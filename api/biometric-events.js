const crypto = require("crypto");
const { sql } = require("./_lib/db");
const { setCors, send, readBody, bearer } = require("./_lib/http");

function digest(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function allowlist() {
  try {
    const parsed = JSON.parse(process.env.HR_DEVICE_KEYS || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== "POST") return send(res, 405, { error: "POST only." });

  try {
    const token = bearer(req);
    const tokenHash = digest(token);
    const device = allowlist().find((row) => String(row.tokenSha256 || "").toLowerCase() === tokenHash);
    if (!token || !device) return send(res, 401, { error: "Unknown HR device token." });

    const body = await readBody(req);
    if (body && body.type === "connection-test") {
      return send(res, 200, { connected: true, deviceId: device.deviceId });
    }

    const workspaceId = device.workspaceId;
    const payload = Object.assign({}, body || {}, {
      _id: body && body._id ? body._id : crypto.randomUUID(),
      kind: "event",
      deviceId: device.deviceId,
    });
    await sql()`
      INSERT INTO fms_workforce (workspace_id, record_id, kind, payload, version, updated_at)
      VALUES (${workspaceId}, ${payload._id}, 'event', ${JSON.stringify(payload)}::jsonb, 1, now())
      ON CONFLICT (workspace_id, record_id) DO NOTHING
    `;
    return send(res, 200, { accepted: true, record: payload });
  } catch (error) {
    console.error("[FMS Biometric]", error);
    return send(res, 500, { error: error.message || "Biometric event failed." });
  }
};
