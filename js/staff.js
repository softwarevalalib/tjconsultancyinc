/* ═══════════════════════════════════════════════════
   staff.js — Staff management, permissions, CRUD
   ═══════════════════════════════════════════════════ */

"use strict";

const PERM_DETAILS = {
  dashboard: {
    icon: "fa-tachometer-alt",
    desc: "Access main dashboard and key metrics",
  },
  clients: { icon: "fa-users", desc: "View, add, and manage client records" },
  reports: {
    icon: "fa-chart-bar",
    desc: "Generate and view financial reports",
  },
  activities: {
    icon: "fa-history",
    desc: "View activity logs and add new entries",
  },
  staff_management: {
    icon: "fa-user-shield",
    desc: "Manage staff members and permissions",
  },
  settings: { icon: "fa-cog", desc: "Configure system settings & branding" },
};

const LICENSE_PLAN_PERMISSIONS = {
  Monthly: ["dashboard", "clients", "reports", "activities"],
  Quarterly: [
    "dashboard",
    "clients",
    "reports",
    "activities",
    "payments",
    "invoices",
    "staff_management",
  ],
  Yearly: [
    "dashboard",
    "clients",
    "reports",
    "activities",
    "payments",
    "invoices",
    "staff_management",
    "settings",
    "payment_details",
  ],
};

let staffLicenseCache = [];

function getLicensePermissions(license) {
  if (!license) return Object.keys(PERM_DETAILS);
  const planPermissions =
    LICENSE_PLAN_PERMISSIONS[license.plan] || LICENSE_PLAN_PERMISSIONS.Monthly;
  const configured = Array.isArray(license.feature_flags)
    ? license.feature_flags
    : [];
  return [...new Set([...planPermissions, ...configured])];
}

async function applyAssignedLicensePermissions(user) {
  if (!user || user.role === "Super Admin" || !user.license_id) return user;
  try {
    const response = await fetch("tables/licenses/" + user.license_id);
    await requireApiSuccess(response, "Assigned license could not be loaded.");
    const license = await response.json();
    const expired =
      license.expiry_date && new Date(license.expiry_date) < new Date();
    user.permissions =
      license.status !== "Active" || expired
        ? ["dashboard"]
        : (user.permissions || []).filter((permission) =>
            getLicensePermissions(license).includes(permission),
          );
  } catch (error) {
    // Keep the stored permissions if the license service is temporarily unavailable.
  }
  return user;
}

function applyLicensePermissionOptions(licenseId = "") {
  const license = staffLicenseCache.find((item) => item.id === licenseId);
  const allowed = getLicensePermissions(license);
  document
    .querySelectorAll('#permissions-grid input[type="checkbox"]')
    .forEach((checkbox) => {
      const enabled = allowed.includes(checkbox.value);
      checkbox.disabled = !enabled;
      if (!enabled) checkbox.checked = false;
    });
  const hint = $("staff-license-permission-hint");
  if (hint)
    hint.textContent = license
      ? `${license.plan} plan access: ${allowed.map((key) => PERM_MAP[key]?.label || key).join(", ")}`
      : "Select a license to apply plan permissions.";
}

/* ─── RENDER STAFF GRID ─── */
function renderStaffGrid(data) {
  const staffList = data || allStaff;
  const grid = $("staff-grid");
  if (!staffList.length) {
    grid.innerHTML =
      '<div style="text-align:center;padding:3rem;color:var(--text-muted);"><i class="fas fa-user-slash" style="font-size:2rem;display:block;margin-bottom:.5rem;"></i>No staff members found.</div>';
    return;
  }
  grid.innerHTML = staffList.map((s) => buildStaffCard(s)).join("");
}

