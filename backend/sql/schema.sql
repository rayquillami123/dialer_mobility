-- Apaga noticias para psql
\set QUIET 1

-- Muestra solo errores
\set ON_ERROR_ROLLBACK 1
\set ON_ERROR_STOP true
\set ECHO errors

-- Envuelve toda la creación en una transacción
BEGIN;

-- Limpia el esquema existente si es necesario (para re-ejecución)
DROP TABLE IF EXISTS
  audit,
  cdr,
  state_area_codes,
  dids,
  trunks,
  providers,
  leads,
  lists,
  campaigns
CASCADE;

-- Tabla de Campañas
CREATE TABLE campaigns (
  id          serial PRIMARY KEY,
  name        text NOT NULL,
  status      text NOT NULL DEFAULT 'draft', -- draft, running, paused, completed
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Tabla de Listas de Leads
CREATE TABLE lists (
  id          serial PRIMARY KEY,
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Tabla de Leads
CREATE TABLE leads (
  id            serial PRIMARY KEY,
  list_id       integer NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  phone         text NOT NULL,
  first_name    text,
  last_name     text,
  state         varchar(2),
  timezone      text,
  attempts      smallint NOT NULL DEFAULT 0,
  last_dispo    text,
  next_try_at   timestamptz
);
CREATE INDEX ON leads (list_id);
CREATE INDEX ON leads (phone);

-- Tabla de Proveedores SIP
CREATE TABLE providers (
  id    serial PRIMARY KEY,
  name  text NOT NULL UNIQUE,
  host  text NOT NULL
);

-- Tabla de Troncales/Trunks
CREATE TABLE trunks (
  id          serial PRIMARY KEY,
  provider_id integer NOT NULL REFERENCES providers(id),
  name        text NOT NULL UNIQUE,
  codecs      text DEFAULT 'ulaw,alaw',
  route       text DEFAULT 'CLI',
  max_cps     integer,
  enabled     boolean NOT NULL DEFAULT true
);
CREATE INDEX ON trunks (provider_id);

-- Tabla de DIDs (números de origen)
CREATE TABLE dids (
  id          serial PRIMARY KEY,
  e164        text NOT NULL UNIQUE,
  state       varchar(2),
  provider_id integer REFERENCES providers(id),
  trunk_id    integer REFERENCES trunks(id),
  enabled     boolean NOT NULL DEFAULT true,
  daily_cap   integer,
  score       real
);
CREATE INDEX ON dids (state);

-- Mapeo de códigos de área a estados para policy de DID
CREATE TABLE state_area_codes (
  state varchar(2) NOT NULL,
  npa   varchar(3) NOT NULL,
  PRIMARY KEY (state, npa)
);

-- Tabla de CDRs (Call Detail Records)
CREATE TABLE cdr (
  id                bigserial PRIMARY KEY,
  uuid              uuid NOT NULL UNIQUE,
  call_id           text,
  direction         text,
  start_stamp       timestamptz,
  answer_stamp      timestamptz,
  end_stamp         timestamptz,
  duration          integer,
  billsec           integer,
  hangup_cause      text,
  sip_hangup_cause  text,
  campaign_id       integer,
  list_id           integer,
  lead_id           integer,
  trunk_id          integer,
  queue             text,
  agent_id          text,
  amd_label         text,
  amd_confidence    real,
  recording_url     text
);
CREATE INDEX ON cdr (start_stamp);
CREATE INDEX ON cdr (campaign_id);
CREATE INDEX ON cdr (lead_id);
CREATE INDEX ON cdr (agent_id);

-- Tabla de Auditoría
CREATE TABLE audit (
  id           bigserial PRIMARY KEY,
  ts           timestamptz NOT NULL DEFAULT now(),
  actor_id     text,                -- usuario o servicio
  actor_ip     inet,
  action       text NOT NULL,       -- e.g. campaign.create, trunk.update
  target_type  text,                -- campaign|trunk|queue|agent|call|auth
  target_id    text,
  details      jsonb,               -- diff o payload relevante
  user_agent   text
);
CREATE INDEX ON audit (ts);
CREATE INDEX ON audit (action);
CREATE INDEX ON audit (target_type, target_id);


-- Datos de ejemplo mínimos
INSERT INTO campaigns(name,status) VALUES ('Demo Predictiva','paused');
INSERT INTO lists(name) VALUES ('Lista 12/09/2025');
INSERT INTO leads(list_id, phone, first_name, state, timezone) VALUES
  (1,'+12125550101','John','TX','America/Chicago'),
  (1,'+14085550102','Mary','CA','America/Los_Angeles'),
  (1,'+17865550103','Luis','GA','America/New_York');

INSERT INTO providers(name,host) VALUES ('ProviderMain','sip.provider.net');
INSERT INTO trunks(provider_id,name,codecs,route,max_cps) VALUES (1,'gw_main','ulaw,alaw','CLI',20);

INSERT INTO dids(e164,state,provider_id,trunk_id,enabled,daily_cap,score) VALUES
  ('+12125551234','TX',1,1,true,300,1.0),
  ('+14085551234','CA',1,1,true,300,1.0),
  ('+17865551234','GA',1,1,true,300,1.0);

-- Área codes básicos (ejemplo) → Carga dataset real después
INSERT INTO state_area_codes(state,npa) VALUES
  ('TX','210'),('TX','214'),('TX','254'),('TX','281'),('TX','346'),('TX','361'),('TX','409'),('TX','512'),('TX','713'),('TX','817'),('TX','832'),('TX','915'),('TX','972'),
  ('CA','209'),('CA','213'),('CA','310'),('CA','323'),('CA','408'),('CA','415'),('CA','424'),('CA','510'),('CA','530'),('CA','559'),('CA','562'),('CA','619'),('CA','626'),('CA','650'),('CA','657'),('CA','661'),('CA','669'),('CA','707'),('CA','714'),('CA','747'),('CA','760'),('CA','805'),('CA','818'),('CA','831'),('CA','840'),('CA','858'),('CA','909'),('CA','916'),('CA','925'),('CA','949'),('CA','951'),
  ('GA','229'),('GA','404'),('GA','470'),('GA','478'),('GA','678'),('GA','706'),('GA','762'),('GA','770'),('GA','912');

COMMIT;

-- Reporta el éxito
\set QUIET 0
\echo '✅ Esquema de base de datos creado y poblado con éxito.'
