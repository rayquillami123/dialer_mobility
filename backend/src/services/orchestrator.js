import { db } from '../server.js';
import { numberToState, pickDidForState, canCallLeadToday } from './did_policy.js';
import { getEslSocket } from './esl.js';
import { computeDialRate } from '../lib/predictor.js';

// Cache para la salud de las troncales para no consultar en cada ciclo
const trunkHealthCache = {
  data: null,
  timestamp: 0,
  ttl: 60 * 1000 // 1 minuto
};

async function fetchTrunkHealth(minutes = 15){
    // Salud básica: ASR y recuento 5xx por troncal (últimos N minutos)
    const q = `
      SELECT t.id as trunk_id, t.name as trunk_name,
             COUNT(*) FILTER (WHERE (c.raw->>'sip_code')='200')::float/NULLIF(COUNT(*),0) AS asr,
             COUNT(*) FILTER (WHERE (c.raw->>'sip_code')::int BETWEEN 500 AND 599) AS c5xx
      FROM cdr c
      JOIN trunks t ON t.id = c.trunk_id
      WHERE c.received_at >= now() - interval '${minutes} minutes'
      GROUP BY 1,2
    `;
    const r = await db.query(q);
    return r.rows;
}

function chooseWeighted(items){
    const total = items.reduce((s,i)=>s+(i.weight||0),0);
    if (total<=0) return items[0];
    let rnd = Math.random()*total;
    for(const it of items){
      rnd -= (it.weight||0);
      if (rnd<=0) return it;
    }
    return items[items.length-1];
}

async function getTrunkWithFailover(campaign) {
    const policy = campaign.trunk_policy || {};
    const weights = (policy.weights||{}); 
    const now = Date.now();

    if (now - trunkHealthCache.timestamp > trunkHealthCache.ttl) {
        trunkHealthCache.data = await fetchTrunkHealth(15);
        trunkHealthCache.timestamp = now;
    }

    const rows = await db.query(`SELECT id, name, enabled FROM trunks WHERE enabled=true`);
    const items = [];
    for (const t of rows.rows){
      let w = Number(weights[t.name] ?? 100);
      const h = trunkHealthCache.data.find(x=>x.trunk_id === t.id);
      if (h){
        if (h.asr !== null && h.asr < 0.2) w = Math.max(5, Math.floor(w*0.5));
        if ((h.c5xx||0) > 20) w = Math.max(5, Math.floor(w*0.5));
      }
      items.push({ id:t.id, name:t.name, weight:w });
    }
    items.sort((a,b)=>b.weight-a.weight);
    const chosen = chooseWeighted(items) || items[0];
    return chosen?.name || Object.keys(weights)[0] || 'gw_main';
}


export async function startCampaign(campaignId){
  console.log('[ORCH] start campaign', campaignId);
  loop(campaignId); // no await
}

async function loop(campaignId){
  const { eslSocket, api } = getEslSocket();
  if (!eslSocket) {
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
           and (now() at time zone $2)::time between start_local and end_local limit 1`,
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
      
      const trunkInfo = await db.query('SELECT id FROM trunks WHERE name = $1', [trunkId]);
      const trunkDbId = trunkInfo.rows[0]?.id;

      // Construir originate
      const vars = [
        `origination_caller_id_number=${cli}`,
        `effective_caller_id_number=${cli}`,
        `export_vars='X_CAMPAIGN,X_LIST,X_LEAD,X_TRUNK,X_DID,X_PBX_QUEUE'`,
        `X_CAMPAIGN=${campaignId}`,
        `X_LIST=${lead.list_id}`,
        `X_LEAD=${lead.lead_id}`,
        `X_TRUNK=${trunkId}`,
        `X_DID=${did.id}`,
        `X_PBX_QUEUE=${queue || 'sales'}` // Cola en la PBX de destino
      ].join(',');

      const dest = lead.phone.replace('+',''); // ajusta a tu gateway
      // En lugar de &park(), transferimos a un dialplan que se encargará del ruteo AMD
      const cmd = `originate {${vars}}sofia/gateway/${trunkId}/${dest} &transfer('dialer_amd_routing XML default')`;

      // Registrar intento
      await db.query(`insert into attempts(campaign_id, list_id, lead_id, did_id, trunk_id, dest_phone, state, result)
                      values($1,$2,$3,$4,$5,$6,$7,$8)`,
                      [campaignId, lead.list_id, lead.lead_id, did.id, trunkDbId, lead.phone, st, 'Dialing']);
      
      // Ejecutar originate (fire-and-forget)
      api(cmd);

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