function buildStaffCard(s) {
  const perms = Array.isArray(s.permissions)
    ? s.permissions
    : s.permissions
      ? JSON.parse(s.permissions)
      : [];
  const roleCls = getRoleClass(s.role);
  const initials = getInitials(s.name);
  const lastLogin = s.last_login
    ? new Date(s.last_login).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Never";

  // Super admin can't be deleted or have permissions edited by others
  const isSuperAdmin = s.role === "Super Admin";
  const isCurrentUser = currentUser && currentUser.id === s.id;

  return `
    <div class="staff-card">
      <div class="staff-card-top">
        <div class="staff-photo">
          ${s.photo ? '<img src="' + s.photo + '" alt="' + s.name + '" />' : initials}
        </div>
        <div class="staff-info">
          <div class="staff-name">
            <span class="status-dot ${s.active !== false ? "active" : "inactive"}"></span>
            ${s.name} ${isCurrentUser ? '<span style="font-size:.7rem;color:var(--primary);">(you)</span>' : ""}
          </div>
          <div class="staff-email">${s.email}</div>
        </div>
      </div>

      <div class="staff-badges">
        <span class="role-badge ${roleCls}">${s.role}</span>
        <span class="badge ${s.active !== false ? "badge-active" : "badge-overdue"}">${s.active !== false ? "Active" : "Inactive"}</span>
      </div>

      <div style="font-size:.75rem;color:var(--text-muted);margin-bottom:.6rem;">
        <i class="fas fa-clock" style="margin-right:.3rem;"></i>Last login: ${lastLogin}
      </div>

      <div class="staff-perms">
        ${perms
          .slice(0, 4)
          .map(
            (p) =>
              `<span class="perm-tag"><i class="fas ${PERM_DETAILS[p]?.icon || "fa-circle"}" style="margin-right:.3rem;font-size:.65rem;"></i>${PERM_MAP[p]?.label || p}</span>`,
          )
          .join("")}
        ${perms.length > 4 ? '<span class="perm-tag">+' + (perms.length - 4) + " more</span>" : ""}
      </div>

      <div class="staff-card-actions">
        ${!isSuperAdmin || isCurrentUser ? `<button class="btn-secondary btn-sm" onclick="openEditStaffModal('${s.id}')"><i class="fas fa-edit"></i> Edit</button>` : ""}
        ${currentUser?.role === "Super Admin" ? `<button class="btn-primary btn-sm" onclick="openPermissionsModal('${s.id}')"><i class="fas fa-key"></i> Permissions</button>` : ""}
        ${!isSuperAdmin && currentUser?.role === "Super Admin" ? `<button class="btn-danger btn-sm" onclick="confirmDeleteStaff('${s.id}')"><i class="fas fa-trash"></i></button>` : ""}
      </div>
    </div>
  `;
}

function getRoleClass(role) {
  const m = {
    "Super Admin": "role-superadmin",
    Admin: "role-manager",
    Manager: "role-manager",
    "Loan Officer": "role-loanofficer",
    Accountant: "role-accountant",
    Viewer: "role-viewer",
  };
  return m[role] || "role-viewer";
}

/* ─── SEARCH ─── */
function filterStaff() {
  const q = $("staff-search").value.toLowerCase();
  const filtered = allStaff.filter(
    (s) =>
      s.name.toLowerCase().includes(q) ||
      s.email.toLowerCase().includes(q) ||
      s.role.toLowerCase().includes(q),
  );
  renderStaffGrid(filtered);
}

/* ─── ADD STAFF ─── */
function openAddStaffModal() {
  $("staff-form-title").textContent = "Add Staff Member";
  $("staff-form").reset();
  $("sf-id").value = "";
  $("sf-active").checked = true;
  $("sf-password").required = true;
  $("sf-password").placeholder = "Set password";
  loadStaffLicenseOptions();
  $("sf-license-id").value = "";
  applyLicensePermissionOptions();

  // Reset permissions
  document
    .querySelectorAll('#permissions-grid input[type="checkbox"]')
    .forEach((cb) => {
      cb.checked = cb.value === "dashboard";
    });

  openModal("staff-form-modal");
}

/* ─── EDIT STAFF ─── */
function openEditStaffModal(staffId) {
  const s = allStaff.find((x) => x.id === staffId);
  if (!s) return;

  $("staff-form-title").textContent = "Edit Staff — " + s.name;
  $("sf-id").value = s.id;
  $("sf-name").value = s.name;
  $("sf-email").value = s.email;
  $("sf-password").value = "";
  $("sf-password").placeholder = "Leave blank to keep current";
  $("sf-password").required = false;
  $("sf-role").value = s.role;
  $("sf-active").checked = s.active !== false;
  loadStaffLicenseOptions(s.license_id || "");
  applyLicensePermissionOptions(s.license_id || "");

  const perms = Array.isArray(s.permissions)
    ? s.permissions
    : s.permissions
      ? JSON.parse(s.permissions)
      : [];
  document
    .querySelectorAll('#permissions-grid input[type="checkbox"]')
    .forEach((cb) => {
      cb.checked = perms.includes(cb.value);
    });

  openModal("staff-form-modal");
}

