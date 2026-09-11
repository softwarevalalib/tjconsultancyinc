/* ═══════════════════════════════════════════════════
   app.js — Core application: auth, routing, nav, utils
   ═══════════════════════════════════════════════════ */

"use strict";

/* Route table requests to NestJS when the UI is served by Five Server. */
const nativeFetch = window.fetch.bind(window);
const backendOrigin = "http://localhost:3000/";
window.fetch = (resource, options) => {
  if (
    typeof resource === "string" &&
    resource.startsWith("tables/") &&
    window.location.port !== "3000"
  ) {
    resource = backendOrigin + resource;
  }
  return nativeFetch(resource, options);
};

async function requireApiSuccess(response, fallbackMessage) {
  if (response.ok) return response;
  let message = fallbackMessage;
  try {
    const body = await response.json();
    message = body.message || body.error || message;
  } catch (error) {
    // Keep the operation-specific fallback when the server returns non-JSON text.
  }
  throw new Error(message);
}

/* ─── Global State ─── */
let currentUser = null;
let allClients = [];
let allInvoices = [];
let allStaff = [];
let allActivities = [];
let allPayments = [];
let portfolioChart = null;
let statusChart = null;
let monthlyChart = null;
let currentPermEditId = null;

const PERM_MAP = {
  dashboard: {
    label: "Dashboard",
    icon: "fa-tachometer-alt",
    desc: "View main dashboard & metrics",
  },
  clients: {
    label: "Clients",
    icon: "fa-users",
    desc: "View & manage client accounts",
  },
  reports: {
    label: "Reports",
    icon: "fa-chart-bar",
    desc: "Access financial reports",
  },
  activities: {
    label: "Activities",
    icon: "fa-history",
    desc: "View & log activity records",
  },
  payments: {
    label: "Payments",
    icon: "fa-money-check-alt",
    desc: "Process client payments",
  },
  payment_details: {
    label: "Payment Details",
    icon: "fa-university",
    desc: "Manage payment receiving details",
  },
  tenant_management: {
    label: "Tenant Management",
    icon: "fa-globe",
    desc: "Configure licensed admin workspaces",
  },
  staff_management: {
    label: "Staff Management",
    icon: "fa-user-shield",
    desc: "Manage staff accounts & roles",
  },
  settings: {
    label: "Settings",
    icon: "fa-cog",
    desc: "Configure system settings",
  },
  licenses: {
    label: "Licenses",
    icon: "fa-key",
    desc: "Issue & manage software licenses",
  },
};

/* ─── Utilities ─── */
const $ = (id) => document.getElementById(id);
const fmt = (n) =>
  new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n || 0);
const fmtCurrency = (n) => "$" + fmt(n);
const fmtPct = (n) => (n || 0).toFixed(2) + "%";

function showToast(msg, type = "success") {
  const toast = $("toast");
  const icons = {
    success: "fa-check-circle",
    error: "fa-times-circle",
    warning: "fa-exclamation-triangle",
    info: "fa-info-circle",
  };
  toast.className = "toast " + type;
  toast.querySelector(".toast-icon").className =
    "toast-icon fas " + (icons[type] || icons.success);
  $("toast-msg").textContent = msg;
  toast.classList.remove("hidden");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.add("hidden"), 3500);
}

function closeModal(id) {
  $(id).classList.add("hidden");
}

function openModal(id) {
  $(id).classList.remove("hidden");
}

function togglePassword() {
  const pw = $("login-password");
  const eye = $("pw-eye");
  if (pw.type === "password") {
    pw.type = "text";
    eye.className = "fas fa-eye-slash";
  } else {
    pw.type = "password";
    eye.className = "fas fa-eye";
  }
}

function triggerUpload(id) {
  $(id).click();
}

function getBadgeClass(status) {
  const m = {
    Active: "badge-active",
    Completed: "badge-completed",
    Overdue: "badge-overdue",
    Pending: "badge-pending",
    Approved: "badge-approved",
    Rejected: "badge-rejected",
  };
  return "badge " + (m[status] || "badge-pending");
}

function initDateDisplay() {
  const el = $("nav-date");
  if (!el) return;
  const opts = {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  };
  el.textContent = new Date().toLocaleDateString("en-US", opts);
}

/* ─── AUTH / LOGIN ─── */
/* Hardcoded master credentials — always available even if DB is empty or stale */
const MASTER_STAFF = [
  {
    id: "s001",
    name: "Software Vala Liberia",
    email: "superadmin",
    password: "admin123",
    role: "Super Admin",
    permissions: [
      "dashboard",
      "clients",
      "reports",
      "activities",
      "staff_management",
      "settings",
    ],
    active: true,
    last_login: new Date().toISOString(),
  },
  {
    id: "s002",
    name: "Sarah Johnson",
    email: "manager@tdjconsultancy.com",
    password: "manager123",
    role: "Manager",
    permissions: ["dashboard", "clients", "reports", "activities"],
    active: true,
    last_login: "",
  },
  {
    id: "s003",
    name: "David Reyes",
    email: "officer@tdjconsultancy.com",
    password: "officer123",
    role: "Loan Officer",
    permissions: ["dashboard", "clients", "activities"],
    active: true,
    last_login: "",
  },
  {
    id: "s004",
    name: "Emily Foster",
    email: "accountant@tdjconsultancy.com",
    password: "account123",
    role: "Accountant",
    permissions: ["dashboard", "reports"],
    active: false,
    last_login: "",
  },
  {
    id: "s005",
    name: "Mike Torres",
    email: "viewer@tdjconsultancy.com",
    password: "viewer123",
    role: "Viewer",
    permissions: ["dashboard"],
    active: true,
    last_login: "",
  },
];

async function loadStaffFromAPI() {
  try {
    const res = await fetch("tables/staff?limit=100");
    const data = await res.json();
    const apiStaff = data.data || [];
    // Merge: API records take priority; fall back to MASTER_STAFF for any missing IDs
    const apiIds = apiStaff.map((s) => s.id);
    const missing = MASTER_STAFF.filter((s) => !apiIds.includes(s.id));
    allStaff = [...apiStaff, ...missing];
    // Always enforce master superadmin credentials regardless of DB value
    allStaff = allStaff.map((s) =>
      s.id === "s001" || s.email === "superadmin"
        ? {
            ...s,
            name: "Software Vala Liberia",
            email: "superadmin",
            password: "admin123",
            role: "Super Admin",
            active: true,
          }
        : s,
    );
  } catch (e) {
    // Network/API failure — use full master list
    allStaff = MASTER_STAFF;
  }
}

