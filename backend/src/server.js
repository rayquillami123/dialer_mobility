
import 'dotenv/config';
import express from 'express';
import { WebSocketServer } from 'ws';
import { Pool } from 'pg';
import cors from 'cors';
import crypto from 'crypto';
import { router as campaigns } from './routes/campaigns.js';
import { router as cdr } from './routes/cdr.js';
import { router as reports } from './routes/reports.js';
import { eslInit } from './services/esl.js';

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
  if (req.url !== '/ws') {
    socket.destroy();
    return;
  }
  // Optionally validate Origin
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

// ESL aggregator → WS
eslInit({ onEvent: (ev)=> {
  // Map to UI contract (very simplificado)
  if (ev['Event-Name']==='CHANNEL_ANSWER'){
    broadcast({type:'call.update', uuid:ev['Unique-ID'], state:'Connected', ts:Date.now(), number: ev['Caller-Destination-Number'] });
  }
  if (ev['Event-Name']==='CHANNEL_HANGUP_COMPLETE'){
    broadcast({type:'call.update', uuid:ev['Unique-ID'], state:'Hangup', ts:Date.now(), billsec: Number(ev['billsec']||0) });
  }
}});
