
import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import { Pool } from 'pg';
import 'dotenv/config';
import { router as campaignsRouter } from './routes/campaigns.js';
import { router as cdrRouter } from './routes/cdr.js';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/api/realtime' });

const port = process.env.PORT || 9003;

// PostgreSQL client setup
export const db = new Pool({
  user: process.env.PGUSER,
  host: process.env.PGHOST,
  database: process.env.PGDATABASE,
  password: process.env.PGPASSWORD,
  port: process.env.PGPORT,
});

app.use(express.json());

// API Routes
app.use('/api/campaigns', campaignsRouter);
app.use('/cdr', cdrRouter);


// Simple root endpoint
app.get('/', (req, res) => {
  res.send('Dialer Backend is running!');
});

// WebSocket connection handling
wss.on('connection', ws => {
  console.log('Client connected to WebSocket');

  // Send a welcome message
  ws.send(JSON.stringify({ type: 'system', message: 'Welcome to Dialer Real-Time' }));

  // Example: Send a mock KPI tick every 5 seconds
  const kpiInterval = setInterval(() => {
    const mockKpi = {
        type: "kpi.tick",
        scope: "global",
        id: "global",
        asr5m: Math.random() * 0.2 + 0.4, // 40-60%
        acd: Math.random() * 30 + 60, // 60-90s
        cps: Math.floor(Math.random() * 10 + 10), // 10-20
        cc: Math.floor(Math.random() * 50 + 100), // 100-150
        abandon60s: Math.random() * 0.03, // 0-3%
        humanRate: Math.random() * 0.15 + 0.2, // 20-35%
        amd: { HUMAN: 12, VOICEMAIL: 8, FAX: 1, SIT: 2, UNKNOWN: 5 },
        ts: Date.now(),
    };
    ws.send(JSON.stringify(mockKpi));
  }, 5000);

  ws.on('close', () => {
    console.log('Client disconnected');
    clearInterval(kpiInterval);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

server.listen(port, () => {
  console.log(`Dialer backend server listening on http://localhost:${port}`);
  console.log(`WebSocket server available at ws://localhost:${port}/api/realtime`);
});
