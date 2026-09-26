/**
 * js/login.js — TJ Consultancy FMS Sign-In Logic (100% LOCAL — no database)
 * =========================================================================
 * Deployment-safe authentication for static hosting (GitHub + Vercel).
 *
 * The old Cloudflare D1 / Table-API backend has been REMOVED.  All
 * authentication now runs locally in the browser using SHA-256 hashing,
 * so the sign-in works identically every time the site is uploaded to
 * any static host — no server, no database, no network dependency.
 *
 * Admin credentials:
 *   username : admin@tjconsultancyinc.com
 *   password : admin@2026
 *
 * Staff accounts created in the dashboard (Staff Management → Staff Access)
 * are stored in localStorage under `fms_staff_accounts_v1` and can log
 * in here with their own username / password and granted permissions.
 *
 * localStorage / sessionStorage keys managed here:
 *   fms_cred_uh / fms_cred_ph  — SHA-256 hashes of the admin credentials
 *   fms_cred_version           — credential version gate ('v7_admin_tjc_2026')
 *   fms_admin_password_changed — preserves a local administrator-selected password
 *   fms_staff_accounts_v1      — staff accounts (created by admin)
 *   fms_auth_token             — sessionStorage session token (auth guard)
 *   fms_auth_user / fms_auth_role / fms_auth_permissions — session identity
 */

