

import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { db } from '../server.js';
import crypto from 'crypto';

export const router = express.Router();

function signAccess(user){
  const ttl = Number(process.env.JWT_ACCESS_TTL || 600);
  return jwt.sign({
    sub: String(user.id),
    email: user.email,
    roles: user.roles || [],
    tenant_id: user.tenant_id
  }, process.env.JWT_ACCESS_SECRET || 'dev', { expiresIn: ttl });
}
function signRefresh(user){
  const days = Number(process.env.JWT_REFRESH_TTL_DAYS || 7);
  return jwt.sign({ sub: String(user.id) }, process.env.JWT_REFRESH_SECRET || 'dev', { expiresIn: `${days}d` });
}
function setRefreshCookie(res, token){
  const isProd = process.env.NODE_ENV === 'production';
  const cookieOpts = {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/api/auth/refresh',
    maxAge: Number(process.env.JWT_REFRESH_TTL_DAYS || 7) * 24*60*60*1000,
  };
  res.cookie('rt', token, cookieOpts);
}

async function loadUserByEmail(email){
  const q = `
    select u.*, coalesce(json_agg(r.code) filter (where r.code is not null), '[]') as roles
    from users u
    left join user_roles ur on ur.user_id = u.id
    left join roles r on r.id = ur.role_id
    where u.email = $1
    group by u.id
    limit 1
  `;
  const r = await db.query(q, [email]);
  return r.rows[0];
}

router.post('/login', async (req,res)=>{
  try{
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({error:'missing_fields'});

    const u = await loadUserByEmail(email);
    if (!u || !u.is_active) {
      await db.query('insert into login_attempts(email, ip, ok) values($1, $2, $3)', [email, req.ip, false]);
      return res.status(401).json({error:'invalid_credentials'});
    }

    const ok = await bcrypt.compare(password, u.password_hash);
    if (!ok) {
      await db.query('insert into login_attempts(email, ip, ok) values($1, $2, $3)', [email, req.ip, false]);
      return res.status(401).json({error:'invalid_credentials'});
    }
    
    await db.query('insert into login_attempts(email, ip, ok) values($1, $2, $3)', [email, req.ip, true]);
    const user = { id:u.id, email:u.email, roles:u.roles, tenant_id:u.tenant_id };
    const at = signAccess(user);
    const rt = signRefresh(user);
    setRefreshCookie(res, rt);
    return res.json({ accessToken: at, access_token: at, user });
  }catch(e){
    console.error('auth.login', e);
    return res.status(500).json({error:'internal_error'});
  }
});

router.post('/refresh', async (req,res)=>{
  try{
    const token = req.cookies?.rt;
    if (!token) return res.status(401).json({error:'missing_refresh'});
    const payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET || 'dev');
    const uid = Number(payload.sub);
    const q = `
      select u.*, coalesce(json_agg(r.code) filter (where r.code is not null), '[]') as roles
      from users u
      left join user_roles ur on ur.user_id = u.id
      left join roles r on r.id = ur.role_id
      where u.id = $1
      group by u.id limit 1
    `;
    const r = await db.query(q, [uid]);
    const u = r.rows[0];
    if (!u || !u.is_active) return res.status(401).json({error:'invalid_refresh'});

    const user = { id:u.id, email:u.email, roles:u.roles, tenant_id:u.tenant_id };
    const at = signAccess(user);
    // opcional: rotate refresh
    const rt = signRefresh(user);
    setRefreshCookie(res, rt);
    return res.json({ accessToken: at, access_token: at, user });
  }catch{
    return res.status(401).json({error:'invalid_refresh'});
  }
});

router.get('/me', async (req,res)=>{
  try{
    if (!req.user) return res.status(401).json({error:'unauthorized'});
    res.json({ user: req.user });
  }catch{
    res.status(500).json({error:'internal_error'});
  }
});

router.post('/logout', (req,res)=>{
  const isProd = process.env.NODE_ENV === 'production';
  const cookieOpts = {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/api/auth/refresh',
  };
  res.clearCookie('rt', cookieOpts);
  res.json({ ok:true });
});

router.post('/accept-invite', async (req,res)=>{
  const { token, name, password } = req.body || {};
  if (!token || !password) return res.status(400).json({error:'missing_fields'});
  const token_hash = crypto.createHash('sha256').update(String(token)).digest('hex');

  const rInv = await db.query('select * from invites where token_hash=$1 and accepted_at is null', [token_hash]);
  const inv = rInv.rows[0];
  if (!inv) return res.status(400).json({error:'invalid_or_used'});
  if (new Date(inv.expires_at).getTime() < Date.now()) return res.status(400).json({error:'expired'});

  // crea o actualiza usuario para ese tenant
  const rUser = await db.query('select * from users where email=$1 and tenant_id=$2', [inv.email, inv.tenant_id]);
  let uid;
  const ph = await bcrypt.hash(password, 10);
  if (!rUser.rowCount) {
    const ins = await db.query(
      `insert into users(tenant_id,email,name,password_hash,is_active)
       values($1,$2,$3,$4,true) returning id`,
       [inv.tenant_id, inv.email, name||null, ph]
    );
    uid = ins.rows[0].id;
  } else {
    uid = rUser.rows[0].id;
    await db.query('update users set name=$2, password_hash=$3, is_active=true where id=$1', [uid, name||rUser.rows[0].name, ph]);
  }
  // roles
  await db.query('delete from user_roles where user_id=$1', [uid]);
  const rr = await db.query('select id,code from roles where code = any($1)', [inv.role_codes]);
  for (const row of rr.rows) {
    await db.query('insert into user_roles(user_id,role_id) values($1,$2) on conflict do nothing', [uid, row.id]);
  }

  await db.query('update invites set accepted_at=now() where id=$1', [inv.id]);
  await db.query(`insert into audit_log(tenant_id,user_id,action,entity,entity_id,meta)
                  values($1,$2,'user.accept_invite','user',$3,$4)`,
                  [inv.tenant_id, uid, String(uid), { email: inv.email }]);

  res.json({ ok:true });
});

router.post('/forgot', async (req,res)=>{
  const { email } = req.body || {};
  if (!email) return res.status(400).json({error:'missing_email'});
  // no reveles si existe o no: devuelve ok siempre
  const base = process.env.APP_BASE_URL || 'http://localhost:3000';
  // token con email (10 min)
  const t = jwt.sign({ email }, process.env.JWT_REFRESH_SECRET || 'dev', { expiresIn: '10m' });
  const link = `${base}/reset-password?token=${encodeURIComponent(t)}`;
  console.log('[reset link]', link); // envíalo por email en prod
  res.json({ ok:true });
});

router.post('/reset', async (req,res)=>{
  const { token, password } = req.body || {};
  try{
    const { email } = jwt.verify(String(token), process.env.JWT_REFRESH_SECRET || 'dev');
    const r = await db.query('select * from users where email=$1 limit 1', [email]);
    if (!r.rowCount) return res.json({ ok:true }); // no reveles
    const ph = await bcrypt.hash(password, 10);
    await db.query('update users set password_hash=$2 where id=$1', [r.rows[0].id, ph]);
    res.json({ ok:true });
  }catch{
    res.status(400).json({error:'invalid_or_expired'});
  }
});
