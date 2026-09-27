/* Staff access profiles stored in the shared Neon workspace. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);

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
  function selectedPermissions() {
    const wrap = $('saPerms');
    return wrap ? Array.from(wrap.querySelectorAll('input[type="checkbox"]:checked')).map(input => input.value) : [];
  }
  function applyPermissions() {
    const user = identity();
    if (user.role === 'admin') return;
    const sharedDataViews = new Set(['clients', 'loans']);
    document.querySelectorAll('.nav-link[data-view]').forEach(link => {
      const view = link.dataset.view;
      if (user.permissions.includes(view) || sharedDataViews.has(view)) return;
      const item = link.closest('li');
      if (item) item.style.display = 'none';
      const panel = $('view-' + view);
      if (panel) { panel.style.display = 'none'; panel.classList.remove('active'); }
    });
    const card = $('staffAccessCard');
    if (card) card.style.display = 'none';
    const active = document.querySelector('.view.active');
    if (active && active.style.display === 'none' && user.permissions.length && typeof window.fmsSwitchView === 'function') {
      window.fmsSwitchView(user.permissions[0]);
    }
  }

  async function renderStaffList() {
    const box = $('staffAccessList');
    if (!box) return;
    if (!window.FMSCloud || !FMSCloud.isConfigured || !FMSCloud.isConfigured()) {
      box.innerHTML = '<p class="staff-access-empty">Connect Supabase Auth and Neon to manage shared staff access.</p>';
      return;
    }
    box.innerHTML = '<p class="staff-access-empty">Loading Neon workspace users...</p>';
    try {
      const rows = await FMSCloud.listStaffProfiles();
      if (!rows.length) {
        box.innerHTML = '<p class="staff-access-empty" style="padding:12px 0">No staff profiles have been assigned yet. Create their Supabase Auth account, then add them here.</p>';
        return;
      }
      box.innerHTML = rows.map(user => {
        const disabled = !!user.disabled;
        return `<div class="sa-row">
          <div class="sa-info"><span class="sa-name">${esc(user.display_name || user.email)}</span>
            <span class="sa-sub">${esc(user.email)} · ${esc((user.permissions || []).join(', '))}</span></div>
          <div class="sa-actions"><span class="sa-status ${disabled ? 'disabled' : 'active'}">${disabled ? 'Disabled' : 'Active'}</span>
            <button class="sa-btn" data-act="toggle" data-id="${esc(user.user_id)}">${disabled ? 'Enable' : 'Disable'}</button>
            <button class="sa-btn danger" data-act="delete" data-id="${esc(user.user_id)}">Remove access</button></div>
        </div>`;
      }).join('');
    } catch (error) {
      box.innerHTML = `<p class="staff-access-empty">Could not load Neon staff profiles: ${esc(error.message || 'connection error')}</p>`;
    }
  }

  async function addStaffProfile() {
    if (identity().role !== 'admin') { toast('Administrator access is required.'); return; }
    const name = ($('saName') || {}).value.trim();
    const email = ($('saEmail') || {}).value.trim();
    const permissions = selectedPermissions();
    if (!name) return toast('Enter the staff member’s full name.');
    if (!email || !email.includes('@')) return toast('Enter the email used for their Supabase Auth account.');
    if (!permissions.length) return toast('Grant at least one permission.');
    const button = $('saCreateBtn');
    if (button) button.disabled = true;
    try {
      await FMSCloud.saveStaffProfile({ display_name: name, email, permissions, disabled: false });
      $('saName').value = '';
      $('saEmail').value = '';
      await renderStaffList();
      toast('Neon workspace access added for ' + name + '.');
    } catch (error) { toast(error.message || 'Could not add this Neon user.'); }
    finally { if (button) button.disabled = false; }
  }

  async function handleAction(event) {
    const button = event.target.closest('.sa-btn');
    if (!button) return;
    if (identity().role !== 'admin') return toast('Administrator access is required.');
    const userId = button.dataset.id;
    const action = button.dataset.act;
    if (action === 'delete' && !confirm('Remove this user’s access to the shared FMS workspace? Their Supabase Auth account will remain.')) return;
    button.disabled = true;
    try {
      if (action === 'toggle') await FMSCloud.updateStaffProfile(userId, { disabled: button.textContent.trim() === 'Disable' });
      if (action === 'delete') await FMSCloud.removeStaffProfile(userId);
      await renderStaffList();
      toast(action === 'delete' ? 'Workspace access removed.' : 'Workspace access updated.');
    } catch (error) { toast(error.message || 'Could not update this Neon profile.'); }
    finally { button.disabled = false; }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const mount = $('staffAccessMount');
    const card = $('staffAccessCard');
    if (mount && card) mount.appendChild(card);
    applyPermissions();
    renderStaffList();
    const addButton = $('saCreateBtn');
    if (addButton) addButton.addEventListener('click', addStaffProfile);
    const list = $('staffAccessList');
    if (list) list.addEventListener('click', handleAction);
    document.addEventListener('fms:cloud-status', event => { if (event.detail && event.detail.connected) renderStaffList(); });
  });
})();
