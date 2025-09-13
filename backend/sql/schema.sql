-- Roles: admin, supervisor, agent, viewer
-- Status: new, in_progress, done, error
-- Dispositions: SALE, CALLBACK, NOANSWER, BUSY, VOICEMAIL, DNC

-- Tenant & Users
CREATE TABLE tenants (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(50) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email VARCHAR(100) NOT NULL,
  name VARCHAR(100),
  password_hash VARCHAR(100) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, email)
);

CREATE TABLE roles (
  id SERIAL PRIMARY KEY,
  code VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(50) NOT NULL
);
INSERT INTO roles(code, name) VALUES ('admin','Administrator'), ('supervisor','Supervisor'), ('agent','Agent'), ('viewer','Viewer');

CREATE TABLE user_roles (
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id INT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY(user_id, role_id)
);

CREATE TABLE invites (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email VARCHAR(100) NOT NULL,
  role_codes VARCHAR(20)[] NOT NULL DEFAULT ARRAY['viewer'],
  token_hash VARCHAR(64) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX on invites(token_hash);

CREATE TABLE api_keys (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  prefix VARCHAR(8) NOT NULL UNIQUE,
  notes TEXT,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Leads & Lists
CREATE TABLE lists (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE leads (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  list_id INT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  phone VARCHAR(20) NOT NULL,
  first_name VARCHAR(50),
  last_name VARCHAR(50),
  state VARCHAR(2),
  timezone VARCHAR(50),
  status VARCHAR(20) NOT NULL DEFAULT 'new',
  priority INT NOT NULL DEFAULT 100,
  notes TEXT,
  attempt_count_total INT NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  created_at TIMESTPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON leads(status, priority, id);
CREATE INDEX ON leads(phone);

CREATE TABLE dnc_numbers (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phone VARCHAR(20) NOT NULL,
  UNIQUE(tenant_id, phone)
);

-- Providers, DIDs, Campaigns
CREATE TABLE trunks (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(50) NOT NULL,
  host VARCHAR(100) NOT NULL,
  codecs VARCHAR(100),
  max_cps INT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(tenant_id, name)
);

CREATE TABLE dids (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  e164 VARCHAR(20) NOT NULL UNIQUE,
  state VARCHAR(2),
  daily_cap INT,
  score INT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMPTZ
);

CREATE TABLE did_usage (
  did_id INT NOT NULL REFERENCES dids(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  calls_total INT DEFAULT 0,
  unique_numbers INT DEFAULT 0,
  human INT DEFAULT 0,
  voicemail INT DEFAULT 0,
  fax INT DEFAULT 0,
  sit INT DEFAULT 0, -- "Special Information Tones" (invalid numbers)
  PRIMARY KEY(did_id, day)
);

CREATE TABLE did_usage_numbers (
  did_id INT NOT NULL REFERENCES dids(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  phone VARCHAR(20) NOT NULL,
  PRIMARY KEY(did_id, day, phone)
);

CREATE TABLE campaigns (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'paused', -- paused, running, stopped
  type VARCHAR(20) NOT NULL DEFAULT 'predictive',
  pacing NUMERIC(4,2),
  max_channels INT,
  abandon_cap NUMERIC(4,2),
  queue VARCHAR(50),
  amd JSONB,
  trunk_policy JSONB,
  retry_rules JSONB,
  auto_protect_enabled BOOLEAN DEFAULT true,
  auto_protect_abandon_cap_pct NUMERIC(4,1) DEFAULT 3.0,
  auto_protect_lookback_min INT DEFAULT 15,
  auto_protect_reduction NUMERIC(4,2) DEFAULT 0.7,
  auto_protect_min_multiplier NUMERIC(4,2) DEFAULT 0.2,
  auto_protect_recovery_step NUMERIC(4,2) DEFAULT 0.1,
  auto_protect_recovery_threshold_pct NUMERIC(4,1) DEFAULT 2.0,
  created_at TIMESTPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTPTZ
);

CREATE TABLE call_windows (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  state VARCHAR(2), -- null para global
  tz VARCHAR(50) NOT NULL,
  start_local TIME NOT NULL,
  end_local TIME NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX ON call_windows(state, active);

CREATE TABLE state_area_codes (
  npa VARCHAR(3) PRIMARY KEY,
  state VARCHAR(2) NOT NULL
);
INSERT INTO state_area_codes (npa, state) VALUES
('205','AL'), ('251','AL'), ('256','AL'), ('334','AL'), ('907','AK'), ('480','AZ'), ('520','AZ'), ('602','AZ'), ('623','AZ'), ('928','AZ'),
('479','AR'), ('501','AR'), ('870','AR'), ('209','CA'), ('213','CA'), ('310','CA'), ('323','CA'), ('408','CA'), ('415','CA'),
('510','CA'), ('530','CA'), ('559','CA'), ('562','CA'), ('619','CA'), ('626','CA'), ('650','CA'), ('661','CA'), ('707','CA'),
('714','CA'), ('760','CA'), ('805','CA'), ('818','CA'), ('831','CA'), ('858','CA'), ('909','CA'), ('916','CA'), ('925','CA'),
('949','CA'), ('951','CA'), ('303','CO'), ('719','CO'), ('970','CO'), ('203','CT'), ('860','CT'), ('302','DE'), ('202','DC'),
('305','FL'), ('321','FL'), ('352','FL'), ('386','FL'), ('407','FL'), ('561','FL'), ('727','FL'), ('772','FL'), ('813','FL'),
('850','FL'), ('863','FL'), ('904','FL'), ('941','FL'), ('954','FL'), ('229','GA'), ('404','GA'), ('478','GA'), ('706','GA'),
('770','GA'), ('912','GA'), ('808','HI'), ('208','ID'), ('217','IL'), ('309','IL'), ('312','IL'), ('618','IL'), ('630','IL'),
('708','IL'), ('773','IL'), ('815','IL'), ('847','IL'), ('219','IN'), ('260','IN'), ('317','IN'), ('574','IN'), ('765','IN'),
('812','IN'), ('319','IA'), ('515','IA'), ('563','IA'), ('641','IA'), ('712','IA'), ('316','KS'), ('620','KS'), ('785','KS'),
('913','KS'), ('270','KY'), ('502','KY'), ('606','KY'), ('859','KY'), ('225','LA'), ('318','LA'), ('337','LA'), ('504','LA'),
('985','LA'), ('207','ME'), ('301','MD'), ('410','MD'), ('443','MD'), ('413','MA'), ('508','MA'), ('617','MA'), ('781','MA'),
('978','MA'), ('231','MI'), ('248','MI'), ('269','MI'), ('313','MI'), ('517','MI'), ('586','MI'), ('616','MI'), ('734','MI'),
('810','MI'), ('906','MI'), ('989','MI'), ('218','MN'), ('320','MN'), ('507','MN'), ('612','MN'), ('651','MN'), ('763','MN'),
('952','MN'), ('228','MS'), ('601','MS'), ('662','MS'), ('314','MO'), ('417','MO'), ('573','MO'), ('636','MO'), ('660','MO'),
('816','MO'), ('406','MT'), ('308','NE'), ('402','NE'), ('702','NV'), ('775','NV'), ('603','NH'), ('201','NJ'), ('609','NJ'),
('732','NJ'), ('856','NJ'), ('908','NJ'), ('973','NJ'), ('505','NM'), ('575','NM'), ('212','NY'), ('315','NY'), ('516','NY'),
('518','NY'), ('585','NY'), ('607','NY'), ('631','NY'), ('716','NY'), ('718','NY'), ('845','NY'), ('914','NY'), ('917','NY'),
('252','NC'), ('336','NC'), ('704','NC'), ('828','NC'), ('910','NC'), ('919','NC'), ('701','ND'), ('216','OH'), ('330','OH'),
('419','OH'), ('440','OH'), ('513','OH'), ('614','OH'), ('740','OH'), ('937','OH'), ('405','OK'), ('580','OK'), ('918','OK'),
('503','OR'), ('541','OR'), ('971','OR'), ('215','PA'), ('412','PA'), ('570','PA'), ('610','PA'), ('717','PA'), ('724','PA'),
('814','PA'), ('401','RI'), ('803','SC'), ('843','SC'), ('864','SC'), ('605','SD'), ('423','TN'), ('615','TN'), ('731','TN'),
('865','TN'), ('901','TN'), ('931','TN'), ('210','TX'), ('214','TX'), ('254','TX'), ('281','TX'), ('325','TX'), ('361','TX'),
('409','TX'), ('432','TX'), ('512','TX'), ('713','TX'), ('806','TX'), ('817','TX'), ('830','TX'), ('832','TX'), ('903','TX'),
('915','TX'), ('936','TX'), ('940','TX'), ('956','TX'), ('972','TX'), ('979','TX'), ('435','UT'), ('801','UT'), ('802','VT'),
('276','VA'), ('434','VA'), ('540','VA'), ('703','VA'), ('757','VA'), ('804','VA'), ('206','WA'), ('253','WA'), ('360','WA'),
('425','WA'), ('509','WA'), ('304','WV'), ('262','WI'), ('414','WI'), ('608','WI'), ('715','WI'), ('920','WI'), ('307','WY');


-- CDRs, Attempts, Logs
CREATE TABLE cdr (
  id BIGSERIAL PRIMARY KEY,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw JSONB NOT NULL,
  tenant_id INT REFERENCES tenants(id) ON DELETE SET NULL,
  campaign_id INT, -- no FK for resilience
  list_id INT,
  lead_id BIGINT,
  did_id INT,
  trunk_id INT,
  amd_label VARCHAR(20),
  amd_conf NUMERIC(4,3),
  billsec INT,
  duration INT
);
CREATE INDEX ON cdr(received_at);
CREATE INDEX ON cdr(campaign_id);
CREATE INDEX ON cdr(did_id);
CREATE INDEX ON cdr(trunk_id);

CREATE TABLE attempts (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  campaign_id INT,
  list_id INT NOT NULL,
  lead_id BIGINT NOT NULL,
  did_id INT NOT NULL,
  trunk_id INT,
  dest_phone VARCHAR(20) NOT NULL,
  state VARCHAR(2),
  result VARCHAR(50)
);
CREATE INDEX ON attempts(lead_id);
CREATE INDEX ON attempts(campaign_id, attempt_at);

CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id INT REFERENCES users(id) ON DELETE SET NULL,
  user_ip INET,
  action VARCHAR(50) NOT NULL,
  entity VARCHAR(50),
  entity_id VARCHAR(50),
  meta JSONB
);

CREATE TABLE login_attempts (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  email VARCHAR(100) NOT NULL,
  ip INET,
  ok BOOLEAN
);

CREATE TABLE agg_campaign_day (
    day DATE NOT NULL,
    tenant_id INT NOT NULL,
    campaign_id INT NOT NULL,
    calls_total INT DEFAULT 0,
    answered INT DEFAULT 0,
    abandoned INT DEFAULT 0,
    billsec_total BIGINT DEFAULT 0,
    amd_human INT DEFAULT 0,
    amd_voicemail INT DEFAULT 0,
    amd_other INT DEFAULT 0,
    PRIMARY KEY(day, tenant_id, campaign_id)
);


-- ====== SEED DATA (for quickstart) ======
-- 1) Create default tenant
INSERT INTO tenants (name, slug) VALUES ('MobilityTech', 'mobilitytech') ON CONFLICT DO NOTHING;

-- 2) Create default admin user (admin@example.com / password)
-- Pass hash for "password" is $2a$10$3Y.u.34yOC.dY6iM5t22z.g0./cM5.gPBGfNjlLp5h.s2R25G1yqa
WITH tenant AS (SELECT id FROM tenants WHERE slug='mobilitytech' LIMIT 1),
     admin_role AS (SELECT id FROM roles WHERE code='admin' LIMIT 1)
INSERT INTO users (tenant_id, email, name, password_hash, is_active)
SELECT (SELECT id FROM tenant), 'admin@example.com', 'Admin', '$2a$10$3Y.u.34yOC.dY6iM5t22z.g0./cM5.gPBGfNjlLp5h.s2R25G1yqa', true
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email='admin@example.com' AND tenant_id=(SELECT id FROM tenant));

WITH usr AS (SELECT id FROM users WHERE email='admin@example.com' LIMIT 1),
     admin_role AS (SELECT id FROM roles WHERE code='admin' LIMIT 1)
INSERT INTO user_roles (user_id, role_id)
SELECT (SELECT id FROM usr), (SELECT id FROM admin_role)
WHERE NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id=(SELECT id FROM usr));

-- 3) Sample provider trunks
WITH tenant AS (SELECT id FROM tenants WHERE slug='mobilitytech' LIMIT 1)
INSERT INTO trunks (tenant_id, name, host, enabled) VALUES
((SELECT id FROM tenant), 'gw_main', 'sip.provider.com', true),
((SELECT id FROM tenant), 'gw_backup', 'sip.backup.com', true)
ON CONFLICT DO NOTHING;