$("login-form").addEventListener("submit", async function (e) {
  e.preventDefault();
  const username = $("login-email").value.trim().toLowerCase();
  const pw = $("login-password").value;
  $("login-btn-text").textContent = "Signing in...";
  await loadStaffFromAPI();
  // Match by username (email field) — case-insensitive
  let user = allStaff.find(
    (s) =>
      s.email.toLowerCase() === username &&
      s.password === pw &&
      s.active !== false,
  );
  // Safety net: if 'superadmin' typed, always allow with master password
  if (!user && username === "superadmin" && pw === "admin123") {
    user = MASTER_STAFF[0];
  }
  $("login-btn-text").textContent = "Sign In";
  if (!user) {
    $("login-error").classList.remove("hidden");
    return;
  }
  $("login-error").classList.add("hidden");
  currentUser = user;
  await applyAssignedLicensePermissions(currentUser);
  localStorage.setItem("fp_user_id", user.id);
  $("login-screen").classList.add("hidden");
  $("main-app").classList.remove("hidden");
  document.body.classList.remove("login-page");
  initApp();
});

function logout() {
  currentUser = null;
  localStorage.removeItem("fp_user_id");
  $("main-app").classList.add("hidden");
  $("login-screen").classList.remove("hidden");
  document.body.classList.add("login-page");
  $("admin-panel").classList.remove("open");
  $("panel-backdrop").classList.add("hidden");
}

/* ─── NAVIGATION ─── */
function navigateTo(page) {
  // Check permissions — service pages are always public within the app
  const finReportPages = [
    "income-statement",
    "balance-sheet",
    "cash-flow",
    "profit-loss",
  ];
  const svcPages = [
    "svc-financial-advisory",
    "svc-research-consulting",
    "svc-access-management",
    "svc-business-development",
    "svc-vehicle-hire",
  ];
  const perm =
    page === "staff"
      ? "staff_management"
      : page === "licenses"
        ? "settings"
        : page === "invoices"
          ? "clients"
          : page === "payments"
            ? "clients"
            : page === "payment-details"
              ? "clients"
              : page === "tenant-management"
                ? "settings"
                : finReportPages.includes(page)
                  ? "reports"
                  : svcPages.includes(page)
                    ? "dashboard"
                    : page;
  if (
    currentUser &&
    !currentUser.permissions.includes(perm) &&
    perm !== "dashboard"
  ) {
    showToast(
      "Access denied — you do not have permission to view this page.",
      "error",
    );
    return;
  }

  // Hide all pages
  document.querySelectorAll(".page").forEach((p) => p.classList.add("hidden"));
  const target = $("page-" + page);
  if (target) target.classList.remove("hidden");

  // Update nav items
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.page === page);
  });

  // Update title
  const titles = {
    dashboard: "Dashboard",
    clients: "Clients",
    reports: "Reports",
    activities: "Activities",
    invoices: "Invoices",
    payments: "Payments",
    "payment-details": "Payment Details",
    "tenant-management": "Tenant Management",
    staff: "Staff Management",
    licenses: "License Management",
    settings: "Settings",
    "income-statement": "Income Statement",
    "balance-sheet": "Balance Sheet",
    "cash-flow": "Cash Flow Statement",
    "profit-loss": "Profit & Loss (P&L)",
    "svc-financial-advisory": "Financial Management Advisory",
    "svc-research-consulting": "Research & Consulting",
    "svc-access-management": "Access Management",
    "svc-business-development": "Business Development",
    "svc-vehicle-hire": "Vehicle Hire & Printing",
  };
  const svcPageList = [
    "svc-financial-advisory",
    "svc-research-consulting",
    "svc-access-management",
    "svc-business-development",
    "svc-vehicle-hire",
  ];
  $("page-title").textContent = titles[page] || "Page";
  const finSubPages = [
    "income-statement",
    "balance-sheet",
    "cash-flow",
    "profit-loss",
  ];
  $("breadcrumb").textContent = finSubPages.includes(page)
    ? "Home / Reports / " + (titles[page] || page)
    : svcPageList.includes(page)
      ? "Home / Services / " + (titles[page] || page)
      : page === "licenses"
        ? "Home / Administration / License Management"
        : "Home / " + (titles[page] || page);

  // Load page data
  if (page === "dashboard") loadDashboard();
  else if (page === "clients") renderClientsGrid();
  else if (page === "reports") loadReports();
  else if (page === "activities") renderActivitiesPage();
  else if (page === "invoices") renderInvoicesPage();
  else if (page === "payments") renderPaymentsPage();
  else if (page === "payment-details") renderPaymentDetailsPage();
  else if (page === "tenant-management") renderTenantManagementPage();
  else if (page === "staff") renderStaffGrid();
  else if (page === "licenses") loadLicensePage();
  else if (page === "income-statement") loadIncomeStatement();
  else if (page === "balance-sheet") loadBalanceSheet();
  else if (page === "cash-flow") loadCashFlow();
  else if (page === "profit-loss") loadProfitLoss();
  else if (page === "svc-financial-advisory")
    loadServicePage("financial-advisory");
  else if (page === "svc-research-consulting")
    loadServicePage("research-consulting");
  else if (page === "svc-access-management")
    loadServicePage("access-management");
  else if (page === "svc-business-development")
    loadServicePage("business-development");
  else if (page === "svc-vehicle-hire") loadServicePage("vehicle-hire");

  // Clear service nav active state unless on a service page
  const svcPagesArr = [
    "svc-financial-advisory",
    "svc-research-consulting",
    "svc-access-management",
    "svc-business-development",
    "svc-vehicle-hire",
  ];
  if (
    !svcPagesArr.includes(page) &&
    typeof clearServiceNavActive === "function"
  )
    clearServiceNavActive();

  // Toggle financial-reports sub-nav
  const finSubPages2 = [
    "income-statement",
    "balance-sheet",
    "cash-flow",
    "profit-loss",
  ];
  const subNav = $("financial-reports-subnav");
  if (subNav)
    subNav.classList.toggle(
      "open",
      page === "reports" || finSubPages2.includes(page),
    );
}

// Nav click handlers
document.querySelectorAll(".nav-item[data-page]").forEach((item) => {
  item.addEventListener("click", (e) => {
    e.preventDefault();
    navigateTo(item.dataset.page);
  });
});

// See all links
document.querySelectorAll(".see-all[data-page]").forEach((link) => {
  link.addEventListener("click", (e) => {
    e.preventDefault();
    navigateTo(link.dataset.page);
  });
});

