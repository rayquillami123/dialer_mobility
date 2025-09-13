-- Tenants (para multi-tenancy)
CREATE TABLE IF NOT EXISTS tenants (
  id serial PRIMARY KEY,
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Usuarios
CREATE TABLE IF NOT EXISTS users (
  id serial PRIMARY KEY,
  tenant_id int NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email text NOT NULL,
  name text,
  password_hash text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email)
);

-- Roles (admin, supervisor, viewer, agent)
CREATE TABLE IF NOT EXISTS roles (
  id serial PRIMARY KEY,
  code text NOT NULL UNIQUE,
  description text
);
INSERT INTO roles(code, description) VALUES
('admin', 'Administrador global del tenant'),
('supervisor', 'Supervisor de campañas y agentes'),
('agent', 'Agente de llamadas'),
('viewer', 'Solo lectura de reportes')
ON CONFLICT (code) DO NOTHING;


-- User-Roles (muchos a muchos)
CREATE TABLE IF NOT EXISTS user_roles (
  user_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id int NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

-- Listas de marcado
CREATE TABLE IF NOT EXISTS lists (
  id serial PRIMARY KEY,
  tenant_id int NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Leads
CREATE TABLE IF NOT EXISTS leads (
  id bigserial PRIMARY KEY,
  list_id int NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  tenant_id int NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phone text NOT NULL,
  alt_phone_1 text,
  alt_phone_2 text,
  first_name text,
  last_name text,
  timezone text, -- ej: America/Mexico_City
  state text, -- ej: TX, CA, FL (para geo-routing)
  zip_code text,
  status text NOT NULL DEFAULT 'new', -- new, in_progress, done, dnc
  priority int NOT NULL DEFAULT 100,
  attempt_count_total int NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  last_disposition text,
  notes jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_leads_status_priority ON leads(status, priority);
CREATE INDEX IF NOT EXISTS idx_leads_tenant_id ON leads(tenant_id);


-- DNC (Do Not Call) por tenant
CREATE TABLE IF NOT EXISTS dnc_numbers (
  id bigserial PRIMARY KEY,
  tenant_id int NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phone text NOT NULL,
  UNIQUE (tenant_id, phone)
);

-- Troncales SIP (carriers)
CREATE TABLE IF NOT EXISTS trunks (
  id serial PRIMARY KEY,
  tenant_id int NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  host text,
  tech text DEFAULT 'sip', -- sip, pjsip
  codecs text[],
  max_cps int,
  max_channels int,
  enabled boolean NOT NULL DEFAULT true
);

-- DIDs (números de origen)
CREATE TABLE IF NOT EXISTS dids (
  id serial PRIMARY KEY,
  tenant_id int NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  e164 text NOT NULL UNIQUE,
  state text, -- ej: TX, CA (para local presence)
  score int NOT NULL DEFAULT 100, -- reputación
  daily_cap int NOT NULL DEFAULT 300,
  last_used_at timestamptz,
  enabled boolean NOT NULL DEFAULT true
);

-- Uso diario de DIDs (para reputación y caps)
CREATE TABLE IF NOT EXISTS did_usage (
  did_id int NOT NULL REFERENCES dids(id) ON DELETE CASCADE,
  day date NOT NULL,
  calls_total int NOT NULL DEFAULT 0,
  unique_numbers int NOT NULL DEFAULT 0, -- números únicos llamados
  human int NOT NULL DEFAULT 0,
  voicemail int NOT NULL DEFAULT 0,
  fax int NOT NULL DEFAULT 0,
  sit int NOT NULL DEFAULT 0, -- Service-affecting issue
  PRIMARY KEY (did_id, day)
);
CREATE TABLE IF NOT EXISTS did_usage_numbers (
  did_id int NOT NULL,
  day date NOT NULL,
  phone text NOT NULL,
  PRIMARY KEY (did_id, day, phone)
);


-- Campañas
CREATE TABLE IF NOT EXISTS campaigns (
  id serial PRIMARY KEY,
  tenant_id int NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'predictive', -- predictive, power, preview, agentless
  pacing float NOT NULL DEFAULT 2.0, -- ratio de marcado
  max_channels int,
  abandon_cap float NOT NULL DEFAULT 0.03, -- 3%
  status text NOT NULL DEFAULT 'paused', -- paused, running, stopped
  list_id int REFERENCES lists(id),
  queue text, -- ej: 'sales_us' (cola en FreeSWITCH/Asterisk)
  amd jsonb, -- config de AMD
  trunk_policy jsonb,
  retry_rules jsonb,
  auto_protect_enabled boolean default true,
  auto_protect_abandon_cap_pct float default 3.0,
  auto_protect_lookback_min int default 15,
  auto_protect_reduction float default 0.7,
  auto_protect_min_multiplier float default 0.2,
  auto_protect_recovery_step float default 0.1,
  auto_protect_recovery_threshold_pct float default 2.0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Intentos de marcado
CREATE TABLE IF NOT EXISTS attempts (
  id bigserial PRIMARY KEY,
  campaign_id int NOT NULL REFERENCES campaigns(id),
  list_id int NOT NULL REFERENCES lists(id),
  lead_id bigint NOT NULL REFERENCES leads(id),
  tenant_id int NOT NULL REFERENCES tenants(id),
  did_id int REFERENCES dids(id),
  trunk_id int REFERENCES trunks(id),
  dest_phone text NOT NULL,
  state text,
  result text, -- ej: Dialing, Answer, NoAnswer, Busy
  attempt_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_attempts_lead_id_day ON attempts (lead_id, (attempt_at::date));

-- CDR (Call Detail Records)
CREATE TABLE IF NOT EXISTS cdr (
  id bigserial PRIMARY KEY,
  received_at timestamptz NOT NULL DEFAULT now(),
  tenant_id int,
  campaign_id int,
  list_id int,
  lead_id bigint,
  did_id int,
  trunk_id int,
  amd_label text, -- HUMAN, MACHINE, FAX, SIT, UNKNOWN
  amd_conf float,
  duration int, -- segundos total
  billsec int, -- segundos facturables
  raw jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cdr_received_at ON cdr(received_at);
CREATE INDEX IF NOT EXISTS idx_cdr_campaign_id ON cdr(campaign_id);
CREATE INDEX IF NOT EXISTS idx_cdr_amd_label ON cdr(amd_label);

-- Ventanas de marcado por estado
CREATE TABLE IF NOT EXISTS call_windows (
  id serial PRIMARY KEY,
  tenant_id int NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  state text, -- ej: CA, NY, o NULL para default
  tz text, -- ej: America/New_York
  start_local time NOT NULL, -- ej: '09:00'
  end_local time NOT NULL, -- ej: '20:00'
  active boolean NOT NULL DEFAULT true,
  UNIQUE(tenant_id, state)
);

-- Mapeo NPA (area code) a Estado (solo US)
CREATE TABLE IF NOT EXISTS state_area_codes (
  npa text PRIMARY KEY,
  state text NOT NULL
);

-- API Keys
CREATE TABLE IF NOT EXISTS api_keys (
  id serial PRIMARY KEY,
  tenant_id int NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  revoked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Invitaciones de usuario
CREATE TABLE IF NOT EXISTS invites (
  id serial PRIMARY KEY,
  tenant_id int NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email text NOT NULL,
  role_codes text[] NOT NULL,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Log de auditoría
CREATE TABLE IF NOT EXISTS audit_log (
  id bigserial PRIMARY KEY,
  ts timestamptz NOT NULL DEFAULT now(),
  tenant_id int,
  user_id int,
  ip text,
  action text NOT NULL, -- ej: campaign.start
  entity text, -- ej: campaign
  entity_id text,
  meta jsonb
);

-- Login attempts
CREATE TABLE IF NOT EXISTS login_attempts (
  id bigserial PRIMARY KEY,
  ts timestamptz NOT NULL DEFAULT now(),
  email text NOT NULL,
  ip text,
  ok boolean
);

-- Agregados por día/campaña
CREATE TABLE IF NOT EXISTS agg_campaign_day (
  day date NOT NULL,
  campaign_id int NOT NULL,
  tenant_id int NOT NULL,
  calls_total int NOT NULL DEFAULT 0,
  answered int NOT NULL DEFAULT 0,
  voicemail int NOT NULL DEFAULT 0,
  human int NOT NULL DEFAULT 0,
  abandoned int NOT NULL DEFAULT 0,
  billsec_avg int,
  duration_avg int,
  PRIMARY KEY (day, campaign_id, tenant_id)
);

-- app_flags: almacena switches de la app
CREATE TABLE IF NOT EXISTS app_flags (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- marca que el bootstrap NO se ha usado aún
INSERT INTO app_flags(key, value)
VALUES ('bootstrap', '{"used": false}')
ON CONFLICT (key) DO NOTHING;

-- Creación de usuario por defecto
INSERT into tenants (name) values ('Default Tenant') ON CONFLICT (name) DO NOTHING;

DO $$
DECLARE
    tenant_id_val INT;
    user_id_val INT;
    admin_role_id INT;
BEGIN
    -- Obtener el ID del tenant por defecto
    SELECT id INTO tenant_id_val FROM tenants WHERE name = 'Default Tenant';

    -- Obtener el ID del rol de admin
    SELECT id INTO admin_role_id FROM roles WHERE code = 'admin';

    -- Verificar si el usuario ya existe
    SELECT id INTO user_id_val FROM users WHERE email = 'admin@example.com' AND tenant_id = tenant_id_val;

    IF user_id_val IS NULL THEN
        -- Insertar el usuario si no existe
        INSERT INTO users (tenant_id, email, name, password_hash, is_active)
        VALUES (tenant_id_val, 'admin@example.com', 'Admin', '$2a$12$V.GqY/1O5AIiV5j14i885e94f1f3a5e1e1e9a2e6e1e8a2e5e1e8', true)
        RETURNING id INTO user_id_val;

        -- Asignar el rol de admin al nuevo usuario
        INSERT INTO user_roles (user_id, role_id)
        VALUES (user_id_val, admin_role_id);
    END IF;
END $$;
