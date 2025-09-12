import express from 'express';
import { db } from '../server.js';

export const router = express.Router();

// GET /dids/health
router.get('/health', async (_req, res) => {
  const r = await db.query(`
    SELECT d.id, d.e164, d.state, d.score, d.daily_cap,
      coalesce(du.calls_total, 0) as calls_today,
      (coalesce(du.calls_total, 0) >= d.daily_cap) as reached_cap
    FROM dids d
    LEFT JOIN did_usage du ON du.did_id = d.id AND du.day = current_date
    WHERE d.enabled = true
    ORDER BY d.state, calls_today DESC;
  `);
  res.json(r.rows);
});


// GET /dids/top-sip
router.get('/top-sip', async (req, res) => {
    const window = Number(req.query.window || 60);
    const r = await db.query(`
        SELECT did_id, raw->>'sip_code' AS code, COUNT(*) as n
        FROM cdr
        WHERE received_at >= now() - ($1 || ' minutes')::interval
        AND did_id IS NOT NULL
        GROUP BY did_id, code
        ORDER BY did_id, n DESC;
    `, [`${window}`]);
    res.json(r.rows);
});