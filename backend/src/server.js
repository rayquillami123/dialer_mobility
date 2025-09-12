import 'dotenv/config';
import express from 'express';
import { WebSocketServer } from 'ws';
import { Pool } from 'pg';
import cors from 'cors';
import crypto from 'crypto';
import { router as campaigns } from './routes/campaigns.js';
import { router as cdr } from './routes/cdr.js';
import { router as reports } from './routes/reports.js';
import { router as providers } from './routes/providers.js';
import { router as dids } from './routes/dids.js';
import { eslInit, getEslSocket } from './services/esl.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Simple auth middleware (bearer)
app.use((req,res,next)=>{
  const token = (req.headers['authorization']||'').replace('Bearer ','');
  if (!process.env.API_TOKEN) return next();
  if (token && token === process.env.API_TOKEN) return next();
  if (req.path.startsWith('/cdr')) return next(); // IP allowlist recomendado
  res.status(401).json({error:{code:'unauthorized', message:'invalid token'}});
});

// DB pool
export const db = new Pool();

app.get('/health', (_req,res)=>res.json({ ok:true, ts:Date.now() }));
app.use('/api/campaigns', campaigns);
app.use('/cdr', cdr);
app.use('/api/reports', reports);
app.use('/api/providers', providers);
app.use('/api/dids', dids);


// WebSocket realtime
const wss = new WebSocketServer({ noServer: true });
function broadcast(obj){
  const s = JSON.stringify(obj);
  for (const c of wss.clients) if (c.readyState === 1) c.send(s);
}

export const ws = { broadcast };

const server = app.listen(process.env.PORT || 9003, ()=>{
  console.log('API listening on', server.address());
});

// Upgrade to WS
server.on('upgrade', (req, socket, head)=>{
  // Solo atender /ws
  if (req.url !== '/ws') {
    socket.destroy();
    return;
  }
  // Optionally validate Origin
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

const activeCallTimers = new Map();

// ESL aggregator → WS
eslInit({ onEvent: (ev)=> {
  const esl = getEslSocket();
  if (!esl) return;

  // Map to UI contract (muy simplificado)
  if (ev['Event-Name']==='CHANNEL_ANSWER'){
    const uuid = ev['Unique-ID'];
    broadcast({type:'call.update', uuid, state:'Connected', ts:Date.now(), number: ev['Caller-Destination-Number'] });
    
    // Inicia timer de "Safe Harbor": si en 2s no hay bridge a un agente (en la PBX externa), es abandono.
    const timer = setTimeout(()=> {
      broadcast({ type:'call.update', uuid, state:'AbandonedSafeHarbor', ts:Date.now() });
      // El dialplan de FreeSWITCH debería encargarse de esto, pero como fallback:
      esl.api(`uuid_broadcast ${uuid} playback::ivr/you_will_be_called_again.wav both`);
      setTimeout(()=> esl.api(`uuid_kill ${uuid}`), 1500); // dar tiempo al playback
      activeCallTimers.delete(uuid);
    }, 2000);
    activeCallTimers.set(uuid, timer);
  }
  else if (ev['Event-Name']==='CHANNEL_BRIDGE' || ev['Event-Name'] === 'CHANNEL_EXECUTE_COMPLETE' && ev['Application'] === 'transfer') {
    // La llamada se conectó a la PBX, cancela el timer de abandono
    const uuid = ev['Unique-ID'];
    if (activeCallTimers.has(uuid)) {
      clearTimeout(activeCallTimers.get(uuid));
      activeCallTimers.delete(uuid);
    }
  }
  else if (ev['Event-Name']==='CHANNEL_HANGUP_COMPLETE'){
    const uuid = ev['Unique-ID'];
    if (activeCallTimers.has(uuid)) {
      clearTimeout(activeCallTimers.get(uuid));
      activeCallTimers.delete(uuid);
    }
    broadcast({type:'call.update', uuid, state:'Hangup', ts:Date.now(), billsec: Number(ev['variable_billsec']||0) });
  }
}});
