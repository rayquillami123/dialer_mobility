
import express from 'express';
import { db } from '../server.js';

export const router = express.Router();

router.post('/', async (req,res)=>{
  try{
    const raw = req.body;

    // Extraer variables útiles
    const vars = raw.variables || {};
    const campaign_id = raw.campaign_id || vars.X_CAMPAIGN;
    const list_id = raw.list_id || vars.X_LIST;
    const lead_id = raw.lead_id || vars.X_LEAD;

    // DID y troncal (de variables X_* si existen)
    const did_id = Number(vars.X_DID || raw.did_id || 0) || null;

    let trunk_id = raw.trunk_id || null;
    const trunkName = vars.X_TRUNK;
    if (!trunk_id && trunkName) {
      const tr = await db.query('select id from trunks where name=$1 limit 1', [trunkName]);
      trunk_id = tr.rows[0]?.id || null;
    }

    const amd_label = (raw.amd_label || vars.AMD_LABEL || '').toUpperCase();
    const amd_conf = Number(raw.amd_confidence || vars.AMD_CONFIDENCE || 0);
    const billsec = Number(raw.billsec || raw['billsec'] || 0);
    const duration = Number(raw.duration || raw['duration'] || 0);

    // Códigos SIP / PDD
    const sip_code = String(raw.sip_code || vars.sip_hangup_cause || '').trim();
    const pdd_ms = Number(raw.progress_media_msec || raw.progress_msec || vars.progress_mediamsec || vars.progressmsec || 0);

    // Número destino (dependiendo del template)
    const dest = raw.destination_number || raw['caller_destination_number'] || vars.destination_number || vars.Caller_Destination_Number || '';

    // Inserta CDR
    await db.query(`
      insert into cdr(raw,campaign_id,list_id,lead_id,did_id,trunk_id,amd_label,amd_conf,billsec,duration)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    `, [raw,campaign_id,list_id,lead_id,did_id,trunk_id,amd_label,amd_conf,billsec,duration]);

    // ---- Métricas diarias por DID ----
    if (did_id) {
      const day = new Date().toISOString().slice(0,10);

      // Asegura fila base
      await db.query(`insert into did_usage(did_id, day) values ($1,$2)
                      on conflict (did_id, day) do nothing`, [did_id, day]);

      // ÚNICOS por DID/día (idempotente)
      if (dest) {
        const ins = await db.query(`
          insert into did_usage_numbers(did_id, day, phone) values ($1,$2,$3)
          on conflict do nothing
        `, [did_id, day, dest]);

        if (ins.rowCount > 0) {
          await db.query(`
            update did_usage set unique_numbers = coalesce(unique_numbers,0) + 1
            where did_id=$1 and day=$2
          `, [did_id, day]);
        }
      }

      // Clasificación básica por tipo
      const isHuman = amd_label === 'HUMAN';
      const isVoicemail = /MACHINE|VOICEMAIL/i.test(amd_label);
      const isFax = amd_label === 'FAX' || String(vars.fax_detected || '').toLowerCase() === 'true';

      // SIT aproximado: códigos típicos de número no asignado / incompleto (ajusta a tu mapping)
      const isSIT = ['404','410','484'].includes(sip_code);

      // Aplica incrementos (solo si corresponde)
      const incCols = [];
      if (isHuman) incCols.push('human');
      if (isVoicemail) incCols.push('voicemail');
      if (isFax) incCols.push('fax');
      if (isSIT) incCols.push('sit');

      if (incCols.length) {
        const sets = incCols.map(c => `${c} = coalesce(${c},0) + 1`).join(', ');
        await db.query(`update did_usage set ${sets} where did_id=$1 and day=$2`, [did_id, day]);
      }
    }

    res.status(200).json({ ok:true });
  }catch(e){
    console.error('CDR error', e);
    // Responder 2xx para no bloquear reintentos del FS
    res.status(200).json({ ok:false });
  }
});
