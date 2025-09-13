#!/usr/bin/env node
// Node 18+ (fetch y URLSearchParams nativos). ESM.
import { setTimeout as sleep } from 'timers/promises';

const args = process.argv.slice(2);
const API = getArg('--api') || process.env.DIALER_API || 'http://localhost:8080';
const email = getArg('-e') || getArg('--email');
const pass  = getArg('-p') || getArg('--password');
const tenant = getArg('-t') || getArg('--tenant');
const role = getArg('-r') || getArg('--role'); // admin|supervisor|agent|viewer
const targetUserEmail = getArg('--target'); // email del usuario objetivo
const userName = getArg('--name');

let accessToken = null;
let cookies = '';

function getArg(flag){ const i = args.indexOf(flag); return i>=0 ? args[i+1] : null; }

async function main() {
  const cmd = args[0];
  if (!cmd) return help(0);

  switch (cmd) {
    case 'login':
      require(email && pass, 'login requiere -e y -p');
      await login(email, pass);
      console.log('Login OK como', email);
      break;

    // Comando 'create-tenant' eliminado, se gestiona vía bootstrap o UI
    // case 'create-tenant': ...

    case 'invite-user':
      require(email && pass && getArg('--invite'), 'invite-user requiere -e, -p, y --invite <email>');
      await login(email, pass);
      await inviteUser(getArg('--invite'), role || 'viewer', userName);
      break;

    case 'set-role':
      require(email && pass && targetUserEmail && role, 'set-role requiere -e, -p, --target y -r (admin|supervisor|agent|viewer)');
      await login(email, pass);
      await setRole(targetUserEmail, role);
      break;

    case 'disable-user':
      require(email && pass && targetUserEmail, 'disable-user requiere -e, -p, y --target <email>');
      await login(email, pass);
      await disableUser(targetUserEmail);
      break;

    case 'list-users':
      require(email && pass, 'list-users requiere -e y -p');
      await login(email, pass);
      await listUsers();
      break;

    default:
      return help(1);
  }
}

function help(code=0){
  console.log(`
Dialer Admin CLI
Uso básico (API: ${API}):

Autenticación:
  --api <url>     URL del backend (def: ${API})
  -e, --email     Email del usuario admin/supervisor
  -p, --password  Contraseña

Comandos:
  login
    Verifica credenciales y guarda la sesión.
    $ node ops/cli/admin.mjs login -e admin@... -p '...'

  list-users
    Lista los usuarios del tenant del admin.
    $ node ops/cli/admin.mjs list-users -e admin@... -p '...'

  invite-user --invite <email> [-r <rol>] [--name "Nombre Apellido"]
    Invita a un nuevo usuario al tenant. Rol por defecto: viewer.
    $ node ops/cli/admin.mjs invite-user -e admin@... -p '...' --invite agente@... -r agent

  set-role --target <email> -r <rol>
    Cambia el rol de un usuario existente. Roles: admin, supervisor, agent, viewer.
    $ node ops/cli/admin.mjs set-role -e admin@... -p '...' --target agente@... -r supervisor

  disable-user --target <email>
    Desactiva la cuenta de un usuario.
    $ node ops/cli/admin.mjs disable-user -e admin@... -p '...' --target agente@...
`);
  process.exit(code);
}

function require(cond, msg){ if(!cond){ console.error('Error:', msg); process.exit(1);} }

async function login(email, password){
  const res = await fetchJSON('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password })
  }, { captureCookies: true });

  accessToken = res.access_token;
  if (!accessToken) throw new Error('No se recibió accessToken en el login');
}

async function inviteUser(userEmail, role, name){
  const body = { email: userEmail, roles: [role] };
  if (name) body.name = name;

  const res = await authedFetchJSON(`/api/users/invite`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  console.log('Invitación creada:', res);
}

async function findUserIdByEmail(userEmail) {
  const users = await authedFetchJSON(`/api/users`);
  const user = (users.items || []).find(u => u.email === userEmail);
  if (!user) throw new Error(`Usuario ${userEmail} no encontrado en este tenant.`);
  return user.id;
}

async function setRole(userEmail, newRole){
  const userId = await findUserIdByEmail(userEmail);
  const body = await authedFetchJSON(`/api/users/${userId}/roles`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ roles: [newRole] })
  });
  console.log(`Rol de ${userEmail} actualizado a ${newRole}:`, body);
}

async function disableUser(userEmail){
  const userId = await findUserIdByEmail(userEmail);
  const body = await authedFetchJSON(`/api/users/${userId}/deactivate`, {
    method: 'POST',
  });
  console.log(`Usuario ${userEmail} desactivado:`, body);
}

async function listUsers(){
  const body = await authedFetchJSON(`/api/users`);
  console.table((body.items||[]).map(u => ({
    id: u.id,
    email: u.email,
    name: u.name || 'N/A',
    roles: u.roles.join(', '),
    active: u.is_active,
  })));
}

async function fetchJSON(path, init={}, opts={}){
  const url = path.startsWith('http') ? path : `${API}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: { ...(init.headers||{}), cookie: cookies || undefined },
    redirect: 'manual',
  });

  const setCookie = res.headers.get('set-cookie');
  if (opts.captureCookies && setCookie) cookies = mergeCookies(cookies, setCookie);

  if (!res.ok) {
    const text = await res.text().catch(()=> '');
    throw new Error(`HTTP ${res.status} ${res.statusText} en ${url} - ${text}`);
  }
  return res.json().catch(()=> ({}));
}

function mergeCookies(prev, setCookieHeader){
  const rt = /(^|;)\s*rt=([^;]+)/i.exec(setCookieHeader);
  if (rt) return `rt=${rt[2]};`;
  return prev;
}

async function authedFetchJSON(path, init={}, retry=0){
  try {
    const res = await fetchJSON(path, {
      ...init,
      headers: { ...(init.headers||{}), authorization: `Bearer ${accessToken}` }
    });
    return res;
  } catch(err) {
    if (String(err).includes('401') && retry < 1) {
      console.log('Token expirado, refrescando sesión...');
      await refresh();
      return authedFetchJSON(path, init, retry + 1);
    }
    if (retry < 3) {
      await sleep(500 * 2**retry);
      return authedFetchJSON(path, init, retry + 1);
    }
    throw err;
  }
}

async function refresh(){
  const res = await fetchJSON('/api/auth/refresh', { method:'POST' }, { captureCookies:true });
  accessToken = res.access_token;
  if (!accessToken) throw new Error('Fallo al refrescar: no se recibió nuevo accessToken');
  console.log('Sesión refrescada.');
}

main().catch(e => { console.error('Error fatal:', e.message||e); process.exit(1); });
