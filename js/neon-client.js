/* Neon Auth identity + Neon Postgres shared data adapter. */
(function (global) {
  "use strict";
  var config = global.FMS_NEON_AUTH_CONFIG || {};
  var apiOrigin = String(config.url || "").trim().replace(/\/$/, "");
  var configured = typeof location !== "undefined" && /^https?:$/i.test(location.protocol);
  var client = null, profile = null, workspaceId = null;
  var authClientReady = global.FMS_NEON_AUTH_READY || Promise.resolve(null);
  var syncStarted = false, syncOnline = false, changeCursor = 0;
  var pollTimer = null, notificationTimer = null;
  var settingsTimer = null, settingsSyncTimer = null, applyingSettings = false, settingsInitialized = false;
  var companyNameTimer = null, companyNameValue = "";
  var knownSettings = Object.create(null);
  var authWatchTimer = null;
  var lastCloudStatus = "";
  var queues = Object.create(null), scheduled = Object.create(null), knownRecords = Object.create(null);

  function clearLegacySession() {
    try { ["fms_auth_token", "fms_auth_uid", "fms_auth_sid", "fms_auth_user", "fms_auth_role", "fms_auth_permissions", "fms_auth_username"].forEach(k => sessionStorage.removeItem(k)); } catch (_) {}
  }
  function saveLegacySession(session, p) {
    if (!session || !session.access_token || !p) return;
    try {
      sessionStorage.setItem("fms_auth_token", session.access_token);
      sessionStorage.setItem("fms_auth_uid", session.user.id);
      sessionStorage.setItem("fms_auth_user", p.display_name || session.user.email || "User");
      sessionStorage.setItem("fms_auth_role", p.role || "staff");
      sessionStorage.setItem("fms_auth_permissions", JSON.stringify(p.permissions || []));
      sessionStorage.setItem("fms_auth_username", p.username || session.user.username || "");
      localStorage.setItem("fms_display_name", p.display_name || session.user.email || "User");
      localStorage.setItem("fms_display_role", p.role === "admin" ? "Finance Manager" : "Staff Member");
    } catch (_) {}
  }
  function status(detail) {
    var next = JSON.stringify({
      connected: !!(detail && detail.connected),
      error: (detail && detail.error) || "",
      initialized: detail && detail.initialized,
    });
    if (next === lastCloudStatus) return;
    lastCloudStatus = next;
    try { document.dispatchEvent(new CustomEvent("fms:cloud-status", { detail: detail || {} })); } catch (_) {}
  }
  function emitPermissions(nextProfile) {
    try { document.dispatchEvent(new CustomEvent("fms:permissions-updated", { detail: { profile: nextProfile || profile || null } })); } catch (_) {}
  }
  function database() { return global.FMSDB || null; }
  function recordId(row) { return row && row._id != null ? String(row._id) : row && row.id != null ? String(row.id) : ""; }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function toMap(rows) {
    var out = Object.create(null);
    (Array.isArray(rows) ? rows : []).forEach(row => { var id = recordId(row); if (id) out[id] = clone(row); });
    return out;
  }
  function equal(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function safeSettings(source) {
    var safe = {};
    Object.keys(source || {}).forEach(function (key) {
      if (/^fms_(?:institution_|logo_url|favicon_url|background_url|website_url)/i.test(key) && !/(?:auth|cred|password|token|staff_accounts|rate_limit)/i.test(key) && typeof source[key] === "string") safe[key] = source[key];
    });
    return safe;
  }
  function localSettings() {
    var values = {};
    try { for (var i = 0; i < localStorage.length; i++) { var key = localStorage.key(i); if (key) { var item = {}; item[key] = localStorage.getItem(key); Object.assign(values, safeSettings(item)); } } } catch (_) {}
    if (!values.fms_institution_name) values.fms_institution_name = "TJ Consultancy Inc";
    return values;
  }
  function emitSettings(settings) {
    try { document.dispatchEvent(new CustomEvent("fms:settings-updated", { detail: { settings: settings || {} } })); } catch (_) {}
  }
  function applySettings(settings) {
    var safe = safeSettings(settings);
    applyingSettings = true;
    try {
      Object.keys(knownSettings).forEach(function (key) { if (!Object.prototype.hasOwnProperty.call(safe, key)) localStorage.removeItem(key); });
      Object.keys(safe).forEach(function (key) { if (localStorage.getItem(key) !== safe[key]) localStorage.setItem(key, safe[key]); });
      knownSettings = safe;
    } finally { applyingSettings = false; }
    emitSettings(safe);
  }
  async function pullSettings() {
    if (!syncOnline) return;
    try {
      var company = await api("company-name");
      companyNameValue = String(company.name || "TJ Consultancy Inc");
      applyingSettings = true;
      try { if (localStorage.getItem("fms_institution_name") !== companyNameValue) localStorage.setItem("fms_institution_name", companyNameValue); }
      finally { applyingSettings = false; }
      emitSettings({ fms_institution_name: companyNameValue });
      var result = await api("settings");
      var remote = safeSettings(result.settings || {});
      if (!settingsInitialized && !Object.keys(remote).length && profile) {
        await api("settings", "PUT", { settings: localSettings(), replace: true });
        remote = localSettings();
      }
      if (!Object.prototype.hasOwnProperty.call(remote, "fms_institution_name")) remote.fms_institution_name = companyNameValue;
      if (!settingsInitialized || !equal(remote, knownSettings)) applySettings(remote);
      settingsInitialized = true;
    } catch (error) { console.warn("[FMS Neon] Settings sync failed.", error); }
  }
  async function pushSettings() {
    if (!syncOnline || applyingSettings || !profile) return;
    var current = localSettings();
    if (equal(current, knownSettings)) return;
    try {
      var result = await api("settings", "PUT", { settings: current, replace: true });
      knownSettings = safeSettings(result.settings || current);
      applySettings(knownSettings);
    } catch (error) { console.warn("[FMS Neon] Settings update failed.", error); }
  }
  function scheduleSettingsSync() {
    if (applyingSettings || !syncOnline || !profile) return;
    clearTimeout(settingsSyncTimer);
    settingsSyncTimer = setTimeout(pushSettings, 350);
  }
  function watchSettings() {
    if (settingsTimer) return;
    settingsTimer = setInterval(pullSettings, 2500);
    global.addEventListener("storage", function (event) {
      if (event.key === "fms_institution_name" && event.newValue && event.newValue !== companyNameValue) pushCompanyName(event.newValue).catch(function () {});
      else if (event.key && /^(?:fms|tj_fms)/i.test(event.key)) scheduleSettingsSync();
    });
    var originalSet = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function (key, value) {
      originalSet(key, value);
      if (key === "fms_institution_name" && !applyingSettings) {
        var name = String(value || "").trim() || "TJ Consultancy Inc";
        clearTimeout(companyNameTimer);
        companyNameTimer = setTimeout(function () { pushCompanyName(name).catch(function () {}); }, 300);
      } else if (typeof key === "string" && /^(?:fms|tj_fms)/i.test(key)) scheduleSettingsSync();
    };
    var originalRemove = localStorage.removeItem.bind(localStorage);
    localStorage.removeItem = function (key) {
      originalRemove(key);
      if (typeof key === "string" && /^(?:fms|tj_fms)/i.test(key)) scheduleSettingsSync();
    };
  }
  async function token() {
    if (!client) return "";
    try {
      var result = await client.auth.getSession();
      return result && result.data && result.data.session && result.data.session.access_token || "";
    } catch (_) { return ""; }
  }
  async function currentSession() {
    if (!client) return null;
    var result = await client.auth.getSession();
    if (result && result.error) throw result.error;
    var session = result && result.data && result.data.session;
    return session && session.user && session.access_token ? session : null;
  }
  async function api(action, method, data, query) {
    var accessToken = await token();
    if (!accessToken) throw new Error("Sign in to connect to the shared Neon database.");
    var params = new URLSearchParams({ action: action });
    Object.keys(query || {}).forEach(key => params.set(key, query[key]));
    var response = await fetch(apiOrigin + "/api/neon?" + params.toString(), {
      method: method || "GET",
      headers: { Authorization: "Bearer " + accessToken, ...(data ? { "Content-Type": "application/json" } : {}) },
      body: data ? JSON.stringify(data) : undefined,
      cache: "no-store",
    });
    var result;
    try { result = await response.json(); } catch (_) { result = {}; }
    if (!response.ok) throw new Error(result.error || "Neon database request failed.");
    return result;
  }
  async function loadProfile(user, accessToken) {
    if (!client || !user) return null;
    var result = await fetch(apiOrigin + "/api/neon?action=profile", { headers: { Authorization: "Bearer " + accessToken }, cache: "no-store" });
    var payload = await result.json().catch(() => ({}));
    if (!result.ok || !payload.profile || !payload.profile.workspace_id) {
      var missing = new Error(payload.error || "Your account is not assigned to a Neon FMS workspace.");
      missing.code = result.status === 403 ? "PROFILE_MISSING" : "NEON_PROFILE_ERROR";
      throw missing;
    }
    return payload.profile;
  }

  async function restoreSession() {
    if (!client) return { configured: false, authenticated: false };
    try {
      var session = await currentSession();
      if (!session) { clearLegacySession(); return { configured: true, authenticated: false }; }
      profile = await loadProfile(session.user, session.access_token);
      workspaceId = profile.workspace_id;
      saveLegacySession(session, profile);
      emitPermissions(profile);
      return { configured: true, authenticated: true, profile: profile };
    } catch (error) {
      clearLegacySession();
      return { configured: true, authenticated: false, error: error };
    }
  }
  function subscribeToAuth() {
    if (!client || authWatchTimer) return;
    var check = async function () {
      if (document.hidden) return;
      try {
        var session = await currentSession();
        if (!session) {
          if (profile) { profile = null; workspaceId = null; syncOnline = false; clearLegacySession(); status({ connected: false }); }
        } else if (profile) {
          try {
            var nextProfile = await loadProfile(session.user, session.access_token);
            var changed = !equal({
              role: profile.role,
              permissions: profile.permissions || [],
              disabled: !!profile.disabled,
              display_name: profile.display_name,
            }, {
              role: nextProfile.role,
              permissions: nextProfile.permissions || [],
              disabled: !!nextProfile.disabled,
              display_name: nextProfile.display_name,
            });
            profile = nextProfile;
            workspaceId = nextProfile.workspace_id;
            saveLegacySession(session, profile);
            if (changed) emitPermissions(profile);
          } catch (error) {
            if (error && (error.code === "PROFILE_MISSING" || /disabled|not assigned/i.test(error.message || ""))) {
              await signOut();
              if (typeof location !== "undefined") location.replace("login.html");
            }
          }
        }
      } catch (_) {}
    };
    authWatchTimer = setInterval(check, 15000);
    global.addEventListener("focus", check);
  }
  var ready = Promise.resolve(authClientReady).then(function (authClient) {
    if (!authClient) return { configured: configured, authenticated: false };
    client = authClient;
    subscribeToAuth();
    return restoreSession();
  }).catch(function (error) {
    status({ connected: false, error: error && error.message || "Neon Auth could not be initialized." });
    return { configured: configured, authenticated: false, error: error };
  });

  async function applyBootstrap(snapshot) {
    var db = database();
    if (!db) return;
    (snapshot.deleted || []).forEach(function (item) { db.markDeletedRecord(item.table_name, item.record_id); });
    var grouped = Object.create(null);
    (snapshot.records || []).forEach(function (item) { (grouped[item.table_name] ||= []).push(item.payload); });
    var names = new Set([...(snapshot.tables || []), ...Object.keys(grouped), ...(db.listTables ? db.listTables() : [])]);
    names.forEach(function (name) {
      db.replaceFromRemote(name, grouped[name] || []);
      knownRecords[name] = toMap(grouped[name] || []);
    });
    changeCursor = Number(snapshot.cursor) || changeCursor;
  }

  async function pullWorkspace() {
    var snapshot = await api("bootstrap");
    await applyBootstrap(snapshot);
    return snapshot;
  }

  async function pushTable(name) {
    var db = database();
    if (!db || !syncOnline) return;
    var current = toMap(db.table(name, []));
    var previous = knownRecords[name] || Object.create(null);
    var changed = [], removed = [];
    Object.keys(current).forEach(id => { if (!previous[id] || !equal(current[id], previous[id])) changed.push({ table_name: name, record_id: id, payload: current[id] }); });
    Object.keys(previous).forEach(id => { if (!current[id]) removed.push({ table_name: name, record_id: id }); });
    if (!changed.length && !removed.length) return;
    for (var offset = 0; offset < Math.max(changed.length, removed.length); offset += 250) {
      await api("sync", "POST", { changed: changed.slice(offset, offset + 250), removed: removed.slice(offset, offset + 250) });
    }
    knownRecords[name] = current;
  }
  function scheduleTable(name) {
    if (!syncOnline || !name) return Promise.resolve();
    if (scheduled[name]) return queues[name] || Promise.resolve();
    scheduled[name] = true;
    queues[name] = (queues[name] || Promise.resolve()).then(async function () {
      scheduled[name] = false;
      await pushTable(name);
    }).catch(async function (error) {
      scheduled[name] = false;
      console.warn("[FMS Neon] Sync failed for " + name + ".", error);
      status({ connected: true, error: error.message || "A server rule rejected this change.", table: name });
      try { await pullWorkspace(); } catch (_) {}
    });
    return queues[name];
  }

  async function pollChanges() {
    if (!syncOnline || !workspaceId) return;
    try {
      var result = await api("changes", "GET", null, { after: String(changeCursor) });
      (result.changes || []).forEach(function (change) {
        var db = database(), name = change.table_name, id = String(change.record_id);
        if (!db) return;
        db.applyRemoteRecord(name, id, change.is_deleted ? null : change.payload, !!change.is_deleted);
        var map = knownRecords[name] || (knownRecords[name] = Object.create(null));
        if (change.is_deleted) delete map[id]; else map[id] = clone(change.payload);
      });
      changeCursor = Number(result.cursor) || changeCursor;
      status({ connected: true, realtime: "polling", cursor: changeCursor });
    } catch (error) {
      status({ connected: false, error: error.message || "Neon connection interrupted." });
    }
  }
  function dispatchNotification(notification) {
    try { document.dispatchEvent(new CustomEvent("fms:notification", { detail: { notification: notification || {} } })); } catch (_) {}
  }
  async function pollNotifications() {
    if (!syncOnline) return;
    try {
      var result = await api("notifications", "GET", null, { limit: "100" });
      (result.notifications || []).forEach(dispatchNotification);
    } catch (_) {}
  }

  async function bootstrapSync() {
    if (syncStarted || !client || !workspaceId || !database()) return;
    syncStarted = true;
    try {
      await database().ready;
      var snapshot = await api("bootstrap");
      if (snapshot.initialized) {
        await applyBootstrap(snapshot);
      } else if (profile && profile.role === "admin") {
        var db = database(), tables = {};
        (db.listTables ? db.listTables() : []).forEach(name => { tables[name] = db.table(name, []).map(clone); });
        await api("initialize", "POST", { tables: tables, deleted: [] });
        snapshot = await api("bootstrap");
        await applyBootstrap(snapshot);
      } else {
        status({ connected: true, initialized: false, error: "Waiting for an administrator to initialize the Neon workspace." });
        syncStarted = false;
        return;
      }
      syncOnline = true;
      status({ connected: true, initialized: true, provider: "Neon Postgres" });
      clearInterval(pollTimer); clearInterval(notificationTimer);
      pollTimer = setInterval(pollChanges, 2500);
      notificationTimer = setInterval(pollNotifications, 5000);
      watchSettings();
      await pullSettings();
      pollNotifications();
      createBackup("daily").catch(error => console.warn("[FMS Neon] Daily backup failed:", error.message));
    } catch (error) {
      syncOnline = false; syncStarted = false;
      console.error("[FMS Neon] Shared workspace could not start.", error);
      status({ connected: false, error: error.message || "Unable to connect to the Neon workspace." });
    }
  }
  async function waitUntilConnected() {
    if (!client) throw new Error("Sign-in is not configured.");
    for (var attempt = 0; attempt < 120; attempt++) {
      if (syncOnline) return true;
      if (!navigator.onLine) throw new Error("Reconnect before importing a shared backup.");
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error("The shared Neon database did not connect. Local data was kept; retry the import when connected.");
  }
  function beginWhenReady() {
    if (!database()) return;
    ready.then(function (result) {
      if (!result.authenticated) return;
      var begin = () => setTimeout(bootstrapSync, 0);
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", begin, { once: true });
      else begin();
    });
  }

  async function signIn(email, password) {
    await ready;
    if (!client) return { success: false, error: "Sign-in is not configured." };
    var result = await client.auth.signInWithPassword({ email: email, password: password });
    if (result && result.error) return { success: false, error: result.error.message || "Invalid email or password." };
    try {
      var session = await currentSession();
      if (!session) return { success: false, error: "Neon Auth did not return a valid sign-in session." };
      profile = await loadProfile(session.user, session.access_token);
      workspaceId = profile.workspace_id;
      saveLegacySession(session, profile);
      emitPermissions(profile);
      return { success: true, profile: profile };
    } catch (error) {
      await client.auth.signOut(); clearLegacySession();
      return { success: false, error: error.message || "Your account could not be authorized." };
    }
  }
  async function signOut() {
    clearInterval(pollTimer); clearInterval(notificationTimer);
    await ready;
    if (client) await client.auth.signOut();
    profile = null; workspaceId = null; syncOnline = false; syncStarted = false;
    clearLegacySession();
  }
  async function changePassword(currentPassword, newPassword) {
    await ready;
    if (!client || !profile || profile.role !== "admin") return { success: false, error: "Administrator sign-in is required for password changes." };
    var session = await currentSession(), email = session && session.user && session.user.email;
    if (!email) return { success: false, error: "Your sign-in session has expired. Please sign in again." };
    var verified = await client.auth.signInWithPassword({ email: email, password: currentPassword });
    if (verified && verified.error) return { success: false, error: "Current password is incorrect." };
    var updated = await client.auth.updateUser({ password: newPassword });
    return updated.error ? { success: false, error: updated.error.message || "Password update failed." } : { success: true };
  }
  async function listNotifications(limit) { var r = await api("notifications", "GET", null, { limit: String(limit || 100) }); return r.notifications || []; }
  async function publishNotification(notification) { return api("notifications", "POST", { notification: notification || {} }); }
  async function listBackups() { var r = await api("backups"); return (r.backups || []).map(b => ({ ts: new Date(b.created_at).getTime(), label: b.label, cloudId: b.id })); }
  async function getBackup(id) { return api("backups", "GET", null, { id: String(id) }); }
  async function createBackup(label, localStorageSettings) {
    if (!syncOnline) throw new Error("Connect to Neon before creating a shared backup.");
    if (database()) await Promise.all((database().listTables ? database().listTables() : []).map(pushTable));
    return api("backups", "POST", { label: label || "auto", localStorage: localStorageSettings || {} });
  }
  async function restoreBackup(id) { return api("backups", "PUT", { id: id }); }
  async function replaceRecords(changed, removed) {
    if (!syncOnline) throw new Error("Connect to Neon before restoring shared data.");
    return api("restore-data", "POST", { changed: changed || [], removed: removed || [] });
  }
  async function importBackup(dump) {
    if (!syncOnline) throw new Error("Connect to Neon before importing a shared backup.");
    return api("backup-import", "POST", { backup: dump });
  }
  async function listWorkforce() { var r = await api("workforce"); return r.records || []; }
  async function saveWorkforce(record, expectedVersion) { return api("workforce", "POST", { record: record, expectedVersion: expectedVersion || 0 }); }
  async function importWorkforce(records) { return api("workforce-import", "POST", { records: records || [] }); }
  async function pushCompanyName(name) {
    if (!syncOnline || !profile || !name || name === companyNameValue) return;
    var result = await api("company-name", "POST", { name: String(name).trim() || "TJ Consultancy Inc" });
    companyNameValue = String(result.name || name);
    applyingSettings = true;
    try { localStorage.setItem("fms_institution_name", companyNameValue); }
    finally { applyingSettings = false; }
    emitSettings({ fms_institution_name: companyNameValue });
  }
  async function saveSettings(settings) {
    if (!profile) throw new Error("Sign in to change shared settings.");
    var result = await api("settings", "PUT", { settings: safeSettings(settings), replace: true });
    knownSettings = safeSettings(result.settings || settings);
    applySettings(knownSettings);
    return result;
  }

  global.FMSCloud = {
    getClient: function () { return client; },
    ready: ready,
    hasConfiguration: function () { return configured; },
    isConfigured: function () { return configured; },
    getProfile: function () { return profile; },
    signIn: signIn, signOut: signOut, changePassword: changePassword,
    listStaffProfiles: async function () { var r = await api("staff-profiles"); return r.profiles || []; },
    saveStaffProfile: async function (profile) { return api("staff-profiles", "POST", { profile: profile || {} }); },
    updateStaffProfile: async function (userId, patch) { return api("staff-profile", "POST", { user_id: userId, profile: patch || {} }); },
    removeStaffProfile: async function (userId) { return api("staff-profile", "DELETE", { user_id: userId }); },
    syncTable: scheduleTable, listNotifications: listNotifications, publishNotification: publishNotification,
    listBackups: listBackups, getBackup: getBackup, createBackup: createBackup, restoreBackup: restoreBackup,
    replaceRecords: replaceRecords, importBackup: importBackup,
    listWorkforce: listWorkforce, saveWorkforce: saveWorkforce, importWorkforce: importWorkforce,
    listSettings: async function () { var result = await api("settings"); return result.settings || {}; },
    saveSettings: saveSettings, pushCompanyName: pushCompanyName,
    startSync: beginWhenReady, waitUntilConnected: waitUntilConnected,
    refreshProfile: async function () {
      var session = await currentSession();
      if (!session) return null;
      profile = await loadProfile(session.user, session.access_token);
      workspaceId = profile.workspace_id;
      saveLegacySession(session, profile);
      emitPermissions(profile);
      return profile;
    },
  };
  beginWhenReady();
})(window);