(function () {
  'use strict';

  /* ── 0. CREDENTIAL CONSTANTS ────────────────────────────────────────── */
  /* Plaintext seeds — both hashed at runtime via FMSSha256(); no hardcoded hex  */
  var DEFAULT_USERNAME_SEED = 'admin@tjconsultancyinc.com';
  var DEFAULT_PASSWORD_SEED = 'admin@2026';

  var STAFF_KEY = 'fms_staff_accounts_v1';

  /* ── 0a. CREDENTIAL VERSION GATE ────────────────────────────────────── */
  /* A new version resets only an untouched default credential cache. Once an
     administrator chooses a local fallback password, preserve it across
     routine application updates. */
  var CRED_VERSION = 'v7_admin_tjc_2026';
  (function enforceCredVersion() {
    try {
      if (localStorage.getItem('fms_cred_version') !== CRED_VERSION) {
        var hasCustomAdminPassword = localStorage.getItem('fms_admin_password_changed') === 'true';
        if (!hasCustomAdminPassword) {
          localStorage.removeItem('fms_cred_uh');
          localStorage.removeItem('fms_cred_ph');
        }
        localStorage.setItem('fms_cred_version', CRED_VERSION);
        console.info(
          '[FMS Login] Credential cache ' +
          (hasCustomAdminPassword ? 'preserved' : 'reset') +
          ' → version ' + CRED_VERSION
        );
      }
    } catch (_) {}
  })();

  /* ── 0b. BELT-AND-SUSPENDERS STALE HASH CHECK ──────────────────────── */
  (function clearStaleCredCache() {
    try {
      var storedUH = localStorage.getItem('fms_cred_uh');
      if (storedUH && storedUH.length !== 64) {
        localStorage.removeItem('fms_cred_uh');
        localStorage.removeItem('fms_cred_ph');
        console.info('[FMS Login] Malformed credential hash cleared.');
      }
    } catch (_) {}
  })();

  /* ── 1. REDIRECT IF ALREADY AUTHENTICATED ──────────────────────────── */
  if (sessionStorage.getItem('fms_auth_token')) {
    window.location.replace('index.html');
    return;
  }

  /* Restore a valid Supabase session when the secure backend is configured. */
  if (window.FMSCloud && typeof window.FMSCloud.hasConfiguration === 'function' && window.FMSCloud.hasConfiguration()) {
    window.FMSCloud.ready.then(function (result) {
      if (result && result.authenticated) window.location.replace('index.html');
    });
  }

  /* ── 2. DOM REFERENCES ──────────────────────────────────────────────── */
  var form          = document.getElementById('loginForm');
  var usernameInput = document.getElementById('loginUsername');
  var passwordInput = document.getElementById('loginPassword');
  var showPwBtn     = document.getElementById('showPwBtn');
  var showPwIcon    = document.getElementById('showPwIcon');
  var submitBtn     = document.getElementById('loginSubmitBtn');
  var btnText       = document.getElementById('loginBtnText');
  var btnSpinner    = document.getElementById('loginBtnSpinner');
  var errorBanner   = document.getElementById('loginError');
  var errorText     = document.getElementById('loginErrorText');
  var fieldUsername = document.getElementById('fieldUsername');
  var fieldPassword = document.getElementById('fieldPassword');
  var usernameHint  = document.getElementById('usernameHint');
  var passwordHint  = document.getElementById('passwordHint');
  var logoIcon      = document.getElementById('loginLogoIcon');
  var logoImg       = document.getElementById('loginLogoImg');
  var websiteLink   = document.getElementById('loginWebsiteLink');

  /* ── 3. RESTORE BRANDING LOGO ───────────────────────────────────────── */
  (function restoreLogo() {
    try {
      var stored = sessionStorage.getItem('fms_logo_url') ||
                   localStorage.getItem('fms_logo_url');
      if (stored && logoImg) {
        logoImg.src = stored;
        logoImg.style.display = 'block';
        if (logoIcon) logoIcon.style.display = 'none';
      }
    } catch (_) {}
  })();

  /* ── 4. RESTORE WEBSITE URL LINK ────────────────────────────────────── */
  (function restoreWebsiteLink() {
    try {
      if (!websiteLink) return;
      var url = localStorage.getItem('fms_website_url') || 'https://tjconsultancy.com';
      websiteLink.href = url;
    } catch (_) {}
  })();

  /* ── 5. SHOW / HIDE PASSWORD TOGGLE ─────────────────────────────────── */
  if (showPwBtn) {
    showPwBtn.addEventListener('click', function () {
      var hidden = passwordInput.type === 'password';
      passwordInput.type = hidden ? 'text' : 'password';
      showPwIcon.className = hidden ? 'fas fa-eye-slash' : 'fas fa-eye';
      this.setAttribute('aria-label', hidden ? 'Hide password' : 'Show password');
    });
  }

  /* ── 6. REAL-TIME INLINE VALIDATION (UX only) ───────────────────────── */
  if (usernameInput) {
    usernameInput.addEventListener('input', function () {
      if (fieldUsername.classList.contains('invalid')) {
        clearFieldError(fieldUsername, usernameHint);
      }
    });
  }
  if (passwordInput) {
    passwordInput.addEventListener('input', function () {
      if (fieldPassword.classList.contains('invalid')) {
        clearFieldError(fieldPassword, passwordHint);
      }
      hideErrorBanner();
    });
  }

  /* ── 6b. STAFF ACCOUNT HELPERS ──────────────────────────────────────── */
  function getStaffAccounts() {
    try {
      var raw = localStorage.getItem(STAFF_KEY);
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (_) { return []; }
  }

  function findStaff(username) {
    var u = String(username || '').trim().toLowerCase();
    var list = getStaffAccounts();
    for (var i = 0; i < list.length; i++) {
      if (String(list[i].username || '').toLowerCase() === u) return list[i];
    }
    return null;
  }

  /* ── 7. FORM SUBMISSION ──────────────────────────────────────────────── */
  if (form) {
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      hideErrorBanner();

      var username = usernameInput.value.trim();
      var password = passwordInput.value;

      /* Presence validation */
      var hasError = false;
      if (!username) {
        setFieldError(fieldUsername, usernameHint, 'Email address is required.');
        hasError = true;
      } else {
        clearFieldError(fieldUsername, usernameHint);
      }
      if (!password) {
        setFieldError(fieldPassword, passwordHint, 'Password is required.');
        hasError = true;
      } else {
        clearFieldError(fieldPassword, passwordHint);
      }
      if (hasError) return;

      setLoading(true);

      /* When configured, Supabase Auth supplies the token and the server
         checks the user's fms_profiles role for every shared-data request. */
      if (window.FMSCloud && typeof window.FMSCloud.hasConfiguration === 'function' && window.FMSCloud.hasConfiguration()) {
        if (!window.FMSCloud.isConfigured()) {
          setLoading(false);
          showErrorBanner('The secure sign-in service could not be loaded. Please try again later.');
          return;
        }
        try {
          var cloudResult = await window.FMSCloud.signIn(username, password);
          if (cloudResult && cloudResult.success) return handleSuccess();
          setLoading(false);
          showErrorBanner((cloudResult && cloudResult.error) || 'Invalid email or password.');
          shakeCard();
          resetPasswordField();
          return;
        } catch (cloudError) {
          setLoading(false);
          showErrorBanner('The secure sign-in service is unavailable. Please try again later.');
          console.error('[FMS Login] Supabase authentication error:', cloudError.message);
          return;
        }
      }

      /* ── LOCAL AUTHENTICATION: SHA-256 hash comparison ──
         100% client-side — works on any static host (GitHub + Vercel),
         offline or online, with zero database dependency.               */
      try {
        var uHash = await FMSSha256(username.toLowerCase());
        var pHash = await FMSSha256(password);

        /* ── (1) ADMIN login ── */
        var defaultUH = await FMSSha256(DEFAULT_USERNAME_SEED.toLowerCase());
        var defaultPH = await FMSSha256(DEFAULT_PASSWORD_SEED);
        var validUH   = localStorage.getItem('fms_cred_uh') || defaultUH;
        var validPH   = localStorage.getItem('fms_cred_ph') || defaultPH;

        if (safeCompare(uHash, validUH) && safeCompare(pHash, validPH)) {
          try {
            localStorage.setItem('fms_cred_uh', uHash);
            localStorage.setItem('fms_cred_ph', pHash);
          } catch (_) {}
          issueSession({
            name:        'Admin User',
            role:        'admin',
            permissions: ['dashboard', 'reports', 'inventory', 'staff', 'settings']
          });
          return handleSuccess();
        }

        /* ── (2) STAFF login ── */
        var staff = findStaff(username);
        if (staff) {
          if (staff.status === 'disabled') {
            setLoading(false);
            showErrorBanner('This account has been disabled. Contact your administrator.');
            shakeCard();
            resetPasswordField();
            return;
          }
          if (safeCompare(pHash, staff.passwordHash)) {
            issueSession({
              name:        staff.name || staff.username,
              role:        'staff',
              permissions: Array.isArray(staff.permissions) && staff.permissions.length
                             ? staff.permissions
                             : ['dashboard', 'inventory']
            });
            return handleSuccess();
          }
        }

        /* ── (3) No match ── */
        setLoading(false);
        showErrorBanner('Invalid username or password. Please try again.');
        shakeCard();
        resetPasswordField();

      } catch (authErr) {
        setLoading(false);
        showErrorBanner('Authentication service unavailable. Please try again later.');
        console.error('[FMS Login] Local auth error:', authErr.message);
      }
    });
  }

  /* ── 8. ENTER KEY ON USERNAME → FOCUS PASSWORD ──────────────────────── */
  if (usernameInput) {
    usernameInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); passwordInput.focus(); }
    });
  }

  /* ── 9. AUTO-FOCUS USERNAME FIELD ───────────────────────────────────── */
  window.addEventListener('DOMContentLoaded', function () {
    if (usernameInput) usernameInput.focus();
  });

  /* ── 10. INJECT CARD SHAKE KEYFRAMES ─────────────────────────────────── */
  (function injectShakeKeyframes() {
    if (document.getElementById('loginShakeKF')) return;
    var s = document.createElement('style');
    s.id = 'loginShakeKF';
    s.textContent =
      '@keyframes shakeCard{0%,100%{transform:translateX(0)}' +
      '15%{transform:translateX(-8px)}35%{transform:translateX(8px)}' +
      '55%{transform:translateX(-5px)}75%{transform:translateX(5px)}}';
    document.head.appendChild(s);
  })();

  /* ══════════════════════════════════════════════════════════════════════
     CRYPTO HELPERS
     ══════════════════════════════════════════════════════════════════════ */

  /** SHA-256 of a UTF-8 string → hex string */
  async function sha256(str) {
    var data = new TextEncoder().encode(str);
    var buf  = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf))
      .map(function(b){ return b.toString(16).padStart(2,'0'); })
      .join('');
  }

  /**
   * Constant-time string comparison (XOR every char code).
   * Prevents timing-based username/password oracle in the local path.
   */
  function safeCompare(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    if (a.length !== b.length) return false;
    var diff = 0;
    for (var i = 0; i < a.length; i++) {
      diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
  }

  /* ══════════════════════════════════════════════════════════════════════
     SESSION + UI HELPERS
     ══════════════════════════════════════════════════════════════════════ */

  /** Issue a session token + identity for the index.html auth guard. */
  async function issueSession(identity) {
    var token = await FMSSha256('fms_local_session_' + Date.now() + '_' + Math.random());
    try {
      sessionStorage.setItem('fms_auth_token', token);
      sessionStorage.setItem('fms_auth_user',  identity.name || 'User');
      sessionStorage.setItem('fms_auth_role',  identity.role || 'staff');
      sessionStorage.setItem('fms_auth_permissions', JSON.stringify(identity.permissions || []));
      /* Keep sidebar / topbar display in sync for staff users */
      localStorage.setItem('fms_display_name', identity.name || 'User');
      localStorage.setItem('fms_display_role',
        identity.role === 'admin' ? 'Finance Manager' : 'Staff Member');
    } catch (_) {}
  }

  function handleSuccess() {
    if (btnText) {
      btnText.innerHTML = '<i class="fas fa-check"><\/i> Authenticated';
    }
    if (submitBtn) {
      submitBtn.style.background  = 'linear-gradient(135deg,#16a34a,#15803d)';
      submitBtn.style.boxShadow   = '0 6px 20px rgba(22,163,74,0.45)';
    }
    setTimeout(function() {
      window.location.replace('index.html');
    }, 600);
  }

  function resetPasswordField() {
    if (passwordInput) {
      passwordInput.value = '';
      passwordInput.type  = 'password';
    }
    if (showPwIcon) showPwIcon.className = 'fas fa-eye';
    if (showPwBtn)  showPwBtn.setAttribute('aria-label', 'Show password');
  }

  function setLoading(on) {
    if (submitBtn) submitBtn.disabled = on;
    if (btnText)    btnText.style.display    = on ? 'none' : 'flex';
    if (btnSpinner) btnSpinner.style.display = on ? 'flex' : 'none';
  }

  function setFieldError(fieldEl, hintEl, msg) {
    if (!fieldEl || !hintEl) return;
    fieldEl.classList.add('invalid');
    fieldEl.classList.remove('valid');
    hintEl.textContent = msg;
  }

  function clearFieldError(fieldEl, hintEl) {
    if (!fieldEl || !hintEl) return;
    fieldEl.classList.remove('invalid');
    hintEl.textContent = '';
  }

  function showErrorBanner(msg) {
    if (!errorText || !errorBanner) return;
    errorText.innerHTML = msg;
    errorBanner.style.display = 'flex';
    errorBanner.style.animation = 'none';
    void errorBanner.offsetHeight; /* reflow */
    errorBanner.style.animation = '';
  }

  function hideErrorBanner() {
    if (errorBanner) errorBanner.style.display = 'none';
  }

  function shakeCard() {
    var card = document.getElementById('loginCard');
    if (!card) return;
    card.style.animation = 'none';
    void card.offsetHeight;
    card.style.animation = 'shakeCard 0.45s ease';
  }

  /* ── 11. CONSOLE DIAGNOSTIC (not a security utility) ────────────────── */
  window.fmsAuthDiag = function () {
    console.info('[FMS] Mode: LOCAL authentication (no database — static-host safe)');
    console.info('[FMS] Session token present:', !!sessionStorage.getItem('fms_auth_token'));
    console.info('[FMS] Fallback cred cache — uh:', !!localStorage.getItem('fms_cred_uh'), 'ph:', !!localStorage.getItem('fms_cred_ph'));
    console.info('[FMS] Staff accounts:', getStaffAccounts().length);
  };

})();
