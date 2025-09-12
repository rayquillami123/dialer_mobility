
import { db } from '../server.js';

// Mapear número E.164 (US) a estado por NPA (3 primeros dígitos)
export async function numberToState(e164){
  const m = (e164||'').match(/^\+1(\d{3})/);
  if (!m) return null;
  const npa = m[1];
  const r = await db.query('select state from state_area_codes where npa=$1 limit 1',[npa]);
  return r.rows[0]?.state || null;
}

// Devuelve un DID viable para ese estado, rotando por salud/uso/recencia.
// Cumple: daily_cap y MAX_CALLS_PER_DID_PER_DAY (env)
export async function pickDidForState(state){
  const maxPerDid = Number(process.env.MAX_CALLS_PER_DID_PER_DAY || 300);
  const today = new Date().toISOString().slice(0,10);
  const r = await db.query(`
    select d.id, d.e164, d.state, d.score, du.calls_total, d.last_used_at
      from dids d
      left join did_usage du on du.did_id = d.id and du.day = $1
      where d.enabled = true and (d.state = $2 or $2 is null)
      order by coalesce(du.calls_total,0) asc, d.score desc, d.last_used_at nulls first
      limit 10
  `, [today, state]);
  const row = r.rows.find(x => (x.calls_total||0) < maxPerDid) || r.rows[0];
  if (!row) return null;
  await db.query('update dids set last_used_at=now() where id=$1',[row.id]);
  await db.query(`
    insert into did_usage(did_id, day, calls_total) values ($1, $2, 1)
    on conflict (did_id, day) do update set calls_total = did_usage.calls_total + 1
  `, [row.id, today]);
  return row;
}

// Chequea cumplimiento para lead (máx 8 intentos/día)
export async function canCallLeadToday(leadId, tz, nowUtc = new Date()){
  const maxPerLead = Number(process.env.MAX_CALLS_PER_LEAD_PER_DAY || 8);
  // frontera de día en tz destino
  const q = await db.query(`
    with bounds as (
      select
        (timezone($1, $2::timestamptz))::date as d
    )
    select count(*)::int as c
    from attempts a, bounds b
    where a.lead_id = $3
      and timezone($1, a.attempt_at)::date = b.d
  `, [tz||'UTC', nowUtc.toISOString(), leadId]);
  return (q.rows[0]?.c || 0) < maxPerLead;
}
