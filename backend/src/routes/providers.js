import express from 'express';
import { db } from '../server.js';

export const router = express.Router();

// GET /providers/health
router.get('/health', async (req, res) => {
  const window = req.query.window || '15m'; // e.g. 15m, 1h, 24h

  // Sanitize window param to avoid SQL injection
  if (!/^\d+[mhd]$/.test(window)) {
    return res.status(400).json({ error: { code: 'bad_request', message: 'Invalid window format. Use e.g. 15m, 1h, 24h' }});
  }

  const r = await db.query(`
    SELECT 
      trunk_id,
      COUNT(*) AS total_calls,
      COUNT(*) FILTER (WHERE raw->>'sip_code'='200')::float / NULLIF(COUNT(*), 0) AS asr,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY COALESCE((raw->>'progress_media_msec')::int, (raw->>'progress_msec')::int)) AS p50_pdd_ms,
      percentile_cont(0.9) WITHIN GROUP (ORDER BY COALESCE((raw->>'progress_media_msec')::int, (raw->>'progress_msec')::int)) AS p90_pdd_ms,
      jsonb_object_agg(
        raw->>'sip_code', (
          SELECT COUNT(*)
          FROM cdr c2
          WHERE c2.trunk_id = c1.trunk_id
            AND c2.raw->>'sip_code' = c1.raw->>'sip_code'
            AND c2.received_at >= now() - ($1 || ' minutes')::interval
        )
      ) FILTER (WHERE raw->>'sip_code' IS NOT NULL) AS sip_mix
    FROM cdr c1
    WHERE received_at >= now() - ($1 || ' minutes')::interval
      AND trunk_id IS NOT NULL
    GROUP BY trunk_id
    ORDER BY asr ASC;
  `, [window.replace(/[mhd]/,'')]);

  res.json(r.rows);
});