/* ─── SAVE STAFF ─── */
async function saveStaff(e) {
  e.preventDefault();
  const id = $("sf-id").value;
  const perms = Array.from(
    document.querySelectorAll(
      '#permissions-grid input[type="checkbox"]:checked',
    ),
  ).map((cb) => cb.value);
  const selectedLicense = staffLicenseCache.find(
    (license) => license.id === $("sf-license-id").value,
  );
  const effectivePermissions = perms.filter((permission) =>
    getLicensePermissions(selectedLicense).includes(permission),
  );

  const payload = {
    name: $("sf-name").value.trim(),
    email: $("sf-email").value.trim(),
    role: $("sf-role").value,
    permissions: effectivePermissions,
    active: $("sf-active").checked,
    license_id: $("sf-license-id").value || null,
  };

  const pw = $("sf-password").value;
  if (pw) payload.password = pw;

  try {
    if (id) {
      const res = await fetch("tables/staff/" + id, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      await requireApiSuccess(res, "The staff member could not be updated.");
      const updated = await res.json();
      const idx = allStaff.findIndex((s) => s.id === id);
      if (idx !== -1) allStaff[idx] = { ...allStaff[idx], ...updated };
      if (currentUser && currentUser.id === id) {
        Object.assign(currentUser, updated);
        updateNavUser();
        updateAdminPanelProfile();
      }
      showToast("Staff member updated!", "success");
    } else {
      if (!pw) {
        showToast("Please set a password for the new staff member.", "error");
        return;
      }
      payload.password = pw;
      const res = await fetch("tables/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      await requireApiSuccess(res, "The staff member could not be added.");
      const created = await res.json();
      allStaff.push(created);
      showToast("Staff member added!", "success");
    }
    closeModal("staff-form-modal");
    renderStaffGrid();
    renderOnlineStaff();
  } catch (err) {
    showToast(err.message || "Failed to save staff member.", "error");
  }
}

async function loadStaffLicenseOptions(selectedId = "") {
  const select = $("sf-license-id");
  if (!select || currentUser?.role !== "Super Admin") return;
  try {
    const response = await fetch("tables/licenses?limit=500&sort=created_at");
    await requireApiSuccess(response, "Licenses could not be loaded.");
    const data = await response.json();
    select.innerHTML =
      '<option value="">No assigned license</option>' +
      (data.data || [])
        .map(
          (license) =>
            `<option value="${license.id}">${license.business_name} — ${license.plan} (${license.status})</option>`,
        )
        .join("");
    staffLicenseCache = data.data || [];
    select.value = selectedId;
    applyLicensePermissionOptions(selectedId);
  } catch (error) {
    select.innerHTML = '<option value="">No assigned license</option>';
  }
}

/* ─── PERMISSIONS MODAL ─── */
function openPermissionsModal(staffId) {
  if (currentUser?.role !== "Super Admin") {
    showToast("Only Super Admin can manage permissions.", "error");
    return;
  }
  const s = allStaff.find((x) => x.id === staffId);
  if (!s) return;
  currentPermEditId = staffId;
  $("perm-modal-name").textContent = s.name;

  const perms = Array.isArray(s.permissions)
    ? s.permissions
    : s.permissions
      ? JSON.parse(s.permissions)
      : [];

  $("perm-modal-grid").innerHTML = Object.entries(PERM_MAP)
    .map(
      ([key, info]) => `
    <label class="perm-item-large">
      <input type="checkbox" value="${key}" ${perms.includes(key) ? "checked" : ""} />
      <i class="perm-icon fas ${info.icon}"></i>
      <div>
        <strong>${info.label}</strong>
        <span class="perm-desc">${info.desc}</span>
      </div>
    </label>
  `,
    )
    .join("");

  openModal("permissions-modal");
}

async function savePermissions() {
  if (!currentPermEditId) return;
  const s = allStaff.find((x) => x.id === currentPermEditId);
  if (!s) return;

  const newPerms = Array.from(
    document.querySelectorAll(
      '#perm-modal-grid input[type="checkbox"]:checked',
    ),
  ).map((cb) => cb.value);

  if (!newPerms.includes("dashboard")) newPerms.unshift("dashboard");

  try {
    const res = await fetch("tables/staff/" + currentPermEditId, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permissions: newPerms }),
    });
    const updated = await res.json();
    const idx = allStaff.findIndex((x) => x.id === currentPermEditId);
    if (idx !== -1) allStaff[idx] = { ...allStaff[idx], ...updated };

    // Update currentUser permissions if editing own account
    if (currentUser && currentUser.id === currentPermEditId) {
      currentUser.permissions = newPerms;
      applyPermissionVisibility();
    }

    renderStaffGrid();
    closeModal("permissions-modal");
    showToast("Permissions updated for " + s.name + "!", "success");
  } catch (err) {
    showToast("Failed to update permissions.", "error");
  }
}

/* ─── DELETE STAFF ─── */
function confirmDeleteStaff(staffId) {
  const s = allStaff.find((x) => x.id === staffId);
  if (!s) return;
  if (currentUser && currentUser.id === staffId) {
    showToast("You cannot delete your own account.", "error");
    return;
  }
  if (
    confirm(
      "Remove staff member: " + s.name + "? This action cannot be undone.",
    )
  ) {
    deleteStaff(staffId);
  }
}

async function deleteStaff(staffId) {
  try {
    await fetch("tables/staff/" + staffId, { method: "DELETE" });
    allStaff = allStaff.filter((s) => s.id !== staffId);
    renderStaffGrid();
    renderOnlineStaff();
    showToast("Staff member removed.", "success");
  } catch (err) {
    showToast("Failed to delete staff member.", "error");
  }
}
