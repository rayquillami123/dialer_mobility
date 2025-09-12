import express from 'express';
import { db } from '../server.js';
export const router = express.Router();

router.get('/cdr', async (req,res)=>{
  const { from, to, campaignId } = req.query;
  const r = await db.query(`select received_at as time, raw->>'destination_number' as phone,
    coalesce(amd_label, raw->>'amd_label') as amd, billsec, duration
    from cdr
    where ($1::timestamptz is null or received_at >= $1)
      and ($2::timestamptz is null or received_at < $2)
      and ($3::int is null or campaign_id = $3)
    order by received_at desc limit 1000`,
    [from||null, to||null, campaignId||null]);
  res.json(r.rows);
});

router.get('/abandonment', async (req, res) => {
  try {
    const win = String(req.query.window || '1d');
    const iv = win.endsWith('m') ? `${parseInt(win)} minutes`
             : win.endsWith('h') ? `${parseInt(win)} hours`
             : '1 day';

    const q = `
      WITH calls AS (
        SELECT
          coalesce(campaign_id, (raw->>'X_CAMPAIGN')::int) AS campaign_id,
          (raw->>'sip_code') AS sip_code,
          (raw->>'safe_harbor')::bool AS safe_harbor, 
          (raw->>'answer_ts')::timestamptz AS answer_ts
        FROM cdr
        WHERE received_at >= now() - interval '${iv}'
      )
      SELECT
        campaign_id,
        COUNT(*)::int AS total_answered,
        COUNT(*) FILTER (WHERE safe_harbor = true)::int AS abandoned_safeharbor,
        CASE
          WHEN COUNT(*) = 0 THEN 0
          ELSE ROUND( (COUNT(*) FILTER (WHERE safe_harbor = true)::numeric / COUNT(*)::numeric) * 100, 2)
        END AS abandonment_pct
      FROM calls
      WHERE sip_code = '200'
      GROUP BY campaign_id
      ORDER BY abandonment_pct DESC NULLS LAST;
    `;
    const r = await db.query(q);
    res.json({ window: iv, items: r.rows });
  } catch (e) {
    console.error('abandonment error', e);
    res.status(500).json({ error: { message: 'internal_error' } });
  }
});

/**
 * GET /api/reports/abandonment/timeseries?campaign_id=1&hours=6&bucket=5m
 * bucket soportado: 1m|5m|15m|60m (minutos u horas)
 * Nota: Esta serie asume que etiquetas 'safe_harbor=true' en tus CDR/eventos cuando disparas el mensaje ≤2s.
 */
router.get('/abandonment/timeseries', async (req, res) => {
  try {
    const campaignId = req.query.campaign_id ? Number(req.query.campaign_id) : null;
    const hours = req.query.hours ? Math.max(1, Number(req.query.hours)) : 6;
    const bucket = String(req.query.bucket || '5m'); // '1m'|'5m'|'15m'|'60m'

    // construye intervalos seguros
    const bucketMap = { '1m': '1 minute', '5m': '5 minutes', '15m': '15 minutes', '60m': '60 minutes' };
    const iv = bucketMap[bucket] || '5 minutes';

    // Rango de tiempo
    const q = `
      WITH params AS (
        SELECT now() - interval '${hours} hours' AS start_ts,
               now() AS end_ts
      ),
      series AS (
        SELECT generate_series((SELECT start_ts FROM params),
                               (SELECT end_ts FROM params),
                               interval '${iv}') AS bucket_start
      ),
      answered AS (
        SELECT date_trunc('${iv}'::text, received_at) AS bucket_start,
               COUNT(*) AS answered
        FROM cdr
        WHERE received_at BETWEEN (SELECT start_ts FROM params) AND (SELECT end_ts FROM params)
          AND (raw->>'sip_code') = '200'
          ${campaignId ? `AND (campaign_id = ${campaignId} OR (raw->>'X_CAMPAIGN')::int = ${campaignId})` : ''}
        GROUP BY 1
      ),
      abandoned AS (
        -- Marcadas como safe_harbor=true en CDR/raw (ajusta si usas otra tabla de eventos)
        SELECT date_trunc('${iv}'::text, received_at) AS bucket_start,
               COUNT(*) AS abandoned
        FROM cdr
        WHERE received_at BETWEEN (SELECT start_ts FROM params) AND (SELECT end_ts FROM params)
          AND (raw->>'sip_code') = '200'
          AND ((raw->>'safe_harbor')::bool IS TRUE)
          ${campaignId ? `AND (campaign_id = ${campaignId} OR (raw->>'X_CAMPAIGN')::int = ${campaignId})` : ''}
        GROUP BY 1
      )
      SELECT
        s.bucket_start,
        COALESCE(a.answered,0)::int AS answered,
        COALESCE(b.abandoned,0)::int AS abandoned,
        CASE
          WHEN COALESCE(a.answered,0) = 0 THEN 0
          ELSE ROUND((COALESCE(b.abandoned,0)::numeric / a.answered::numeric) * 100, 2)
        END AS abandonment_pct
      FROM series s
      LEFT JOIN answered a ON a.bucket_start = s.bucket_start
      LEFT JOIN abandoned b ON b.bucket_start = s.bucket_start
      ORDER BY s.bucket_start ASC;
    `;

    const r = await db.query(q);
    res.json({
      window: `${hours}h`,
      bucket: iv,
      campaign_id: campaignId,
      points: r.rows.map(row => ({
        bucket_start: row.bucket_start, // ISO timestamp
        answered: Number(row.answered),
        abandoned: Number(row.abandoned),
        abandonment_pct: Number(row.abandonment_pct),
      })),
    });
  } catch (e) {
    console.error('abandonment timeseries error', e);
    res.status(500).json({ error: { message: 'internal_error' } });
  }
});
