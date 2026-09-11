/* ═══════════════════════════════════════════════════════════════
   license.js — Full License Generation & Management System
  SVL FMS | Software Vala Liberia
   ═══════════════════════════════════════════════════════════════ */

"use strict";

/* ─── State ─── */
let allLicenses = [];
let allLicensePlans = [];
let licenseEditId = null;
let licCurrentPage = 1;
const LIC_PAGE_SIZE = 10;

/* ─── Plan durations map ─── */
const PLAN_DAYS = { Monthly: 30, Quarterly: 90, Yearly: 365 };
const PLAN_PRICES = { Monthly: 29.99, Quarterly: 79.99, Yearly: 279.99 };

/* ═══════════════════════════════════════════
   KEY GENERATOR
   Format: TDJ-XXXX-XXXX-XXXX  (alphanumeric)
═══════════════════════════════════════════ */
function generateLicenseKey() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const seg = () =>
    Array.from(
      { length: 4 },
      () => chars[Math.floor(Math.random() * chars.length)],
    ).join("");
  return `TDJ-${seg()}-${seg()}-${seg()}`;
}

/* ═══════════════════════════════════════════
   DATE HELPERS
═══════════════════════════════════════════ */
function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function daysUntil(dateStr) {
  if (!dateStr) return -999;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const exp = new Date(dateStr);
  exp.setHours(0, 0, 0, 0);
  return Math.round((exp - now) / 86400000);
}

