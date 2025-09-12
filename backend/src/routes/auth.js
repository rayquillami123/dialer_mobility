
import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { db } from '../server.js';

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
  const secure = String(process.env.COOKIE_SECURE||'false') === 'true';
  res.cookie('rt', token, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/api/auth/refresh',
    maxAge: Number(process.env.JWT_REFRESH_TTL_DAYS || 7) * 24*60*60*1000,
  });
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
    if (!u || !u.is_active) return res.status(401).json({error:'invalid_credentials'});

    const ok = await bcrypt.compare(password, u.password_hash);
    if (!ok) return res.status(401).json({error:'invalid_credentials'});

    const user = { id:u.id, email:u.email, roles:u.roles, tenant_id:u.tenant_id };
    const at = signAccess(user);
    const rt = signRefresh(user);
    setRefreshCookie(res, rt);
    return res.json({ access_token: at, user });
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
    return res.json({ access_token: at, user });
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
  res.clearCookie('rt', { path:'/api/auth/refresh' });
  res.json({ ok:true });
});
