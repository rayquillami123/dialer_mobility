#!/usr/bin/env node
// Node 18+ (fetch y URLSearchParams nativos). ESM.
import { setTimeout as sleep } from 'timers/promises';

const args = process.argv.slice(2);
const API = getArg('--api') || process.env.DIALER_API || 'http://localhost:8080';
const email = getArg('-e') || getArg('--email');
const pass  = getArg('-p') || getArg('--password');
let tenantId = getArg('-t') || getArg('--tenant-id');
const role = getArg('-r') || getArg('--role'); // admin|supervisor|agent
const target = getArg('--target'); // email del usuario objetivo

let accessToken = null;
let cookies = '';

function getArg(flag){ const i = args.indexOf(flag); return i>=0 ? args[i+1] : null; }

async function main() {
  const cmd = args[0];
  if (!cmd) return help(0);

  if (cmd !== 'login') {
    require(email && pass, `Comando '${cmd}' requiere login con -e y -p`);
    await login(email, pass);
  }

  switch (cmd) {
    case 'login':
      require(email && pass, 'login requiere -e y -p');
      await login(email, pass);
      console.log('Login OK como', email);
      break;

    case 'invite-user':
      require(getArg('--invite'), 'invite-user requiere --invite <email>');
      await inviteUser(getArg('--invite'), role || 'viewer');
      break;

    case 'set-role':
      require(target && role, 'set-role requiere --target <email> y -r <rol>');
      await setRole(target, role);
      break;

    case 'disable-user':
      require(target, 'disable-user requiere --target <email>');
      await disableUser(target);
      break;

    case 'list-users':
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

  # Iniciar sesión (necesario para otros comandos)
  node ops/cli/admin.mjs --api https://api.midominio.com login -e admin@empresa.com -p '*****'

  # (Los siguientes comandos reusan la sesión)
  # Invitar usuario
  node ops/cli/admin.mjs --api ... invite-user -e admin@... -p '...' --invite agente@acme.com -r agent

  # Asignar rol
  node ops/cli/admin.mjs --api ... set-role -e admin@... -p '...' --target agente@acme.com -r supervisor

  # Desactivar usuario
  node ops/cli/admin.mjs --api ... disable-user -e admin@... -p '...' --target agente@acme.com

  # Listar usuarios
  node ops/cli/admin.mjs --api ... list-users -e admin@... -p '...'
`);
  process.exit(code);
}

function require(cond, msg){ if(!cond){ console.error('Error:', msg); process.exit(1);} }

async function login(email, password){
  const data = await fetchJSON('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password })
  }, { captureCookies: true });
  
  accessToken = data.accessToken || data.access_token;
  if (!accessToken) throw new Error('No se recibió accessToken');
  tenantId = data.user?.tenant_id;
}

async function findUserIdByEmail(email) {
  const users = await authedFetchJSON('/api/users');
  const user = (users.items || []).find(u => u.email === email);
  if (!user) throw new Error(`Usuario ${email} no encontrado en el tenant.`);
  return user.id;
}

async function inviteUser(userEmail, userRole){
  const body = await authedFetchJSON(`/api/users/invite`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: userEmail, roles: [userRole] })
  });
  console.log('Invitación creada:', body);
}

async function setRole(userEmail, newRole){
  const uid = await findUserIdByEmail(userEmail);
  const body = await authedFetchJSON(`/api/users/${uid}/roles`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ roles: [newRole] })
  });
  console.log(`Rol de ${userEmail} actualizado a ${newRole}:`, body);
}

async function disableUser(userEmail){
  const uid = await findUserIdByEmail(userEmail);
  const body = await authedFetchJSON(`/api/users/${uid}/deactivate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({})
  });
  console.log(`Usuario ${userEmail} desactivado:`, body);
}

async function listUsers(){
  const body = await authedFetchJSON(`/api/users`);
  console.table((body.items||[]).map(u => ({
    id: u.id, email: u.email, name: u.name, roles: u.roles.join(','), active: u.is_active
  })));
}

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
  accessToken = res.accessToken || res.access_token;
  if (!accessToken) throw new Error('refresh: sin accessToken');
}

main().catch(e => { console.error(e.message||e); process.exit(1); });
