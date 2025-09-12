
import express from 'express';
import { db } from '../server.js';

export const router = express.Router();

// Recepción de CDR desde FreeSWITCH (mod_json_cdr)
router.post('/', async (req,res)=>{
  try{
    const raw = req.body;
    // Extraer algunos campos útiles
    const campaign_id = raw.campaign_id || raw['variables']?.X_CAMPAIGN;
    const list_id = raw.list_id || raw['variables']?.X_LIST;
    const lead_id = raw.lead_id || raw['variables']?.X_LEAD;
    const did_id = raw.did_id;
    const trunk_id = raw.trunk_id;
    const amd_label = raw.amd_label || raw['variables']?.AMD_LABEL;
    const amd_conf = Number(raw.amd_confidence || raw['variables']?.AMD_CONFIDENCE || 0);
    const billsec = Number(raw.billsec || raw['billsec'] || 0);
    const duration = Number(raw.duration || raw['duration'] || 0);

    await db.query(`insert into cdr(raw,campaign_id,list_id,lead_id,did_id,trunk_id,amd_label,amd_conf,billsec,duration)
                    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
                    [raw,campaign_id,list_id,lead_id,did_id,trunk_id,amd_label,amd_conf,billsec,duration]);

    res.status(200).json({ ok:true });
  }catch(e){
    console.error('CDR error', e);
    res.status(200).json({ ok:false }); // responder 2xx para no bloquear reintentos
  }
});
