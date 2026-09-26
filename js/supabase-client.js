/* ============================================================
   Supabase authentication + shared-data synchronisation

   The local FMSDB cache remains available for fast/offline rendering. When
   configured, this module makes Supabase the durable source of truth and
   synchronises each FMSDB record across authorised devices in real time.
   ============================================================ */
(function (global) {
  "use strict";

  var config = global.FMS_SUPABASE_CONFIG || {};
  var url = String(config.url || "")
    .trim()
    .replace(/\/$/, "");
  var publishableKey = String(config.publishableKey || "").trim();
  var configured =
    /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url) && !!publishableKey;
  var client = null;
  var profile = null;
  var workspaceId = null;
  var syncStarted = false;
  var syncOnline = false;
  var recordsChannel = null;
  var notificationsChannel = null;
  var tableQueues = Object.create(null);
  var tableScheduled = Object.create(null);
  var knownRecords = Object.create(null);
  var stateTables = [];

  var RECORDS_TABLE = "fms_records";
  var STATE_TABLE = "fms_sync_state";
  var NOTIFICATIONS_TABLE = "fms_notifications";

  function clearLegacySession() {
    try {
      [
        "fms_auth_token",
        "fms_auth_uid",
        "fms_auth_sid",
        "fms_auth_user",
        "fms_auth_role",
        "fms_auth_permissions",
      ].forEach(function (key) {
        sessionStorage.removeItem(key);
      });
    } catch (_) {}
  }

  function saveLegacySession(session, nextProfile) {
    if (!session || !session.access_token || !nextProfile) return;
    try {
      sessionStorage.setItem("fms_auth_token", session.access_token);
      sessionStorage.setItem("fms_auth_uid", session.user.id);
      sessionStorage.setItem(
        "fms_auth_user",
        nextProfile.display_name || session.user.email || "User",
      );
      sessionStorage.setItem("fms_auth_role", nextProfile.role || "staff");
      sessionStorage.setItem(
        "fms_auth_permissions",
        JSON.stringify(nextProfile.permissions || []),
      );
      localStorage.setItem(
        "fms_display_name",
        nextProfile.display_name || session.user.email || "User",
      );
      localStorage.setItem(
        "fms_display_role",
        nextProfile.role === "admin" ? "Finance Manager" : "Staff Member",
      );
    } catch (_) {}
  }

  function errorMessage(error, fallback) {
    if (!error) return fallback;
    if (error.message === "PROFILE_MISSING") {
      return "Your account is not assigned to the FMS workspace. Ask an administrator to provision it.";
    }
    return fallback;
  }

  if (
    configured &&
    global.supabase &&
    typeof global.supabase.createClient === "function"
  ) {
    client = global.supabase.createClient(url, publishableKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    });
  } else if (configured) {
    console.error("[FMS Supabase] The Supabase browser library did not load.");
  }

  async function loadProfile(user) {
    if (!client || !user) return null;
    var result = await client
      .from("fms_profiles")
      .select("id, workspace_id, display_name, role, permissions")
      .eq("id", user.id)
      .maybeSingle();
    if (result.error) throw result.error;
    if (!result.data || !result.data.workspace_id) {
      var missing = new Error("PROFILE_MISSING");
      missing.code = "PROFILE_MISSING";
      throw missing;
    }
    return result.data;
  }

  async function restoreSession() {
    if (!client) return { configured: false, authenticated: false };
    try {
      var result = await client.auth.getSession();
      var session = result.data && result.data.session;
      if (!session) {
        clearLegacySession();
        return { configured: true, authenticated: false };
      }
      profile = await loadProfile(session.user);
      workspaceId = profile.workspace_id;
      saveLegacySession(session, profile);
      return { configured: true, authenticated: true, profile: profile };
    } catch (error) {
      clearLegacySession();
      return { configured: true, authenticated: false, error: error };
    }
  }

  var ready = restoreSession();

  if (client) {
    client.auth.onAuthStateChange(function (_event, session) {
      if (!session) {
        profile = null;
        workspaceId = null;
        clearLegacySession();
      } else if (profile) {
        saveLegacySession(session, profile);
      }
    });
  }

  function recordId(row) {
    if (!row || typeof row !== "object") return "";
    if (row._id !== undefined && row._id !== null) return String(row._id);
    if (row.id !== undefined && row.id !== null) return String(row.id);
    return "";
  }

  function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function mapRows(rows) {
    var map = Object.create(null);
    (Array.isArray(rows) ? rows : []).forEach(function (row) {
      var id = recordId(row);
      if (id) map[id] = cloneJson(row);
    });
    return map;
  }

  function values(map) {
    return Object.keys(map).map(function (key) {
      return map[key];
    });
  }

  function sameJson(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  function database() {
    return global.FMSDB || null;
  }

  function status(detail) {
    try {
      document.dispatchEvent(
        new CustomEvent("fms:supabase-status", { detail: detail || {} }),
      );
    } catch (_) {}
  }

  async function readState() {
    var result = await client
      .from(STATE_TABLE)
      .select("tables")
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (result.error) throw result.error;
    return result.data || null;
  }

  async function writeState(tables) {
    var result = await client
      .from(STATE_TABLE)
      .upsert(
        { workspace_id: workspaceId, tables: tables },
        { onConflict: "workspace_id" },
      );
    if (result.error) throw result.error;
    stateTables = tables.slice();
  }

  async function readRemoteRecords() {
    var result = await client
      .from(RECORDS_TABLE)
      .select("table_name, record_id, payload")
      .eq("workspace_id", workspaceId);
    if (result.error) throw result.error;
    return result.data || [];
  }

  async function readRemoteDeletions() {
    var result = await client
      .from("fms_deleted_records")
      .select("table_name, record_id")
      .eq("workspace_id", workspaceId);
    if (result.error) throw result.error;
    return result.data || [];
  }

  function applyRemoteTable(tableName, rows) {
    var db = database();
    if (!db || typeof db.replaceFromRemote !== "function") return;
    db.replaceFromRemote(tableName, rows);
    knownRecords[tableName] = mapRows(rows);
  }

  async function pullWorkspace() {
    var db = database();
    if (!db) return;
    /* Read tombstones first. This prevents a cache or imported backup from
       briefly recreating a record that was deleted while this browser was
       offline. Subsequent deletes are delivered through fms_records Realtime. */
    var remoteDeletions = await readRemoteDeletions();
    if (typeof db.markDeletedRecord === "function") {
      remoteDeletions.forEach(function (record) {
        db.markDeletedRecord(record.table_name, record.record_id);
      });
    }
    var remoteRows = await readRemoteRecords();
    var grouped = Object.create(null);
    remoteRows.forEach(function (record) {
      if (!grouped[record.table_name]) grouped[record.table_name] = [];
      grouped[record.table_name].push(record.payload);
    });
    var names = stateTables.slice();
    Object.keys(grouped).forEach(function (name) {
      if (names.indexOf(name) === -1) names.push(name);
    });
    if (typeof db.listTables === "function") {
      db.listTables().forEach(function (name) {
        if (names.indexOf(name) === -1) names.push(name);
      });
    }
    names.forEach(function (name) {
      applyRemoteTable(name, grouped[name] || []);
    });
  }

  async function pushTable(tableName) {
    var db = database();
    if (!db || !syncOnline) return;
    var currentRows = db.table(tableName, []);
    var current = mapRows(currentRows);
    var previous = knownRecords[tableName] || Object.create(null);
    var changed = [];
    var removed = [];

    Object.keys(current).forEach(function (id) {
      if (!previous[id] || !sameJson(current[id], previous[id])) {
        changed.push({
          workspace_id: workspaceId,
          table_name: tableName,
          record_id: id,
          payload: current[id],
        });
      }
    });
    Object.keys(previous).forEach(function (id) {
      if (!current[id]) removed.push(id);
    });

    if (changed.length) {
      var upsert = await client
        .from(RECORDS_TABLE)
        .upsert(changed, { onConflict: "workspace_id,table_name,record_id" });
      if (upsert.error) throw upsert.error;
    }
    if (removed.length) {
      var deletion = await client
        .from(RECORDS_TABLE)
        .delete()
        .eq("workspace_id", workspaceId)
        .eq("table_name", tableName)
        .in("record_id", removed);
      if (deletion.error) throw deletion.error;
    }
    knownRecords[tableName] = current;
    if (stateTables.indexOf(tableName) === -1) {
      await writeState(stateTables.concat([tableName]));
    }
  }

  function scheduleTable(tableName) {
    if (!syncOnline || !tableName || tableScheduled[tableName]) return;
    tableScheduled[tableName] = true;
    tableQueues[tableName] = (tableQueues[tableName] || Promise.resolve())
      .then(async function () {
        tableScheduled[tableName] = false;
        await pushTable(tableName);
      })
      .catch(async function (error) {
        tableScheduled[tableName] = false;
        console.warn(
          "[FMS Supabase] Sync rejected for " + tableName + ".",
          error,
        );
        status({
          connected: true,
          error: errorMessage(error, "A server rule rejected this change."),
          table: tableName,
        });
        try {
          await pullWorkspace();
        } catch (pullError) {
          console.warn(
            "[FMS Supabase] Could not restore the server copy.",
            pullError,
          );
        }
      });
  }

  function handleRemoteChange(change) {
    if (!change) return;
    var row = change.new || change.old || {};
    var tableName = row.table_name;
    var id = row.record_id;
    if (!tableName || !id) return;
    var db = database();
    if (!db || typeof db.applyRemoteRecord !== "function") return;
    var isDelete = change.eventType === "DELETE";
    db.applyRemoteRecord(
      tableName,
      String(id),
      isDelete ? null : row.payload,
      isDelete,
    );
    var map = knownRecords[tableName] || Object.create(null);
    if (isDelete) delete map[String(id)];
    else map[String(id)] = cloneJson(row.payload);
    knownRecords[tableName] = map;
  }

  function subscribeToRecords() {
    if (recordsChannel) client.removeChannel(recordsChannel);
    recordsChannel = client
      .channel("fms-records-" + workspaceId)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: RECORDS_TABLE,
          filter: "workspace_id=eq." + workspaceId,
        },
        handleRemoteChange,
      )
      .subscribe(function (state) {
        status({ connected: state === "SUBSCRIBED", realtime: state });
      });
  }

  function dispatchNotification(notification) {
    try {
      document.dispatchEvent(
        new CustomEvent("fms:notification", {
          detail: { notification: notification || {} },
        }),
      );
    } catch (_) {}
  }

  function handleRemoteNotification(change) {
    if (!change || change.eventType === "DELETE") return;
    var notification = change.new || {};
    if (notification.workspace_id !== workspaceId) return;
    dispatchNotification(notification);
  }

  function subscribeToNotifications() {
    if (!client || !workspaceId) return;
    if (notificationsChannel) client.removeChannel(notificationsChannel);
    notificationsChannel = client
      .channel("fms-notifications-" + workspaceId)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: NOTIFICATIONS_TABLE,
          filter: "workspace_id=eq." + workspaceId,
        },
        handleRemoteNotification,
      )
      .subscribe(function (state) {
        status({ notificationsRealtime: state });
      });
  }

  async function listNotifications(limit) {
    if (!client || !workspaceId) return [];
    var safeLimit = Math.max(1, Math.min(Number(limit) || 100, 100));
    var result = await client
      .from(NOTIFICATIONS_TABLE)
      .select("id, client_event_id, type, title, message, metadata, created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(safeLimit);
    if (result.error) throw result.error;
    return result.data || [];
  }

  async function publishNotification(notification) {
    if (!client || !workspaceId || !profile) {
      return { success: false, error: "Supabase is not connected." };
    }

    notification = notification || {};
    var clientEventId = String(notification.client_event_id || "").trim();
    if (!clientEventId) {
      return { success: false, error: "A notification ID is required." };
    }

    var result = await client.from(NOTIFICATIONS_TABLE).insert({
      workspace_id: workspaceId,
      source_user_id: profile.id,
      client_event_id: clientEventId,
      type: String(notification.type || "system").slice(0, 40),
      title: String(notification.title || "System update").slice(0, 160),
      message: String(notification.message || "").slice(0, 1000),
      metadata:
        notification.metadata && typeof notification.metadata === "object"
          ? notification.metadata
          : {},
    });

    /* A browser retry may encounter its already-created event. It is safe to
       treat that unique-key conflict as delivered because all clients dedupe
       by client_event_id. */
    if (result.error && result.error.code !== "23505") throw result.error;
    return { success: true };
  }

  async function bootstrapSync() {
    if (syncStarted || !client || !workspaceId || !database()) return;
    syncStarted = true;
    try {
      subscribeToNotifications();
      var serverState = await readState();
      if (serverState) {
        stateTables = Array.isArray(serverState.tables)
          ? serverState.tables
          : [];
        await pullWorkspace();
        syncOnline = true;
        subscribeToRecords();
        status({ connected: true, initialized: true });
        return;
      }

      if (!profile || profile.role !== "admin") {
        status({
          connected: true,
          initialized: false,
          error:
            "Waiting for an administrator to initialise the shared workspace.",
        });
        return;
      }

      var db = database();
      stateTables = typeof db.listTables === "function" ? db.listTables() : [];
      syncOnline = true;
      for (var i = 0; i < stateTables.length; i++)
        await pushTable(stateTables[i]);
      await writeState(stateTables);
      subscribeToRecords();
      status({ connected: true, initialized: true });
    } catch (error) {
      syncOnline = false;
      console.error("[FMS Supabase] Shared workspace was not started.", error);
      status({
        connected: false,
        error: errorMessage(
          error,
          "Unable to connect to the shared workspace.",
        ),
      });
    }
  }

  function beginWhenReady() {
    if (!client || !database()) return;
    ready.then(function (result) {
      if (!result.authenticated) return;
      var begin = function () {
        setTimeout(bootstrapSync, 0);
      };
      if (document.readyState === "loading")
        document.addEventListener("DOMContentLoaded", begin, { once: true });
      else begin();
    });
  }

  async function signIn(email, password) {
    if (!client)
      return { success: false, error: "Supabase is not configured." };
    var result = await client.auth.signInWithPassword({
      email: email,
      password: password,
    });
    if (result.error || !result.data || !result.data.session) {
      return { success: false, error: "Invalid email or password." };
    }
    try {
      profile = await loadProfile(result.data.session.user);
      workspaceId = profile.workspace_id;
      saveLegacySession(result.data.session, profile);
      return { success: true, profile: profile };
    } catch (error) {
      await client.auth.signOut();
      clearLegacySession();
      return {
        success: false,
        error: errorMessage(error, "Your account could not be authorised."),
      };
    }
  }

  async function signOut() {
    if (recordsChannel && client) {
      try {
        await client.removeChannel(recordsChannel);
      } catch (_) {}
      recordsChannel = null;
    }
    if (notificationsChannel && client) {
      try {
        await client.removeChannel(notificationsChannel);
      } catch (_) {}
      notificationsChannel = null;
    }
    if (client) await client.auth.signOut();
    profile = null;
    workspaceId = null;
    syncOnline = false;
    clearLegacySession();
  }

  /* Update the signed-in administrator's password. Supabase requires a
     current session for this operation; we also reauthenticate with the
     supplied current password so the Settings form has the same protection
     in cloud and local deployments. */
  async function changePassword(currentPassword, newPassword) {
    if (!client || !profile) {
      return { success: false, error: "The secure sign-in service is unavailable." };
    }
    if (profile.role !== "admin") {
      return { success: false, error: "Only an administrator can change this password here." };
    }

    var userResult = await client.auth.getUser();
    var user = userResult.data && userResult.data.user;
    var email = user && user.email;
    if (userResult.error || !email) {
      return { success: false, error: "Your sign-in session has expired. Please sign in again." };
    }

    var verification = await client.auth.signInWithPassword({
      email: email,
      password: currentPassword,
    });
    if (verification.error) {
      return { success: false, error: "Current password is incorrect." };
    }

    var update = await client.auth.updateUser({ password: newPassword });
    if (update.error) {
      return { success: false, error: update.error.message || "Password update failed." };
    }

    var refreshed = await client.auth.getSession();
    if (refreshed.data && refreshed.data.session) {
      saveLegacySession(refreshed.data.session, profile);
    }
    return { success: true };
  }

  global.FMSCloud = {
    getClient: function () { return client; },
    ready: ready,
    hasConfiguration: function () {
      return configured;
    },
    isConfigured: function () {
      return !!client;
    },
    getProfile: function () {
      return profile;
    },
    signIn: signIn,
    signOut: signOut,
    changePassword: changePassword,
    syncTable: scheduleTable,
    listNotifications: listNotifications,
    publishNotification: publishNotification,
    startSync: beginWhenReady,
  };

  beginWhenReady();
})(window);
