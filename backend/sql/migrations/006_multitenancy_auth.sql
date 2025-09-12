-- Tenants
CREATE TABLE IF NOT EXISTS tenants (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Usuarios
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  is_active BOOLEAN DEFAULT TRUE
);

-- Roles base
CREATE TABLE IF NOT EXISTS roles (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,  -- 'admin','supervisor','agent','viewer'
  description TEXT
);

-- Asignación de roles a usuarios
CREATE TABLE IF NOT EXISTS user_roles (
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  role_id INT REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY(user_id, role_id)
);

-- API keys (opcional para integraciones)
CREATE TABLE IF NOT EXISTS api_keys (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_used_at TIMESTAMPTZ
);

-- Agrega tenant_id a tus entidades clave
ALTER TABLE campaigns     ADD COLUMN IF NOT EXISTS tenant_id INT REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE lists         ADD COLUMN IF NOT EXISTS tenant_id INT REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE leads         ADD COLUMN IF NOT EXISTS tenant_id INT REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE trunks        ADD COLUMN IF NOT EXISTS tenant_id INT REFERENCES tenants(id) ON DELETE SET NULL;
ALTER TABLE dids          ADD COLUMN IF NOT EXISTS tenant_id INT REFERENCES tenants(id) ON DELETE SET NULL;
ALTER TABLE attempts      ADD COLUMN IF NOT EXISTS tenant_id INT REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE cdr           ADD COLUMN IF NOT EXISTS tenant_id INT; -- rellénalo al ingerir CDR
ALTER TABLE call_windows  ADD COLUMN IF NOT EXISTS tenant_id INT REFERENCES tenants(id) ON DELETE CASCADE;

-- Índices por tenant
CREATE INDEX IF NOT EXISTS idx_campaigns_tenant ON campaigns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_leads_tenant     ON leads(tenant_id);
CREATE INDEX IF NOT EXISTS idx_trunks_tenant    ON trunks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_dids_tenant      ON dids(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cdr_tenant_time  ON cdr(tenant_id, received_at);

-- Seed mínimo
INSERT INTO roles(code, description) VALUES
  ('admin','Administrador del tenant'),
  ('supervisor','Supervisa campañas y agentes'),
  ('agent','Atiende llamadas'),
  ('viewer','Solo lectura')
ON CONFLICT DO NOTHING;

-- Tenant y admin por defecto (cambia email/pass!)
INSERT INTO tenants(name, slug) VALUES ('Default Tenant','default') ON CONFLICT DO NOTHING;
WITH t AS (SELECT id FROM tenants WHERE slug='default')
INSERT INTO users(tenant_id,email,name,password_hash)
SELECT t.id,'admin@example.com','Admin', '$2a$10$f6xS5sB5C2nC9j.3p.G3M.oF3jZ5E6c8d7A1bB2c4d'
FROM t
ON CONFLICT (email) DO NOTHING;