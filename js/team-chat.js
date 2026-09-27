/* Staff access profiles stored in the shared Neon workspace. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  let lastProfileFingerprint = '';
  let staffListTimer = 0;
  let appliedAccess = '';

  function toast(message) {
    const el = $('toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(el._staffAccessTimer);
    el._staffAccessTimer = setTimeout(() => el.classList.remove('show'), 3500);
  }
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
  }
  function identity() {
    let permissions = [];
    try { permissions = JSON.parse(sessionStorage.getItem('fms_auth_permissions') || '[]'); } catch (_) {}
    return {
      role: sessionStorage.getItem('fms_auth_role') || 'staff',
      permissions: Array.isArray(permissions) ? permissions : [],
    };
  }
  function applyPermissions() {
    const user = identity();
    const isAdmin = user.role === 'admin';
    const allowed = new Set(user.permissions);
    const fingerprint = JSON.stringify({ role: user.role, permissions: user.permissions });
    document.querySelectorAll('.nav-link[data-view]').forEach(link => {
      const view = link.dataset.view;
      const show = isAdmin || allowed.has(view);
      const item = link.closest('li');
      if (item) item.style.display = show ? '' : 'none';
      const panel = $('view-' + view);
      if (panel) {
        if (!show) {
          panel.style.display = 'none';
          panel.classList.remove('active');
        } else {
          panel.style.display = '';
        }
      }
    });
    document.querySelectorAll('[data-view]').forEach(el => {
      if (el.classList.contains('nav-link')) return;
      const view = el.dataset.view;
      if (!view) return;
      el.hidden = !(isAdmin || allowed.has(view));
    });
    const card = $('staffAccessCard');
    if (card) card.style.display = isAdmin ? '' : 'none';
    const addBtn = $('addStaffBtn');
    if (addBtn) addBtn.style.display = isAdmin ? '' : 'none';
    const active = document.querySelector('.view.active');
    const needsSwitch = active && (active.style.display === 'none' || active.hidden);
    if (needsSwitch) {
      const first = isAdmin ? 'dashboard' : (user.permissions[0] || '');
      if (first && typeof window.fmsSwitchView === 'function') window.fmsSwitchView(first);
    }
    if (fingerprint !== appliedAccess) appliedAccess = fingerprint;
  }

  function profilesFingerprint(rows) {
    return JSON.stringify((rows || []).map(user => ([
      user.user_id, user.email, user.username, user.display_name, !!user.disabled, user.permissions || []
    ])));
  }

  async function renderStaffList(force) {
    const box = $('staffAccessList');
    if (!box) return;
    if (identity().role !== 'admin') {
      box.innerHTML = '';
      lastProfileFingerprint = '';
      return;
    }
    if (!window.FMSCloud || !FMSCloud.isConfigured || !FMSCloud.isConfigured()) {
      box.innerHTML = '<p class="staff-access-empty">Sign in to manage shared staff login accounts.</p>';
      return;
    }
    if (!box.dataset.ready) {
      box.innerHTML = '<p class="staff-access-empty">Loading workspace users…</p>';
    }
    try {
      const rows = await FMSCloud.listStaffProfiles();
      const next = profilesFingerprint(rows);
      if (!force && next === lastProfileFingerprint && box.dataset.ready) return;
      lastProfileFingerprint = next;
      box.dataset.ready = '1';
      if (!rows.length) {
        box.innerHTML = '<p class="staff-access-empty" style="padding:12px 0">No staff logins yet. Use Add Staff to create a username, password, role, and permissions.</p>';
        return;
      }
      box.innerHTML = rows.map(user => {
        const disabled = !!user.disabled;
        const username = user.username ? '@' + user.username + ' · ' : '';
        return `<div class="sa-row">
          <div class="sa-info"><span class="sa-name">${esc(user.display_name || user.email)}</span>
            <span class="sa-sub">${esc(username)}${esc(user.email)} · ${esc((user.permissions || []).join(', ') || 'no views')}</span></div>
          <div class="sa-actions"><span class="sa-status ${disabled ? 'disabled' : 'active'}">${disabled ? 'Disabled' : 'Active'}</span>
            <button class="sa-btn" data-act="toggle" data-id="${esc(user.user_id)}">${disabled ? 'Enable' : 'Disable'}</button>
            <button class="sa-btn danger" data-act="delete" data-id="${esc(user.user_id)}">Remove access</button></div>
        </div>`;
      }).join('');
    } catch (error) {
      box.innerHTML = `<p class="staff-access-empty">Could not load staff logins: ${esc(error.message || 'connection error')}</p>`;
    }
  }

  function scheduleStaffList() {
    clearTimeout(staffListTimer);
    staffListTimer = setTimeout(() => { renderStaffList(false); }, 250);
  }

  async function handleAction(event) {
    const button = event.target.closest('.sa-btn');
    if (!button) return;
    if (identity().role !== 'admin') return toast('Administrator access is required.');
    const userId = button.dataset.id;
    const action = button.dataset.act;
    if (action === 'delete' && !confirm('Remove this staff login from the shared FMS workspace? They will no longer be able to sign in.')) return;
    button.disabled = true;
    try {
      if (action === 'toggle') await FMSCloud.updateStaffProfile(userId, { disabled: button.textContent.trim() === 'Disable' });
      if (action === 'delete') await FMSCloud.removeStaffProfile(userId);
      await renderStaffList(true);
      toast(action === 'delete' ? 'Staff login removed.' : 'Staff login updated.');
    } catch (error) { toast(error.message || 'Could not update this staff login.'); }
    finally { button.disabled = false; }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const mount = $('staffAccessMount');
    const card = $('staffAccessCard');
    if (mount && card) mount.appendChild(card);
    applyPermissions();
    renderStaffList(true);
    const list = $('staffAccessList');
    if (list) list.addEventListener('click', handleAction);
    document.addEventListener('fms:permissions-updated', applyPermissions);
    document.addEventListener('fms:staff-accounts-changed', () => renderStaffList(true));
    document.addEventListener('fms:cloud-status', event => {
      if (event.detail && event.detail.connected) scheduleStaffList();
    });
    if (window.FMSDB) {
      FMSDB.on(change => {
        if (change.table === 'staff' || change.table === '*') scheduleStaffList();
      });
    }
  });

  window.FMSAccess = {
    apply: applyPermissions,
    identity,
    canOpen (view) {
      const user = identity();
      if (user.role === 'admin') return true;
      return user.permissions.indexOf(view) !== -1;
    }
  };
})();
