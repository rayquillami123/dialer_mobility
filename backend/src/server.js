

import 'dotenv/config';
import express from 'express';
import { WebSocketServer } from 'ws';
import { Pool } from 'pg';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { router as campaigns } from './routes/campaigns.js';
import { router as cdr } from './routes/cdr.js';
import { router as reports } from './routes/reports.js';
import { router as providers } from './routes/providers.js';
import { router as dids } from './routes/dids.js';
import { eslInit } from './services/esl.js';
import { router as recordings } from './routes/recordings.js';
import { router as auth } from './routes/auth.js';
import { bearerOrApiKey, authenticate } from './mw/authz.js';
import { router as users } from './routes/users.js';
import integrations from './routes/integrations.js';
import jwt from 'jsonwebtoken';
import url from 'node:url';
import promBundle from 'express-prom-bundle';
import { loginLimiter, apiLimiter } from './mw/ratelimit.js';
import { audit } from './mw/audit.js';
import { wsConnections } from './metrics/custom.js';
import makeBootstrapRouter from "./routes/auth_bootstrap.js";

const app = express();
const metrics = promBundle({
  includeMethod: true,
  includePath: true,
  customLabels: { app: 'dialer' },
  buckets: [0.05, 0.1, 0.3, 0.6, 1, 2, 5],
  metricsPath: '/api/metrics',
});
app.use(metrics);

const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN || 'http://localhost:3000,http://localhost:9002').split(',');
if (process.env.NODE_ENV === 'development' || process.env.FIREBASE_DEBUG) {
  ALLOWED_ORIGINS.push('https://studio.firebase.google.com');
}

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      cb(null, true);
    } else {
      cb(new Error(`Origin ${origin} not allowed by CORS`));
    }
  },
  credentials: true,
}));

app.use(cookieParser());
app.use(express.json({ limit: '2mb' }));


// (Opcional) servir descargables si defines DOWNLOADS_DIR
if (process.env.DOWNLOADS_DIR) {
  app.use('/downloads', express.static(process.env.DOWNLOADS_DIR));
}

// DB
export const db = new Pool();

app.use(audit(db));
app.use('/api/auth/login', loginLimiter);
app.use('/api/', apiLimiter);

// RUTA PÚBLICA SÓLO PARA BOOTSTRAP
app.use("/api/auth", makeBootstrapRouter(db));

// Auth Bearer simple (excepto /cdr que idealmente aseguras por IP/Nginx)
app.use(bearerOrApiKey);
app.use(authenticate(db));


// Rutas
app.get('/api/health', (_req,res)=>res.json({ ok:true, ts:Date.now() }));
app.use('/api/auth', auth);
app.use('/api/campaigns', campaigns);
app.use('/api/users', users);
app.use('/cdr', cdr);
app.use('/api/reports', reports);
app.use('/api/providers', providers);
app.use('/api/dids', dids);
app.use('/api/recordings', recordings);
app.use('/api/integrations', integrations);


// WS
const server = app.listen(process.env.PORT || 8080, ()=>{
  console.log('API listening on', server.address());
});

export const wss = new WebSocketServer({ server, path: '/ws' });
const socketsByTenant = new Map(); // tenant_id -> Set<WebSocket>

function addSocket(tenantId, ws) {
  if (!socketsByTenant.has(tenantId)) socketsByTenant.set(tenantId, new Set());
  socketsByTenant.get(tenantId).add(ws);
  wsConnections.inc({ tenant_id: String(tenantId) }, 1);
  ws.on('close', () => {
    socketsByTenant.get(tenantId)?.delete(ws);
    wsConnections.dec({ tenant_id: String(tenantId) }, 1);
  });
}

export function broadcastToTenant(tenantId, payload) {
  const msg = JSON.stringify(payload);
  const set = socketsByTenant.get(tenantId);
  if (!set) return;
  for (const ws of set) {
    if (ws.readyState === ws.OPEN) ws.send(msg);
  }
}

export function broadcastAll(payload) {
  const msg = JSON.stringify(payload);
  for (const set of socketsByTenant.values()) {
    for (const ws of set) if (ws.readyState === ws.OPEN) ws.send(msg);
  }
}

