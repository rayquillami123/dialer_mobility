
import express from 'express';
import { db } from '../server.js';
import { requireRole } from '../mw/authz.js';

export const router = express.Router();

router.get('/', requireRole('admin', 'supervisor'), async (req,res)=>{
  const r = await db.query('SELECT id, e164, state FROM dids WHERE tenant_id=$1 ORDER BY state, e164', [req.user.tenant_id]);
  res.json({ items: r.rows });
});

// GET /dids/health
router.get('/health', async (req, res) => {
  const r = await db.query(`
    SELECT d.id, d.e164, d.state, d.score, d.daily_cap,
      coalesce(du.calls_total, 0) as calls_today,
      (coalesce(du.calls_total, 0) >= d.daily_cap) as reached_cap
    FROM dids d
    LEFT JOIN did_usage du ON du.did_id = d.id AND du.day = current_date
    WHERE d.enabled = true AND d.tenant_id = $1
    ORDER BY d.state, calls_today DESC;
  `, [req.user.tenant_id]);
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
        AND tenant_id = $2
        GROUP BY did_id, code
        ORDER BY did_id, n DESC;
    `, [`${window}`, req.user.tenant_id]);
    res.json(r.rows);
});
