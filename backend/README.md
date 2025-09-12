
# Dialer Backend Skeleton (Node.js + PostgreSQL + FreeSWITCH)

Este es un esqueleto funcional para conectar tu UI con FreeSWITCH:
- API REST + WebSocket (Express + ws)
- Orquestador de marcado (originate vía ESL)
- Ingesta de CDR (`/cdr`)
- Política de DIDs por estado (rotación + límites por día)
- Reglas de reintento y cumplimiento (máx 8 intentos por lead/día, máx por DID/día)

> **Importante:** Este repo es un punto de partida. Ajusta a tus necesidades, seguridad, y despliegue.

## Requisitos
- Node 18+
- PostgreSQL 14+
- FreeSWITCH con `mod_event_socket`, `mod_json_cdr`, `mod_callcenter` (ver guía que adjuntamos)

## Setup rápido
```bash
cp .env.example .env
# Edita credenciales
npm i
npm run db:setup     # crea esquema
npm run dev
```

## Servicios
- **API**: `src/server.js` (REST + WebSocket)
- **Orquestador**: `src/services/orchestrator.js` (elige leads, asigna DID, hace originate)
- **ESL**: `src/services/esl.js` (agrega eventos → WS y callbacks internos)
- **Política de DID**: `src/services/did_policy.js`
- **Ingesta CDR**: `src/routes/cdr.js` (compatible con mod_json_cdr)

## Flujo de marcado (simplificado)
1. El supervisor inicia una campaña (`/campaigns/:id/start`).
2. El orquestador busca *N* leads con `FOR UPDATE SKIP LOCKED`, valida cumplimiento (DNC, ventana horaria, máx intentos/día).
3. Selecciona DID por **estado** (NPA→state), verifica salud/uso y límites por día.
4. Origina con ESL: exporta `X_*` (campaña, lista, lead, troncal, DID) y CLI.
5. FreeSWITCH enruta, AMD/IA etiqueta, `json_cdr` POSTea `/cdr`.
6. El agregador ESL emite `call.update`/`kpi.tick` por WebSocket a la UI.
7. La UI renderiza dashboard y tiempo real.

## Scripts npm
- `npm run dev` → `node src/server.js`
- `npm run db:setup` → aplica `sql/schema.sql`
- `npm run orchestrator` → corre sólo el orquestador (útil en pruebas)

## Seguridad
- Protege `/cdr` por IP allowlist y token.
- ESL **siempre** en 127.0.0.1 o ACL estricta.
- Tokens rotables en `.env`.
