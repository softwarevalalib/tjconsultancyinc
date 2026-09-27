ALTER TABLE fms_users ADD COLUMN IF NOT EXISTS username TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS fms_users_username_lower_idx
  ON fms_users (lower(username))
  WHERE username IS NOT NULL AND btrim(username) <> '';

UPDATE fms_users
SET username = 'admin'
WHERE lower(email) = 'admin@tjconsultancyinc.com'
  AND (username IS NULL OR btrim(username) = '');