function formatDate(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function isExpired(expiry) {
  return daysUntil(expiry) < 0;
}

/* ═══════════════════════════════════════════
   API — fetch licenses & plans
═══════════════════════════════════════════ */
async function fetchLicenses() {
  try {
    const res = await fetch("tables/licenses?limit=500&sort=created_at");
    const data = await res.json();
    allLicenses = (data.data || []).sort(
      (a, b) => (b.created_at || 0) - (a.created_at || 0),
    );
  } catch (e) {
    allLicenses = [];
  }
}

async function fetchLicensePlans() {
  try {
    const res = await fetch("tables/license_plans?limit=20");
    const data = await res.json();
    allLicensePlans = data.data || [];
  } catch (e) {
    allLicensePlans = [
      { id: "plan-monthly", name: "Monthly", duration_days: 30, price: 29.99 },
      {
        id: "plan-quarterly",
        name: "Quarterly",
        duration_days: 90,
        price: 79.99,
      },
      { id: "plan-yearly", name: "Yearly", duration_days: 365, price: 279.99 },
    ];
  }
}

/* ═══════════════════════════════════════════
   LOAD LICENSE PAGE
═══════════════════════════════════════════ */
async function loadLicensePage() {
  await Promise.all([fetchLicenses(), fetchLicensePlans()]);
  renderLicenseStats();
  renderLicensePlansCards();
  renderLicenseTable();
  updateLicensePlanSelect();
}

/* ─── Summary Stats ─── */
function renderLicenseStats() {
  const total = allLicenses.length;
  const active = allLicenses.filter((l) => l.status === "Active").length;
  const expired = allLicenses.filter(
    (l) =>
      l.status === "Expired" ||
      (l.status === "Active" && isExpired(l.expiry_date)),
  ).length;
  const expiring = allLicenses.filter((l) => {
    const d = daysUntil(l.expiry_date);
    return l.status === "Active" && d >= 0 && d <= 7;
  }).length;
  const monthly = allLicenses.filter((l) => l.plan === "Monthly").length;
  const quarterly = allLicenses.filter((l) => l.plan === "Quarterly").length;
  const yearly = allLicenses.filter((l) => l.plan === "Yearly").length;
  const revenue = allLicenses
    .filter((l) => l.status === "Active")
    .reduce((s, l) => s + (PLAN_PRICES[l.plan] || 0), 0);

  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  set("lic-stat-total", total);
  set("lic-stat-active", active);
  set("lic-stat-expired", expired);
  set("lic-stat-expiring", expiring);
  set("lic-stat-monthly", monthly);
  set("lic-stat-quarterly", quarterly);
  set("lic-stat-yearly", yearly);
  set("lic-stat-revenue", "$" + revenue.toFixed(2));
}

/* ─── Plan Cards ─── */
function renderLicensePlansCards() {
  const container = document.getElementById("lic-plans-cards");
  if (!container) return;
  const plans = [
    {
      id: "plan-monthly",
      name: "Monthly",
      price: 29.99,
      days: 30,
      icon: "fa-calendar-alt",
      color: "#3b82f6",
      features: [
        "Full Dashboard Access",
        "Client Management",
        "Financial Reports",
        "Activity Logs",
        "Email Support",
      ],
      popular: false,
    },
    {
      id: "plan-quarterly",
      name: "Quarterly",
      price: 79.99,
      days: 90,
      icon: "fa-calendar-week",
      color: "#8b5cf6",
      features: [
        "Everything in Monthly",
        "Staff Management",
        "Priority Support",
        "Save 11%",
      ],
      popular: true,
    },
    {
      id: "plan-yearly",
      name: "Yearly",
      price: 279.99,
      days: 365,
      icon: "fa-calendar-check",
      color: "#10b981",
      features: [
        "Everything in Quarterly",
        "Settings & Customization",
        "Dedicated Support",
        "Save 22%",
        "Free Updates 1 Year",
      ],
      popular: false,
    },
  ];
  container.innerHTML = plans
    .map(
      (p) => `
    <div class="lic-plan-card ${p.popular ? "popular" : ""}">
      ${p.popular ? '<div class="lic-plan-badge">Most Popular</div>' : ""}
      <div class="lic-plan-icon" style="background:${p.color}20;color:${p.color}">
        <i class="fas ${p.icon}"></i>
      </div>
      <h3 class="lic-plan-name">${p.name}</h3>
      <div class="lic-plan-price">
        <span class="lic-price-amount">$${p.price.toFixed(2)}</span>
        <span class="lic-price-per">/ ${p.name.toLowerCase()}</span>
      </div>
      <div class="lic-plan-duration"><i class="fas fa-clock"></i> ${p.days} days validity</div>
      <ul class="lic-plan-features">
        ${p.features.map((f) => `<li><i class="fas fa-check"></i> ${f}</li>`).join("")}
      </ul>
      <button class="lic-plan-btn" onclick="openIssueLicenseModal('${p.name}')" style="background:${p.color}">
        <i class="fas fa-key"></i> Issue ${p.name} License
      </button>
    </div>
  `,
    )
    .join("");
}

/* ─── Table ─── */
function renderLicenseTable(filterStatus = "all", searchTerm = "") {
  const tbody = document.getElementById("lic-table-body");
  if (!tbody) return;

  let list = [...allLicenses];

  /* Auto-update status for expired licenses in display */
  list = list.map((l) => ({
    ...l,
    _displayStatus:
      l.status === "Active" && isExpired(l.expiry_date) ? "Expired" : l.status,
  }));

  if (filterStatus !== "all")
    list = list.filter((l) => l._displayStatus === filterStatus);
  if (searchTerm) {
    const q = searchTerm.toLowerCase();
    list = list.filter(
      (l) =>
        (l.business_name || "").toLowerCase().includes(q) ||
        (l.license_key || "").toLowerCase().includes(q) ||
        (l.business_email || "").toLowerCase().includes(q),
    );
  }

  /* Pagination */
  const total = list.length;
  const pages = Math.ceil(total / LIC_PAGE_SIZE) || 1;
  if (licCurrentPage > pages) licCurrentPage = 1;
  const start = (licCurrentPage - 1) * LIC_PAGE_SIZE;
  const page = list.slice(start, start + LIC_PAGE_SIZE);

  if (page.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="empty-state"><i class="fas fa-key"></i><br>No licenses found</td></tr>`;
  } else {
    tbody.innerHTML = page
      .map((l) => {
        const days = daysUntil(l.expiry_date);
        const urgency =
          days >= 0 && days <= 3
            ? "lic-expiry-critical"
            : days >= 0 && days <= 7
              ? "lic-expiry-warning"
              : "";
        const expiryLabel =
          days < 0
            ? `<span class="lic-expiry-label expired">Expired ${Math.abs(days)}d ago</span>`
            : days === 0
              ? `<span class="lic-expiry-label critical">Expires today!</span>`
              : `<span class="lic-expiry-label ${urgency}">${days}d left</span>`;

        const planBadge =
          {
            Monthly: '<span class="lic-badge-plan monthly">Monthly</span>',
            Quarterly:
              '<span class="lic-badge-plan quarterly">Quarterly</span>',
            Yearly: '<span class="lic-badge-plan yearly">Yearly</span>',
          }[l.plan] || `<span class="lic-badge-plan">${l.plan}</span>`;

        const statusCls =
          {
            Active: "lic-status-active",
            Expired: "lic-status-expired",
            Suspended: "lic-status-suspended",
            Pending: "lic-status-pending",
          }[l._displayStatus] || "lic-status-pending";

        return `
        <tr>
          <td><code class="lic-key-code">${l.license_key || "—"}</code></td>
          <td><strong>${l.business_name || "—"}</strong><br><small style="color:var(--text-muted)">${l.business_email || ""}</small></td>
          <td>${planBadge}</td>
          <td><span class="lic-status-badge ${statusCls}">${l._displayStatus}</span></td>
          <td>${formatDate(l.issue_date)}</td>
          <td class="${urgency}">${formatDate(l.expiry_date)}<br>${expiryLabel}</td>
          <td>${l.issued_by || "Super Admin"}</td>
          <td>${l.notes ? `<span title="${l.notes}" class="lic-notes-tip"><i class="fas fa-sticky-note"></i></span>` : "—"}</td>
          <td>
            <div class="lic-actions">
              <button class="lic-action-btn info" title="View" onclick="viewLicenseDetail('${l.id}')"><i class="fas fa-eye"></i></button>
              <button class="lic-action-btn warning" title="Renew" onclick="openRenewModal('${l.id}')"><i class="fas fa-sync-alt"></i></button>
              <button class="lic-action-btn ${l.status === "Suspended" ? "success" : "danger"}" title="${l.status === "Suspended" ? "Activate" : "Suspend"}"
                onclick="toggleSuspendLicense('${l.id}')">
                <i class="fas ${l.status === "Suspended" ? "fa-play" : "fa-pause"}"></i>
              </button>
              <button class="lic-action-btn danger" title="Delete" onclick="deleteLicense('${l.id}')"><i class="fas fa-trash"></i></button>
            </div>
          </td>
        </tr>`;
      })
      .join("");
  }

  /* Pagination bar */
  renderLicensePagination(pages, total);
  /* Count label */
  const countEl = document.getElementById("lic-count-label");
  if (countEl)
    countEl.textContent = `Showing ${Math.min(start + 1, total)}–${Math.min(start + LIC_PAGE_SIZE, total)} of ${total} license${total !== 1 ? "s" : ""}`;
}

function renderLicensePagination(pages, total) {
  const el = document.getElementById("lic-pagination");
  if (!el) return;
  if (pages <= 1) {
    el.innerHTML = "";
    return;
  }
  let html = `<button class="lic-pg-btn" ${licCurrentPage === 1 ? "disabled" : ""} onclick="licGoPage(${licCurrentPage - 1})"><i class="fas fa-chevron-left"></i></button>`;
  for (let i = 1; i <= pages; i++) {
    html += `<button class="lic-pg-btn ${i === licCurrentPage ? "active" : ""}" onclick="licGoPage(${i})">${i}</button>`;
  }
  html += `<button class="lic-pg-btn" ${licCurrentPage === pages ? "disabled" : ""} onclick="licGoPage(${licCurrentPage + 1})"><i class="fas fa-chevron-right"></i></button>`;
  el.innerHTML = html;
}

function licGoPage(n) {
  licCurrentPage = n;
  applyLicenseFilters();
}

function applyLicenseFilters() {
  const status = document.getElementById("lic-filter-status")?.value || "all";
  const search = document.getElementById("lic-search")?.value || "";
  renderLicenseTable(status, search);
}

/* ─── Update Plan Select ─── */
function updateLicensePlanSelect() {
  const sel = document.getElementById("lf-plan");
  if (!sel) return;
  sel.innerHTML = `
    <option value="Monthly">Monthly — $29.99 / 30 days</option>
    <option value="Quarterly">Quarterly — $79.99 / 90 days</option>
    <option value="Yearly">Yearly — $279.99 / 365 days</option>
  `;
}

/* ═══════════════════════════════════════════
   OPEN ISSUE LICENSE MODAL
═══════════════════════════════════════════ */
function openIssueLicenseModal(planPreset) {
  licenseEditId = null;
  const form = document.getElementById("license-form");
  if (form) form.reset();

  document.getElementById("lf-modal-title").textContent = "Issue New License";
  document.getElementById("lf-submit-btn").textContent =
    "Generate & Issue License";

  /* Preset the plan */
  const planSel = document.getElementById("lf-plan");
  if (planSel && planPreset) planSel.value = planPreset;

  /* Default issue date = today */
  const today = new Date().toISOString().split("T")[0];
  document.getElementById("lf-issue-date").value = today;
  updateExpiryPreview();

  openModal("license-form-modal");
}

/* ═══════════════════════════════════════════
   EXPIRY PREVIEW (live update)
═══════════════════════════════════════════ */
function updateExpiryPreview() {
  const plan = document.getElementById("lf-plan")?.value;
  const issueDate = document.getElementById("lf-issue-date")?.value;
  const el = document.getElementById("lf-expiry-preview");
  if (!el) return;
  if (!issueDate || !plan) {
    el.textContent = "—";
    return;
  }
  const days = PLAN_DAYS[plan] || 30;
  const expiry = addDays(issueDate, days);
  el.textContent = formatDate(expiry) + ` (${days} days)`;
}

/* ═══════════════════════════════════════════
   SAVE LICENSE (Issue / Edit)
═══════════════════════════════════════════ */
async function saveLicense(e) {
  e.preventDefault();
  const btn = document.getElementById("lf-submit-btn");
  btn.textContent = "Saving…";
  btn.disabled = true;

  const plan = document.getElementById("lf-plan").value;
  const issueDate = document.getElementById("lf-issue-date").value;
  const days = PLAN_DAYS[plan] || 30;
  const expiry = addDays(issueDate, days);

  const payload = {
    business_name: document.getElementById("lf-business-name").value.trim(),
    business_email: document.getElementById("lf-business-email").value.trim(),
    business_phone: document.getElementById("lf-business-phone").value.trim(),
    plan: plan,
    plan_id: "plan-" + plan.toLowerCase(),
    status: document.getElementById("lf-status").value,
    issue_date: issueDate,
    expiry_date: expiry,
    notes: document.getElementById("lf-notes").value.trim(),
    issued_by:
      typeof currentUser !== "undefined" && currentUser
        ? currentUser.name
        : "Super Admin",
  };

  try {
    if (licenseEditId) {
      /* Edit existing */
      await fetch(`tables/licenses/${licenseEditId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      showToast("License updated successfully.", "success");
    } else {
      /* New — generate key */
      payload.license_key = generateLicenseKey();
      payload.activated_at = "";
      await fetch("tables/licenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      showToast(`License issued! Key: ${payload.license_key}`, "success");
    }
    closeModal("license-form-modal");
    await fetchLicenses();
    renderLicenseStats();
    renderLicenseTable();
  } catch (err) {
    showToast("Failed to save license. Please try again.", "error");
  }
  btn.textContent = licenseEditId ? "Save Changes" : "Generate & Issue License";
  btn.disabled = false;
}

/* ═══════════════════════════════════════════
   VIEW LICENSE DETAIL
═══════════════════════════════════════════ */
function viewLicenseDetail(id) {
  const lic = allLicenses.find((l) => l.id === id);
  if (!lic) return;
  const days = daysUntil(lic.expiry_date);
  const status =
    lic.status === "Active" && isExpired(lic.expiry_date)
      ? "Expired"
      : lic.status;
  const statusCls =
    {
      Active: "lic-status-active",
      Expired: "lic-status-expired",
      Suspended: "lic-status-suspended",
      Pending: "lic-status-pending",
    }[status] || "";
  const planColor =
    { Monthly: "#3b82f6", Quarterly: "#8b5cf6", Yearly: "#10b981" }[lic.plan] ||
    "#6b7280";

  const expiryInfo =
    days < 0
      ? `<span style="color:#ef4444">Expired ${Math.abs(days)} day(s) ago</span>`
      : days === 0
        ? `<span style="color:#ef4444">Expires TODAY</span>`
        : days <= 7
          ? `<span style="color:#f59e0b">Expires in ${days} day(s)</span>`
          : `<span style="color:#10b981">Expires in ${days} day(s)</span>`;

  document.getElementById("lic-detail-body").innerHTML = `
    <div class="lic-detail-header">
      <div class="lic-detail-key-wrap">
        <i class="fas fa-key lic-detail-key-icon"></i>
        <div>
          <div class="lic-detail-key">${lic.license_key}</div>
          <div class="lic-detail-key-label">License Key</div>
        </div>
        <button class="lic-copy-btn" onclick="copyLicenseKey('${lic.license_key}')" title="Copy key">
          <i class="fas fa-copy"></i> Copy
        </button>
      </div>
      <span class="lic-status-badge ${statusCls} large">${status}</span>
    </div>

    <div class="lic-detail-grid">
      <div class="lic-detail-item">
        <span class="lic-detail-label"><i class="fas fa-building"></i> Business Name</span>
        <span class="lic-detail-value">${lic.business_name || "—"}</span>
      </div>
      <div class="lic-detail-item">
        <span class="lic-detail-label"><i class="fas fa-envelope"></i> Email</span>
        <span class="lic-detail-value">${lic.business_email || "—"}</span>
      </div>
      <div class="lic-detail-item">
        <span class="lic-detail-label"><i class="fas fa-phone"></i> Phone</span>
        <span class="lic-detail-value">${lic.business_phone || "—"}</span>
      </div>
      <div class="lic-detail-item">
        <span class="lic-detail-label"><i class="fas fa-tag"></i> Plan</span>
        <span class="lic-detail-value"><span class="lic-badge-plan ${lic.plan?.toLowerCase()}" style="font-size:.85rem">${lic.plan}</span></span>
      </div>
      <div class="lic-detail-item">
        <span class="lic-detail-label"><i class="fas fa-calendar-plus"></i> Issue Date</span>
        <span class="lic-detail-value">${formatDate(lic.issue_date)}</span>
      </div>
      <div class="lic-detail-item">
        <span class="lic-detail-label"><i class="fas fa-calendar-times"></i> Expiry Date</span>
        <span class="lic-detail-value">${formatDate(lic.expiry_date)} — ${expiryInfo}</span>
      </div>
      <div class="lic-detail-item">
        <span class="lic-detail-label"><i class="fas fa-bolt"></i> Activated</span>
        <span class="lic-detail-value">${lic.activated_at ? formatDate(lic.activated_at) : "Not yet activated"}</span>
      </div>
      <div class="lic-detail-item">
        <span class="lic-detail-label"><i class="fas fa-user-shield"></i> Issued By</span>
        <span class="lic-detail-value">${lic.issued_by || "Super Admin"}</span>
      </div>
      ${
        lic.notes
          ? `<div class="lic-detail-item full-width">
        <span class="lic-detail-label"><i class="fas fa-sticky-note"></i> Notes</span>
        <span class="lic-detail-value">${lic.notes}</span>
      </div>`
          : ""
      }
    </div>

    <div class="lic-detail-actions">
      <button class="btn-primary" onclick="closeModal('license-detail-modal');openEditLicenseModal('${lic.id}')">
        <i class="fas fa-edit"></i> Edit License
      </button>
      <button class="btn-warning" onclick="closeModal('license-detail-modal');openRenewModal('${lic.id}')">
        <i class="fas fa-sync-alt"></i> Renew License
      </button>
      <button class="btn-secondary" onclick="copyLicenseKey('${lic.license_key}')">
        <i class="fas fa-copy"></i> Copy Key
      </button>
    </div>
  `;
  openModal("license-detail-modal");
}

/* ─── Copy key to clipboard ─── */
function copyLicenseKey(key) {
  navigator.clipboard
    .writeText(key)
    .then(() => {
      showToast(`License key copied: ${key}`, "success");
    })
    .catch(() => {
      showToast("Copy failed. Please copy manually: " + key, "warning");
    });
}

/* ═══════════════════════════════════════════
   EDIT LICENSE
═══════════════════════════════════════════ */
function openEditLicenseModal(id) {
  const lic = allLicenses.find((l) => l.id === id);
  if (!lic) return;
  licenseEditId = id;

  document.getElementById("lf-modal-title").textContent = "Edit License";
  document.getElementById("lf-submit-btn").textContent = "Save Changes";
  document.getElementById("lf-business-name").value = lic.business_name || "";
  document.getElementById("lf-business-email").value = lic.business_email || "";
  document.getElementById("lf-business-phone").value = lic.business_phone || "";
  document.getElementById("lf-plan").value = lic.plan || "Monthly";
  document.getElementById("lf-status").value = lic.status || "Active";
  document.getElementById("lf-issue-date").value = lic.issue_date || "";
  document.getElementById("lf-notes").value = lic.notes || "";
  updateExpiryPreview();
  openModal("license-form-modal");
}

/* ═══════════════════════════════════════════
   RENEW LICENSE MODAL
═══════════════════════════════════════════ */
function openRenewModal(id) {
  const lic = allLicenses.find((l) => l.id === id);
  if (!lic) return;
  document.getElementById("renew-lic-id").value = id;
  document.getElementById("renew-business-name").textContent =
    lic.business_name || "—";
  document.getElementById("renew-current-key").textContent =
    lic.license_key || "—";
  document.getElementById("renew-current-expiry").textContent = formatDate(
    lic.expiry_date,
  );
  document.getElementById("renew-plan").value = lic.plan || "Monthly";
  updateRenewPreview();
  openModal("license-renew-modal");
}

function updateRenewPreview() {
  const plan = document.getElementById("renew-plan")?.value;
  const days = PLAN_DAYS[plan] || 30;
  const today = new Date().toISOString().split("T")[0];
  const expiry = addDays(today, days);
  const el = document.getElementById("renew-new-expiry");
  if (el) el.textContent = formatDate(expiry) + ` (+${days} days from today)`;
}

async function confirmRenew() {
  const id = document.getElementById("renew-lic-id").value;
  const plan = document.getElementById("renew-plan").value;
  const days = PLAN_DAYS[plan] || 30;
  const today = new Date().toISOString().split("T")[0];
  const expiry = addDays(today, days);

  try {
    await fetch(`tables/licenses/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plan,
        plan_id: "plan-" + plan.toLowerCase(),
        status: "Active",
        issue_date: today,
        expiry_date: expiry,
      }),
    });
    showToast("License renewed successfully!", "success");
    closeModal("license-renew-modal");
    await fetchLicenses();
    renderLicenseStats();
    renderLicenseTable();
  } catch (err) {
    showToast("Renewal failed. Please try again.", "error");
  }
}

/* ═══════════════════════════════════════════
   SUSPEND / ACTIVATE TOGGLE
═══════════════════════════════════════════ */
async function toggleSuspendLicense(id) {
  const lic = allLicenses.find((l) => l.id === id);
  if (!lic) return;
  const newStatus = lic.status === "Suspended" ? "Active" : "Suspended";
  const action = newStatus === "Suspended" ? "Suspend" : "Activate";
  if (!confirm(`${action} license for "${lic.business_name}"?`)) return;
  try {
    await fetch(`tables/licenses/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    showToast(`License ${newStatus.toLowerCase()}d successfully.`, "success");
    await fetchLicenses();
    renderLicenseStats();
    renderLicenseTable();
  } catch (err) {
    showToast("Action failed. Please try again.", "error");
  }
}

/* ═══════════════════════════════════════════
   DELETE LICENSE
═══════════════════════════════════════════ */
async function deleteLicense(id) {
  const lic = allLicenses.find((l) => l.id === id);
  if (!lic) return;
  if (
    !confirm(
      `Permanently delete license for "${lic.business_name}"?\n\nKey: ${lic.license_key}\n\nThis cannot be undone.`,
    )
  )
    return;
  try {
    await fetch(`tables/licenses/${id}`, { method: "DELETE" });
    showToast("License deleted.", "success");
    await fetchLicenses();
    renderLicenseStats();
    renderLicenseTable();
  } catch (err) {
    showToast("Delete failed.", "error");
  }
}

/* ═══════════════════════════════════════════
   LICENSE GATE — shown to business users
   checking their own license status
═══════════════════════════════════════════ */
async function checkBusinessLicense(licenseKey) {
  try {
    const res = await fetch(
      `tables/licenses?search=${encodeURIComponent(licenseKey)}&limit=5`,
    );
    const data = await res.json();
    const list = (data.data || []).filter((l) => l.license_key === licenseKey);
    if (!list.length) return { valid: false, reason: "License key not found." };
    const lic = list[0];
    if (lic.status === "Suspended")
      return {
        valid: false,
        reason: "This license has been suspended. Contact SVL FMS.",
      };
    if (lic.status === "Expired" || isExpired(lic.expiry_date))
      return {
        valid: false,
        reason: `License expired on ${formatDate(lic.expiry_date)}.`,
      };
    if (lic.status !== "Active")
      return { valid: false, reason: `License status: ${lic.status}.` };
    /* Mark activated_at if first use */
    if (!lic.activated_at) {
      await fetch(`tables/licenses/${lic.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activated_at: new Date().toISOString().split("T")[0],
        }),
      });
    }
    return { valid: true, license: lic };
  } catch (e) {
    return {
      valid: false,
      reason: "Unable to verify license. Check your connection.",
    };
  }
}

async function verifyLicenseGate() {
  const key = document
    .getElementById("lg-key-input")
    ?.value?.trim()
    .toUpperCase();
  const errEl = document.getElementById("lg-error");
  const btn = document.getElementById("lg-verify-btn");
  if (!key) {
    if (errEl) errEl.textContent = "Please enter your license key.";
    return;
  }
  btn.textContent = "Verifying…";
  btn.disabled = true;
  const result = await checkBusinessLicense(key);
  btn.textContent = "Verify License";
  btn.disabled = false;
  if (result.valid) {
    const screen = document.getElementById("license-gate-screen");
    if (screen) screen.classList.add("hidden");
    showToast(
      `Welcome! License valid until ${formatDate(result.license.expiry_date)}`,
      "success",
    );
    localStorage.setItem("tdj_license_key", key);
  } else {
    if (errEl) errEl.textContent = result.reason;
  }
}

/* ═══════════════════════════════════════════
   EXPORT LICENSES AS CSV
═══════════════════════════════════════════ */
function exportLicensesCSV() {
  if (!allLicenses.length) {
    showToast("No licenses to export.", "warning");
    return;
  }
  const headers = [
    "License Key",
    "Business Name",
    "Email",
    "Phone",
    "Plan",
    "Status",
    "Issue Date",
    "Expiry Date",
    "Issued By",
    "Notes",
  ];
  const rows = allLicenses.map((l) =>
    [
      l.license_key,
      l.business_name,
      l.business_email,
      l.business_phone,
      l.plan,
      l.status,
      l.issue_date,
      l.expiry_date,
      l.issued_by,
      l.notes || "",
    ]
      .map((v) => `"${(v || "").replace(/"/g, '""')}"`)
      .join(","),
  );
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `TDJ_Licenses_${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("Licenses exported to CSV.", "success");
}