/* ─── SIDEBAR TOGGLE ─── */
const sidebar = document.getElementById("sidebar");
const contentArea = document.getElementById("content-area");

$("sidebar-toggle").addEventListener("click", () => {
  if (window.innerWidth <= 768) {
    sidebar.classList.toggle("mobile-open");
  } else {
    sidebar.classList.toggle("collapsed");
  }
});

$("menu-btn").addEventListener("click", () => {
  if (window.innerWidth <= 768) {
    sidebar.classList.toggle("mobile-open");
  } else {
    sidebar.classList.toggle("collapsed");
  }
});

/* ─── ADMIN PANEL ─── */
function toggleAdminPanel() {
  $("admin-panel").classList.toggle("open");
  $("panel-backdrop").classList.toggle("hidden");
}

$("admin-panel-toggle").addEventListener("click", toggleAdminPanel);

/* ─── NOTIFICATIONS ─── */
const notifications = [
  {
    icon: "fa-exclamation-triangle",
    text: "Robert Kim — overdue payment alert",
    type: "warning",
  },
  {
    icon: "fa-dollar-sign",
    text: "James Carter made a payment of $2,775",
    type: "success",
  },
  {
    icon: "fa-user-plus",
    text: "Blue Horizon Corp loan application pending",
    type: "info",
  },
];

function renderNotifications() {
  const list = $("notif-list");
  if (!notifications.length) {
    list.innerHTML = '<p class="notif-empty">No notifications</p>';
    $("notif-badge").textContent = "0";
    return;
  }
  $("notif-badge").textContent = String(notifications.length);
  list.innerHTML = notifications
    .map(
      (n, index) => `
    <button type="button" class="notif-item" data-notification-index="${index}">
      <i class="fas ${n.icon}"></i>
      <span>${n.text}</span>
    </button>
  `,
    )
    .join("");
}

function clearNotifications(event) {
  if (event) event.stopPropagation();
  notifications.length = 0;
  $("notif-badge").textContent = "0";
  renderNotifications();
}

$("notif-btn").addEventListener("click", () => {
  const dd = $("notif-dropdown");
  dd.classList.toggle("hidden");
  const isOpen = !dd.classList.contains("hidden");
  $("notif-btn").classList.toggle("active", isOpen);
  $("notif-btn").setAttribute("aria-expanded", String(isOpen));
  $("notif-btn").setAttribute(
    "aria-label",
    isOpen ? "Close notifications" : "Open notifications",
  );
  if (isOpen) renderNotifications();
});

$("notif-list").addEventListener("click", (event) => {
  const item = event.target.closest("[data-notification-index]");
  if (!item) return;
  event.stopPropagation();
  item.classList.add("read");
});

// Close dropdown when clicking outside
document.addEventListener("click", (e) => {
  if (!e.target.closest(".notifications")) {
    $("notif-dropdown").classList.add("hidden");
    $("notif-btn").classList.remove("active");
    $("notif-btn").setAttribute("aria-expanded", "false");
    $("notif-btn").setAttribute("aria-label", "Open notifications");
  }
});

/* ─── PROFILE EDIT ─── */
function openProfileEditModal() {
  if (!currentUser) return;
  $("pe-name").value = currentUser.name;
  $("pe-email").value = currentUser.email;
  $("pe-phone").value = currentUser.phone || "";
  openModal("profile-edit-modal");
}

function saveProfileEdit() {
  if (!currentUser) return;
  currentUser.name = $("pe-name").value;
  currentUser.email = $("pe-email").value;
  updateAdminPanelProfile();
  updateNavUser();
  closeModal("profile-edit-modal");
  showToast("Profile updated successfully!", "success");
}

function updateAdminPanelProfile() {
  if (!currentUser) return;
  $("admin-panel-name").textContent = currentUser.name;
  $("admin-panel-role").textContent = currentUser.role;
  $("admin-panel-email").textContent = currentUser.email;
  $("ap-last-login").textContent = currentUser.last_login
    ? new Date(currentUser.last_login).toLocaleDateString()
    : "Today";
}

function updateNavUser() {
  if (!currentUser) return;
  $("nav-user-name").textContent = currentUser.name.split(" ")[0];
  $("nav-user-role").textContent = currentUser.role;
  const initials = currentUser.name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const avatarEl = $("nav-user-avatar");
  if (currentUser.photo) {
    avatarEl.innerHTML = '<img src="' + currentUser.photo + '" alt="Avatar" />';
  } else {
    avatarEl.innerHTML = initials;
  }
}

/* ─── PROFILE PHOTO ─── */
function updateProfilePhoto(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (e) {
    const src = e.target.result;
    currentUser.photo = src;
    const adminAv = $("admin-avatar");
    adminAv.innerHTML = '<img src="' + src + '" alt="Profile" />';
    updateNavUser();
    showToast("Profile photo updated!", "success");
  };
  reader.readAsDataURL(file);
}

/* ─── SETTINGS HELPERS ─── */
function switchSettingsTab(tab) {
  document
    .querySelectorAll(".settings-tab")
    .forEach((t) => t.classList.toggle("active", t.dataset.tab === tab));
  document.querySelectorAll(".settings-panel").forEach((p) => {
    const pid = "settings-" + p.id.replace("settings-", "");
    p.classList.toggle("hidden", p.id !== "settings-" + tab);
  });
}

function saveCompanySettings() {
  const name = $("s-company-name").value;
  const sub = $("s-tagline").value;
  document
    .querySelectorAll(".company-title")
    .forEach((el) => (el.textContent = name));
  $("sidebar-company-name").textContent = name;
  $("login-company-name").textContent = name;
  document
    .querySelectorAll(".company-sub")
    .forEach((el) => (el.textContent = sub));
  document.title = "SVL FMS — Financial Management Dashboard";
  showToast("Company settings saved!", "success");
}

function saveBrandingSettings() {
  const color = $("s-primary-color").value;
  applyPrimaryColor(color);
  showToast("Branding applied successfully!", "success");
}

function applyPrimaryColor(color) {
  document.documentElement.style.setProperty("--primary", color);
  $("s-primary-color-text").value = color;
}

function applyAccentColor(color) {
  document.documentElement.style.setProperty("--accent", color);
  $("s-accent-color-text").value = color;
}

