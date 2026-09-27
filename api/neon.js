const { sql } = require("./_lib/db");
const { setCors, send, query, readBody, safeTable, recordId, randomPassword } = require("./_lib/http");
const { loadSession, loadProfile } = require("./_lib/session");

function requireAdmin(profile) {
  if (!profile || profile.role !== "admin") {
    const error = new Error("Administrator access is required.");
    error.status = 403;
    throw error;
  }
}

async function requireAccess(req) {
  const user = await loadSession(req);
  if (!user) {
    const error = new Error("Sign in to connect to the shared Neon database.");
    error.status = 401;
    throw error;
  }
  const profile = await loadProfile(user.id);
  if (!profile || !profile.workspace_id) {
    const error = new Error("Your account is not assigned to a Neon FMS workspace.");
    error.status = 403;
    throw error;
  }
  if (profile.disabled) {
    const error = new Error("This account has been disabled.");
    error.status = 403;
    throw error;
  }
  return { user, profile, workspaceId: profile.workspace_id };
}

async function writeChange(workspaceId, tableName, recId, payload, isDeleted) {
  await sql()`
    INSERT INTO fms_changes (workspace_id, table_name, record_id, payload, is_deleted)
    VALUES (${workspaceId}, ${tableName}, ${recId}, ${payload == null ? null : JSON.stringify(payload)}::jsonb, ${!!isDeleted})
  `;
}

async function upsertRecords(workspaceId, changed) {
  for (const item of changed || []) {
    const tableName = safeTable(item.table_name);
    const recId = String(item.record_id || recordId(item.payload) || "").trim();
    if (!tableName || !recId || !item.payload || typeof item.payload !== "object") continue;
    await sql()`
      INSERT INTO fms_records (workspace_id, table_name, record_id, payload, is_deleted, updated_at)
      VALUES (${workspaceId}, ${tableName}, ${recId}, ${JSON.stringify(item.payload)}::jsonb, false, now())
      ON CONFLICT (workspace_id, table_name, record_id)
      DO UPDATE SET payload = EXCLUDED.payload, is_deleted = false, updated_at = now()
    `;
    await writeChange(workspaceId, tableName, recId, item.payload, false);
  }
}

async function removeRecords(workspaceId, removed) {
  for (const item of removed || []) {
    const tableName = safeTable(item.table_name);
    const recId = String(item.record_id || "").trim();
    if (!tableName || !recId) continue;
    await sql()`
      UPDATE fms_records
      SET is_deleted = true, updated_at = now()
      WHERE workspace_id = ${workspaceId} AND table_name = ${tableName} AND record_id = ${recId}
    `;
    await writeChange(workspaceId, tableName, recId, null, true);
  }
}

async function snapshotWorkspace(workspaceId, localStorage) {
  const records = await sql()`
    SELECT table_name, record_id, payload
    FROM fms_records
    WHERE workspace_id = ${workspaceId} AND is_deleted = false
    ORDER BY table_name, record_id
  `;
  const deleted = await sql()`
    SELECT table_name, record_id
    FROM fms_records
    WHERE workspace_id = ${workspaceId} AND is_deleted = true
  `;
  const settingsRows = await sql()`SELECT settings FROM fms_settings WHERE workspace_id = ${workspaceId} LIMIT 1`;
  const workspace = await sql()`SELECT company_name FROM fms_workspaces WHERE id = ${workspaceId} LIMIT 1`;
  const workforce = await sql()`
    SELECT payload FROM fms_workforce WHERE workspace_id = ${workspaceId} ORDER BY record_id
  `;
  const tables = {};
  records.forEach((row) => {
    if (!tables[row.table_name]) tables[row.table_name] = [];
    tables[row.table_name].push(row.payload);
  });
  return {
    app: "TJ-FMS",
    version: 1,
    exported: new Date().toISOString(),
    tables,
    localStorage: localStorage || (settingsRows[0] && settingsRows[0].settings) || {},
    workforce: workforce.map((row) => row.payload),
    company_name: workspace[0] && workspace[0].company_name,
    deleted,
  };
}

