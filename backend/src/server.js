
import 'dotenv/config';
import express from 'express';
import { WebSocketServer } from 'ws';
import { Pool } from 'pg';
import cors from 'cors';
import { router as campaigns } from './routes/campaigns.js';
import { router as cdr } from './routes/cdr.js';
import { router as reports } from './routes/reports.js';
import { router as providers } from './routes/providers.js';
import { router as dids } from './routes/dids.js';
import { eslInit } from './services/esl.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// (Opcional) servir descargables si defines DOWNLOADS_DIR
if (process.env.DOWNLOADS_DIR) {
  app.use('/downloads', express.static(process.env.DOWNLOADS_DIR));
}

// Auth Bearer simple (excepto /cdr que idealmente aseguras por IP/Nginx)
app.use((req,res,next)=>{
  const token = (req.headers['authorization']||'').replace('Bearer ','');
  if (!process.env.API_TOKEN) return next();
  if (token && token === process.env.API_TOKEN) return next();
  if (req.path.startsWith('/cdr')) return next();
  res.status(401).json({error:{code:'unauthorized', message:'invalid token'}});
});

// DB
export const db = new Pool();

// Rutas
app.get('/health', (_req,res)=>res.json({ ok:true, ts:Date.now() }));
app.use('/api/campaigns', campaigns);
app.use('/cdr', cdr);
app.use('/api/reports', reports);
app.use('/api/providers', providers);
app.use('/api/dids', dids);

// WS
const wss = new WebSocketServer({ noServer: true });
function broadcast(obj){
  const s = JSON.stringify(obj);
  for (const c of wss.clients) if (c.readyState === 1) c.send(s);
}
export const ws = { broadcast };

const server = app.listen(process.env.PORT || 9003, ()=>{
  console.log('API listening on', server.address());
});
server.on('upgrade', (req, socket, head)=>{
    if (req.url !== '/ws') {
        socket.destroy();
        return;
    }
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
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
        ws.broadcast({ type:'call.update', uuid, state:'AbandonedSafeHarbor', ts:Date.now() });
        // Reproduce mensaje y corta (ajusta la ruta del prompt según tus audios)
        await esl.api(`uuid_broadcast ${uuid} playback:ivr/ivr-you_will_be_called_again.wav both`);
        setTimeout(()=> esl.api(`uuid_kill ${uuid}`), 1500);
      } catch {}
      activeCallTimers.delete(uuid);
    }, ms);
    activeCallTimers.set(uuid, t);
    ws.broadcast({ type:'call.update', uuid, state:'Connected', ts:Date.now(), number: ev['Caller-Destination-Number'] });
  }

  if (name === 'CHANNEL_BRIDGE') {
    // Se asignó a agente → cancelar Safe Harbor
    const t = activeCallTimers.get(uuid);
    if (t) { clearTimeout(t); activeCallTimers.delete(uuid); }
    ws.broadcast({ type:'call.update', uuid, state:'Bridged', ts:Date.now() });
  } else if (name === 'CHANNEL_EXECUTE_COMPLETE' && ev['Application'] === 'transfer') {
    // La llamada se conectó a la PBX, cancela el timer de abandono
    if (activeCallTimers.has(uuid)) {
      clearTimeout(activeCallTimers.get(uuid));
      activeCallTimers.delete(uuid);
    }
  }

  if (name === 'CHANNEL_HANGUP_COMPLETE') {
    // Limpieza de timers
    const t = activeCallTimers.get(uuid);
    if (t) { clearTimeout(t); activeCallTimers.delete(uuid); }
    ws.broadcast({ type:'call.update', uuid, state:'Hangup', ts:Date.now(), billsec: Number(ev['variable_billsec']||0) });
  }
}});

export default app;
