const { sql } = require("./_lib/db");
const { setCors, send, query, readBody } = require("./_lib/http");
const { createSession, loadSession, revokeSession } = require("./_lib/session");

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  const action = String(query(req).action || "login").toLowerCase();

  try {
    if (action === "login" && req.method === "POST") {
      const body = await readBody(req);
      const identifier = String(body.email || body.username || body.identifier || "").trim().toLowerCase();
      const password = String(body.password || "");
      if (!identifier || !password) return send(res, 400, { error: "Email or username and password are required." });

      const users = await sql()`
        SELECT id, email, display_name, username
        FROM fms_users
        WHERE password_hash = crypt(${password}, password_hash)
          AND (
            lower(email) = ${identifier}
            OR (username IS NOT NULL AND lower(username) = ${identifier})
          )
        LIMIT 1
      `;
      const user = users[0];
      if (!user) return send(res, 401, { error: "Invalid email, username, or password." });

      const profiles = await sql()`
        SELECT disabled FROM fms_profiles WHERE user_id = ${user.id} LIMIT 1
      `;
      if (profiles[0] && profiles[0].disabled) {
        return send(res, 403, { error: "This account has been disabled." });
      }

      const session = await createSession(user);
      return send(res, 200, { session });
    }

    if (action === "session" && req.method === "GET") {
      const user = await loadSession(req);
      if (!user) return send(res, 401, { error: "Your sign-in session has expired." });
      return send(res, 200, {
        session: {
          access_token: require("./_lib/http").bearer(req),
          user: { id: user.id, email: user.email },
        },
      });
    }

    if (action === "logout" && req.method === "POST") {
      await revokeSession(req);
      return send(res, 200, { success: true });
    }

    if ((action === "update-password" || action === "change-password") && req.method === "POST") {
      const user = await loadSession(req);
      if (!user) return send(res, 401, { error: "Your sign-in session has expired." });
      const body = await readBody(req);
      const password = String(body.password || body.newPassword || "");
      if (password.length < 8) return send(res, 400, { error: "New password must be at least 8 characters." });
      await sql()`
        UPDATE fms_users
        SET password_hash = crypt(${password}, gen_salt('bf', 12)),
            updated_at = now()
        WHERE id = ${user.id}
      `;
      return send(res, 200, { success: true });
    }

    return send(res, 404, { error: "Unknown auth action." });
  } catch (error) {
    console.error("[FMS Auth]", error);
    return send(res, 500, { error: error.message || "Authentication service failed." });
  }
};
