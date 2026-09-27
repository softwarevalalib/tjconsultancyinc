/* Apply assigned sidebar and dashboard access for the signed-in user. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  let appliedAccess = '';

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
    const addBtn = $('addStaffBtn');
    if (addBtn) addBtn.style.display = isAdmin ? '' : 'none';
    if (fingerprint === appliedAccess) return;
    appliedAccess = fingerprint;
    const active = document.querySelector('.view.active');
    const needsSwitch = active && (active.style.display === 'none' || active.hidden);
    if (needsSwitch) {
      const first = isAdmin ? 'dashboard' : (user.permissions[0] || '');
      if (first && typeof window.fmsSwitchView === 'function') window.fmsSwitchView(first);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    applyPermissions();
    document.addEventListener('fms:permissions-updated', applyPermissions);
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