function syncColor(val) {
  if (/^#[0-9A-Fa-f]{6}$/.test(val)) applyPrimaryColor(val);
}

function changePassword() {
  const curr = $("s-curr-pw").value;
  const nw = $("s-new-pw").value;
  const conf = $("s-conf-pw").value;
  if (!curr || !nw || !conf) {
    showToast("Please fill all password fields.", "error");
    return;
  }
  if (nw !== conf) {
    showToast("New passwords do not match.", "error");
    return;
  }
  if (nw.length < 6) {
    showToast("Password must be at least 6 characters.", "error");
    return;
  }
  if (currentUser && currentUser.password !== curr) {
    showToast("Current password is incorrect.", "error");
    return;
  }
  if (currentUser) currentUser.password = nw;
  $("s-curr-pw").value = "";
  $("s-new-pw").value = "";
  $("s-conf-pw").value = "";
  showToast("Password changed successfully!", "success");
}

function previewLogo(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const logoData = e.target.result;
    applyLogo(logoData);
    localStorage.setItem("fms_logo", logoData);
    saveLogoToAPI(logoData);
    showToast("Logo preview updated!", "info");
  };
  reader.readAsDataURL(file);
}

function applyLogo(logoData) {
  if (!logoData) return;
  const logoTargets = document.querySelectorAll(
    ".logo-circle, .logo-icon, .lg-logo-icon",
  );
  logoTargets.forEach((target) => {
    target.innerHTML =
      '<img class="uploaded-logo" src="' + logoData + '" alt="Company logo" />';
  });
  $("logo-preview-area").innerHTML =
    '<img class="uploaded-logo logo-upload-preview" src="' +
    logoData +
    '" alt="Company logo preview" />';
}

async function saveLogoToAPI(logoData) {
  try {
    const response = await fetch("tables/settings?limit=500");
    const settings = await response.json();
    const existing = (settings.data || []).find(
      (setting) => setting.setting_key === "branding_logo",
    );
    const request = existing
      ? fetch("tables/settings/" + existing.id, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ value: logoData }),
        })
      : fetch("tables/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            setting_key: "branding_logo",
            value: logoData,
          }),
        });
    await request;
  } catch (error) {
    // localStorage keeps the logo available while the development API is offline.
    console.warn("Logo saved locally; API persistence is unavailable.", error);
  }
}

async function restoreLogo() {
  let logoData = localStorage.getItem("fms_logo");
  try {
    const response = await fetch("tables/settings?limit=500");
    const settings = await response.json();
    const savedLogo = (settings.data || []).find(
      (setting) => setting.setting_key === "branding_logo",
    );
    if (savedLogo && typeof savedLogo.value === "string") {
      logoData = savedLogo.value;
      localStorage.setItem("fms_logo", logoData);
    }
  } catch (error) {
    // Fall back to the browser copy for local development without the API.
  }
  if (logoData) applyLogo(logoData);
}

function previewBg(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    $("bg-preview-area").innerHTML =
      '<img src="' +
      e.target.result +
      '" style="max-height:80px;border-radius:8px;object-fit:cover;width:100%;" />';
    $("login-bg").style.backgroundImage = "url(" + e.target.result + ")";
    $("login-bg").style.opacity = "0.5";
    showToast("Login background updated!", "info");
  };
  reader.readAsDataURL(file);
}

function openUploadLogoPanel() {
  navigateTo("settings");
  toggleAdminPanel();
  setTimeout(() => {
    switchSettingsTab("branding");
    showToast("Use the branding panel to upload your logo.", "info");
  }, 300);
}

function openLoginBgPanel() {
  navigateTo("settings");
  toggleAdminPanel();
  setTimeout(() => {
    switchSettingsTab("branding");
    showToast("Use the branding panel to set login background.", "info");
  }, 300);
}

function exportReport() {
  const headers = [
    "Client",
    "Type",
    "Loan Amount",
    "Rate",
    "Duration",
    "Interest",
    "Total",
    "Paid",
    "Balance",
    "Status",
  ];
  const rows = allClients.map((c) => [
    c.client_name,
    c.client_type,
    c.loan_amount,
    c.flat_rate + "%",
    c.duration_months + "mo",
    c.interest_amount,
    c.total_payment,
    c.amount_paid,
    c.remaining_balance,
    c.status,
  ]);
  let csv = headers.join(",") + "\n" + rows.map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "loan_register.csv";
  a.click();
  URL.revokeObjectURL(url);
  showToast("Report exported!", "success");
}

/* ═══════════════════════════════════════════════════════════════
   COLOR PICKER — Navigation Color Customizer
   ═══════════════════════════════════════════════════════════════ */

/* Default colour values — single source of truth */
const NAV_COLOR_DEFAULTS = {
  svcStart: "#1e1b4b",
  svcMid: "#312e81",
  svcEnd: "#4338ca",
  svcDir: "90deg",
  sbTop: "#1e1b4b",
  sbMid: "#2d2a7a",
  sbBot: "#312e81",
  sbDir: "180deg",
  nbBg: "#ffffff",
  nbText: "#1e293b",
  nbBorder: "#e2e8f0",
  nbStyle: "flat",
};

const NAV_COLOR_LS_KEY = "tdj_nav_colors";

