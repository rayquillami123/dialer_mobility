
import express from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { db } from '../server.js';
import { requireRole } from '../mw/authz.js';

export const router = express.Router();

// Listar usuarios del tenant
router.get('/', requireRole('admin','supervisor'), async (req,res)=>{
  const r = await db.query(`
    select u.id, u.email, u.name, u.is_active, u.created_at,
           coalesce(json_agg(r.code) filter (where r.code is not null), '[]') as roles
    from users u
    left join user_roles ur on ur.user_id = u.id
    left join roles r on r.id = ur.role_id
    where u.tenant_id = $1
    group by u.id
    order by u.id desc
  `, [req.user.tenant_id]);
  res.json({ items: r.rows });
});

// Crear directo (opcional, útil en dev)
router.post('/', requireRole('admin'), async (req,res)=>{
  const { email, name, password, roles=[] } = req.body || {};
  if (!email || !password) return res.status(400).json({error:'missing_fields'});
  const ph = await bcrypt.hash(password, 10);
  const r = await db.query(
    `insert into users(tenant_id,email,name,password_hash,is_active)
     values($1,$2,$3,$4,true) returning id`, [req.user.tenant_id, email, name||null, ph]
  );
  const uid = r.rows[0].id;
  // roles
  if (Array.isArray(roles) && roles.length) {
    const rr = await db.query('select id,code from roles where code = any($1)', [roles]);
    for (const row of rr.rows) {
      await db.query('insert into user_roles(user_id,role_id) values($1,$2) on conflict do nothing', [uid, row.id]);
    }
  }
  await db.query(
    `insert into audit_log(tenant_id,user_id,action,entity,entity_id,meta)
     values($1,$2,'user.create','user',$3,$4)`,
     [req.user.tenant_id, req.user.id, String(uid), { email, roles }]
  );
  res.status(201).json({ id: uid });
});

// Invitar usuario (genera token de un solo uso)
router.post('/invite', requireRole('admin'), async (req,res)=>{
  const { email, roles=['viewer'], ttl_hours=48 } = req.body || {};
  if (!email) return res.status(400).json({error:'missing_email'});
  const token = crypto.randomBytes(24).toString('base64url');
  const token_hash = crypto.createHash('sha256').update(token).digest('hex');
  const exp = new Date(Date.now() + Number(ttl_hours)*3600*1000);
  await db.query(
    `insert into invites(tenant_id,email,role_codes,token_hash,expires_at)
     values($1,$2,$3,$4,$5)`,
     [req.user.tenant_id, email, roles, token_hash, exp]
  );
  await db.query(
    `insert into audit_log(tenant_id,user_id,action,entity,meta)
     values($1,$2,'user.invite','user',$3)`,
     [req.user.tenant_id, req.user.id, { email, roles, exp }]
  );
  // Devuelve el link para que lo envíes por email (o lo copies)
  const base = process.env.APP_BASE_URL || 'http://localhost:3000';
  const link = `${base}/accept-invite?token=${encodeURIComponent(token)}`;
  res.json({ ok:true, link, expires_at: exp.toISOString() });
});

// Activar/actualizar roles
router.post('/:id/roles', requireRole('admin'), async (req,res)=>{
  const uid = Number(req.params.id);
  const { roles=[] } = req.body || {};
  const rUser = await db.query('select id from users where id=$1 and tenant_id=$2', [uid, req.user.tenant_id]);
  if (!rUser.rowCount) return res.status(404).json({error:'not_found'});
  await db.query('delete from user_roles where user_id=$1', [uid]);
  if (roles.length){
    const rr = await db.query('select id,code from roles where code = any($1)', [roles]);
    for (const row of rr.rows) {
      await db.query('insert into user_roles(user_id,role_id) values($1,$2) on conflict do nothing', [uid, row.id]);
    }
  }
  await db.query(
    `insert into audit_log(tenant_id,user_id,action,entity,entity_id,meta)
     values($1,$2,'user.update_roles','user',$3,$4)`,
     [req.user.tenant_id, req.user.id, String(uid), { roles }]
  );
  res.json({ ok:true });
});

// Desactivar usuario
router.post('/:id/deactivate', requireRole('admin'), async (req,res)=>{
  const uid = Number(req.params.id);
  const r = await db.query('update users set is_active=false where id=$1 and tenant_id=$2 returning id', [uid, req.user.tenant_id]);
  if (!r.rowCount) return res.status(404).json({error:'not_found'});
  await db.query(
    `insert into audit_log(tenant_id,user_id,action,entity,entity_id)
     values($1,$2,'user.deactivate','user',$3)`,
     [req.user.tenant_id, req.user.id, String(uid)]
  );
  res.json({ ok:true });
});
