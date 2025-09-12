
import express from 'express';
import { db } from '../server.js';
import { startCampaign } from '../services/orchestrator.js';

export const router = express.Router();

router.get('/', async (_req,res)=>{
  const r = await db.query('select * from campaigns order by id desc limit 200');
  res.json(r.rows);
});

router.post('/', async (req,res)=>{
  const { name, type='predictive', pacing=2, max_channels=50, abandon_cap=0.03, queue='sales', amd={}, trunk_policy={}, retry_rules={} } = req.body||{};
  const r = await db.query(
    `insert into campaigns(name,type,pacing,max_channels,abandon_cap,queue,amd,trunk_policy,retry_rules)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,
    [name,type,pacing,max_channels,abandon_cap,queue,amd,trunk_policy,retry_rules]
  );
  res.status(201).json(r.rows[0]);
});

router.post('/:id/start', async (req,res)=>{
  const { id } = req.params;
  await db.query(`update campaigns set status='running', updated_at=now() where id=$1`, [id]);
  startCampaign(Number(id)); // fire-and-forget loop
  res.status(202).json({ ok:true });
});

router.post('/:id/pause', async (req,res)=>{
  const { id } = req.params;
  await db.query(`update campaigns set status='paused', updated_at=now() where id=$1`, [id]);
  res.status(202).json({ ok:true });
});

router.post('/:id/stop', async (req,res)=>{
  const { id } = req.params;
  await db.query(`update campaigns set status='stopped', updated_at=now() where id=$1`, [id]);
  res.status(202).json({ ok:true });
});

// GET /api/campaigns/:id/autoprotect (estado en vivo)
router.get('/:id/autoprotect', async (req, res) => {
  const id = Number(req.params.id);
  // Si quieres exponer el estado en memoria, puedes replicar la lógica mínima:
  const row = await db.query('select * from campaigns where id=$1', [id]);
  const c = row.rows?.[0];
  if (!c) return res.status(404).json({ error: { message: 'not_found' } });

  // Calcular on-demand (rápido)
  const look = Number(c.auto_protect_lookback_min ?? 15);
  const cap = Number(c.auto_protect_abandon_cap_pct ?? 3.0);

  const q = `
    WITH win AS (SELECT now() - interval '${look} minutes' AS start_ts)
    SELECT
      COUNT(*) FILTER (WHERE (raw->>'sip_code')='200')::int AS answered,
      COUNT(*) FILTER (WHERE (raw->>'sip_code')='200' AND (raw->>'safe_harbor')::bool IS TRUE)::int AS abandoned
    FROM cdr
    WHERE received_at >= (SELECT start_ts FROM win)
      AND (campaign_id = $1 OR (raw->>'X_CAMPAIGN')::int = $1)
  `;
  const r = await db.query(q, [id]);
  const ans = Number(r.rows?.[0]?.answered || 0);
  const abd = Number(r.rows?.[0]?.abandoned || 0);
  const pct = ans ? Number(((abd/ans)*100).toFixed(2)) : 0;
  res.json({ campaign_id: id, cap_pct: cap, window_min: look, answered: ans, abandoned: abd, abandonment_pct: pct });
});
