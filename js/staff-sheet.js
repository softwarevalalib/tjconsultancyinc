/* ============================================================
   js/staff-sheet.js — TJ Consultancy FMS
   Excel-style Staff Spreadsheet
   ============================================================
   • The Staff dashboard renders as an editable spreadsheet.
   • Click any cell to edit — saves automatically on blur/Enter.
   • Username + Password columns create a REAL working login
     (SHA-256 hashed into fms_staff_accounts_v1 — the same store
     the sign-in page authenticates against).
   • All rows persist in the FMS database (FMSDB table 'staff')
     and sync across tabs in real time.
   • Export the sheet to CSV with one click.
   ============================================================ */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const STAFF_KEY = 'fms_staff_accounts_v1';

  function canDeleteRecords () {
    return !!(window.FMSDB && typeof FMSDB.canDelete === 'function' && FMSDB.canDelete());
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

  /* Views a staff member can be granted (row-level permissions) */
  const PERM_VIEWS = [
    { key: 'dashboard',  label: 'Dashboard'  },
    { key: 'reports',    label: 'Reports'    },
    { key: 'clients',    label: 'Clients'    },
    { key: 'inventory',  label: 'Inventory'  },
    { key: 'staff',      label: 'Staff'      },
    { key: 'settings',   label: 'Settings'   }
  ];

  function permList (row) {
    const permissions = (Array.isArray(row.permissions) && row.permissions.length)
      ? row.permissions.slice()
      : ['dashboard', 'inventory'];
    return [...new Set(permissions
      .map(permission => permission === 'activities' ? 'inventory' : permission)
      .filter(permission => permission !== 'chat'))];
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

  /* ── seed from the built-in staff directory (first run only) ── */
  function seedRows () {
    const base = (window.FMS && FMS.data && FMS.data.staff) || [];
    return base.map(s => ({
      _id: 'stf-' + s.id, name: s.name, role: s.role, dept: s.dept,
      email: s.email, username: '', password: '', status: s.status,
      _locked: true, permissions: ['dashboard', 'inventory']
    }));
  }

  let rows = [];
  let editing = false;
  const selectedStaffIds = new Set();

  function load () {
    if (window.FMSDB) rows = FMSDB.table('staff', seedRows());
    else rows = seedRows();
  }
  function save () {
    /* FMSDB keeps the active table as a live array. Pass a fresh copy here:
       otherwise replacing the table in place would clear the same `rows`
       array before it is copied back, making a newly added staff member
       disappear from Staff Management. */
    if (window.FMSDB) {
      return FMSDB.set('staff', rows.map(row => ({
        ...row,
        permissions: Array.isArray(row.permissions) ? row.permissions.slice() : []
      })));
    }
    return true;
  }

  /* ── staff login account sync ────────────────────────────── */
  function getAccounts () {
    try { const v = JSON.parse(localStorage.getItem(STAFF_KEY) || '[]'); return Array.isArray(v) ? v : []; }
    catch (_) { return []; }
  }
  function saveAccounts (l) { try { localStorage.setItem(STAFF_KEY, JSON.stringify(l)); } catch (_) {} }
  function accountStatus (row) {
    return String(row.status || '').toLowerCase() === 'on leave' ? 'disabled' : 'active';
  }

  function revokeAccount (username) {
    const un = String(username || '').trim().toLowerCase();
    if (!un) return;
    const accounts = getAccounts();
    const remaining = accounts.filter(a => String(a.username || '').toLowerCase() !== un);
    if (remaining.length !== accounts.length) saveAccounts(remaining);
  }

  async function syncAccount (row) {
    const un = (row.username || '').trim();
    if (!un) return;
    const accounts = getAccounts();
    const existing = accounts.find(a => String(a.username).toLowerCase() === un.toLowerCase());
    if (row.password && row.password.length >= 6) {
      const hash = await FMSSha256(row.password);
      if (existing) {
        existing.name = row.name || existing.name;
        existing.passwordHash = hash;             /* password set / reset */
        existing.permissions  = permList(row);    /* row-level permissions */
        existing.status       = accountStatus(row);
      } else {
        accounts.push({
          id: 'staff-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          name: row.name || un, username: un, passwordHash: hash,
          permissions: permList(row), status: accountStatus(row), created: Date.now()
        });
      }
      saveAccounts(accounts);
      showToast('Login access saved for ' + un + '.');
    } else if (existing) {
      let changed = false;
      if (row.name && existing.name !== row.name) { existing.name = row.name; changed = true; }
      const perms = permList(row);
      if (JSON.stringify(existing.permissions || []) !== JSON.stringify(perms)) { existing.permissions = perms; changed = true; }
      const status = accountStatus(row);
      if (existing.status !== status) { existing.status = status; changed = true; }
      if (changed) { saveAccounts(accounts); showToast('Permissions updated for ' + un + '.'); }
    }
  }

  function requiredText (value, label) {
    const text = String(value || '').trim();
    if (!text) throw new Error(label + ' is required.');
    return text;
  }

  /** Add Staff uses this shared method so the form and spreadsheet never diverge. */
  async function addStaffRecord (fields) {
    const name       = requiredText(fields.name, 'Full name');
    const role       = requiredText(fields.role, 'Role');
    const dept       = requiredText(fields.dept, 'Department');
    const email      = requiredText(fields.email, 'Email');
    const username   = requiredText(fields.username, 'Username');
    const password   = String(fields.password || '');
    const status     = requiredText(fields.status, 'Status');
    const permissions = Array.isArray(fields.permissions) ? fields.permissions.slice() : [];

    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Enter a valid email address.');
    if (password.length < 6) throw new Error('Password must be at least 6 characters.');
    if (!permissions.length) throw new Error('Choose at least one permission.');
    if (rows.some(row => String(row.username || '').toLowerCase() === username.toLowerCase())) {
      throw new Error('That username is already in use.');
    }

    const row = {
      _id: window.FMSDB ? FMSDB.uid('stf-') : 'stf-' + Date.now(),
      name, role, dept, email, username, password, status, permissions,
      _locked: true
    };
    rows.unshift(row);
    save();
    await syncAccount(row);
    render();
    return row;
  }

  /* ── render ──────────────────────────────────────────────── */
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
      selectAll.disabled = rows.length === 0;
    }
    if (deleteBtn) {
      deleteBtn.disabled = !canDeleteRecords() || selectedCount === 0;
      deleteBtn.innerHTML = `<i class="fas fa-trash"></i> Delete Selected${selectedCount ? ` (${selectedCount})` : ''}`;
      deleteBtn.title = selectedCount
        ? `Delete ${selectedCount} selected staff record${selectedCount === 1 ? '' : 's'}`
        : 'Select one or more staff records first';
    }
  }

  function deleteSelectedStaff () {
    if (!canDeleteRecords()) { showToast('Sign in to delete staff records.'); return; }
    reconcileSelection();
    const selectedRows = rows.filter(row => selectedStaffIds.has(String(row._id)));
    if (!selectedRows.length) { showToast('Select one or more staff records first.'); return; }

    const count = selectedRows.length;
    const recordLabel = count === 1 ? 'staff record and its login access' : `${count} staff records and their login access`;
    if (!confirm(`Delete ${recordLabel}? This action removes the selected records immediately.`)) return;

    rows = rows.filter(row => !selectedStaffIds.has(String(row._id)));
    if (!save()) {
      load();
      reconcileSelection();
      render();
      showToast('The selected staff records could not be deleted.');
      return;
    }
    selectedRows.forEach(row => revokeAccount(row.username));
    selectedStaffIds.clear();
    render();
    showToast(`${count} staff record${count === 1 ? '' : 's'} and login access deleted.`);
  }

  function render () {
    const tbody = $('staffSheetBody');
    if (!tbody) return;
    reconcileSelection();
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="${COLS.length + 4}" class="empty-state">No staff records yet. Use Add Staff to create one.</td></tr>`;
      updateSelectionControls();
      return;
    }
    tbody.innerHTML = rows.map((r, i) => {
      const locked = r._locked !== false;
      const selected = selectedStaffIds.has(String(r._id));
      return `
      <tr data-id="${esc(r._id)}" class="${locked ? 'row-locked' : 'row-editing'}${selected ? ' sheet-row-selected' : ''}">
        <td class="sheet-select-cell"><input class="staff-row-select" type="checkbox" data-select="${esc(r._id)}" aria-label="Select ${esc(r.name || 'staff member')}"${selected ? ' checked' : ''}></td>
        <td class="sheet-rownum">${i + 1}</td>
        ${COLS.map(c => `<td class="sheet-cell${locked ? ' locked' : ''}" contenteditable="${locked ? 'false' : 'true'}" data-key="${c.k}" spellcheck="false">${esc(r[c.k])}</td>`).join('')}
        <td class="sheet-perms">
          <details class="perm-dd">
            <summary title="View access granted to this staff member">${permCount(r)} view${permCount(r) === 1 ? '' : 's'}</summary>
            <div class="perm-dd-menu">
              ${PERM_VIEWS.map(v => `<label class="perm-dd-item"><input type="checkbox" data-perm="${v.key}" ${hasPerm(r, v.key) ? 'checked' : ''}/> ${v.label}</label>`).join('')}
            </div>
          </details>
        </td>
        <td class="sheet-actions">
          <button class="sheet-edit" data-edit="${esc(r._id)}" title="${locked ? 'Edit this row' : 'Save changes'}"><i class="fas fa-${locked ? 'pen' : 'floppy-disk'}"></i> ${locked ? 'Edit' : 'Save'}</button>
        </td>
      </tr>`;
    }).join('');
    updateSelectionControls();
  }

  /* ── events ──────────────────────────────────────────────── */
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
      if (row[key] === val) return;
      row[key] = val;
      save();
      if (key === 'username' || key === 'password' || key === 'name' || key === 'status') syncAccount(row);
      showToast('Saved.');
    });

    tbody.addEventListener('click', e => {
      /* Edit-field button: unlock the row for editing, then Save */
      const edit = e.target.closest('.sheet-edit');
      if (edit) {
        const row = rows.find(r => r._id === edit.dataset.edit);
        if (!row) return;
        row._locked = !(row._locked !== false);
        save(); render();
        if (row._locked === false) {
          const tr    = tbody.querySelector('tr[data-id="' + row._id + '"]');
          const first = tr && tr.querySelector('.sheet-cell');
          if (first) first.focus();
          showToast('Editing row — change the fields, then click Save.');
        } else {
          syncAccount(row);
          showToast('Row saved.');
        }
      }
    });

    /* Row-level permission toggles — take effect for that staff login */
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
      const tr  = cb.closest('tr');
      const row = rows.find(r => r._id === (tr && tr.dataset.id));
      if (!row) return;
      const list = permList(row);
      const idx  = list.indexOf(cb.dataset.perm);
      if (cb.checked && idx === -1) list.push(cb.dataset.perm);
      if (!cb.checked && idx !== -1) list.splice(idx, 1);
      row.permissions = list;
      save();
      syncAccount(row);
      render();
    });

    const selectAll = $('staffSelectAll');
    if (selectAll) selectAll.addEventListener('change', () => {
      if (selectAll.checked) rows.forEach(row => selectedStaffIds.add(String(row._id)));
      else selectedStaffIds.clear();
      render();
    });

    const deleteBtn = $('staffBulkDeleteBtn');
    if (deleteBtn) deleteBtn.addEventListener('click', deleteSelectedStaff);

    const csvBtn = $('staffSheetExportBtn');
    if (csvBtn) csvBtn.addEventListener('click', () => {
      const head = COLS.map(c => c.label).join(',');
      const body = rows.map(r => COLS.map(c => '"' + String(r[c.k] || '').replace(/"/g, '""') + '"').join(',')).join('\n');
      const blob = new Blob([head + '\n' + body], { type: 'text/csv' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = 'TJ_FMS_Staff_' + new Date().toISOString().slice(0, 10) + '.csv';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Staff sheet exported as CSV.');
    });
  }

  /* ── real-time: re-render when another tab changes staff ── */
  function initRealtime () {
    if (window.FMSDB) FMSDB.on(d => {
      if (d.table === 'staff' && !editing) { rows = FMSDB.table('staff'); render(); }
    });
  }

  function boot () {
    if (!$('staffSheetBody')) return;
    /* Spreadsheet replaces the old card grid as the staff dashboard */
    const grid = $('staffGrid');
    if (grid) grid.style.display = 'none';
    load(); render(); initEvents(); initRealtime();
  }

  window.StaffSheetAPI = { addStaff: addStaffRecord };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
