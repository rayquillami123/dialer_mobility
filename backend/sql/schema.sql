-- Dialer SQL schema (PostgreSQL)
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- Tenants / simple single-tenant MVP
CREATE TABLE IF NOT EXISTS campaigns (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'predictive', -- predictive | power | press1
  status TEXT NOT NULL DEFAULT 'paused',   -- paused | running | stopped
  queue TEXT DEFAULT 'sales',
  pacing NUMERIC(6,2) DEFAULT 2.0,
  max_channels INT DEFAULT 50,
  abandon_cap NUMERIC(5,4) DEFAULT 0.03,
  amd JSONB DEFAULT '{}'::jsonb,
  trunk_policy JSONB DEFAULT '{}'::jsonb,
  retry_rules JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lists (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS leads (
  id BIGSERIAL PRIMARY KEY,
  list_id INT REFERENCES lists(id) ON DELETE CASCADE,
  phone CITEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  state TEXT,              -- ISO US-STATE (TX, FL, CA, ...)
  timezone TEXT,           -- e.g., America/Chicago
  priority INT DEFAULT 0,
  status TEXT DEFAULT 'new',  -- new|in_progress|done|dnc
  last_attempt_at TIMESTAMPTZ,
  attempt_count_total INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(list_id, phone)
);
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone);

-- DNC global
CREATE TABLE IF NOT EXISTS dnc_numbers (
  phone CITEXT PRIMARY KEY,
  source TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Proveedores / Troncales
CREATE TABLE IF NOT EXISTS providers (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  host TEXT,
  enabled BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS trunks (
  id SERIAL PRIMARY KEY,
  provider_id INT REFERENCES providers(id) ON DELETE SET NULL,
  name TEXT UNIQUE NOT NULL,
  codecs TEXT,
  route TEXT DEFAULT 'CLI',
  max_cps INT DEFAULT 20,
  enabled BOOLEAN DEFAULT TRUE
);

-- DIDs (Caller IDs) con pools por estado
CREATE TABLE IF NOT EXISTS dids (
  id SERIAL PRIMARY KEY,
  e164 TEXT UNIQUE NOT NULL,
  state TEXT,                -- TX, CA, FL...
  provider_id INT REFERENCES providers(id) ON DELETE SET NULL,
  trunk_id INT REFERENCES trunks(id) ON DELETE SET NULL,
  enabled BOOLEAN DEFAULT TRUE,
  daily_cap INT DEFAULT 300,
  score NUMERIC(5,2) DEFAULT 1.0, -- salud (0..1) pondera rotación
  last_used_at TIMESTAMPTZ
);

-- Uso de DID por día
CREATE TABLE IF NOT EXISTS did_usage (
  did_id INT REFERENCES dids(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  calls_total INT DEFAULT 0,
  unique_numbers INT DEFAULT 0,
  human INT DEFAULT 0,
  voicemail INT DEFAULT 0,
  fax INT DEFAULT 0,
  sit INT DEFAULT 0,
  flagged BOOLEAN DEFAULT FALSE, -- si el carrier reporta algo
  PRIMARY KEY(did_id, day)
);

-- Intentos de llamada
CREATE TABLE IF NOT EXISTS attempts (
  id BIGSERIAL PRIMARY KEY,
  campaign_id INT REFERENCES campaigns(id) ON DELETE CASCADE,
  list_id INT REFERENCES lists(id) ON DELETE CASCADE,
  lead_id BIGINT REFERENCES leads(id) ON DELETE CASCADE,
  did_id INT REFERENCES dids(id),
  trunk_id INT REFERENCES trunks(id),
  dest_phone CITEXT NOT NULL,
  state TEXT,
  attempt_at TIMESTAMPTZ DEFAULT now(),
  result TEXT,           -- Dialing|Ringing|Connected|Fax|Sit|Voicemail|NoAnswer|Hangup
  sip_cause TEXT,
  amd_label TEXT,
  amd_conf NUMERIC(4,2),
  duration_sec INT,
  billsec_sec INT
);
CREATE INDEX IF NOT EXISTS idx_attempts_lead_day ON attempts(lead_id, attempt_at);
CREATE INDEX IF NOT EXISTS idx_attempts_did_day ON attempts(did_id, attempt_at);
CREATE INDEX IF NOT EXISTS idx_attempts_campaign ON attempts(campaign_id, attempt_at);

-- CDR plano (json_cdr)
CREATE TABLE IF NOT EXISTS cdr (
  uuid UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  raw JSONB NOT NULL,
  received_at TIMESTAMPTZ DEFAULT now(),
  campaign_id INT,
  list_id INT,
  lead_id BIGINT,
  did_id INT,
  trunk_id INT,
  amd_label TEXT,
  amd_conf NUMERIC(4,2),
  billsec INT,
  duration INT
);

-- Mapas NPA → STATE (cargar dataset NANPA)
CREATE TABLE IF NOT EXISTS state_area_codes (
  state TEXT NOT NULL,
  npa CHAR(3) NOT NULL,
  PRIMARY KEY(state, npa)
);

-- Auditoría
CREATE TABLE IF NOT EXISTS audit_events (
  id BIGSERIAL PRIMARY KEY,
  actor_id TEXT,
  actor_ip INET,
  action TEXT,
  target_type TEXT,
  target_id TEXT,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Vistas útiles
CREATE VIEW daily_attempts_by_lead AS
SELECT lead_id,
       (attempt_at AT TIME ZONE 'UTC')::date AS utc_day,
       count(*) as attempts
FROM attempts
WHERE attempt_at >= now() - interval '3 days'
GROUP BY 1,2;

-- Constraints lógicas por aplicación:
-- - Máx intentos por lead/día (por defecto 8)
-- - Máx llamadas por DID/día (configurable)

-- Datos de ejemplo mínimos
insert into campaigns(name,status) values ('Demo Predictiva','paused');
insert into lists(name) values ('Lista 12/09/2025');
insert into leads(list_id, phone, first_name, state, timezone) values
  (1,'+12125550101','John','TX','America/Chicago'),
  (1,'+14085550102','Mary','CA','America/Los_Angeles'),
  (1,'+17865550103','Luis','GA','America/New_York');

insert into providers(name,host) values ('ProviderMain','sip.provider.net');
insert into trunks(provider_id,name,codecs,route,max_cps) values (1,'gw_main','ulaw,alaw','CLI',20);

insert into dids(e164,state,provider_id,trunk_id,enabled,daily_cap,score) values
  ('+12125551234','TX',1,1,true,300,1.0),
  ('+14085551234','CA',1,1,true,300,1.0),
  ('+17865551234','GA',1,1,true,300,1.0);

-- Área codes básicos (ejemplo) → Carga dataset real después
insert into state_area_codes(state,npa) values
  ('TX','210'),('TX','214'),('TX','254'),('TX','281'),('TX','346'),('TX','361'),('TX','409'),('TX','512'),('TX','713'),('TX','817'),('TX','832'),('TX','915'),('TX','972'),
  ('CA','209'),('CA','213'),('CA','310'),('CA','323'),('CA','408'),('CA','415'),('CA','424'),('CA','510'),('CA','530'),('CA','559'),('CA','562'),('CA','619'),('CA','626'),('CA','650'),('CA','657'),('CA','661'),('CA','669'),('CA','707'),('CA','714'),('CA','747'),('CA','760'),('CA','805'),('CA','818'),('CA','831'),('CA','840'),('CA','858'),('CA','909'),('CA','916'),('CA','925'),('CA','949'),('CA','951'),
  ('GA','229'),('GA','404'),('GA','470'),('GA','478'),('GA','678'),('GA','706'),('GA','762'),('GA','770'),('GA','912');