/* Preset palettes ─────────────────────────────────────────── */
const CP_PRESETS = {
  svc: [
    {
      name: "Ocean Blue",
      stops: ["#1e1b4b", "#312e81", "#4338ca"],
      dir: "90deg",
    },
    {
      name: "Emerald Forest",
      stops: ["#064e3b", "#065f46", "#10b981"],
      dir: "90deg",
    },
    {
      name: "Midnight",
      stops: ["#0f0f0f", "#1e1e2e", "#2e2e4e"],
      dir: "90deg",
    },
    { name: "Crimson", stops: ["#7f1d1d", "#991b1b", "#dc2626"], dir: "90deg" },
    {
      name: "Amber Gold",
      stops: ["#78350f", "#92400e", "#d97706"],
      dir: "90deg",
    },
    {
      name: "Teal Mist",
      stops: ["#134e4a", "#0f766e", "#14b8a6"],
      dir: "90deg",
    },
    {
      name: "Violet Dusk",
      stops: ["#2e1065", "#4c1d95", "#7c3aed"],
      dir: "90deg",
    },
    { name: "Slate", stops: ["#0f172a", "#1e293b", "#334155"], dir: "90deg" },
  ],
  sidebar: [
    {
      name: "Ocean Blue",
      stops: ["#1e1b4b", "#2d2a7a", "#312e81"],
      dir: "180deg",
    },
    {
      name: "Emerald Forest",
      stops: ["#064e3b", "#065f46", "#047857"],
      dir: "180deg",
    },
    {
      name: "Midnight",
      stops: ["#0f0f0f", "#1c1c2e", "#2e2e4e"],
      dir: "180deg",
    },
    {
      name: "Crimson",
      stops: ["#7f1d1d", "#991b1b", "#b91c1c"],
      dir: "180deg",
    },
    {
      name: "Amber Gold",
      stops: ["#78350f", "#92400e", "#b45309"],
      dir: "180deg",
    },
    {
      name: "Teal Mist",
      stops: ["#134e4a", "#0f766e", "#0d9488"],
      dir: "180deg",
    },
    {
      name: "Violet Dusk",
      stops: ["#2e1065", "#4c1d95", "#6d28d9"],
      dir: "180deg",
    },
    { name: "Slate", stops: ["#0f172a", "#1e293b", "#1e293b"], dir: "180deg" },
  ],
  navbar: [
    {
      name: "Clean White",
      bg: "#ffffff",
      text: "#1e293b",
      border: "#e2e8f0",
      style: "flat",
    },
    {
      name: "Light Gray",
      bg: "#f8fafc",
      text: "#1e293b",
      border: "#e2e8f0",
      style: "flat",
    },
    {
      name: "Slate Dark",
      bg: "#1e293b",
      text: "#f1f5f9",
      border: "#334155",
      style: "flat",
    },
    {
      name: "Midnight Black",
      bg: "#0f172a",
      text: "#e2e8f0",
      border: "#1e293b",
      style: "flat",
    },
    {
      name: "Indigo",
      bg: "#312e81",
      text: "#e0e7ff",
      border: "#4338ca",
      style: "flat",
    },
    {
      name: "Emerald",
      bg: "#064e3b",
      text: "#d1fae5",
      border: "#065f46",
      style: "flat",
    },
    {
      name: "Glass Light",
      bg: "#ffffff",
      text: "#1e293b",
      border: "#e2e8f0",
      style: "glass",
    },
    {
      name: "Warm Cream",
      bg: "#fffbeb",
      text: "#78350f",
      border: "#fde68a",
      style: "flat",
    },
  ],
};

/* ── Render preset swatches ─────────────────────────────────── */
function initColorPickerPresets() {
  /* Services Bar presets */
  const svcContainer = $("svc-presets");
  if (svcContainer) {
    svcContainer.innerHTML = CP_PRESETS.svc
      .map((p, i) => {
        const grad = "linear-gradient(90deg," + p.stops.join(",") + ")";
        return `<button class="cp-preset-swatch" title="${p.name}" style="background:${grad}"
                onclick="applyColorPreset('svc',${i})" aria-label="${p.name}"></button>`;
      })
      .join("");
  }

  /* Sidebar presets */
  const sbContainer = $("sidebar-presets");
  if (sbContainer) {
    sbContainer.innerHTML = CP_PRESETS.sidebar
      .map((p, i) => {
        const grad = "linear-gradient(180deg," + p.stops.join(",") + ")";
        return `<button class="cp-preset-swatch" title="${p.name}" style="background:${grad}"
                onclick="applyColorPreset('sidebar',${i})" aria-label="${p.name}"></button>`;
      })
      .join("");
  }

  /* Navbar presets */
  const nbContainer = $("navbar-presets");
  if (nbContainer) {
    nbContainer.innerHTML = CP_PRESETS.navbar
      .map((p, i) => {
        return `<button class="cp-preset-swatch" title="${p.name}" style="background:${p.bg};border:1.5px solid ${p.border}"
                onclick="applyColorPreset('navbar',${i})" aria-label="${p.name}"></button>`;
      })
      .join("");
  }
}

/* Apply a preset to the picker inputs then live-preview ────── */
function applyColorPreset(section, idx) {
  if (section === "svc") {
    const p = CP_PRESETS.svc[idx];
    _setPickerVal("svc-color-start", p.stops[0]);
    _setPickerVal("svc-color-mid", p.stops[1]);
    _setPickerVal("svc-color-end", p.stops[2]);
    $("svc-gradient-dir").value = p.dir;
    /* mark active swatch */
    _markActiveSwatch("svc-presets", idx);
  } else if (section === "sidebar") {
    const p = CP_PRESETS.sidebar[idx];
    _setPickerVal("sb-color-top", p.stops[0]);
    _setPickerVal("sb-color-mid", p.stops[1]);
    _setPickerVal("sb-color-bot", p.stops[2]);
    $("sb-gradient-dir").value = p.dir;
    _markActiveSwatch("sidebar-presets", idx);
  } else if (section === "navbar") {
    const p = CP_PRESETS.navbar[idx];
    _setPickerVal("nb-color-bg", p.bg);
    _setPickerVal("nb-color-text", p.text);
    _setPickerVal("nb-color-border", p.border);
    $("nb-style").value = p.style;
    _markActiveSwatch("navbar-presets", idx);
  }
  previewNavColors();
}

/* Helper — sets both the color input and text input together */
function _setPickerVal(baseId, hex) {
  const colorEl = $(baseId);
  const textEl = $(baseId + "-hex");
  if (colorEl) colorEl.value = hex;
  if (textEl) textEl.value = hex;
}

/* Helper — toggle .active class on preset swatches */
function _markActiveSwatch(containerId, activeIdx) {
  const container = $(containerId);
  if (!container) return;
  container.querySelectorAll(".cp-preset-swatch").forEach((sw, i) => {
    sw.classList.toggle("active", i === activeIdx);
  });
}

/* ── Sync text ↔ color input ────────────────────────────────── */
function hexInputSync(baseId, val) {
  if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
    const colorEl = $(baseId);
    if (colorEl) colorEl.value = val;
    previewNavColors();
  }
}

/* ── Read current picker values ─────────────────────────────── */
function _readPickerValues() {
  const g = (id) => {
    const el = $(id);
    return el ? el.value : "";
  };
  return {
    svcStart: g("svc-color-start") || NAV_COLOR_DEFAULTS.svcStart,
    svcMid: g("svc-color-mid") || NAV_COLOR_DEFAULTS.svcMid,
    svcEnd: g("svc-color-end") || NAV_COLOR_DEFAULTS.svcEnd,
    svcDir: g("svc-gradient-dir") || NAV_COLOR_DEFAULTS.svcDir,
    sbTop: g("sb-color-top") || NAV_COLOR_DEFAULTS.sbTop,
    sbMid: g("sb-color-mid") || NAV_COLOR_DEFAULTS.sbMid,
    sbBot: g("sb-color-bot") || NAV_COLOR_DEFAULTS.sbBot,
    sbDir: g("sb-gradient-dir") || NAV_COLOR_DEFAULTS.sbDir,
    nbBg: g("nb-color-bg") || NAV_COLOR_DEFAULTS.nbBg,
    nbText: g("nb-color-text") || NAV_COLOR_DEFAULTS.nbText,
    nbBorder: g("nb-color-border") || NAV_COLOR_DEFAULTS.nbBorder,
    nbStyle: g("nb-style") || NAV_COLOR_DEFAULTS.nbStyle,
  };
}

