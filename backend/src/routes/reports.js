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
