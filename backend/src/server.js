
import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import { Pool } from 'pg';
import 'dotenv/config';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/api/realtime' });

const port = process.env.PORT || 9003;

// PostgreSQL client setup
const pool = new Pool({
  user: process.env.PGUSER,
  host: process.env.PGHOST,
  database: process.env.PGDATABASE,
  password: process.env.PGPASSWORD,
  port: process.env.PGPORT,
});

app.use(express.json());

// Simple root endpoint
app.get('/', (req, res) => {
  res.send('Dialer Backend is running!');
});

// Endpoint for receiving CDRs from FreeSWITCH
app.post('/cdr', async (req, res) => {
  console.log('Received CDR:', req.body);
  try {
    // Note: This is a simplified insert. You'll need to map all fields from the
    // json_cdr template to your database columns.
    const cdr = req.body;
    await pool.query(
      `INSERT INTO cdr (
        uuid, call_id, direction, start_stamp, answer_stamp, end_stamp, duration, billsec, hangup_cause,
        campaign_id, list_id, lead_id, trunk_id, queue, agent_id, amd_label, amd_confidence, recording_url
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
      )`,
      [
        cdr.uuid, cdr.call_id, cdr.direction, new Date(cdr.start_stamp), new Date(cdr.answer_stamp), new Date(cdr.end_stamp),
        cdr.duration, cdr.billsec, cdr.hangup_cause, cdr.campaign_id, cdr.list_id, cdr.lead_id, cdr.trunk_id,
        cdr.queue, cdr.agent_id, cdr.amd_label, cdr.amd_confidence, cdr.recording_url
      ]
    );
    res.status(200).send('CDR received');
  } catch (error) {
    console.error('Error saving CDR:', error);
    res.status(500).send('Error saving CDR');
  }
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