/* ── Apply colour values to CSS custom properties ───────────── */
function _applyCSSVars(v) {
  const root = document.documentElement;
  root.style.setProperty("--svc-grad-start", v.svcStart);
  root.style.setProperty("--svc-grad-mid", v.svcMid);
  root.style.setProperty("--svc-grad-end", v.svcEnd);
  root.style.setProperty("--svc-grad-dir", v.svcDir);
  root.style.setProperty("--sidebar-grad-start", v.sbTop);
  root.style.setProperty("--sidebar-grad-mid", v.sbMid);
  root.style.setProperty("--sidebar-grad-end", v.sbBot);
  root.style.setProperty("--sidebar-grad-dir", v.sbDir);
  root.style.setProperty("--navbar-bg", v.nbBg);
  root.style.setProperty("--navbar-text", v.nbText);
  root.style.setProperty("--navbar-border", v.nbBorder);

  /* Navbar style modifier */
  const nb = document.querySelector(".top-navbar");
  if (nb) {
    nb.classList.remove("nb-glass", "nb-gradient");
    if (v.nbStyle === "glass") {
      nb.classList.add("nb-glass");
    } else if (v.nbStyle === "gradient") {
      nb.classList.add("nb-gradient");
    }
  }
}

/* ── Update the live preview strip inside the settings panel ── */
function _updatePreviewStrip(v) {
  const svcBar = $("cp-svc-preview");
  const sbBar = $("cp-sidebar-preview");
  const nbBar = $("cp-navbar-preview");

  if (svcBar) {
    const grad =
      "linear-gradient(" +
      v.svcDir +
      "," +
      v.svcStart +
      "," +
      v.svcMid +
      "," +
      v.svcEnd +
      ")";
    svcBar.style.background = grad;
    svcBar
      .querySelectorAll(".cp-preview-dot")
      .forEach((d) => (d.style.background = "rgba(255,255,255,.55)"));
    const lbl = svcBar.querySelector(".cp-preview-item-label");
    if (lbl) {
      lbl.style.color = "rgba(255,255,255,.9)";
    }
  }
  if (sbBar) {
    const grad =
      "linear-gradient(" +
      v.sbDir +
      "," +
      v.sbTop +
      "," +
      v.sbMid +
      "," +
      v.sbBot +
      ")";
    sbBar.style.background = grad;
    sbBar
      .querySelectorAll(".cp-preview-dot")
      .forEach((d) => (d.style.background = "rgba(255,255,255,.55)"));
    const lbl = sbBar.querySelector(".cp-preview-item-label");
    if (lbl) {
      lbl.style.color = "rgba(255,255,255,.9)";
    }
  }
  if (nbBar) {
    nbBar.style.background = v.nbBg;
    nbBar.style.borderColor = v.nbBorder;
    nbBar
      .querySelectorAll(".cp-preview-dot")
      .forEach((d) => (d.style.background = v.nbText + "33"));
    const lbl = nbBar.querySelector(".cp-preview-item-label");
    if (lbl) {
      lbl.style.color = v.nbText;
    }
    /* glassmorphism hint */
    if (v.nbStyle === "glass") {
      nbBar.style.backdropFilter = "blur(10px)";
      nbBar.style.background = v.nbBg + "cc";
    } else {
      nbBar.style.backdropFilter = "";
    }
  }
}

/* ── Live preview (no save) ─────────────────────────────────── */
function previewNavColors() {
  const v = _readPickerValues();
  _applyCSSVars(v);
  _updatePreviewStrip(v);
}

/* ── Reset to defaults ──────────────────────────────────────── */
function resetNavColors() {
  const d = NAV_COLOR_DEFAULTS;

  /* Restore picker inputs */
  _setPickerVal("svc-color-start", d.svcStart);
  _setPickerVal("svc-color-mid", d.svcMid);
  _setPickerVal("svc-color-end", d.svcEnd);
  const svcDir = $("svc-gradient-dir");
  if (svcDir) svcDir.value = d.svcDir;

  _setPickerVal("sb-color-top", d.sbTop);
  _setPickerVal("sb-color-mid", d.sbMid);
  _setPickerVal("sb-color-bot", d.sbBot);
  const sbDir = $("sb-gradient-dir");
  if (sbDir) sbDir.value = d.sbDir;

  _setPickerVal("nb-color-bg", d.nbBg);
  _setPickerVal("nb-color-text", d.nbText);
  _setPickerVal("nb-color-border", d.nbBorder);
  const nbStyle = $("nb-style");
  if (nbStyle) nbStyle.value = d.nbStyle;

  /* Clear active preset highlights */
  ["svc-presets", "sidebar-presets", "navbar-presets"].forEach((id) => {
    const c = $(id);
    if (c)
      c.querySelectorAll(".cp-preset-swatch").forEach((s) =>
        s.classList.remove("active"),
      );
  });

  /* Apply CSS variables & preview strip */
  _applyCSSVars(d);
  _updatePreviewStrip(d);

  /* Remove any persisted overrides */
  localStorage.removeItem(NAV_COLOR_LS_KEY);

  showToast("Navigation colors reset to default.", "info");
}

/* ── Apply & persist to localStorage ───────────────────────── */
function applyAndSaveNavColors() {
  const v = _readPickerValues();
  _applyCSSVars(v);
  _updatePreviewStrip(v);
  localStorage.setItem(NAV_COLOR_LS_KEY, JSON.stringify(v));
  showToast("Navigation colors saved successfully!", "success");
}

