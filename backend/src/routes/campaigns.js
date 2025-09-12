
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