wss.on('connection', (ws, req) => {
  try {
    const u = url.parse(req.url, true);
    let token = u.query.token;
    if (!token && req.headers['sec-websocket-protocol']) {
      const sp = String(req.headers['sec-websocket-protocol']).split(',').map(s => s.trim());
      const b = sp.find(s => s && s !== 'json');
      if (b) token = b;
    }
    if (!token) { ws.close(4001, 'missing token'); return; }
    const payload = jwt.verify(String(token), process.env.JWT_ACCESS_SECRET || 'dev');
    ws.user = { id: Number(payload.sub), tenant_id: Number(payload.tenant_id), roles: payload.roles || [] };
    addSocket(ws.user.tenant_id, ws);

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw));
        if (msg?.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
        }
      } catch { /* ignorar */ }
    });

    ws.send(JSON.stringify({ type: 'ws.hello', ts: Date.now(), tenant_id: ws.user.tenant_id }));
  } catch (e) {
    try { ws.close(4003, 'unauthorized'); } catch {}
  }
});


// Timers Safe Harbor (uuid -> timeout)
const activeCallTimers = new Map();

// ESL → Safe Harbor + eventos básicos
const esl = eslInit({ onEvent: (ev)=> {
  const name = ev['Event-Name'];
  const uuid = ev['Unique-ID'];
  if (!uuid) return;

  if (name === 'CHANNEL_ANSWER') {
    // Inicia timer Safe Harbor
    const ms = Number(process.env.SAFE_HARBOR_MS || 2000);
    const t = setTimeout(async ()=>{
      try {
        const campaignId = ev['variable_X_CAMPAIGN'];
        const campaign = (await db.query('SELECT tenant_id FROM campaigns WHERE id = $1', [campaignId])).rows[0];
        if (campaign) {
          broadcastToTenant(campaign.tenant_id, { type:'call.update', uuid, state:'AbandonedSafeHarbor', ts:Date.now() });
        }
        await esl.api(`uuid_setvar ${uuid} safe_harbor true`);
        await esl.api(`uuid_broadcast ${uuid} playback:ivr/ivr-you_will_be_called_again.wav both`);
        setTimeout(()=> esl.api(`uuid_kill ${uuid}`), 1500);
      } catch {}
      activeCallTimers.delete(uuid);
    }, ms);
    activeCallTimers.set(uuid, t);

    const campaignId = ev['variable_X_CAMPAIGN'];
    db.query('SELECT tenant_id FROM campaigns WHERE id = $1', [campaignId]).then(res => {
      if (res.rows[0]) {
        broadcastToTenant(res.rows[0].tenant_id, { type:'call.update', uuid, state:'Connected', ts:Date.now(), number: ev['Caller-Destination-Number'] });
      }
    });
  }

  if (name === 'CHANNEL_BRIDGE') {
    const t = activeCallTimers.get(uuid);
    if (t) { clearTimeout(t); activeCallTimers.delete(uuid); }
    
    const campaignId = ev['variable_X_CAMPAIGN'];
    db.query('SELECT tenant_id FROM campaigns WHERE id = $1', [campaignId]).then(res => {
      if (res.rows[0]) {
        broadcastToTenant(res.rows[0].tenant_id, { type:'call.update', uuid, state:'Bridged', ts:Date.now() });
      }
    });

    const recDir = process.env.REC_DIR || '/var/recordings';
    const ts = new Date().toISOString().replace(/[:.]/g,'-');
    const recFile = `${recDir}/${ts}_${uuid}.wav`;
    esl.api(`uuid_setvar ${uuid} recording_path '${recFile}'`);
    esl.api(`uuid_record ${uuid} start ${recFile}`);
    
    db.query('SELECT tenant_id FROM campaigns WHERE id = $1', [campaignId]).then(res => {
      if (res.rows[0]) {
        broadcastToTenant(res.rows[0].tenant_id, { type:'call.update', uuid, recording:recFile });
      }
    });
  } else if (name === 'CHANNEL_EXECUTE_COMPLETE' && ev['Application'] === 'transfer') {
    if (activeCallTimers.has(uuid)) {
      clearTimeout(activeCallTimers.get(uuid));
      activeCallTimers.delete(uuid);
    }
  }

  if (name === 'CHANNEL_HANGUP_COMPLETE') {
    const t = activeCallTimers.get(uuid);
    if (t) { clearTimeout(t); activeCallTimers.delete(uuid); }
    esl.api(`uuid_record ${uuid} stop`);
    
    const campaignId = ev['variable_X_CAMPAIGN'];
    db.query('SELECT tenant_id FROM campaigns WHERE id = $1', [campaignId]).then(res => {
      if (res.rows[0]) {
        broadcastToTenant(res.rows[0].tenant_id, { type:'call.update', uuid, state:'Hangup', ts:Date.now(), billsec: Number(ev['variable_billsec']||0) });
      }
    });
  }
}});

export default app;
