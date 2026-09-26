/**
 * security-settings.js  —  Security Policy & Audit Log UI
 * =========================================================
 * Drives:
 *   1. The "Security Policy Settings" card  (#secPolicyCard) in Settings view
 *   2. The "Audit Log" card  (#auditLogCard) in Settings view
 *   3. The "Change Password" card  (#chpwBtn) in Settings view
 *
 * The password control supports the active deployment mode: Supabase in
 * production or the local-login fallback for a standalone/offline install.
 * Security policy and audit controls still require the optional AuthAPI.
 */

(function () {
  "use strict";

  function currentRole() {
    try {
      return sessionStorage.getItem("fms_auth_role") || "staff";
    } catch (_) {
      return "staff";
    }
  }

  async function sha256(value) {
    const bytes = new TextEncoder().encode(value);
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(hash))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  function safeCompare(left, right) {
    if (
      typeof left !== "string" ||
      typeof right !== "string" ||
      left.length !== right.length
    )
      return false;
    let difference = 0;
    for (let index = 0; index < left.length; index++) {
      difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
    }
    return difference === 0;
  }

  function validateNewPassword(currentPassword, newPassword) {
    if (newPassword.length < 8)
      return "New password must be at least 8 characters.";
    if (!/[A-Z]/.test(newPassword))
      return "New password must contain at least one uppercase letter.";
    if (!/[0-9]/.test(newPassword))
      return "New password must contain at least one number.";
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?]/.test(newPassword)) {
      return "New password must contain at least one special character.";
    }
    if (newPassword === currentPassword)
      return "Choose a new password that differs from the current password.";
    return "";
  }

  async function changeLocalAdminPassword(currentPassword, newPassword) {
    const storedHash = localStorage.getItem("fms_cred_ph");
    if (!storedHash) {
      return {
        success: false,
        error:
          "Admin credentials are unavailable. Sign out and sign in again, then retry.",
      };
    }
    const currentHash = await sha256(currentPassword);
    if (!safeCompare(currentHash, storedHash)) {
      return { success: false, error: "Current password is incorrect." };
    }
    const newHash = await sha256(newPassword);
    localStorage.setItem("fms_cred_ph", newHash);
    localStorage.setItem("fms_admin_password_changed", "true");
    const changedAt = new Date().toISOString();
    localStorage.setItem("fms_admin_password_changed_at", changedAt);
    sessionStorage.setItem("fms_auth_password_changed_at", changedAt);

    /* Confirm the persisted credential before reporting success. The login
       page reads this same key, so the replacement password works on the
       next sign-in without waiting for a refresh or a deployment. */
    if (!safeCompare(localStorage.getItem("fms_cred_ph"), newHash)) {
      return {
        success: false,
        error: "The new password could not be saved. Please try again.",
      };
    }
    return { success: true, changedAt: changedAt };
  }

  async function changeAdminPassword(currentPassword, newPassword) {
    if (currentRole() !== "admin") {
      return {
        success: false,
        error: "Only an administrator can change this password here.",
      };
    }

    const policyError = validateNewPassword(currentPassword, newPassword);
    if (policyError) return { success: false, error: policyError };

    if (
      window.FMSCloud &&
      typeof window.FMSCloud.hasConfiguration === "function" &&
      window.FMSCloud.hasConfiguration()
    ) {
      if (
        window.FMSCloud.ready &&
        typeof window.FMSCloud.ready.then === "function"
      ) {
        await window.FMSCloud.ready;
      }
      if (typeof window.FMSCloud.changePassword !== "function") {
        return {
          success: false,
          error: "The secure sign-in service is unavailable.",
        };
      }
      return window.FMSCloud.changePassword(currentPassword, newPassword);
    }

    if (window.AuthAPI && typeof window.AuthAPI.changePassword === "function") {
      return window.AuthAPI.changePassword(currentPassword, newPassword);
    }
    return changeLocalAdminPassword(currentPassword, newPassword);
  }

  /* ── Category colour map ─────────────────────────────────────────── */
  const CAT_COLORS = {
    authentication: { bg: "rgba(2,119,189,0.12)", text: "#7dd3fc" },
    session: { bg: "rgba(139,92,246,0.12)", text: "#c4b5fd" },
    password: { bg: "rgba(34,197,94,0.12)", text: "#86efac" },
    audit: { bg: "rgba(245,158,11,0.12)", text: "#fcd34d" },
    access: { bg: "rgba(239,68,68,0.12)", text: "#fca5a5" },
  };

  const SEVERITY_COLORS = {
    info: { bg: "rgba(79,195,247,0.12)", text: "#4fc3f7" },
    warning: { bg: "rgba(245,158,11,0.12)", text: "#fbbf24" },
    critical: { bg: "rgba(239,68,68,0.12)", text: "#f87171" },
  };

  const ACTION_ICONS = {
    login_success: { icon: "fas fa-check-circle", color: "#4ade80" },
    login_failed: { icon: "fas fa-times-circle", color: "#f87171" },
    logout: { icon: "fas fa-arrow-right-from-bracket", color: "#94a3b8" },
    session_expired: { icon: "fas fa-clock", color: "#fbbf24" },
    account_locked: { icon: "fas fa-lock", color: "#f87171" },
    password_changed: { icon: "fas fa-key", color: "#a78bfa" },
    user_created: { icon: "fas fa-user-plus", color: "#4ade80" },
    user_updated: { icon: "fas fa-user-pen", color: "#fbbf24" },
    user_disabled: { icon: "fas fa-user-slash", color: "#f87171" },
    settings_changed: { icon: "fas fa-sliders", color: "#fbbf24" },
    token_verified: { icon: "fas fa-shield-check", color: "#4fc3f7" },
    rate_limit_hit: { icon: "fas fa-gauge-high", color: "#f87171" },
  };

  /* ── Data types: renders input or toggle ────────────────────────── */
  function buildControl(setting) {
    const isBoolean = setting.data_type === "boolean";
    const isSensitive = setting.is_sensitive;
    const value = setting.setting_value;

    if (isBoolean) {
      const checked = value === "true";
      return (
        '<label class="toggle-switch sec-toggle" style="flex-shrink:0">' +
        '<input type="checkbox" data-sec-key="' +
        setting.setting_key +
        '"' +
        (checked ? " checked" : "") +
        " />" +
        '<span class="toggle-slider"></span>' +
        "<\/label>"
      );
    }
    if (setting.data_type === "json") {
      return (
        '<input type="text" class="form-input sec-input" ' +
        'data-sec-key="' +
        setting.setting_key +
        '" ' +
        'value="' +
        (isSensitive ? "" : escHtml(value)) +
        '" ' +
        'placeholder="' +
        (isSensitive ? "[sensitive — click to edit]" : setting.default_value) +
        '" ' +
        'style="font-family:monospace;font-size:0.8rem;max-width:300px" />'
      );
    }
    return (
      '<input type="' +
      (setting.data_type === "integer" ? "number" : "text") +
      '" ' +
      'class="form-input sec-input" ' +
      'data-sec-key="' +
      setting.setting_key +
      '" ' +
      'value="' +
      escHtml(value) +
      '" ' +
      'min="0" style="max-width:120px" />'
    );
  }

  function escHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* ── Build the security policy grid ────────────────────────────── */
  function renderSecurityPolicy(settings) {
    const container = document.getElementById("secPolicyGrid");
    if (!container) return;

    /* Group by category */
    const groups = {};
    settings.forEach((s) => {
      if (!groups[s.category]) groups[s.category] = [];
      groups[s.category].push(s);
    });

    const CATEGORY_ORDER = [
      "authentication",
      "session",
      "password",
      "audit",
      "access",
    ];
    let html = "";

    CATEGORY_ORDER.forEach((cat) => {
      if (!groups[cat]) return;
      const c = CAT_COLORS[cat] || CAT_COLORS.authentication;
      html +=
        '<div class="sec-policy-group" style="margin-bottom:24px">' +
        '<div class="sec-policy-group-header" style="' +
        "display:flex;align-items:center;gap:8px;margin-bottom:12px;" +
        "padding:8px 12px;border-radius:8px;background:" +
        c.bg +
        '">' +
        '<span style="font-size:0.78rem;font-weight:700;text-transform:uppercase;' +
        "letter-spacing:0.06em;color:" +
        c.text +
        '">' +
        cat +
        "<\/span>" +
        "<\/div>" +
        '<div class="sec-policy-rows">';

      groups[cat].forEach((s) => {
        const dflt = s.default_value;
        const changed = s.setting_value !== dflt;
        html +=
          '<div class="sec-policy-row" style="' +
          "display:flex;align-items:center;gap:12px;padding:10px 12px;" +
          "border-radius:8px;margin-bottom:6px;" +
          "background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.06)" +
          (changed ? ";border-color:rgba(245,158,11,0.25)" : "") +
          '">' +
          '<div style="flex:1;min-width:0">' +
          '<div style="font-size:0.88rem;font-weight:500;color:#e2e8f0">' +
          escHtml(s.label) +
          "<\/div>" +
          '<div style="font-size:0.78rem;color:#64748b;margin-top:2px">' +
          escHtml(s.description) +
          "<\/div>" +
          '<div style="font-size:0.75rem;color:#475569;margin-top:3px">Default: <code style="color:#94a3b8">' +
          escHtml(dflt) +
          "<\/code><\/div>" +
          "<\/div>" +
          '<div style="flex-shrink:0">' +
          buildControl(s) +
          "<\/div>" +
          "<\/div>";
      });

      html += "<\/div><\/div>";
    });

    container.innerHTML = html;
  }

  /* ── Load & display security policy ────────────────────────────── */
  let policyLoaded = false;

  async function loadSecurityPolicy(force) {
    if (policyLoaded && !force) return;
    const loadEl = document.getElementById("secPolicyLoading");
    const gridEl = document.getElementById("secPolicyGrid");
    if (!loadEl || !gridEl) return;

    if (!window.AuthAPI) {
      loadEl.innerHTML =
        '<i class="fas fa-info-circle" style="color:#4fc3f7"></i> Security policy settings are managed by the configured sign-in provider.';
      return;
    }

    loadEl.style.display = "block";
    gridEl.style.display = "none";

    try {
      const settings = await AuthAPI.getSecuritySettings();
      renderSecurityPolicy(settings);
      loadEl.style.display = "none";
      gridEl.style.display = "block";
      policyLoaded = true;
    } catch (e) {
      loadEl.innerHTML =
        '<i class="fas fa-exclamation-circle" style="color:#f87171"></i> ' +
        "Failed to load security settings: " +
        (e.message || "network error") +
        '. <a href="setup.html" style="color:#4fc3f7">Run setup wizard</a> if this is a first-run.';
    }
  }

  /* ── Save all policy changes ────────────────────────────────────── */
  async function saveSecurityPolicy() {
    if (!window.AuthAPI) return;
    const saveBtn = document.getElementById("btnSaveSecPolicy");
    if (saveBtn) saveBtn.disabled = true;

    let saved = 0;
    let failed = 0;
    const toasts = [];

    /* Collect text/number inputs */
    const inputs = document.querySelectorAll(".sec-input[data-sec-key]");
    for (const input of inputs) {
      const key = input.getAttribute("data-sec-key");
      const val = input.value.trim();
      try {
        await AuthAPI.updateSecuritySetting(key, val);
        saved++;
      } catch (e) {
        failed++;
        toasts.push("Failed to save " + key + ": " + e.message);
      }
    }

    /* Collect toggles */
    const toggles = document.querySelectorAll(
      'input[type="checkbox"][data-sec-key]',
    );
    for (const toggle of toggles) {
      const key = toggle.getAttribute("data-sec-key");
      const val = toggle.checked ? "true" : "false";
      try {
        await AuthAPI.updateSecuritySetting(key, val);
        saved++;
      } catch (e) {
        failed++;
        toasts.push("Failed to save " + key + ": " + e.message);
      }
    }

    if (saveBtn) saveBtn.disabled = false;

    if (typeof window.showToast === "function") {
      if (failed === 0) {
        showToast("✅ " + saved + " security settings saved.", 3000);
      } else {
        showToast("⚠️ " + saved + " saved, " + failed + " failed.", 4000);
      }
    }

    /* Reload to show current state */
    policyLoaded = false;
    await loadSecurityPolicy(true);
  }

  /* ── Audit log pagination state ─────────────────────────────────── */
  let auditPage = 1;
  const AUDIT_LIMIT = 20;
  let auditLoaded = false;

  /* ── Load & display audit log ───────────────────────────────────── */
  async function loadAuditLog(page, force) {
    page = page || 1;
    if (auditLoaded && page === auditPage && !force) return;
    auditPage = page;

    const loadEl = document.getElementById("auditLogLoading");
    const wrapEl = document.getElementById("auditLogWrap");
    const pagerEl = document.getElementById("auditLogPager");
    const tbody = document.getElementById("auditLogBody");
    if (!loadEl || !tbody) return;

    if (!window.AuthAPI) {
      loadEl.innerHTML =
        '<i class="fas fa-info-circle" style="color:#4fc3f7"></i> Audit logs are available only when the optional AuthAPI is deployed.';
      return;
    }

    loadEl.style.display = "block";
    if (wrapEl) wrapEl.style.display = "none";
    if (pagerEl) pagerEl.style.display = "none";

    try {
      const data = await AuthAPI.getAuditLog(AUDIT_LIMIT, page);
      const rows = data.data || [];
      const total = data.total || rows.length;

      if (rows.length === 0) {
        loadEl.innerHTML =
          '<i class="fas fa-info-circle" style="color:#4fc3f7"></i> No audit log entries found yet.';
        return;
      }

      tbody.innerHTML = rows
        .map((row) => {
          const ai = ACTION_ICONS[row.action] || {
            icon: "fas fa-circle",
            color: "#94a3b8",
          };
          const sev = SEVERITY_COLORS[row.severity] || SEVERITY_COLORS.info;
          const ts = row.created_at
            ? new Date(parseInt(row.created_at)).toLocaleString()
            : "—";
          const details = row.details
            ? (function () {
                try {
                  const d = JSON.parse(row.details);
                  return Object.entries(d)
                    .map(([k, v]) => k + "=" + v)
                    .join(", ");
                } catch (_) {
                  return row.details;
                }
              })()
            : "—";

          return (
            "<tr>" +
            '<td style="white-space:nowrap;color:#94a3b8;font-size:0.8rem">' +
            ts +
            "<\/td>" +
            '<td><span style="display:inline-flex;align-items:center;gap:5px;font-size:0.82rem;font-weight:500;color:' +
            ai.color +
            '">' +
            '<i class="' +
            ai.icon +
            '" style="font-size:0.75rem"><\/i>' +
            (row.action || "—").replace(/_/g, " ") +
            "<\/span><\/td>" +
            '<td style="font-size:0.82rem;color:#e2e8f0">' +
            escHtml(row.username_attempted || row.user_id || "—") +
            "<\/td>" +
            '<td><span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:0.72rem;font-weight:600;background:' +
            sev.bg +
            ";color:" +
            sev.text +
            '">' +
            (row.severity || "info") +
            "<\/span><\/td>" +
            '<td style="font-size:0.8rem;color:#64748b;font-family:monospace">' +
            escHtml(row.ip_address || "—") +
            "<\/td>" +
            '<td style="font-size:0.78rem;color:#475569;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' +
            escHtml(details) +
            '">' +
            escHtml(details) +
            "<\/td>" +
            "<\/tr>"
          );
        })
        .join("");

      loadEl.style.display = "none";
      if (wrapEl) wrapEl.style.display = "";
      auditLoaded = true;

      /* Pager */
      if (pagerEl) {
        const totalPages = Math.ceil(total / AUDIT_LIMIT);
        const pageInfo = document.getElementById("auditPageInfo");
        if (pageInfo)
          pageInfo.textContent =
            "Page " + page + " of " + totalPages + " (" + total + " entries)";

        const prevBtn = document.getElementById("auditPrevBtn");
        const nextBtn = document.getElementById("auditNextBtn");
        if (prevBtn) prevBtn.disabled = page <= 1;
        if (nextBtn) nextBtn.disabled = page >= totalPages;

        pagerEl.style.display = "flex";
      }
    } catch (e) {
      loadEl.innerHTML =
        '<i class="fas fa-exclamation-circle" style="color:#f87171"></i> Failed to load audit log: ' +
        (e.message || "unknown error");
    }
  }

  /* ── Change Password handler ─────────────────────────────────────── */
  function initChangePassword() {
    const btn = document.getElementById("chpwBtn");
    const errEl = document.getElementById("chpwError");
    const okEl = document.getElementById("chpwSuccess");
    const curPwEl = document.getElementById("chpwCurrent");
    const newPwEl = document.getElementById("chpwNew");
    const confPwEl = document.getElementById("chpwConfirm");
    if (!btn || !curPwEl || !newPwEl || !confPwEl) return;

    btn.addEventListener("click", async function () {
      if (errEl) errEl.style.display = "none";
      if (okEl) okEl.style.display = "none";

      const cur = curPwEl.value;
      const npw = newPwEl.value;
      const conf = confPwEl.value;

      if (!cur || !npw || !conf) {
        if (errEl) {
          errEl.textContent = "All three password fields are required.";
          errEl.style.display = "block";
        }
        return;
      }
      if (npw !== conf) {
        if (errEl) {
          errEl.textContent = "New passwords do not match.";
          errEl.style.display = "block";
        }
        return;
      }

      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"><\/i> Changing…';

      try {
        const res = await changeAdminPassword(cur, npw);
        if (res.success) {
          if (okEl) {
            okEl.textContent =
              "Password updated. The new password is active immediately.";
            okEl.style.display = "block";
          }
          curPwEl.value = "";
          newPwEl.value = "";
          confPwEl.value = "";
          curPwEl.focus();
        } else {
          if (errEl) {
            errEl.textContent = res.error || "Password change failed.";
            errEl.style.display = "block";
          }
        }
      } catch (e) {
        if (errEl) {
          errEl.textContent = e.message || "An error occurred.";
          errEl.style.display = "block";
        }
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-save"><\/i> Update Password';
      }
    });
  }

  /* ── Bind Settings view activation ──────────────────────────────── */
  function bindSettingsViewActivation() {
    /* Watch for the settings view becoming visible */
    const viewEl = document.getElementById("view-settings");
    if (!viewEl) return;

    /* MutationObserver: fire when settings view gets .active */
    const observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (m) {
        if (m.type === "attributes" && m.attributeName === "class") {
          if (viewEl.classList.contains("active")) {
            onSettingsViewOpen();
          }
        }
      });
    });
    observer.observe(viewEl, { attributes: true });

    /* Also fire immediately if settings is already active on load */
    if (viewEl.classList.contains("active")) onSettingsViewOpen();
  }

  function onSettingsViewOpen() {
    loadSecurityPolicy();
    loadAuditLog(1);
  }

  /* ── Wire buttons ────────────────────────────────────────────────── */
  function bindButtons() {
    const reloadPolicy = document.getElementById("btnReloadSecPolicy");
    if (reloadPolicy) {
      reloadPolicy.addEventListener("click", function () {
        policyLoaded = false;
        loadSecurityPolicy(true);
      });
    }

    const savePolicy = document.getElementById("btnSaveSecPolicy");
    if (savePolicy) {
      savePolicy.addEventListener("click", saveSecurityPolicy);
    }

    const reloadAudit = document.getElementById("btnReloadAudit");
    if (reloadAudit) {
      reloadAudit.addEventListener("click", function () {
        auditLoaded = false;
        loadAuditLog(auditPage, true);
      });
    }

    const prevBtn = document.getElementById("auditPrevBtn");
    if (prevBtn) {
      prevBtn.addEventListener("click", function () {
        if (auditPage > 1) loadAuditLog(auditPage - 1, true);
      });
    }

    const nextBtn = document.getElementById("auditNextBtn");
    if (nextBtn) {
      nextBtn.addEventListener("click", function () {
        loadAuditLog(auditPage + 1, true);
      });
    }
  }

  /* ── Init ────────────────────────────────────────────────────────── */
  function boot() {
    initChangePassword();
    bindButtons();
    bindSettingsViewActivation();
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
