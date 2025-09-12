# Dialer Mobilitytech — API v1 (Contracts)

_Revision: 2025-09-12T14:11:50.829194 UTC_


Base URL: `/api/v1`  
Auth: `Authorization: Bearer <token>` (JWT or opaque).  
All responses are JSON. Errors follow the format:

```json
{"error": {"code":"<slug>","message":"<human message>","details":{} }}
```

---

## WebSocket (Real‑time)
Endpoint: `GET /ws` (Upgrade to WebSocket).

### Messages (server → client)

#### 1) KPI tick
```json
{"type":"kpi.tick","scope":"global|campaign|trunk","id":"cmp_1",
  "asr5m":0.54,"acd":71,"cps":18,"cc":142,"abandon60s":0.02,
  "humanRate":0.31,"amd":{"HUMAN":12,"VOICEMAIL":8,"FAX":2,"SIT":1,"UNKNOWN":5},
  "windowSec":60,"ts":1736722800123}
```

#### 2) Call update
```json
{"type":"call.update","uuid":"c2f...","ts":1736722800456,
  "campaignId":"cmp_1","trunkId":"gw_main","number":"+12223334444",
  "state":"Dialing|Ringing|Connected|Fax|Sit|Voicemail|NoAnswer|Hangup",
  "sip":"486","amd":{"label":"HUMAN","conf":0.84},
  "queue":"sales","agentId":"1001","billsec":10}
```

#### 3) Agent / Queue
```json
{"type":"agent.update","agentId":"1001","status":"Available|On Break|On Call|Wrapup","ts":1736722800123}
{"type":"queue.update","queue":"sales","inQueue":3,"serviced":120,"slaPct":0.92,"ts":1736722810000}
```

---

## Campaigns

### Create
`POST /campaigns`
```json
{
  "name":"Ventas Q1","type":"predictive",
  "listId":"lst_2025_12_09","queue":"sales",
  "trunkPolicy":{"weights":{"gw_main":70,"gw_backup":30},"caps":{"gw_main":20,"gw_backup":10}},
  "pacing":2,"maxChannels":50,"abandonCap":0.03,
  "amd":{"engine":"hybrid","minConfidence":0.7,"windowMs":900,"detectFax":true,"detectSIT":true},
  "predictive":{"targetOccupancy":0.85,"ahtSec":240}
}
```
**201** →
```json
{"id":"cmp_1","status":"paused"}
```

### Update
`PATCH /campaigns/{{id}}` (partial allowed)

### Lifecycle
`POST /campaigns/{{id}}/start` → **202**  
`POST /campaigns/{{id}}/pause` → **202**  
`POST /campaigns/{{id}}/stop` → **202**

### Runtime
`GET /campaigns/{{id}}/runtime` →
```json
{"status":"running","pacing":2,"asr5m":0.48,"acd":63,"cps":14,"cc":120,"abandon60s":0.012}
```

### List / Get
`GET /campaigns?status=&q=` — `GET /campaigns/{{id}}`

---

## Lists & Leads

### Create list
`POST /lists`
```json
{"name":"Lista 12/09/2025"}
```

### Import CSV
`POST /lists/{{id}}/import`  (multipart/form-data; file=`csv`)  
Columns: **phone** (E.164). Optional: `firstName,lastName,state,timezone,altPhone1,altPhone2,zip,notes`.  
Server valida: formato, duplicados, DNC, timezone inferido (state/zip).

### Retry rules by disposition
`POST /lists/{{id}}/retry-rules`
```json
{"rules":{
  "NOANSWER":{"cooldownMin":30,"maxAttempts":4},
  "BUSY":{"cooldownMin":10,"maxAttempts":3},
  "VOICEMAIL":{"cooldownMin":1440,"maxAttempts":2},
  "CALLBACK":{"scheduledAt":"2025-12-09T14:00:00Z"}
}}
```

### Leads list / Disposition
`GET /lists/{{id}}/leads?after=&limit=&q=`  
`POST /leads/{{leadId}}/disposition`
```json
{"campaignId":"cmp_1","disposition":"SALE|CALLBACK|NOANSWER|BUSY|VOICEMAIL|DNC","notes":"..." }
```

