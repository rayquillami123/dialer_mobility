
-- Base schema for the dialer backend database (PostgreSQL)

-- Drop tables if they exist to ensure a clean slate
DROP TABLE IF EXISTS cdr;
DROP TABLE IF EXISTS leads;

-- Call Detail Records (CDRs) table
-- This table will be populated by FreeSWITCH's mod_json_cdr
CREATE TABLE cdr (
  id                  BIGSERIAL PRIMARY KEY,
  uuid                UUID NOT NULL,
  call_id             TEXT,
  direction           TEXT,
  start_stamp         TIMESTAMPTZ,
  answer_stamp        TIMESTAMPTZ,
  end_stamp           TIMESTAMPTZ,
  duration            INTEGER,
  billsec             INTEGER,
  hangup_cause        TEXT,
  sip_hangup_cause    TEXT,
  
  -- Custom variables from dialplan
  campaign_id         TEXT,
  list_id             TEXT,
  lead_id             BIGINT,
  trunk_id            TEXT,
  queue               TEXT,
  agent_id            TEXT,
  
  -- AMD (Answering Machine Detection) results
  amd_label           TEXT,
  amd_confidence      NUMERIC,
  
  -- Other useful fields
  disposition         TEXT,
  recording_url       TEXT,

  -- Timestamps
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX ON cdr (start_stamp);
CREATE INDEX ON cdr (campaign_id);
CREATE INDEX ON cdr (lead_id);
CREATE INDEX ON cdr (trunk_id);
CREATE INDEX ON cdr (agent_id);


-- Leads table for campaigns
CREATE TABLE leads (
  id                  BIGSERIAL PRIMARY KEY,
  list_id             TEXT NOT NULL,
  phone               TEXT NOT NULL,
  first_name          TEXT,
  last_name           TEXT,
  state               TEXT,
  timezone            TEXT,
  meta                JSONB,
  
  -- Disposition and retry logic fields
  attempts            INTEGER NOT NULL DEFAULT 0,
  last_disposition    TEXT,
  next_try_at         TIMESTAMPTZ,
  
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX ON leads (list_id);
CREATE INDEX ON leads (phone);
CREATE INDEX ON leads (next_try_at);

-- Function to update the 'updated_at' timestamp automatically
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_timestamp
BEFORE UPDATE ON leads
FOR EACH ROW
EXECUTE PROCEDURE trigger_set_timestamp();
