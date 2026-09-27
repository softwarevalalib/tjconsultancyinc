const { sql } = require("./db");
const { bearer, sha256, randomToken } = require("./http");

const SESSION_HOURS = Math.max(1, Number(process.env.SESSION_HOURS || 12));

async function createSession(user) {
  const token = randomToken(32);
  const expires = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000);
  await sql()`
    INSERT INTO fms_sessions (user_id, token_hash, expires_at)
    VALUES (${user.id}, ${sha256(token)}, ${expires.toISOString()})
  `;
  return {
    access_token: token,
    token_type: "bearer",
    expires_at: Math.floor(expires.getTime() / 1000),
    user: {
      id: user.id,
      email: user.email,
    },
  };
}

async function loadSession(req) {
  const token = bearer(req);
  if (!token) return null;
  const rows = await sql()`
    SELECT
      s.id AS session_id,
      s.expires_at,
      u.id,
      u.email,
      u.display_name
    FROM fms_sessions s
    JOIN fms_users u ON u.id = s.user_id
    WHERE s.token_hash = ${sha256(token)}
      AND s.revoked = false
      AND s.expires_at > now()
    LIMIT 1
  `;
  return rows[0] || null;
}

async function revokeSession(req) {
  const token = bearer(req);
  if (!token) return;
  await sql()`
    UPDATE fms_sessions
    SET revoked = true
    WHERE token_hash = ${sha256(token)}
  `;
}

async function loadProfile(userId) {
  const rows = await sql()`
    SELECT
      p.user_id,
      p.workspace_id,
      p.role,
      p.display_name,
      p.permissions,
      p.disabled,
      u.email
    FROM fms_profiles p
    JOIN fms_users u ON u.id = p.user_id
    WHERE p.user_id = ${userId}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    user_id: row.user_id,
    workspace_id: row.workspace_id,
    role: row.role,
    display_name: row.display_name,
    permissions: Array.isArray(row.permissions) ? row.permissions : [],
    disabled: !!row.disabled,
    email: row.email,
  };
}

module.exports = { createSession, loadSession, revokeSession, loadProfile };
