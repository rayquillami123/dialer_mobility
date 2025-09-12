import { db } from '../server.js';
import { numberToState, pickDidForState, canCallLeadToday } from './did_policy.js';
import { getEslSocket } from './esl.js';
import { computeDialRate } from '../lib/predictor.js';

// Cache para la salud de las troncales para no consultar en cada ciclo
const trunkHealthCache = {
  data: null,
  timestamp: 0,
  ttl: 15 * 60 * 1000 // 15 minutos
};

async function getTrunkWithFailover(campaign) {
    const now = Date.now();
    // Actualizar cache si es muy viejo
    if (now - trunkHealthCache.timestamp > trunkHealthCache.ttl) {
        try {
            const apiUrl = `http://localhost:${process.env.PORT || 9003}`;
            const response = await fetch(`${apiUrl}/api/providers/health?window=15m`);
            if (response.ok) {
                trunkHealthCache.data = await response.json();
                trunkHealthCache.timestamp = now;
            } else {
                trunkHealthCache.data = null;
            }
        } catch (e) {
            console.error('[ORCH] Could not fetch trunk health', e);
            trunkHealthCache.data = null;
        }
    }

    const weights = { ...campaign.trunk_policy?.weights };
    if (trunkHealthCache.data && weights) {
        for (const item of trunkHealthCache.data) {
            if (!item || !item.trunk_id) continue;
            // Lógica de failover simple: reducir peso si ASR es bajo o hay muchos errores 5xx
            if (item.asr !== null && item.asr < 0.2) {
                weights[item.trunk_id] = Math.max(5, Math.floor(weights[item.trunk_id] * 0.5));
            }
            if (item.sip_mix?.['503'] > 20) { // Asumiendo que sip_mix tiene los conteos
                weights[item.trunk_id] = Math.max(5, Math.floor(weights[item.trunk_id] * 0.5));
            }
        }
    }
    
    // Elegir troncal basado en pesos (simplificado)
    const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0);
    let random = Math.random() * totalWeight;
    for (const [trunkId, weight] of Object.entries(weights)) {
        random -= weight;
        if (random <= 0) return trunkId;
    }
    return Object.keys(weights)[0]; // Fallback
}


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
    const s = await db.query('select * from campaigns where id=$1',[campaignId]);
    const campaign = s.rows[0];
    if (!campaign || campaign.status !== 'running') return;
    
    const { pacing, max_channels, queue, trunk_policy } = campaign;

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
      // 1. Cumplimiento de ventana horaria
      const okWindow = await db.query(
        `select 1 from call_windows
         where active and (state is null or state=$1)
           and (localtime at time zone $2) between start_local and end_local limit 1`,
        [lead.state, lead.timezone || 'UTC']
      );
      if (okWindow.rowCount === 0) continue; // saltar lead fuera de ventana

      // 2. Cumplimiento de 8 intentos/día
      const allowed = await canCallLeadToday(lead.lead_id, lead.timezone);
      if (!allowed) {
        await db.query('update leads set status = $2 where id=$1',[lead.lead_id, 'done']);
        continue;
      }

      const st = lead.state || await numberToState(lead.phone);
      const did = await pickDidForState(st);
      if (!did) continue;

      const cli = did.e164;
      const trunkId = await getTrunkWithFailover(campaign);
      if (!trunkId) {
          console.error('[ORCH] No viable trunk found');
          continue;
      }

      // Construir originate
      const vars = [
        `origination_caller_id_number=${cli}`,
        `effective_caller_id_number=${cli}`,
        `export_vars='X_CAMPAIGN,X_LIST,X_LEAD,X_TRUNK,X_DID'`,
        `X_CAMPAIGN=${campaignId}`,
        `X_LIST=${lead.list_id}`,
        `X_LEAD=${lead.lead_id}`,
        `X_TRUNK=${trunkId}`,
        `X_DID=${did.id}`
      ].join(',');

      const dest = lead.phone.replace('+',''); // ajusta a tu gateway
      const cmd = `originate {${vars}}sofia/gateway/${trunkId}/${dest} &park()`;

      // Registrar intento
      await db.query(`insert into attempts(campaign_id, list_id, lead_id, did_id, dest_phone, state, result)
                      values($1,$2,$3,$4,$5,$6,$7)`,
                      [campaignId, lead.list_id, lead.lead_id, did.id, lead.phone, st, 'Dialing']);
      
      // Ejecutar originate (fire-and-forget)
      esl.api(cmd);

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