async function cursorFor(workspaceId) {
  const rows = await sql()`SELECT COALESCE(MAX(id), 0)::text AS cursor FROM fms_changes WHERE workspace_id = ${workspaceId}`;
  return Number(rows[0] && rows[0].cursor) || 0;
}

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  const params = query(req);
  const action = String(params.action || "").toLowerCase();

  try {
    const { user, profile, workspaceId } = await requireAccess(req);

    if (action === "profile") {
      return send(res, 200, { profile });
    }

    if (action === "bootstrap") {
      const workspace = await sql()`SELECT initialized FROM fms_workspaces WHERE id = ${workspaceId} LIMIT 1`;
      const initialized = !!(workspace[0] && workspace[0].initialized);
      if (!initialized) {
        return send(res, 200, { initialized: false, records: [], deleted: [], tables: [], cursor: 0 });
      }
      const records = await sql()`
        SELECT table_name, record_id, payload
        FROM fms_records
        WHERE workspace_id = ${workspaceId} AND is_deleted = false
      `;
      const deleted = await sql()`
        SELECT table_name, record_id
        FROM fms_records
        WHERE workspace_id = ${workspaceId} AND is_deleted = true
      `;
      const tables = Array.from(new Set(records.map((row) => row.table_name)));
      return send(res, 200, {
        initialized: true,
        records,
        deleted,
        tables,
        cursor: await cursorFor(workspaceId),
      });
    }

    if (action === "initialize" && req.method === "POST") {
      requireAdmin(profile);
      const body = await readBody(req);
      const tables = body.tables || {};
      const changed = [];
      Object.keys(tables).forEach((name) => {
        (Array.isArray(tables[name]) ? tables[name] : []).forEach((row) => {
          const recId = recordId(row);
          if (recId) changed.push({ table_name: name, record_id: recId, payload: row });
        });
      });
      await upsertRecords(workspaceId, changed);
      await removeRecords(workspaceId, body.deleted || []);
      await sql()`UPDATE fms_workspaces SET initialized = true WHERE id = ${workspaceId}`;
      return send(res, 200, { initialized: true, cursor: await cursorFor(workspaceId) });
    }

    if (action === "sync" && req.method === "POST") {
      const body = await readBody(req);
      await upsertRecords(workspaceId, body.changed || []);
      await removeRecords(workspaceId, body.removed || []);
      return send(res, 200, { ok: true, cursor: await cursorFor(workspaceId) });
    }

    if (action === "changes" && req.method === "GET") {
      const after = Number(params.after || 0) || 0;
      const rows = await sql()`
        SELECT id, table_name, record_id, payload, is_deleted
        FROM fms_changes
        WHERE workspace_id = ${workspaceId} AND id > ${after}
        ORDER BY id ASC
        LIMIT 500
      `;
      return send(res, 200, {
        changes: rows.map((row) => ({
          table_name: row.table_name,
          record_id: row.record_id,
          payload: row.payload,
          is_deleted: !!row.is_deleted,
        })),
        cursor: rows.length ? Number(rows[rows.length - 1].id) : after,
      });
    }

    if (action === "notifications" && req.method === "GET") {
      const limit = Math.min(200, Math.max(1, Number(params.limit || 100)));
      const rows = await sql()`
        SELECT id, payload, created_at
        FROM fms_notifications
        WHERE workspace_id = ${workspaceId}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
      return send(res, 200, {
        notifications: rows.map((row) => Object.assign({ id: row.id, created_at: row.created_at }, row.payload || {})),
      });
    }

    if (action === "notifications" && req.method === "POST") {
      const body = await readBody(req);
      const notification = body.notification || body || {};
      const rows = await sql()`
        INSERT INTO fms_notifications (workspace_id, payload)
        VALUES (${workspaceId}, ${JSON.stringify(notification)}::jsonb)
        RETURNING id, payload, created_at
      `;
      const row = rows[0];
      return send(res, 200, {
        notification: Object.assign({ id: row.id, created_at: row.created_at }, row.payload || {}),
      });
    }

    if (action === "settings" && req.method === "GET") {
      const rows = await sql()`SELECT settings FROM fms_settings WHERE workspace_id = ${workspaceId} LIMIT 1`;
      return send(res, 200, { settings: (rows[0] && rows[0].settings) || {} });
    }

    if (action === "settings" && req.method === "PUT") {
      const body = await readBody(req);
      const settings = body.settings && typeof body.settings === "object" ? body.settings : {};
      await sql()`
        INSERT INTO fms_settings (workspace_id, settings, updated_at)
        VALUES (${workspaceId}, ${JSON.stringify(settings)}::jsonb, now())
        ON CONFLICT (workspace_id)
        DO UPDATE SET settings = EXCLUDED.settings, updated_at = now()
      `;
      return send(res, 200, { settings });
    }

    if (action === "company-name" && req.method === "GET") {
      const rows = await sql()`SELECT company_name FROM fms_workspaces WHERE id = ${workspaceId} LIMIT 1`;
      return send(res, 200, { name: (rows[0] && rows[0].company_name) || "TJ Consultancy Inc" });
    }

    if (action === "company-name" && req.method === "POST") {
      const body = await readBody(req);
      const name = String(body.name || "").trim() || "TJ Consultancy Inc";
      await sql()`UPDATE fms_workspaces SET company_name = ${name} WHERE id = ${workspaceId}`;
      return send(res, 200, { name });
    }

    if (action === "backups" && req.method === "GET" && params.id) {
      const rows = await sql()`
        SELECT id, label, snapshot, created_at
        FROM fms_backups
        WHERE workspace_id = ${workspaceId} AND id = ${params.id}
        LIMIT 1
      `;
      if (!rows[0]) return send(res, 404, { error: "Backup not found." });
      return send(res, 200, { backup: { id: rows[0].id, label: rows[0].label, created_at: rows[0].created_at, data: rows[0].snapshot } });
    }

    if (action === "backups" && req.method === "GET") {
      const rows = await sql()`
        SELECT id, label, created_at
        FROM fms_backups
        WHERE workspace_id = ${workspaceId}
        ORDER BY created_at DESC
        LIMIT 50
      `;
      return send(res, 200, { backups: rows });
    }

    if (action === "backups" && req.method === "POST") {
      const body = await readBody(req);
      const label = String(body.label || "auto");
      const snapshot = await snapshotWorkspace(workspaceId, body.localStorage || {});
      const rows = await sql()`
        INSERT INTO fms_backups (workspace_id, label, snapshot)
        VALUES (${workspaceId}, ${label}, ${JSON.stringify(snapshot)}::jsonb)
        RETURNING id, label, created_at
      `;
      return send(res, 200, { backup: rows[0] });
    }

    if (action === "backups" && req.method === "PUT") {
      requireAdmin(profile);
      const body = await readBody(req);
      const rows = await sql()`
        SELECT snapshot FROM fms_backups
        WHERE workspace_id = ${workspaceId} AND id = ${body.id}
        LIMIT 1
      `;
      if (!rows[0]) return send(res, 404, { error: "Backup not found." });
      const dump = rows[0].snapshot || {};
      const changed = [];
      Object.keys(dump.tables || {}).forEach((name) => {
        (dump.tables[name] || []).forEach((row) => {
          const recId = recordId(row);
          if (recId) changed.push({ table_name: name, record_id: recId, payload: row });
        });
      });
      await upsertRecords(workspaceId, changed);
      if (dump.localStorage) {
        await sql()`
          INSERT INTO fms_settings (workspace_id, settings, updated_at)
          VALUES (${workspaceId}, ${JSON.stringify(dump.localStorage)}::jsonb, now())
          ON CONFLICT (workspace_id)
          DO UPDATE SET settings = EXCLUDED.settings, updated_at = now()
        `;
      }
      return send(res, 200, { restored: true });
    }

    if (action === "restore-data" && req.method === "POST") {
      const body = await readBody(req);
      await upsertRecords(workspaceId, body.changed || []);
      await removeRecords(workspaceId, body.removed || []);
      return send(res, 200, { ok: true });
    }

    if (action === "backup-import" && req.method === "POST") {
      requireAdmin(profile);
      const body = await readBody(req);
      const dump = body.backup || body;
      const changed = [];
      Object.keys((dump && dump.tables) || {}).forEach((name) => {
        (dump.tables[name] || []).forEach((row) => {
          const recId = recordId(row);
          if (recId) changed.push({ table_name: name, record_id: recId, payload: row });
        });
      });
      await upsertRecords(workspaceId, changed);
      return send(res, 200, { imported: changed.length });
    }

    if (action === "workforce" && req.method === "GET") {
      requireAdmin(profile);
      const rows = await sql()`
        SELECT record_id, kind, payload, version
        FROM fms_workforce
        WHERE workspace_id = ${workspaceId}
        ORDER BY updated_at DESC
      `;
      return send(res, 200, {
        records: rows.map((row) => Object.assign({}, row.payload || {}, {
          _id: row.record_id,
          kind: row.kind,
          version: Number(row.version) || 0,
        })),
      });
    }

    if (action === "workforce" && req.method === "POST") {
      requireAdmin(profile);
      const body = await readBody(req);
      const record = body.record || {};
      const recId = String(record._id || recordId(record.payload) || recordId(record) || "").trim();
      if (!recId) return send(res, 400, { error: "Workforce record id is required." });
      const expected = Number(body.expectedVersion || 0);
      const existing = await sql()`
        SELECT version, payload FROM fms_workforce
        WHERE workspace_id = ${workspaceId} AND record_id = ${recId}
        LIMIT 1
      `;
      if (existing[0] && Number(existing[0].version) !== expected) {
        return send(res, 409, { error: "This workforce record changed in another session. Reload and try again." });
      }
      const nextVersion = (existing[0] ? Number(existing[0].version) : 0) + 1;
      const payload = Object.assign({}, record.payload || record, { _id: recId, version: nextVersion });
      const kind = record.kind || payload.kind || "";
      await sql()`
        INSERT INTO fms_workforce (workspace_id, record_id, kind, payload, version, updated_at)
        VALUES (${workspaceId}, ${recId}, ${kind}, ${JSON.stringify(payload)}::jsonb, ${nextVersion}, now())
        ON CONFLICT (workspace_id, record_id)
        DO UPDATE SET kind = EXCLUDED.kind, payload = EXCLUDED.payload, version = EXCLUDED.version, updated_at = now()
      `;
      await sql()`
        INSERT INTO fms_hr_audit (workspace_id, actor_email, action, before_payload, after_payload)
        VALUES (${workspaceId}, ${user.email}, ${existing[0] ? "update" : "create"}, ${existing[0] ? JSON.stringify(existing[0].payload) : null}::jsonb, ${JSON.stringify(payload)}::jsonb)
      `;
      return send(res, 200, { record: payload });
    }

    if (action === "workforce-import" && req.method === "POST") {
      requireAdmin(profile);
      const body = await readBody(req);
      const records = Array.isArray(body.records) ? body.records : [];
      for (const record of records) {
        const recId = String(record._id || recordId(record) || "").trim();
        if (!recId) continue;
        const version = Number(record.version || 1);
        await sql()`
          INSERT INTO fms_workforce (workspace_id, record_id, kind, payload, version, updated_at)
          VALUES (${workspaceId}, ${recId}, ${record.kind || ""}, ${JSON.stringify(record)}::jsonb, ${version}, now())
          ON CONFLICT (workspace_id, record_id)
          DO UPDATE SET kind = EXCLUDED.kind, payload = EXCLUDED.payload, version = EXCLUDED.version, updated_at = now()
        `;
      }
      return send(res, 200, { imported: records.length });
    }

    if (action === "staff-profiles" && req.method === "GET") {
      requireAdmin(profile);
      const rows = await sql()`
        SELECT p.user_id, p.role, p.display_name, p.permissions, p.disabled, u.email
        FROM fms_profiles p
        JOIN fms_users u ON u.id = p.user_id
        WHERE p.workspace_id = ${workspaceId} AND p.role = 'staff'
        ORDER BY p.display_name
      `;
      return send(res, 200, { profiles: rows });
    }

    if (action === "staff-profiles" && req.method === "POST") {
      requireAdmin(profile);
      const body = await readBody(req);
      const incoming = body.profile || body;
      const email = String(incoming.email || "").trim().toLowerCase();
      const displayName = String(incoming.display_name || "").trim();
      const permissions = Array.isArray(incoming.permissions) ? incoming.permissions : [];
      if (!email || !email.includes("@")) return send(res, 400, { error: "Enter a valid staff email." });
      if (!displayName) return send(res, 400, { error: "Enter the staff member's full name." });
      const password = String(incoming.password || "").trim() || randomPassword();
      const created = await sql()`
        INSERT INTO fms_users (email, password_hash, display_name)
        VALUES (${email}, crypt(${password}, gen_salt('bf', 12)), ${displayName})
        ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name, updated_at = now()
        RETURNING id, email, display_name
      `;
      const staff = created[0];
      await sql()`
        INSERT INTO fms_profiles (user_id, workspace_id, role, display_name, permissions, disabled)
        VALUES (${staff.id}, ${workspaceId}, 'staff', ${displayName}, ${JSON.stringify(permissions)}::jsonb, false)
        ON CONFLICT (user_id)
        DO UPDATE SET display_name = EXCLUDED.display_name, permissions = EXCLUDED.permissions, disabled = false
      `;
      return send(res, 200, {
        profile: {
          user_id: staff.id,
          email: staff.email,
          display_name: displayName,
          permissions,
          disabled: false,
        },
        temporary_password: incoming.password ? undefined : password,
      });
    }

    if (action === "staff-profile" && req.method === "POST") {
      requireAdmin(profile);
      const body = await readBody(req);
      const userId = String(body.user_id || "").trim();
      const patch = body.profile || {};
      if (!userId) return send(res, 400, { error: "Staff user id is required." });
      if (userId === profile.user_id) return send(res, 400, { error: "You cannot change your own access this way." });
      const disabled = patch.disabled == null ? null : !!patch.disabled;
      const permissions = Array.isArray(patch.permissions) ? patch.permissions : null;
      const displayName = patch.display_name ? String(patch.display_name).trim() : null;
      await sql()`
        UPDATE fms_profiles
        SET
          disabled = COALESCE(${disabled}, disabled),
          permissions = COALESCE(${permissions ? JSON.stringify(permissions) : null}::jsonb, permissions),
          display_name = COALESCE(${displayName}, display_name)
        WHERE user_id = ${userId} AND workspace_id = ${workspaceId} AND role = 'staff'
      `;
      return send(res, 200, { updated: true });
    }

    if (action === "staff-profile" && req.method === "DELETE") {
      requireAdmin(profile);
      const body = Object.keys(params).length ? params : await readBody(req);
      const userId = String(body.user_id || body.id || "").trim();
      if (!userId) return send(res, 400, { error: "Staff user id is required." });
      if (userId === profile.user_id) return send(res, 400, { error: "You cannot remove your own administrator access." });
      await sql()`DELETE FROM fms_profiles WHERE user_id = ${userId} AND workspace_id = ${workspaceId} AND role = 'staff'`;
      return send(res, 200, { removed: true });
    }

    return send(res, 404, { error: "Unknown Neon action." });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error("[FMS Neon]", error);
    return send(res, status, { error: error.message || "Neon database request failed." });
  }
};
