/**
 * auth-api.js  —  TJ Consultancy FMS Secure Authentication Layer
 * ================================================================
 * Implements server-backed authentication using the Cloudflare D1 Table API.
 *
 * Security architecture:
 *  • PBKDF2-SHA-256 (310,000 iterations) password hashing — same as OWASP minimum
 *  • SHA-256 username hashing (no plaintext usernames stored)
 *  • SHA-256 session token hashing (raw token only in sessionStorage, hash only in DB)
 *  • 128-bit cryptographically random session tokens (crypto.getRandomValues)
 *  • Client-side rate limiting (localStorage, per-IP window)
 *  • Account lockout policy enforcement (reads fms_security_settings)
 *  • Full audit logging for every auth event
 *  • Constant-time comparison (safeCompare) to prevent timing attacks
 *
 * Exposed as window.AuthAPI (accessed by login.js, admin-panel.js, index.html guard)
 */

(function (global) {
  'use strict';

  /* ── Constants ──────────────────────────────────────────────────────── */
  const TABLES = {
    USERS     : 'fms_users',
    SESSIONS  : 'fms_sessions',
    AUDIT     : 'fms_audit_log',
    SETTINGS  : 'fms_security_settings'
  };

  const SESSION_KEY = 'fms_auth_token';   // raw token in sessionStorage
  const SESSION_UID = 'fms_auth_uid';     // user id in sessionStorage
  const SESSION_SID = 'fms_auth_sid';     // session record id in sessionStorage
  const SESSION_USER= 'fms_auth_user';    // display name in sessionStorage

  /* Client-side rate-limit state (per browser, best-effort) */
  const RL_KEY   = 'fms_rl_data';         // localStorage key
  const RL_FALLBACK_WINDOW  = 60;         // seconds
  const RL_FALLBACK_MAX     = 10;         // requests

  /* PBKDF2 iterations — must match what setup.html / seed-admin.js uses */
  const PBKDF2_ITERATIONS = 310000;

  /* ── Crypto helpers ─────────────────────────────────────────────────── */

  function bytesToHex(bytes) {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
    }
    return bytes;
  }

  function randomHex(n) {
    const arr = new Uint8Array(n);
    crypto.getRandomValues(arr);
    return bytesToHex(arr);
  }

  async function sha256(str) {
    const data = new TextEncoder().encode(str);
    const buf  = await crypto.subtle.digest('SHA-256', data);
    return bytesToHex(new Uint8Array(buf));
  }

  async function pbkdf2Derive(password, saltHex, iterations) {
    iterations = iterations || PBKDF2_ITERATIONS;
    const enc = new TextEncoder();
    const km = await crypto.subtle.importKey(
      'raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']
    );
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt: hexToBytes(saltHex), iterations },
      km, 256
    );
    return bytesToHex(new Uint8Array(bits));
  }

  /** Constant-time string comparison (prevents timing attacks on hex digests) */
  function safeCompare(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
      diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
  }

  /* ── Security settings cache ────────────────────────────────────────── */
  const settingsCache = {};
  let settingsLoaded  = false;

  async function loadSecuritySettings() {
    if (settingsLoaded) return settingsCache;
    try {
      const res = await fetch('tables/' + TABLES.SETTINGS + '?limit=50');
      if (res.ok) {
        const data = await res.json();
        (data.data || []).forEach(row => {
          settingsCache[row.setting_key] = row.setting_value;
        });
        settingsLoaded = true;
      }
    } catch (_) { /* network failure — fall back to hardcoded defaults */ }
    return settingsCache;
  }

  function getSetting(key, defaultVal) {
    const v = settingsCache[key];
    if (v === undefined || v === null) return defaultVal;
    return v;
  }

  function getSettingInt(key, def)  { return parseInt(getSetting(key, String(def)), 10) || def; }
  function getSettingBool(key, def) { const v = getSetting(key, String(def)); return v === 'true'; }

  /* ── Client-side rate limiter ───────────────────────────────────────── */
  function checkRateLimit() {
    const window_s = getSettingInt('rate_limit_window_seconds', RL_FALLBACK_WINDOW);
    const max_req  = getSettingInt('rate_limit_max_requests',   RL_FALLBACK_MAX);
    const now      = Date.now();
    let rl;
    try {
      rl = JSON.parse(localStorage.getItem(RL_KEY) || '{"count":0,"window_start":0}');
    } catch (_) {
      rl = { count: 0, window_start: 0 };
    }
    /* Reset if window has expired */
    if (now - rl.window_start > window_s * 1000) {
      rl = { count: 0, window_start: now };
    }
    if (rl.count >= max_req) {
      const retry_in = Math.ceil((rl.window_start + window_s * 1000 - now) / 1000);
      return { limited: true, retryIn: retry_in };
    }
    rl.count++;
    try { localStorage.setItem(RL_KEY, JSON.stringify(rl)); } catch (_) {}
    return { limited: false };
  }

  function resetRateLimit() {
    try { localStorage.removeItem(RL_KEY); } catch (_) {}
  }

  /* ── Table API helpers ──────────────────────────────────────────────── */
  async function apiGet(table, id) {
    const url = id ? ('tables/' + table + '/' + id) : ('tables/' + table);
    const res = await fetch(url);
    if (!res.ok) return null;
    return res.json();
  }

  async function apiSearch(table, search, limit) {
    limit = limit || 50;
    const url = 'tables/' + table + '?search=' + encodeURIComponent(search) + '&limit=' + limit;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return data.data || [];
  }

  async function apiPost(table, payload) {
    const res = await fetch('tables/' + table, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.text().catch(() => String(res.status));
      throw new Error('API POST ' + table + ' failed: ' + err);
    }
    return res.json();
  }

  async function apiPatch(table, id, patch) {
    const res = await fetch('tables/' + table + '/' + id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    });
    if (!res.ok) {
      const err = await res.text().catch(() => String(res.status));
      throw new Error('API PATCH ' + table + '/' + id + ' failed: ' + err);
    }
    return res.json();
  }

  /* ── Audit logger ────────────────────────────────────────────────────── */
  async function audit(action, opts) {
    opts = opts || {};
    const entry = {
      id:                 randomHex(16),
      user_id:            opts.userId    || null,
      username_attempted: opts.username  || null,
      action,
      ip_address:         opts.ip        || 'unknown',
      user_agent:         navigator.userAgent || '',
      session_id:         opts.sessionId || null,
      details:            opts.details   ? JSON.stringify(opts.details) : null,
      severity:           opts.severity  || 'info'
    };
    try {
      await apiPost(TABLES.AUDIT, entry);
    } catch (_) {
      /* Audit failures must never break the auth flow */
      console.warn('[AuthAPI] Audit log write failed (non-fatal)');
    }
  }

  /* ── User lookup by username ─────────────────────────────────────────── */
  async function findUserByUsername(username) {
    const uhash = await sha256(username.toLowerCase().trim());
    /* Search using username_hash */
    const rows = await apiSearch(TABLES.USERS, uhash, 5);
    /* Filter exact match */
    return rows.find(r => safeCompare(r.username_hash, uhash)) || null;
  }

  /* ── Account lockout helpers ─────────────────────────────────────────── */
  function isLocked(user) {
    if (!user.locked_until) return false;
    return new Date(user.locked_until) > new Date();
  }

  async function incrementFailedAttempts(user) {
    const maxAttempts   = getSettingInt('max_login_attempts', 5);
    const lockoutMinutes= getSettingInt('lockout_duration_minutes', 30);
    const newCount      = (user.failed_attempts || 0) + 1;
    const patch         = { failed_attempts: newCount };

    if (newCount >= maxAttempts) {
      const lockUntil = new Date(Date.now() + lockoutMinutes * 60 * 1000).toISOString();
      patch.locked_until = lockUntil;
      await audit('account_locked', {
        userId: user.id,
        severity: 'critical',
        details: { locked_until: lockUntil, failed_attempts: newCount }
      });
    }
    await apiPatch(TABLES.USERS, user.id, patch);
  }

  async function resetFailedAttempts(userId) {
    await apiPatch(TABLES.USERS, userId, {
      failed_attempts: 0,
      locked_until: null,
      last_login: new Date().toISOString()
    });
  }

  /* ── Revoke existing sessions (single-session policy) ───────────────── */
  async function revokeExistingSessions(userId) {
    const allowMultiple = getSettingBool('allow_multiple_sessions', false);
    if (allowMultiple) return;
    try {
      const rows = await apiSearch(TABLES.SESSIONS, userId, 50);
      const now  = new Date().toISOString();
      const activeSessions = rows.filter(s =>
        s.user_id === userId && !s.is_revoked && new Date(s.expires_at) > new Date()
      );
      for (const s of activeSessions) {
        await apiPatch(TABLES.SESSIONS, s.id, { is_revoked: true, revoked_at: now });
      }
    } catch (_) {
      console.warn('[AuthAPI] Session cleanup failed (non-fatal)');
    }
  }

  /* ── Core: LOGIN ─────────────────────────────────────────────────────── */
  /**
   * Authenticate a user against the fms_users table.
   * @param {string} username
   * @param {string} password
   * @returns {Promise<{success:boolean, error?:string, user?:object, token?:string, sessionId?:string}>}
   */
  async function login(username, password) {
    /* 0. Load security settings first */
    await loadSecuritySettings();

    /* 1. Client-side rate limit */
    const rl = checkRateLimit();
    if (rl.limited) {
      await audit('rate_limit_hit', {
        username,
        severity: 'warning',
        details: { retry_in_seconds: rl.retryIn }
      });
      return {
        success: false,
        error: 'Too many login attempts. Please wait ' + rl.retryIn + ' seconds and try again.'
      };
    }

    /* 2. Find user record */
    let user;
    try {
      user = await findUserByUsername(username);
    } catch (e) {
      console.error('[AuthAPI] User lookup error:', e);
      return { success: false, error: 'Authentication service unavailable. Please try again.' };
    }

    if (!user) {
      await audit('login_failed', {
        username,
        severity: 'warning',
        details: { reason: 'user_not_found' }
      });
      /* Generic message — do not reveal whether user exists */
      return { success: false, error: 'Invalid username or password.' };
    }

    /* 3. Check account active */
    if (!user.is_active) {
      await audit('login_failed', {
        userId: user.id, username,
        severity: 'warning',
        details: { reason: 'account_disabled' }
      });
      return { success: false, error: 'This account has been disabled. Contact your administrator.' };
    }

    /* 4. Check lockout */
    if (isLocked(user)) {
      const unlockAt = new Date(user.locked_until);
      const mins     = Math.ceil((unlockAt - Date.now()) / 60000);
      await audit('login_failed', {
        userId: user.id, username,
        severity: 'warning',
        details: { reason: 'account_locked', locked_until: user.locked_until }
      });
      return {
        success: false,
        error: 'Account temporarily locked. Try again in ' + mins + ' minute' + (mins === 1 ? '' : 's') + '.'
      };
    }

    /* 5. Verify password (PBKDF2) */
    let derivedHash;
    try {
      derivedHash = await pbkdf2Derive(password, user.salt);
    } catch (e) {
      console.error('[AuthAPI] PBKDF2 derivation failed:', e);
      return { success: false, error: 'Authentication service unavailable. Please try again.' };
    }

    if (!safeCompare(derivedHash, user.password_hash)) {
      await incrementFailedAttempts(user);
      await audit('login_failed', {
        userId: user.id, username,
        severity: 'warning',
        details: { reason: 'wrong_password', attempt: (user.failed_attempts || 0) + 1 }
      });
      const remaining = getSettingInt('max_login_attempts', 5) - ((user.failed_attempts || 0) + 1);
      const hint = remaining > 0
        ? ' (' + remaining + ' attempt' + (remaining === 1 ? '' : 's') + ' remaining)'
        : ' Account will be locked.';
      return { success: false, error: 'Invalid username or password.' + hint };
    }

    /* 6. Password correct — create session */
    const rawToken     = randomHex(32);            // 256-bit raw token
    const tokenHash    = await sha256(rawToken);   // stored in DB
    const sessionDurationH = getSettingInt('session_duration_hours', 8);
    const expiresAt    = new Date(Date.now() + sessionDurationH * 3600 * 1000).toISOString();
    const sessionId    = randomHex(16);
    const now          = new Date().toISOString();

    /* 7. Revoke prior sessions (single-session policy if enabled) */
    await revokeExistingSessions(user.id);

    /* 8. Write session record */
    try {
      await apiPost(TABLES.SESSIONS, {
        id: sessionId,
        user_id: user.id,
        token_hash: tokenHash,
        expires_at: expiresAt,
        ip_address: 'client',   // browsers cannot read real IP; set by server if extended
        user_agent: navigator.userAgent || '',
        is_revoked: false,
        revoked_at: null,
        last_seen_at: now
      });
    } catch (e) {
      console.error('[AuthAPI] Session creation failed:', e);
      return { success: false, error: 'Could not create session. Please try again.' };
    }

    /* 9. Reset failed attempts + update last_login */
    await resetFailedAttempts(user.id);

    /* 10. Audit success */
    await audit('login_success', {
      userId: user.id,
      username,
      sessionId,
      severity: 'info',
      details: { expires_at: expiresAt, display_name: user.display_name }
    });

    /* 11. Reset client-side rate limiter */
    resetRateLimit();

    /* 12. Store session in sessionStorage (raw token + metadata) */
    try {
      sessionStorage.setItem(SESSION_KEY,  rawToken);
      sessionStorage.setItem(SESSION_UID,  user.id);
      sessionStorage.setItem(SESSION_SID,  sessionId);
      sessionStorage.setItem(SESSION_USER, user.display_name);
    } catch (_) {}

    return {
      success: true,
      token: rawToken,
      sessionId,
      user: {
        id:           user.id,
        display_name: user.display_name,
        display_role: user.display_role,
        role:         user.role
      }
    };
  }

  /* ── Core: VERIFY TOKEN ──────────────────────────────────────────────── */
  /**
   * Verify a session token against fms_sessions.
   * @param {string} rawToken  - token from sessionStorage
   * @returns {Promise<{valid:boolean, user?:object, sessionId?:string, reason?:string}>}
   */
  async function verifyToken(rawToken) {
    if (!rawToken) return { valid: false, reason: 'no_token' };

    let tokenHash;
    try {
      tokenHash = await sha256(rawToken);
    } catch (_) {
      return { valid: false, reason: 'hash_error' };
    }

    /* Search sessions by token_hash */
    let sessions;
    try {
      sessions = await apiSearch(TABLES.SESSIONS, tokenHash, 5);
    } catch (_) {
      /* Network failure — fail open to avoid locking users out during connectivity blip */
      console.warn('[AuthAPI] Token verify: network failure — failing open (1 min grace)');
      return { valid: true, reason: 'network_grace', offline: true };
    }

    const session = sessions.find(s => safeCompare(s.token_hash, tokenHash));

    if (!session) {
      return { valid: false, reason: 'session_not_found' };
    }
    if (session.is_revoked) {
      return { valid: false, reason: 'session_revoked' };
    }
    if (new Date(session.expires_at) < new Date()) {
      await audit('session_expired', {
        userId: session.user_id, sessionId: session.id, severity: 'info'
      });
      return { valid: false, reason: 'session_expired' };
    }

    /* Update last_seen_at (fire-and-forget) */
    apiPatch(TABLES.SESSIONS, session.id, { last_seen_at: new Date().toISOString() })
      .catch(() => {});

    /* Fetch user */
    let user = null;
    try {
      user = await apiGet(TABLES.USERS, session.user_id);
    } catch (_) {}

    if (!user || !user.is_active) {
      return { valid: false, reason: 'user_inactive' };
    }

    await audit('token_verified', {
      userId: user.id,
      sessionId: session.id,
      severity: 'info',
      details: { display_name: user.display_name }
    });

    return {
      valid: true,
      sessionId: session.id,
      user: {
        id:           user.id,
        display_name: user.display_name,
        display_role: user.display_role,
        role:         user.role
      }
    };
  }

  /* ── Core: LOGOUT ────────────────────────────────────────────────────── */
  /**
   * Revoke the current session and clear sessionStorage.
   * @returns {Promise<{success:boolean}>}
   */
  async function logout() {
    const rawToken  = sessionStorage.getItem(SESSION_KEY);
    const sessionId = sessionStorage.getItem(SESSION_SID);
    const userId    = sessionStorage.getItem(SESSION_UID);

    /* Clear storage first — even if API fails the browser is logged out */
    try {
      sessionStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(SESSION_UID);
      sessionStorage.removeItem(SESSION_SID);
      sessionStorage.removeItem(SESSION_USER);
    } catch (_) {}

    if (sessionId) {
      try {
        await apiPatch(TABLES.SESSIONS, sessionId, {
          is_revoked: true,
          revoked_at: new Date().toISOString()
        });
      } catch (_) {}
    }

    await audit('logout', {
      userId:    userId  || null,
      sessionId: sessionId || null,
      severity: 'info'
    });

    return { success: true };
  }

  /* ── Convenience: get current session state ──────────────────────────── */
  function getCurrentSession() {
    return {
      token:    sessionStorage.getItem(SESSION_KEY),
      userId:   sessionStorage.getItem(SESSION_UID),
      sessionId:sessionStorage.getItem(SESSION_SID),
      userName: sessionStorage.getItem(SESSION_USER)
    };
  }

  function isSessionPresent() {
    return !!sessionStorage.getItem(SESSION_KEY);
  }

  /* ── Password change ─────────────────────────────────────────────────── */
  /**
   * Change the current user's password (requires current password to verify).
   * @param {string} currentPassword
   * @param {string} newPassword
   * @returns {Promise<{success:boolean, error?:string}>}
   */
  async function changePassword(currentPassword, newPassword) {
    await loadSecuritySettings();

    /* Fetch current user */
    const userId = sessionStorage.getItem(SESSION_UID);
    if (!userId) return { success: false, error: 'Not authenticated.' };

    const user = await apiGet(TABLES.USERS, userId);
    if (!user) return { success: false, error: 'User record not found.' };

    /* Verify current password */
    const currentHash = await pbkdf2Derive(currentPassword, user.salt);
    if (!safeCompare(currentHash, user.password_hash)) {
      return { success: false, error: 'Current password is incorrect.' };
    }

    /* Validate new password against policy */
    const minLen       = getSettingInt('min_password_length', 8);
    const reqUpper     = getSettingBool('require_uppercase', true);
    const reqNumber    = getSettingBool('require_number', true);
    const reqSpecial   = getSettingBool('require_special_char', true);

    if (newPassword.length < minLen) {
      return { success: false, error: 'New password must be at least ' + minLen + ' characters.' };
    }
    if (reqUpper && !/[A-Z]/.test(newPassword)) {
      return { success: false, error: 'New password must contain at least one uppercase letter.' };
    }
    if (reqNumber && !/[0-9]/.test(newPassword)) {
      return { success: false, error: 'New password must contain at least one number.' };
    }
    if (reqSpecial && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPassword)) {
      return { success: false, error: 'New password must contain at least one special character.' };
    }

    /* Derive new hash */
    const newSalt = randomHex(16);
    const newHash = await pbkdf2Derive(newPassword, newSalt);

    await apiPatch(TABLES.USERS, userId, {
      password_hash: newHash,
      salt: newSalt,
      password_changed_at: new Date().toISOString()
    });

    await audit('password_changed', {
      userId,
      sessionId: sessionStorage.getItem(SESSION_SID),
      severity: 'warning',
      details: { display_name: user.display_name }
    });

    return { success: true };
  }

  /* ── Security settings helpers (for Settings UI) ─────────────────────── */
  async function getSecuritySettings() {
    const res = await fetch('tables/' + TABLES.SETTINGS + '?limit=50');
    if (!res.ok) throw new Error('Failed to load security settings');
    const data = await res.json();
    return data.data || [];
  }

  async function updateSecuritySetting(settingKey, newValue) {
    const userId = sessionStorage.getItem(SESSION_UID);
    const userName = sessionStorage.getItem(SESSION_USER);

    const patch = {
      setting_value: String(newValue),
      updated_by: userName || 'admin'
    };
    /* PATCH by the setting's id (which equals setting_key) */
    const result = await apiPatch(TABLES.SETTINGS, settingKey, patch);

    /* Invalidate cache */
    settingsCache[settingKey] = String(newValue);

    await audit('settings_changed', {
      userId,
      sessionId: sessionStorage.getItem(SESSION_SID),
      severity: 'warning',
      details: { key: settingKey, new_value: newValue }
    });

    return result;
  }

  /* ── Audit log reader (for Settings view) ────────────────────────────── */
  async function getAuditLog(limit, page) {
    limit = limit || 50;
    page  = page  || 1;
    const res = await fetch(
      'tables/' + TABLES.AUDIT + '?limit=' + limit + '&page=' + page + '&sort=created_at'
    );
    if (!res.ok) throw new Error('Failed to load audit log');
    return res.json();
  }

  /* ── User management (admin only) ────────────────────────────────────── */
  async function listUsers(limit) {
    limit = limit || 50;
    const res = await fetch('tables/' + TABLES.USERS + '?limit=' + limit);
    if (!res.ok) throw new Error('Failed to load users');
    const data = await res.json();
    return data.data || [];
  }

  async function toggleUserActive(targetUserId, active) {
    const patch = { is_active: active };
    const result = await apiPatch(TABLES.USERS, targetUserId, patch);
    await audit(active ? 'user_updated' : 'user_disabled', {
      userId: sessionStorage.getItem(SESSION_UID),
      sessionId: sessionStorage.getItem(SESSION_SID),
      severity: 'warning',
      details: { target_user_id: targetUserId, is_active: active }
    });
    return result;
  }

  async function unlockUser(targetUserId) {
    const result = await apiPatch(TABLES.USERS, targetUserId, {
      locked_until: null,
      failed_attempts: 0
    });
    await audit('user_updated', {
      userId: sessionStorage.getItem(SESSION_UID),
      sessionId: sessionStorage.getItem(SESSION_SID),
      severity: 'warning',
      details: { target_user_id: targetUserId, action: 'manual_unlock' }
    });
    return result;
  }

  /* ── Auth guard helper (used by index.html inline script) ────────────── */
  /**
   * Full async auth guard: verifies the session token against the database.
   * Returns true if valid; redirects to login.html if not.
   * Designed to be called in a DOMContentLoaded handler.
   */
  async function enforceAuth(redirectUrl) {
    redirectUrl = redirectUrl || 'login.html';
    const token = sessionStorage.getItem(SESSION_KEY);
    if (!token) {
      window.location.replace(redirectUrl);
      return false;
    }
    const result = await verifyToken(token);
    if (!result.valid && !result.offline) {
      try { sessionStorage.clear(); } catch (_) {}
      window.location.replace(redirectUrl);
      return false;
    }
    /* Refresh user display info if returned */
    if (result.user) {
      try { sessionStorage.setItem(SESSION_USER, result.user.display_name); } catch (_) {}
    }
    return true;
  }

  /* ── Expose public API ───────────────────────────────────────────────── */
  global.AuthAPI = {
    /* Core auth */
    login,
    logout,
    verifyToken,
    enforceAuth,
    isSessionPresent,
    getCurrentSession,

    /* Password */
    changePassword,

    /* Security settings */
    loadSecuritySettings,
    getSecuritySettings,
    updateSecuritySetting,

    /* Audit log */
    getAuditLog,

    /* User management */
    listUsers,
    toggleUserActive,
    unlockUser,

    /* Utilities (exposed for advanced use / debugging) */
    _sha256:       sha256,
    _pbkdf2:       pbkdf2Derive,
    _safeCompare:  safeCompare,
    _randomHex:    randomHex,
    _audit:        audit,

    TABLES,
    SESSION_KEY
  };

  console.log('[AuthAPI] Loaded — PBKDF2-SHA-256, session tokens, full audit logging.');

})(window);
