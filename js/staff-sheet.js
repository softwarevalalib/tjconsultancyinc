/* ============================================================
   js/staff-sheet.js — TJ Consultancy FMS
   Excel-style Staff Spreadsheet
   ============================================================
   • Admin creates staff with role, permissions, username, and password.
   • Accounts are stored in Neon (fms_users / fms_profiles).
   • Staff sign in with email or username and only see assigned views.
   • Spreadsheet re-renders only when the staff snapshot actually changes.
   ============================================================ */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);

  function canManageStaff () {
    try { return sessionStorage.getItem('fms_auth_role') === 'admin'; } catch (_) { return false; }
  }

  const COLS = [
    { k: 'name',     label: 'Full Name'  },
    { k: 'role',     label: 'Role'       },
    { k: 'dept',     label: 'Department' },
    { k: 'email',    label: 'Email'      },
    { k: 'username', label: 'Username'   },
    { k: 'password', label: 'Password'   },
    { k: 'status',   label: 'Status'     }
  ];

  const PERM_VIEWS = [
    { key: 'dashboard',  label: 'Dashboard'  },
    { key: 'reports',    label: 'Reports'    },
    { key: 'clients',    label: 'Clients'    },
    { key: 'staff',      label: 'Staff'      },
    { key: 'settings',   label: 'Settings'   }
  ];

  function permList (row) {
    const permissions = (Array.isArray(row.permissions) && row.permissions.length)
      ? row.permissions.slice()
      : ['dashboard'];
    return [...new Set(permissions.filter(permission => PERM_VIEWS.some(view => view.key === permission)))];
  }
  function hasPerm (row, key) { return permList(row).indexOf(key) !== -1; }
  function permCount (row) { return PERM_VIEWS.filter(v => hasPerm(row, v.key)).length; }

  function esc (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }
  function showToast (msg) {
    const t = $('toast'); if (!t) return;
    t.textContent = msg; t.classList.add('show');
    clearTimeout(t._sst); t._sst = setTimeout(() => t.classList.remove('show'), 3000);
  }
  function normalizeUsername (value) {
    return String(value || '').trim().toLowerCase();
  }
  function accountDisabled (row) {
    return String(row.status || '').toLowerCase() === 'on leave';
  }
  function snapshot (list) {
    return JSON.stringify((list || []).map(row => ({
      id: row._id,
      user_id: row.user_id || '',
      name: row.name || '',
      role: row.role || '',
      dept: row.dept || '',
      email: row.email || '',
      username: normalizeUsername(row.username),
      status: row.status || '',
      permissions: permList(row),
      locked: row._locked !== false
    })));
  }
  function notifyAccountsChanged () {
    try { document.dispatchEvent(new CustomEvent('fms:staff-accounts-changed')); } catch (_) {}
  }

  let rows = [];
  let editing = false;
  let lastSnapshot = '';
  const selectedStaffIds = new Set();

  function load () {
    if (window.FMSDB) rows = FMSDB.table('staff', []);
    else rows = [];
  }
  function persistable (row) {
    return {
      ...row,
      password: '',
      username: normalizeUsername(row.username),
      permissions: permList(row)
    };
  }
  function save () {
    if (window.FMSDB) {
      return FMSDB.set('staff', rows.map(persistable));
    }
    return true;
  }

  async function requireCloud () {
    if (!window.FMSCloud || !FMSCloud.isConfigured || !FMSCloud.isConfigured()) {
      throw new Error('Sign in as administrator to create staff login accounts.');
    }
    if (FMSCloud.ready) await FMSCloud.ready;
  }

  async function syncNeonAccount (row, password) {
    await requireCloud();
    const payload = {
      display_name: row.name,
      email: String(row.email || '').trim().toLowerCase(),
      username: normalizeUsername(row.username),
      permissions: permList(row),
      disabled: accountDisabled(row)
    };
    if (password) payload.password = password;
    if (row.user_id && typeof FMSCloud.updateStaffProfile === 'function') {
      await FMSCloud.updateStaffProfile(row.user_id, payload);
      return row.user_id;
    }
    const created = await FMSCloud.saveStaffProfile(payload);
    if (!created || !created.profile || !created.profile.user_id) {
      throw new Error('The staff login account could not be created.');
    }
    row.user_id = created.profile.user_id;
    if (created.profile.username) row.username = created.profile.username;
    return row.user_id;
  }

  async function revokeNeonAccount (row) {
    const userId = row && row.user_id;
    if (!userId || !window.FMSCloud || typeof FMSCloud.removeStaffProfile !== 'function') return;
    try { await FMSCloud.removeStaffProfile(userId); } catch (_) {}
  }

  function requiredText (value, label) {
    const text = String(value || '').trim();
    if (!text) throw new Error(label + ' is required.');
    return text;
  }

  /** Add Staff uses this shared method so the form and spreadsheet never diverge. */
  async function addStaffRecord (fields) {
    if (!canManageStaff()) throw new Error('Administrator access is required to create staff.');
    const name       = requiredText(fields.name, 'Full name');
    const role       = requiredText(fields.role, 'Role');
    const dept       = requiredText(fields.dept, 'Department');
    const email      = requiredText(fields.email, 'Email').toLowerCase();
    const username   = normalizeUsername(requiredText(fields.username, 'Username'));
    const password   = String(fields.password || '');
    const status     = requiredText(fields.status, 'Status');
    const permissions = Array.isArray(fields.permissions) ? fields.permissions.slice() : [];

    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Enter a valid email address.');
    if (!/^[a-z0-9._-]{3,40}$/.test(username)) throw new Error('Username must be 3–40 characters using letters, numbers, dots, hyphens, or underscores.');
    if (password.length < 6) throw new Error('Password must be at least 6 characters.');
    if (!permissions.length) throw new Error('Choose at least one permission.');
    if (rows.some(row => normalizeUsername(row.username) === username)) {
      throw new Error('That username is already in use.');
    }
    if (rows.some(row => String(row.email || '').toLowerCase() === email)) {
      throw new Error('That email is already in use.');
    }

    const row = {
      _id: window.FMSDB ? FMSDB.uid('stf-') : 'stf-' + Date.now(),
      name, role, dept, email, username, password: '', status, permissions,
      _locked: true
    };
    await syncNeonAccount(row, password);
    rows.unshift(row);
    if (!save()) {
      rows.shift();
      throw new Error('The staff record could not be saved.');
    }
    render(true);
    notifyAccountsChanged();
    return persistable(row);
  }

  function reconcileSelection () {
    const existing = new Set(rows.map(row => String(row._id)));
    selectedStaffIds.forEach(id => {
      if (!existing.has(String(id))) selectedStaffIds.delete(id);
    });
  }

  function updateSelectionControls () {
    const selectAll = $('staffSelectAll');
    const deleteBtn = $('staffBulkDeleteBtn');
    const selectedCount = rows.filter(row => selectedStaffIds.has(String(row._id))).length;

    if (selectAll) {
      selectAll.checked = rows.length > 0 && selectedCount === rows.length;
      selectAll.indeterminate = selectedCount > 0 && selectedCount < rows.length;
      selectAll.disabled = rows.length === 0 || !canManageStaff();
    }
    if (deleteBtn) {
      deleteBtn.disabled = !canManageStaff() || selectedCount === 0;
      deleteBtn.innerHTML = `<i class="fas fa-trash"></i> Delete Selected${selectedCount ? ` (${selectedCount})` : ''}`;
      deleteBtn.title = selectedCount
        ? `Delete ${selectedCount} selected staff record${selectedCount === 1 ? '' : 's'}`
        : 'Select one or more staff records first';
    }
  }

  async function deleteSelectedStaff () {
    if (!canManageStaff()) { showToast('Administrator access is required to delete staff.'); return; }
    reconcileSelection();
    const selectedRows = rows.filter(row => selectedStaffIds.has(String(row._id)));
    if (!selectedRows.length) { showToast('Select one or more staff records first.'); return; }

    const count = selectedRows.length;
    const recordLabel = count === 1 ? 'staff record and its login access' : `${count} staff records and their login access`;
    if (!confirm(`Delete ${recordLabel}? This action removes the selected records immediately.`)) return;

    const remaining = rows.filter(row => !selectedStaffIds.has(String(row._id)));
    const previous = rows.slice();
    rows = remaining;
    if (!save()) {
      rows = previous;
      reconcileSelection();
      render(true);
      showToast('The selected staff records could not be deleted.');
      return;
    }
    await Promise.all(selectedRows.map(row => revokeNeonAccount(row)));
    selectedStaffIds.clear();
    render(true);
    notifyAccountsChanged();
    showToast(`${count} staff record${count === 1 ? '' : 's'} and login access deleted.`);
  }

  function render (force) {
    const tbody = $('staffSheetBody');
    if (!tbody) return;
    if (editing && !force) return;
    reconcileSelection();
    const next = snapshot(rows);
    if (!force && next === lastSnapshot && tbody.children.length) {
      updateSelectionControls();
      return;
    }
    lastSnapshot = next;
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="${COLS.length + 4}" class="empty-state">No staff records yet. Use Add Staff to create one.</td></tr>`;
      updateSelectionControls();
      return;
    }
    const manage = canManageStaff();
    tbody.innerHTML = rows.map((r, i) => {
      const locked = r._locked !== false;
      const selected = selectedStaffIds.has(String(r._id));
      return `
      <tr data-id="${esc(r._id)}" class="${locked ? 'row-locked' : 'row-editing'}${selected ? ' sheet-row-selected' : ''}">
        <td class="sheet-select-cell"><input class="staff-row-select" type="checkbox" data-select="${esc(r._id)}" aria-label="Select ${esc(r.name || 'staff member')}"${selected ? ' checked' : ''}${manage ? '' : ' disabled'}></td>
        <td class="sheet-rownum">${i + 1}</td>
        ${COLS.map(c => {
          const value = c.k === 'password' ? '' : (r[c.k] == null ? '' : r[c.k]);
          const editable = manage && !locked && c.k !== 'password' ? 'true' : (manage && !locked && c.k === 'password' ? 'true' : 'false');
          return `<td class="sheet-cell${locked || !manage ? ' locked' : ''}" contenteditable="${editable}" data-key="${c.k}" spellcheck="false">${esc(value)}</td>`;
        }).join('')}
        <td class="sheet-perms">
          <details class="perm-dd">
            <summary title="View access granted to this staff member">${permCount(r)} view${permCount(r) === 1 ? '' : 's'}</summary>
            <div class="perm-dd-menu">
              ${PERM_VIEWS.map(v => `<label class="perm-dd-item"><input type="checkbox" data-perm="${v.key}" ${hasPerm(r, v.key) ? 'checked' : ''}${manage ? '' : ' disabled'}/> ${v.label}</label>`).join('')}
            </div>
          </details>
        </td>
        <td class="sheet-actions">
          ${manage ? `<button class="sheet-edit" data-edit="${esc(r._id)}" title="${locked ? 'Edit this row' : 'Save changes'}"><i class="fas fa-${locked ? 'pen' : 'floppy-disk'}"></i> ${locked ? 'Edit' : 'Save'}</button>` : ''}
        </td>
      </tr>`;
    }).join('');
    updateSelectionControls();
  }

  function initEvents () {
    const tbody = $('staffSheetBody');
    if (!tbody) return;

    tbody.addEventListener('focusin', e => { if (e.target.classList.contains('sheet-cell')) editing = true; });

    tbody.addEventListener('keydown', e => {
      if (e.target.classList.contains('sheet-cell') && e.key === 'Enter') {
        e.preventDefault(); e.target.blur();
      }
    });

    tbody.addEventListener('focusout', e => {
      const cell = e.target.closest ? e.target.closest('.sheet-cell') : null;
      if (!cell || cell.classList.contains('locked')) return;
      editing = false;
      const tr  = cell.closest('tr');
      const id  = tr && tr.dataset.id;
      const key = cell.dataset.key;
      const row = rows.find(r => r._id === id);
      if (!row || !key) return;
      const val = cell.textContent.trim();
      if (key === 'password') {
        if (!val) return;
        if (val.length < 6) { showToast('Password must be at least 6 characters.'); cell.textContent = ''; return; }
        syncNeonAccount(row, val).then(() => {
          cell.textContent = '';
          notifyAccountsChanged();
          showToast('Login password updated for ' + (row.username || row.name) + '.');
        }).catch(error => showToast(error.message || 'Could not update this login.'));
        return;
      }
      if (String(row[key] || '') === val) return;
      if (key === 'username') {
        const username = normalizeUsername(val);
        if (!/^[a-z0-9._-]{3,40}$/.test(username)) { showToast('Enter a valid username.'); cell.textContent = row.username || ''; return; }
        row.username = username;
      } else {
        row[key] = val;
      }
      save();
      if (row.user_id) {
        syncNeonAccount(row).then(() => notifyAccountsChanged()).catch(error => {
          showToast(error.message || 'Could not update this login.');
        });
      }
      showToast('Saved.');
    });

    tbody.addEventListener('click', e => {
      const edit = e.target.closest('.sheet-edit');
      if (edit) {
        if (!canManageStaff()) return;
        const row = rows.find(r => r._id === edit.dataset.edit);
        if (!row) return;
        row._locked = !(row._locked !== false);
        save(); render(true);
        if (row._locked === false) {
          const tr    = tbody.querySelector('tr[data-id="' + row._id + '"]');
          const first = tr && tr.querySelector('.sheet-cell');
          if (first) first.focus();
          showToast('Editing row — change the fields, then click Save.');
        } else {
          syncNeonAccount(row).then(() => notifyAccountsChanged()).catch(error => {
            showToast(error.message || 'Could not update this login.');
          });
          showToast('Row saved.');
        }
      }
    });

    tbody.addEventListener('change', e => {
      const select = e.target.closest ? e.target.closest('.staff-row-select') : null;
      if (select) {
        const id = String(select.dataset.select || '');
        if (select.checked) selectedStaffIds.add(id);
        else selectedStaffIds.delete(id);
        const tr = select.closest('tr');
        if (tr) tr.classList.toggle('sheet-row-selected', select.checked);
        updateSelectionControls();
        return;
      }
      const cb = e.target.closest ? e.target.closest('input[data-perm]') : null;
      if (!cb) return;
      if (!canManageStaff()) return;
      const tr  = cb.closest('tr');
      const row = rows.find(r => r._id === (tr && tr.dataset.id));
      if (!row) return;
      const list = permList(row);
      const idx  = list.indexOf(cb.dataset.perm);
      if (cb.checked && idx === -1) list.push(cb.dataset.perm);
      if (!cb.checked && idx !== -1) list.splice(idx, 1);
      row.permissions = list;
      save();
      syncNeonAccount(row).then(() => notifyAccountsChanged()).catch(error => {
        showToast(error.message || 'Could not update permissions.');
      });
      render(true);
    });

    const selectAll = $('staffSelectAll');
    if (selectAll) selectAll.addEventListener('change', () => {
      if (selectAll.checked) rows.forEach(row => selectedStaffIds.add(String(row._id)));
      else selectedStaffIds.clear();
      render(true);
    });

    const deleteBtn = $('staffBulkDeleteBtn');
    if (deleteBtn) deleteBtn.addEventListener('click', () => { deleteSelectedStaff(); });

    const csvBtn = $('staffSheetExportBtn');
    if (csvBtn) csvBtn.addEventListener('click', () => {
      const head = COLS.filter(c => c.k !== 'password').map(c => c.label).join(',');
      const body = rows.map(r => COLS.filter(c => c.k !== 'password').map(c => '"' + String(r[c.k] || '').replace(/"/g, '""') + '"').join(',')).join('\n');
      const blob = new Blob([head + '\n' + body], { type: 'text/csv' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = 'TJ_FMS_Staff_' + new Date().toISOString().slice(0, 10) + '.csv';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Staff sheet exported as CSV.');
    });
  }

  function initRealtime () {
    if (!window.FMSDB) return;
    FMSDB.on(d => {
      if (d.table !== 'staff' && d.table !== '*') return;
      if (editing) return;
      rows = FMSDB.table('staff');
      render(false);
    });
  }

  function boot () {
    if (!$('staffSheetBody')) return;
    const grid = $('staffGrid');
    if (grid) grid.style.display = 'none';
    load(); render(true); initEvents(); initRealtime();
  }

  window.StaffSheetAPI = { addStaff: addStaffRecord };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