/* ── Load saved colors on app init ─────────────────────────── */
function loadSavedNavColors() {
  let v;
  try {
    const raw = localStorage.getItem(NAV_COLOR_LS_KEY);
    v = raw ? JSON.parse(raw) : null;
  } catch (e) {
    v = null;
  }
  if (!v) return; /* nothing saved — keep CSS variable defaults */

  /* Apply CSS variables immediately (before DOM fully interactive) */
  _applyCSSVars(v);

  /* Restore picker inputs if the settings panel exists */
  _setPickerVal("svc-color-start", v.svcStart);
  _setPickerVal("svc-color-mid", v.svcMid);
  _setPickerVal("svc-color-end", v.svcEnd);
  const svcDir = $("svc-gradient-dir");
  if (svcDir) svcDir.value = v.svcDir;

  _setPickerVal("sb-color-top", v.sbTop);
  _setPickerVal("sb-color-mid", v.sbMid);
  _setPickerVal("sb-color-bot", v.sbBot);
  const sbDir = $("sb-gradient-dir");
  if (sbDir) sbDir.value = v.sbDir;

  _setPickerVal("nb-color-bg", v.nbBg);
  _setPickerVal("nb-color-text", v.nbText);
  _setPickerVal("nb-color-border", v.nbBorder);
  const nbStyle = $("nb-style");
  if (nbStyle) nbStyle.value = v.nbStyle;

  /* Update preview strip */
  _updatePreviewStrip(v);
}

/* ─── INIT APP ─── */
async function initApp() {
  initDateDisplay();
  updateNavUser();
  updateAdminPanelProfile();
  applyPermissionVisibility();
  renderOnlineStaff();
  loadSavedNavColors();
  initColorPickerPresets();
  wireAutoCalculateListeners(); // wire client form auto-calc inputs once
  startLiveChartUpdates();

  // Load all data
  await Promise.all([fetchClients(), fetchActivities(), fetchPayments()]);

  // Navigate to dashboard
  navigateTo("dashboard");
}

/* ─── Admin panel quick link to Licenses ─── */
function openLicensesPanel() {
  const ap = $("admin-panel");
  if (ap) ap.classList.remove("open");
  const bd = $("panel-backdrop");
  if (bd) bd.classList.add("hidden");
  navigateTo("licenses");
}

function applyPermissionVisibility() {
  if (!currentUser) return;
  const perms = currentUser.permissions || [];
  document.querySelectorAll(".nav-item[data-perm]").forEach((item) => {
    const perm = item.dataset.perm;
    const superAdminOnly = item.classList.contains("tenant-management-nav");
    item.style.display =
      (!superAdminOnly || currentUser.role === "Super Admin") &&
      perms.includes(perm)
        ? ""
        : "none";
  });
}

function renderOnlineStaff() {
  const list = $("online-staff-list");
  if (!list) return;
  list.innerHTML = allStaff
    .slice(0, 5)
    .map(
      (s) => `
    <div class="online-staff-item">
      <div class="online-dot ${s.active ? "" : "offline-dot"}"></div>
      <div>
        <div style="font-weight:600;font-size:.82rem;">${s.name}</div>
        <div style="font-size:.72rem;color:var(--text-muted);">${s.role}</div>
      </div>
    </div>
  `,
    )
    .join("");
}

/* ─── FETCH DATA ─── */
async function fetchClients() {
  try {
    const res = await fetch("tables/clients?limit=100");
    const data = await res.json();
    allClients = data.data || [];
  } catch (e) {
    console.warn("Using fallback client data");
  }
}

async function fetchActivities() {
  try {
    const res = await fetch("tables/activities?limit=100");
    const data = await res.json();
    allActivities = data.data || [];
  } catch (e) {
    console.warn("Using fallback activity data");
  }
}

async function fetchPayments() {
  try {
    const response = await fetch("tables/payments?limit=500&sort=created_at");
    await requireApiSuccess(response, "Payments could not be loaded.");
    const data = await response.json();
    allPayments = data.data || [];
  } catch (error) {
    allPayments = [];
    console.warn(error.message || "Payments could not be loaded.");
  }
}

let tenantLicenses = [];
let selectedTenantLicense = null;

async function renderTenantManagementPage() {
  if (currentUser?.role !== "Super Admin") {
    showToast("Only Super Admin can configure licensed workspaces.", "error");
    navigateTo("dashboard");
    return;
  }
  try {
    const response = await fetch("tables/licenses?limit=500&sort=created_at");
    await requireApiSuccess(
      response,
      "Licensed workspaces could not be loaded.",
    );
    const data = await response.json();
    tenantLicenses = data.data || [];
  } catch (error) {
    tenantLicenses = [];
    showToast(
      error.message || "Licensed workspaces could not be loaded.",
      "error",
    );
  }
  const body = $("tenant-license-tbody");
  if (!body) return;
  body.innerHTML =
    tenantLicenses
      .map(
        (license) =>
          `<tr><td><strong>${license.business_name}</strong><small class="invoice-client-type">${license.business_email}</small></td><td>${license.plan}</td><td><span class="${getBadgeClass(license.status)}">${license.status}</span></td><td>${license.subdomain || "—"}</td><td>${license.website_url ? `<a href="${license.website_url}" target="_blank" rel="noopener">Visit</a>` : "—"}</td><td><button class="btn-secondary btn-sm" onclick="selectTenantLicense('${license.id}')"><i class="fas fa-edit"></i> Configure</button></td></tr>`,
      )
      .join("") ||
    '<tr><td colspan="6" class="invoice-empty-state">No licenses available.</td></tr>';
}

function selectTenantLicense(licenseId) {
  selectedTenantLicense = tenantLicenses.find(
    (license) => license.id === licenseId,
  );
  if (!selectedTenantLicense) return;
  $("tenant-license-id").value = selectedTenantLicense.id;
  $("tenant-subdomain").value = selectedTenantLicense.subdomain || "";
  $("tenant-domain").value = selectedTenantLicense.domain_name || "";
  $("tenant-website").value = selectedTenantLicense.website_url || "";
  $("tenant-seo-title").value = selectedTenantLicense.seo_title || "";
  $("tenant-seo-description").value =
    selectedTenantLicense.seo_description || "";
  $("tenant-seo-keywords").value = selectedTenantLicense.seo_keywords || "";
  document.querySelectorAll(".feature-flags input").forEach((input) => {
    input.checked = (selectedTenantLicense.feature_flags || []).includes(
      input.value,
    );
  });
  $("tenant-config-status").textContent =
    `Configuring ${selectedTenantLicense.business_name} (${selectedTenantLicense.plan})`;
}

