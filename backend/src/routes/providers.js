
import express from 'express';
import { db } from '../server.js';
import { requireRole } from '../mw/authz.js';

export const router = express.Router();

// GET /providers/health
router.get('/health', async (req, res) => {
  const window = req.query.window || '15m'; // e.g. 15m, 1h, 24h

  // Sanitize window param to avoid SQL injection
  if (!/^\d+[mhd]$/.test(window)) {
    return res.status(400).json({ error: { code: 'bad_request', message: 'Invalid window format. Use e.g. 15m, 1h, 24h' }});
  }
  const interval = window.replace('m', ' minutes').replace('h', ' hours').replace('d', ' days');

  const r = await db.query(`
    SELECT 
      t.id as trunk_id,
      t.name as trunk_name,
      COUNT(c.id) AS total_calls,
      COALESCE(COUNT(c.id) FILTER (WHERE (c.raw->>'sip_code')='200')::float / NULLIF(COUNT(c.id), 0), 0) AS asr,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY COALESCE((c.raw->>'progress_media_msec')::int, (c.raw->>'progress_msec')::int)) AS p50_pdd_ms,
      percentile_cont(0.9) WITHIN GROUP (ORDER BY COALESCE((c.raw->>'progress_media_msec')::int, (c.raw->>'progress_msec')::int)) AS p90_pdd_ms,
      (SELECT jsonb_object_agg(code, n)
       FROM (
         SELECT raw->>'sip_code' as code, COUNT(*) as n
         FROM cdr
         WHERE trunk_id = t.id AND received_at >= now() - $1::interval AND raw->>'sip_code' IS NOT NULL
         GROUP BY code
       ) as sip_counts
      ) as sip_mix
    FROM trunks t
    LEFT JOIN cdr c ON c.trunk_id = t.id AND c.received_at >= now() - $1::interval
    WHERE t.tenant_id = $2
    GROUP BY t.id, t.name
    ORDER BY t.name;
  `, [interval, req.user.tenant_id]);

  res.json(r.rows);
});


router.get('/', requireRole('admin', 'supervisor'), async(req, res) => {
    const r = await db.query('SELECT * FROM trunks WHERE tenant_id = $1 ORDER BY name', [req.user.tenant_id]);
    res.json({ items: r.rows });
});

router.post('/', requireRole('admin'), async(req, res) => {
    const { name, host, codecs, cliRoute, maxCPS, enabled } = req.body;
    const r = await db.query(
        'INSERT INTO trunks (tenant_id, name, host, codecs, route, max_cps, enabled) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
        [req.user.tenant_id, name, host, codecs, cliRoute, maxCPS, enabled]
    );
    res.status(201).json(r.rows[0]);
});

router.patch('/:id', requireRole('admin'), async(req, res) => {
    const { id } = req.params;
    const { name, host, codecs, cliRoute, maxCPS, enabled } = req.body;

    // build query dynamically based on provided fields
    const fields = [];
    const values = [];
    let query = 'UPDATE trunks SET ';

    if (name !== undefined) { fields.push('name'); values.push(name); }
    if (host !== undefined) { fields.push('host'); values.push(host); }
    if (codecs !== undefined) { fields.push('codecs'); values.push(codecs); }
    if (cliRoute !== undefined) { fields.push('route'); values.push(cliRoute); }
    if (maxCPS !== undefined) { fields.push('max_cps'); values.push(maxCPS); }
    if (enabled !== undefined) { fields.push('enabled'); values.push(enabled); }
    
    if (fields.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
    }

    query += fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
    query += ` WHERE id = $${fields.length + 1} AND tenant_id = $${fields.length + 2} RETURNING *`;
    values.push(id, req.user.tenant_id);

    const r = await db.query(query, values);
    res.json(r.rows[0]);
});
