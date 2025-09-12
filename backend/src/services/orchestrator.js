
import { db } from '../server.js';
import { numberToState, pickDidForState, canCallLeadToday } from './did_policy.js';
import { getEslSocket } from './esl.js';

export async function startCampaign(campaignId){
  console.log('[ORCH] start campaign', campaignId);
  loop(campaignId); // no await
}

async function loop(campaignId){
  const esl = getEslSocket();
  if (!esl) {
    console.error('[ORCH] ESL socket not available, retrying in 5s...');
    setTimeout(()=>loop(campaignId), 5000);
    return;
  }

  // Ejecuta mientras status=running
  try{
    const s = await db.query('select status, pacing, max_channels, queue from campaigns where id=$1',[campaignId]);
    if (!s.rows[0] || s.rows[0].status !== 'running') return;
    const { pacing, max_channels, queue } = s.rows[0];

    // Buscar un batch pequeño (pacing) de leads elegibles
    const batch = await db.query(`
      with next as (
        select l.id as lead_id, l.list_id, l.phone, l.state, l.timezone
        from leads l
        where l.status in ('new','in_progress')
          and not exists (select 1 from dnc_numbers d where d.phone = l.phone)
        order by l.priority desc, l.id
        limit $1
        for update skip locked
      )
      select * from next
    `, [Math.max(1, Math.floor(Number(pacing)||2))]);

    for (const lead of batch.rows){
      // cumplimiento de 8 intentos/día
      const allowed = await canCallLeadToday(lead.lead_id, lead.timezone);
      if (!allowed) {
        await db.query('update leads set status = $2 where id=$1',[lead.lead_id, 'done']);
        continue;
      }

      const st = lead.state || await numberToState(lead.phone);
      const did = await pickDidForState(st);
      if (!did) continue;

      const cli = did.e164;

      // Construir originate
      const vars = [
        `origination_caller_id_number=${cli}`,
        `effective_caller_id_number=${cli}`,
        `export_vars='X_CAMPAIGN,X_LIST,X_LEAD,X_TRUNK,X_DID'`,
        `X_CAMPAIGN=${campaignId}`,
        `X_LIST=${lead.list_id}`,
        `X_LEAD=${lead.lead_id}`,
        `X_TRUNK=gw_main`, // Debería ser dinámico según política de troncales
        `X_DID=${did.id}`
      ].join(',');

      const dest = lead.phone.replace('+',''); // ajusta a tu gateway
      const cmd = `originate {${vars}}sofia/gateway/gw_main/${dest} &park()`;

      // Registrar intento
      await db.query(`insert into attempts(campaign_id, list_id, lead_id, did_id, dest_phone, state, result)
                      values($1,$2,$3,$4,$5,$6,$7)`,
                      [campaignId, lead.list_id, lead.lead_id, did.id, lead.phone, st, 'Dialing']);
      
      // Ejecutar originate (fire-and-forget)
      esl.write(`api ${cmd}\n\n`);

      // Marcar lead en progreso
      await db.query('update leads set status=$2, last_attempt_at=now(), attempt_count_total=attempt_count_total+1 where id=$1',
                     [lead.lead_id, 'in_progress']);
    }
  }catch(e){
    console.error('[ORCH] error', e);
  }finally{
    setTimeout(()=>loop(campaignId), 500); // lazo suave (ajusta por CPS)
  }
}