async function saveTenantConfiguration(event) {
  if (event) event.preventDefault();
  const id = $("tenant-license-id").value;
  if (!id) return showToast("Select a licensed workspace first.", "warning");
  const payload = {
    subdomain: $("tenant-subdomain").value.trim(),
    domain_name: $("tenant-domain").value.trim(),
    website_url: $("tenant-website").value.trim() || null,
    seo_title: $("tenant-seo-title").value.trim(),
    seo_description: $("tenant-seo-description").value.trim(),
    seo_keywords: $("tenant-seo-keywords").value.trim(),
    feature_flags: Array.from(
      document.querySelectorAll(".feature-flags input:checked"),
    ).map((input) => input.value),
  };
  try {
    const response = await fetch(`tables/licenses/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    await requireApiSuccess(
      response,
      "Workspace configuration could not be saved.",
    );
    selectedTenantLicense = { ...selectedTenantLicense, ...payload };
    tenantLicenses = tenantLicenses.map((license) =>
      license.id === id ? selectedTenantLicense : license,
    );
    await renderTenantManagementPage();
    selectTenantLicense(id);
    showToast("Workspace configuration saved.", "success");
  } catch (error) {
    showToast(
      error.message || "Workspace configuration could not be saved.",
      "error",
    );
  }
}

function visitConfiguredWebsite() {
  const url = $("tenant-website").value.trim();
  if (!url) return showToast("Enter a website URL first.", "warning");
  window.open(
    /^https?:\/\//i.test(url) ? url : `https://${url}`,
    "_blank",
    "noopener",
  );
}

async function backupSystemData() {
  if (currentUser?.role !== "Super Admin")
    return showToast("Only Super Admin can create backups.", "error");
  try {
    const resources = [
      "clients",
      "staff",
      "activities",
      "licenses",
      "license_plans",
      "invoices",
      "payments",
      "settings",
    ];
    const records = {};
    for (const resource of resources) {
      const response = await fetch(`tables/${resource}?limit=500`);
      await requireApiSuccess(response, `Could not back up ${resource}.`);
      records[resource] = (await response.json()).data || [];
    }
    const blob = new Blob(
      [
        JSON.stringify(
          { exported_at: new Date().toISOString(), records },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `fms-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast("System backup downloaded.", "success");
  } catch (error) {
    showToast(error.message || "System backup failed.", "error");
  }
}

let paymentDetails = {
  bankName: "",
  bankAccountName: "",
  bankAccountNumber: "",
  bankBranch: "",
  mobileName: "",
  mobileNumber: "",
  mobileInstructions: "",
  orangeName: "",
  orangeNumber: "",
  orangeInstructions: "",
};

async function renderPaymentDetailsPage() {
  try {
    const response = await fetch("tables/settings?limit=500");
    await requireApiSuccess(response, "Payment details could not be loaded.");
    const data = await response.json();
    const saved = (data.data || []).find(
      (item) => item.setting_key === "payment_details",
    );
    if (saved && saved.value && typeof saved.value === "object")
      paymentDetails = { ...paymentDetails, ...saved.value };
  } catch (error) {
    showToast(error.message || "Payment details could not be loaded.", "error");
  }
  Object.entries({
    "pd-bank-name": paymentDetails.bankName,
    "pd-bank-account-name": paymentDetails.bankAccountName,
    "pd-bank-account-number": paymentDetails.bankAccountNumber,
    "pd-bank-branch": paymentDetails.bankBranch,
    "pd-mobile-name": paymentDetails.mobileName,
    "pd-mobile-number": paymentDetails.mobileNumber,
    "pd-mobile-instructions": paymentDetails.mobileInstructions,
    "pd-orange-name": paymentDetails.orangeName,
    "pd-orange-number": paymentDetails.orangeNumber,
    "pd-orange-instructions": paymentDetails.orangeInstructions,
  }).forEach(([id, value]) => {
    if ($(id)) $(id).value = value || "";
  });
}

function readPaymentDetails() {
  return {
    bankName: $("pd-bank-name").value.trim(),
    bankAccountName: $("pd-bank-account-name").value.trim(),
    bankAccountNumber: $("pd-bank-account-number").value.trim(),
    bankBranch: $("pd-bank-branch").value.trim(),
    mobileName: $("pd-mobile-name").value.trim(),
    mobileNumber: $("pd-mobile-number").value.trim(),
    mobileInstructions: $("pd-mobile-instructions").value.trim(),
    orangeName: $("pd-orange-name").value.trim(),
    orangeNumber: $("pd-orange-number").value.trim(),
    orangeInstructions: $("pd-orange-instructions").value.trim(),
  };
}

async function savePaymentDetails() {
  paymentDetails = readPaymentDetails();
  try {
    const response = await fetch("tables/settings?limit=500");
    await requireApiSuccess(response, "Payment details could not be saved.");
    const data = await response.json();
    const existing = (data.data || []).find(
      (item) => item.setting_key === "payment_details",
    );
    const endpoint = existing
      ? `tables/settings/${existing.id}`
      : "tables/settings";
    const saveResponse = await fetch(endpoint, {
      method: existing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        setting_key: "payment_details",
        value: paymentDetails,
      }),
    });
    await requireApiSuccess(
      saveResponse,
      "Payment details could not be saved.",
    );
    showToast("Payment details saved successfully.", "success");
  } catch (error) {
    showToast(error.message || "Payment details could not be saved.", "error");
  }
}

async function copyPaymentDetails(method) {
  const details =
    method === "bank"
      ? `Bank: ${$("pd-bank-name").value}\nAccount Name: ${$("pd-bank-account-name").value}\nAccount Number: ${$("pd-bank-account-number").value}\nBranch / SWIFT: ${$("pd-bank-branch").value}`
      : method === "mobile"
        ? `Mobile Money Name: ${$("pd-mobile-name").value}\nNumber: ${$("pd-mobile-number").value}\nInstructions: ${$("pd-mobile-instructions").value}`
        : `Orange Money Name: ${$("pd-orange-name").value}\nNumber: ${$("pd-orange-number").value}\nInstructions: ${$("pd-orange-instructions").value}`;
  try {
    await navigator.clipboard.writeText(details);
    showToast("Payment details copied.", "success");
  } catch (error) {
    showToast("Could not copy payment details.", "error");
  }
}

/* ─── Auto-restore session (optional demo) ─── */
// On load — check if we have a demo session from localStorage
window.addEventListener("DOMContentLoaded", async () => {
  await restoreLogo();
  // Pre-load staff and check session
  await loadStaffFromAPI();
  const savedId = localStorage.getItem("fp_user_id");
  if (savedId && allStaff.length) {
    const user = allStaff.find((s) => s.id === savedId);
    if (user) {
      currentUser = user;
      await applyAssignedLicensePermissions(currentUser);
      $("login-screen").classList.add("hidden");
      $("main-app").classList.remove("hidden");
      document.body.classList.remove("login-page");
      initApp();
      return;
    }
  }
  // Otherwise show login
});
