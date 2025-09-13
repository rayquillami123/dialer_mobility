#!/usr/bin/env node
// Node 18+ (fetch y URLSearchParams nativos). ESM.
import { setTimeout as sleep } from 'timers/promises';

const args = process.argv.slice(2);
const API = getArg('--api') || process.env.DIALER_API || 'http://localhost:8080';
const email = getArg('-e') || getArg('--email');
const pass  = getArg('-p') || getArg('--password');
const tenant = getArg('-t') || getArg('--tenant');
const role = getArg('-r') || getArg('--role'); // admin|supervisor|agent
const targetEmail = getArg('--target'); // email del usuario objetivo
const inviteEmail = getArg('--invite');

let accessToken = null;
let cookies = '';

function getArg(flag){ const i = args.indexOf(flag); return i>=0 ? args[i+1] : null; }

async function main() {
  const cmd = args[0];
  if (!cmd) return help(0);

  // Comandos que no requieren login
  if (cmd === 'login') {
    require(email && pass, 'login requiere -e y -p');
    await login(email, pass);
    console.log('Login OK como', email);
    return;
  }

  // Todos los demás comandos requieren login
  require(email && pass, `El comando '${cmd}' requiere autenticación con -e y -p.`);
  await login(email, pass);

  switch (cmd) {
    case 'invite-user':
      require(tenant && inviteEmail, 'invite-user requiere -t y --invite <email>');
      await inviteUser(inviteEmail, [getArg('--role') || 'viewer']);
      break;

    case 'set-role':
      require(tenant && targetEmail && role, 'set-role requiere -t, --target y -r (admin|supervisor|agent|viewer)');
      await setRole(targetEmail, [role]);
      break;

    case 'disable-user':
      require(tenant && targetEmail, 'disable-user requiere -t y --target');
      await disableUser(targetEmail);
      break;

    case 'list-users':
      require(tenant, 'list-users requiere -t');
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

  # Iniciar sesión (obtiene y guarda tokens para los demás comandos)
  node ops/cli/admin.mjs --api ${API} login -e <admin_email> -p '<password>'

  # Invitar usuario a un tenant
  node ops/cli/admin.mjs --api ${API} invite-user -e <admin> -p '...' -t MobilityTech --invite nuevo.agente@example.com --role agent

  # Cambiar el rol de un usuario
  node ops/cli/admin.mjs --api ${API} set-role -e <admin> -p '...' -t MobilityTech --target nuevo.agente@example.com -r supervisor

  # Desactivar un usuario
  node ops/cli/admin.mjs --api ${API} disable-user -e <admin> -p '...' -t MobilityTech --target nuevo.agente@example.com

  # Listar todos los usuarios del tenant
  node ops/cli/admin.mjs --api ${API} list-users -e <admin> -p '...' -t MobilityTech
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

  accessToken = res.accessToken ?? res.access_token;
  if (!accessToken) throw new Error('No se recibió accessToken en el login');
}

async function findUserIdByEmail(email) {
  const users = await authedFetchJSON(`/api/users`);
  const user = (users.items || []).find(u => u.email === email);
  if (!user) throw new Error(`Usuario con email '${email}' no encontrado en el tenant.`);
  return user.id;
}


async function inviteUser(userEmail, roles){
  const body = await authedFetchJSON(`/api/users/invite`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: userEmail, roles })
  });
  console.log('Invitación creada:', body);
}

async function setRole(userEmail, newRoles){
  const userId = await findUserIdByEmail(userEmail);
  const body = await authedFetchJSON(`/api/users/${userId}/roles`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ roles: newRoles })
  });
  console.log('Roles actualizados:', body);
}

async function disableUser(userEmail){
  const userId = await findUserIdByEmail(userEmail);
  const body = await authedFetchJSON(`/api/users/${userId}/deactivate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
  });
  console.log('Usuario desactivado:', body);
}

async function listUsers(){
  const body = await authedFetchJSON(`/api/users`);
  console.table((body.items||[]).map(u => ({
    id: u.id,
    email: u.email,
    name: u.name || '—',
    roles: (u.roles||[]).join(', '),
    is_active: u.is_active,
  })));
}

/* --- helpers HTTP con reintentos exponenciales --- */

async function fetchJSON(path, init={}, opts={}){
  const url = path.startsWith('http') ? path : `${API}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init.headers||{}),
      cookie: cookies || undefined
    },
    redirect: 'manual',
  });

  const setCookie = res.headers.get('set-cookie');
  if (opts.captureCookies && setCookie) cookies = mergeCookies(cookies, setCookie);
  if (!res.ok) {
    const text = await res.text().catch(()=> '');
    throw new Error(`HTTP ${res.status} ${res.statusText} - ${text}`);
  }
  return res.json().catch(()=> ({}));
}

function mergeCookies(prev, setCookieHeader){
  const rt = /(^|;)\s*rt=([^;]+)/i.exec(setCookieHeader);
  if (rt) return `rt=${rt[2]};`;
  return prev;
}

async function authedFetchJSON(path, init={}, retry=0){
  try{
    const res = await fetchJSON(path, {
      ...init,
      headers: {
        ...(init.headers||{}),
        authorization: `Bearer ${accessToken}`
      }
    });
    return res;
  }catch(err){
    if (String(err).includes('401') && retry < 1) {
      await refresh();
      return authedFetchJSON(path, init, retry+1);
    }
    if (retry < 3) {
      await sleep(200 * 2**retry);
      return authedFetchJSON(path, init, retry+1);
    }
    throw err;
  }
}

async function refresh(){
  const res = await fetchJSON('/api/auth/refresh', { method:'POST' }, { captureCookies:true });
  accessToken = res.accessToken ?? res.access_token;
  if (!accessToken) throw new Error('refresh: sin accessToken');
}

main().catch(e => { console.error(e.message||e); process.exit(1); });