---

## Queues & Agents (mod_callcenter)

### Queues
`POST /queues`
```json
{"name":"sales","strategy":"longest-idle-agent","moh":"local_stream://moh",
  "tierRules":{"apply":true,"waitSecond":15,"waitMultiplyLevel":true},
  "wrapUpSec":3,"noAnswerDelaySec":2}
```
`GET /queues`

### Agents
`POST /agents`
```json
{"name":"1001","contact":"user/1001","type":"callback"}
```
`PATCH /agents/{{id}}/state`
```json
{"status":"Available|Logged Out|On Break|Wrapup"}
```
`POST /queues/{{queue}}/tiers`
```json
{"agent":"1001","level":1,"position":1}
```

---

## Providers / Trunks

`POST /providers` / `PATCH /providers/{{id}}`
```json
{"name":"gw_main","host":"sip.provider.net","codecs":["PCMU","PCMA"],"route":"CLI","maxCps":20,"enabled":true}
```
`GET /providers/health`
```json
{"items":[{"id":"gw_main","asr5m":0.42,"pddMs":2200,"cps":14,"cpsMax":20,
"sip":{"486":120,"480":30,"503":9},"sitPct":0.8,"faxPct":0.2}]}
```
`POST /providers/{{id}}/probe` → originate test call

---

## Reports

### Raw CDR
`GET /reports/cdr?from=&to=&campaignId=&trunkId=&agentId=&disposition=&amd=&format=csv`

### Aggregates
`GET /reports/campaign?from=&to=` → ASR/ACD/abandono/contact-rate por campaña.  
`GET /reports/provider?from=&to=` → KPIs por troncal.  
`GET /reports/agent?from=&to=` → AHT/occupancy por agente.

---

## Audit

`GET /audit?from=&to=&actor=&action=&targetType=&targetId=&page=`  
`POST /audit`
```json
{"actorId":"u_42","actorIp":"203.0.113.5","action":"campaign.start",
  "targetType":"campaign","targetId":"cmp_12","details":{"pacing":2}}
```

---

## Integrations (FreeSWITCH)

`POST /integrations/fs/guide` → returns **application/zip** or **text/markdown**.  
`POST /integrations/fs/notes` → returns checklist JSON.  
`POST /integrations/fs/esl-suggest` → returns suggested event_socket & ACL snippet.

---

## CDR Intake (FreeSWITCH → Backend)

`POST /cdr`  (FreeSWITCH `mod_json_cdr` POSTs here). Return 2xx.

### Expected JSON fields
```json
{
  "uuid":"...","call_id":"...","direction":"inbound|outbound",
  "start_stamp":"2025-12-09 08:01:02","answer_stamp":"2025-12-09 08:01:05","end_stamp":"2025-12-09 08:01:47",
  "duration":45,"billsec":42,"hangup_cause":"NORMAL_CLEARING","sip_hangup_cause":"16",
  "caller_id_name":"...","caller_id_number":"+13055550123","destination_number":"+12223334444",
  "campaign_id":"cmp_1","list_id":"lst_1","lead_id":"lead_999","trunk_id":"gw_main",
  "queue":"sales","agent_id":"1001","recording_url":"https://.../rec.wav",
  "amd_label":"HUMAN","amd_confidence":"0.84","amd_latency_ms":"930",
  "progress_ms":"2500","early_media_ms":"0","network_addr":"1.2.3.4",
  "read_codec":"PCMU","write_codec":"PCMU"
}
```

---

## Error Codes
- `bad_request` (400) – invalid payload/params  
- `unauthorized` (401) – bad or missing token  
- `forbidden` (403) – policy/role  
- `not_found` (404) – id unknown  
- `conflict` (409) – state conflict  
- `rate_limited` (429)  
- `server_error` (500)

## Security
- Admin endpoints require RBAC.  
- CDR/ESL endpoints allowlist + TLS.  
- Rotate API tokens and ESL password regularly.