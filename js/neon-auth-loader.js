/* Same-origin Neon Auth client. Mimics the small supabase-js surface
   used by neon-client.js so the rest of the dashboard stays unchanged. */
(function (global) {
  "use strict";
  var STORAGE = "fms_neon_session";

  function apiBase() {
    return String((global.FMS_NEON_AUTH_CONFIG || {}).url || "").trim().replace(/\/$/, "");
  }

  function readSession() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE) || "null");
    } catch (_) {
      return null;
    }
  }

  function writeSession(session) {
    try {
      if (!session || !session.access_token) localStorage.removeItem(STORAGE);
      else localStorage.setItem(STORAGE, JSON.stringify(session));
    } catch (_) {}
  }

  function expired(session) {
    return !session || !session.access_token || (session.expires_at && Date.now() > Number(session.expires_at) * 1000);
  }

  async function request(action, method, data, token) {
    var headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = "Bearer " + token;
    var response = await fetch(apiBase() + "/api/auth?action=" + encodeURIComponent(action), {
      method: method || "POST",
      headers: headers,
      body: data ? JSON.stringify(data) : undefined,
      cache: "no-store",
    });
    var result = {};
    try { result = await response.json(); } catch (_) {}
    if (!response.ok) throw new Error(result.error || "Authentication request failed.");
    return result;
  }

  var client = {
    auth: {
      signInWithPassword: async function (credentials) {
        try {
          var result = await request("login", "POST", {
            email: credentials && credentials.email,
            username: credentials && (credentials.username || credentials.email),
            password: credentials && credentials.password,
          });
          writeSession(result.session);
          return { data: { session: result.session }, error: null };
        } catch (error) {
          return { data: { session: null }, error: { message: error.message } };
        }
      },
      getSession: async function () {
        var session = readSession();
        if (expired(session)) {
          writeSession(null);
          return { data: { session: null }, error: null };
        }
        return { data: { session: session }, error: null };
      },
      signOut: async function () {
        var session = readSession();
        try {
          if (session && session.access_token) await request("logout", "POST", {}, session.access_token);
        } catch (_) {}
        writeSession(null);
        return { error: null };
      },
      updateUser: async function (patch) {
        var session = readSession();
        if (!session || !session.access_token) return { error: { message: "Your sign-in session has expired." } };
        try {
          await request("update-password", "POST", { password: patch && patch.password }, session.access_token);
          return { error: null };
        } catch (error) {
          return { error: { message: error.message } };
        }
      },
    },
  };

  global.FMS_NEON_AUTH_READY = Promise.resolve(client);
})(window);
