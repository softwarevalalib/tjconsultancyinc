CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS fms_workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  initialized BOOLEAN NOT NULL DEFAULT false,
  company_name TEXT NOT NULL DEFAULT 'TJ Consultancy Inc',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fms_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  username TEXT,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS fms_users_username_lower_idx
  ON fms_users (lower(username))
  WHERE username IS NOT NULL AND btrim(username) <> '';

CREATE TABLE IF NOT EXISTS fms_profiles (
  user_id UUID PRIMARY KEY REFERENCES fms_users(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES fms_workspaces(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'staff')),
  display_name TEXT NOT NULL,
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  disabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fms_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES fms_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fms_records (
  workspace_id UUID NOT NULL REFERENCES fms_workspaces(id) ON DELETE CASCADE,
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, table_name, record_id)
);

CREATE TABLE IF NOT EXISTS fms_changes (
  id BIGSERIAL PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES fms_workspaces(id) ON DELETE CASCADE,
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  payload JSONB,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fms_changes_workspace_id_idx ON fms_changes (workspace_id, id);

CREATE TABLE IF NOT EXISTS fms_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES fms_workspaces(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fms_notifications_workspace_created_idx ON fms_notifications (workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS fms_settings (
  workspace_id UUID PRIMARY KEY REFERENCES fms_workspaces(id) ON DELETE CASCADE,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fms_backups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES fms_workspaces(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fms_workforce (
  workspace_id UUID NOT NULL REFERENCES fms_workspaces(id) ON DELETE CASCADE,
  record_id TEXT NOT NULL,
  kind TEXT,
  payload JSONB NOT NULL,
  version BIGINT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, record_id)
);

CREATE TABLE IF NOT EXISTS fms_hr_audit (
  id BIGSERIAL PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES fms_workspaces(id) ON DELETE CASCADE,
  actor_email TEXT,
  action TEXT NOT NULL,
  before_payload JSONB,
  after_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO fms_workspaces (id, name, company_name)
SELECT '11111111-1111-1111-1111-111111111111', 'TJ Consultancy Inc', 'TJ Consultancy Inc'
WHERE NOT EXISTS (SELECT 1 FROM fms_workspaces);
