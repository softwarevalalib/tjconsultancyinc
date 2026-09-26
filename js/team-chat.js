/* ============================================================
   js/team-chat.js — TJ Consultancy FMS Staff Access
   Staff Login Management (100% local)
   ============================================================
   • Admin can create staff logins with granted permissions
     (localStorage: fms_staff_accounts_v1, SHA-256 password hashes)
   • Enforces per-staff view permissions by hiding unauthorised
     sidebar links and views.
   ============================================================ */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);

  const STAFF_KEY = 'fms_staff_accounts_v1';
  const staffBC   = ('BroadcastChannel' in window) ? new BroadcastChannel('fms_staff_access') : null;

  /* ── helpers ─────────────────────────────────────────────── */
  function lsGet (k, f) { try { const v = localStorage.getItem(k); return v === null ? f : v; } catch (_) { return f; } }
  function lsSet (k, v) { try { localStorage.setItem(k, v); } catch (_) {} }

  function showToast (msg) {
    const t = $('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._tcTimer);
    t._tcTimer = setTimeout(() => t.classList.remove('show'), 3000);
  }

  function escapeHtml (s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function uid (prefix) {
    return (prefix || 'id-') + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  /* ── current session identity ────────────────────────────── */
  function currentIdentity () {
    let perms = [];
    try { perms = JSON.parse(sessionStorage.getItem('fms_auth_permissions') || '[]'); } catch (_) {}
    return {
      name: sessionStorage.getItem('fms_auth_user') || lsGet('fms_display_name', 'User'),
      role: sessionStorage.getItem('fms_auth_role') || 'admin',
      permissions: Array.isArray(perms)
        ? perms.map(permission => permission === 'activities' ? 'inventory' : permission).filter(permission => permission !== 'chat')
        : []
    };
  }

  /* ============================================================
     1. PERMISSION ENFORCEMENT (staff see only granted views)
     ============================================================ */
  function applyPermissions () {
    const me = currentIdentity();
    if (me.role === 'admin') return; /* admin sees everything */

    document.querySelectorAll('.nav-link').forEach(a => {
      const v = a.dataset.view;
      if (!v) return;
      if (me.permissions.indexOf(v) === -1) {
        const li = a.closest('li');
        if (li) li.style.display = 'none';
        const sec = $('view-' + v);
        if (sec) { sec.style.display = 'none'; sec.classList.remove('active'); }
      }
    });

    /* Staff cannot manage staff access */
    const card = $('staffAccessCard');
    if (card) card.style.display = 'none';

    /* If the currently active view is not permitted, jump to first granted view */
    const active = document.querySelector('.view.active');
    if (active && active.style.display === 'none' && me.permissions.length) {
      if (typeof window.fmsSwitchView === 'function') {
        window.fmsSwitchView(me.permissions[0]);
      }
    }
  }

  /* ============================================================
     2. STAFF LOGIN MANAGEMENT (admin only)
     ============================================================ */
  function getStaff () {
    try { const s = JSON.parse(lsGet(STAFF_KEY, '[]')); return Array.isArray(s) ? s : []; }
    catch (_) { return []; }
  }
  function saveStaff (list) {
    lsSet(STAFF_KEY, JSON.stringify(list));
    if (staffBC) { try { staffBC.postMessage({ staff: true, at: Date.now() }); } catch (_) {} }
  }

  function selectedPerms () {
    const wrap = $('saPerms');
    if (!wrap) return [];
    return Array.from(wrap.querySelectorAll('input[type="checkbox"]:checked')).map(c => c.value);
  }

  async function createStaff () {
    if (currentIdentity().role !== 'admin') { showToast('Only the admin can create staff logins.'); return; }

    const name = ($('saName') || {}).value || '';
    const username = ($('saUsername') || {}).value || '';
    const password = ($('saPassword') || {}).value || '';
    const perms = selectedPerms();

    if (!name.trim())            { showToast('Enter the staff member\u2019s full name.'); return; }
    if (username.trim().length < 3) { showToast('Username must be at least 3 characters.'); return; }
    if (password.length < 6)     { showToast('Password must be at least 6 characters.'); return; }
    if (!perms.length)           { showToast('Grant at least one permission.'); return; }

    const u = username.trim().toLowerCase();
    if (u === 'admin@tjconsultancyinc.com') { showToast('That username is reserved for the admin.'); return; }
    if (getStaff().some(s => String(s.username).toLowerCase() === u)) {
      showToast('A staff login with that username already exists.');
      return;
    }

    const hash = await FMSSha256(password);
    const list = getStaff();
    list.push({
      id: uid('staff-'),
      name: name.trim(),
      username: username.trim(),
      passwordHash: hash,
      permissions: perms,
      status: 'active',
      created: Date.now()
    });
    saveStaff(list);

    $('saName').value = ''; $('saUsername').value = ''; $('saPassword').value = '';
    renderStaffList();
    showToast('Staff login created for ' + name.trim() + '.');
  }

  function renderStaffList () {
    const box = $('staffAccessList');
    if (!box) return;
    const list = getStaff();
    if (!list.length) {
      box.innerHTML = '<p class="staff-access-empty" style="padding:12px 0">No staff logins created yet.</p>';
      return;
    }
    box.innerHTML = list.map(s => {
      const disabled = s.status === 'disabled';
      return '<div class="sa-row">' +
        '<div class="sa-info">' +
          '<span class="sa-name">' + escapeHtml(s.name) + '</span>' +
          '<span class="sa-sub">@' + escapeHtml(s.username) + ' · ' + escapeHtml((s.permissions || []).join(', ')) + '</span>' +
        '</div>' +
        '<div class="sa-actions">' +
          '<span class="sa-status ' + (disabled ? 'disabled' : 'active') + '">' + (disabled ? 'Disabled' : 'Active') + '</span>' +
          '<button class="sa-btn" data-act="resetpw" data-id="' + s.id + '"><i class="fas fa-key"></i> Reset Password</button>' +
          '<button class="sa-btn" data-act="toggle" data-id="' + s.id + '">' + (disabled ? 'Enable' : 'Disable') + '</button>' +
          '<button class="sa-btn danger" data-act="delete" data-id="' + s.id + '">Delete</button>' +
        '</div></div>';
    }).join('');
  }

  function handleStaffAction (e) {
    const btn = e.target.closest('.sa-btn');
    if (!btn) return;
    if (currentIdentity().role !== 'admin') { showToast('Only the admin can manage staff logins.'); return; }
    const id = btn.dataset.id;
    const act = btn.dataset.act;
    let list = getStaff();
    const s = list.find(x => x.id === id);
    if (!s) return;
    if (act === 'resetpw') {
      /* Admin resets the password of any staff user */
      const np = prompt('Set a new password for ' + s.name + ' (minimum 6 characters):');
      if (np === null) return;
      if (np.length < 6) { showToast('Password must be at least 6 characters.'); return; }
      FMSSha256(np).then(h => {
        s.passwordHash = h;
        /* staff rows only store this login — keep the sheet in sync */
        saveStaff(list);
        /* clear any forced-change flag so the new password works immediately */
        try {
          const rows = JSON.parse(localStorage.getItem('fmsdb_staff') || '[]');
          if (Array.isArray(rows)) {
            let touched = false;
            rows.forEach(r => {
              if (String(r.username || '').toLowerCase() === String(s.username || '').toLowerCase()) {
                r.password = ''; r._locked = true; touched = true;
              }
            });
            if (touched && window.FMSDB) FMSDB.set('staff', rows);
          }
        } catch (_) {}
        showToast('Password reset for ' + s.name + '. They can sign in with the new password now.');
      });
      return;
    }
    if (act === 'toggle') {
      s.status = s.status === 'disabled' ? 'active' : 'disabled';
      saveStaff(list);
      showToast(s.name + ' ' + (s.status === 'disabled' ? 'disabled.' : 'enabled.'));
    } else if (act === 'delete') {
      if (!confirm('Delete staff login for ' + s.name + '?')) return;
      list = list.filter(x => x.id !== id);
      saveStaff(list);
      showToast('Staff login deleted.');
    }
    renderStaffList();
  }

  /* ============================================================
     INIT
     ============================================================ */
  document.addEventListener('DOMContentLoaded', function () {
    /* Team Chat is retired: remove its obsolete local-only conversation data. */
    try {
      localStorage.removeItem('fms_team_chat_v1');
      localStorage.removeItem('fms_comm_notes_v1');
    } catch (_) {}

    // Staff Access belongs in Staff Management.
    const accessMount = $('staffAccessMount');
    const accessCard = $('staffAccessCard');
    if (accessMount && accessCard) accessMount.appendChild(accessCard);

    applyPermissions();
    renderStaffList();

    window.addEventListener('storage', e => {
      if (e.key === STAFF_KEY) { renderStaffList(); applyPermissions(); }
    });
    if (staffBC) staffBC.onmessage = () => { renderStaffList(); applyPermissions(); };
    if (window.FMSDB) FMSDB.on(d => { if (d.table === '*') { renderStaffList(); applyPermissions(); } });

    const createBtn = $('saCreateBtn');
    if (createBtn) createBtn.addEventListener('click', createStaff);
    const listBox = $('staffAccessList');
    if (listBox) listBox.addEventListener('click', handleStaffAction);
  });

})();
