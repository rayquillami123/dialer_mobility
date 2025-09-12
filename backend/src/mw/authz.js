
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const PUBLIC_PATHS = [
  /^\/api\/auth\//,
  /^\/api\/health$/,
  /^\/cdr$/,
  /^\/ws$/
];

export function bearerOrApiKey(req, _res, next){
  const auth = req.headers['authorization'] || '';
  if (auth.startsWith('Bearer ')) req.token = auth.slice(7);
  const pkt = req.headers['x-api-key'];
  if (pkt) req.apiKey = String(pkt);
  next();
}

export function authenticate(db){
  return async function(req, res, next){
    if (PUBLIC_PATHS.some(rx => rx.test(req.path))) return next();

    try{
      // API Key
      if (req.apiKey){
        const sha = crypto.createHash('sha256').update(req.apiKey).digest('hex');
        const row = await db.query('select * from api_keys where token_hash=$1 limit 1', [sha]);
        const k = row.rows[0];
        if (!k) return res.status(401).json({error:'invalid_api_key'});
        req.user = { id: 0, email:'apikey', roles:['admin'], tenant_id:k.tenant_id };
        req.authType='api_key';
        return next();
      }

      // JWT acceso
      if (!req.token) return res.status(401).json({error:'missing_token'});
      const payload = jwt.verify(req.token, process.env.JWT_ACCESS_SECRET || 'dev');
      req.user = {
        id: Number(payload.sub),
        email: payload.email,
        roles: payload.roles || [],
        tenant_id: Number(payload.tenant_id)
      };
      req.authType='jwt';
      next();
    }catch{
      return res.status(401).json({error:'unauthorized'});
    }
  };
}

export function requireRole(...allowed){
  return function(req,res,next){
    const roles = req.user?.roles || [];
    if (roles.some(r => allowed.includes(r))) return next();
    return res.status(403).json({error:'forbidden'});
  };
}
