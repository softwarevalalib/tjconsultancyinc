/* Administrator-only workforce data. Configured deployments use the Neon API;
   the browser demo remains local only when shared-cloud sign-in is disabled. */
(function () {
  'use strict';
  const key = 'fms_workforce_demo_v1';
  let records = [], ready = false, connected = false, status = 'Loading workforce…', poller = null;
  const cloud = () => !!window.FMSCloud?.hasConfiguration();
  const admin = () => sessionStorage.getItem('fms_auth_role') === 'admin';
  const emit = () => document.dispatchEvent(new CustomEvent('fms:workforce-change'));
  function readLocal() { try { const data = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(data) ? data : []; } catch (_) { return []; } }
  async function refresh() {
    if (!cloud() || !admin()) return;
    try {
      records = await FMSCloud.listWorkforce();
      ready = true; connected = true; status = 'Live • connected to Neon'; emit();
    } catch (error) {
      connected = false; status = 'Neon unavailable • reconnect to load workforce data'; emit();
      throw error;
    }
  }
  async function init() {
    if (window.FMSCloud) await FMSCloud.ready;
    if (!admin()) { status = 'Administrator access required'; emit(); return; }
    if (!cloud()) {
      records = readLocal(); ready = true;
      status = 'Local demo • saved in this browser • shared data requires cloud setup'; emit(); return;
    }
    try {
      await refresh();
      clearInterval(poller);
      poller = setInterval(() => refresh().catch(() => {}), 5000);
    } catch (error) { status += '. ' + error.message; emit(); }
  }
  async function save(kind, payload) {
    if (!admin() || !ready) throw Error('Workforce is not ready or access is denied.');
    if (cloud() && (!connected || !navigator.onLine)) throw Error('Reconnect before saving workforce changes.');
    const id = payload._id || crypto.randomUUID();
    const previous = records.find(row => row._id === id);
    const next = { ...payload, _id: id, kind, updatedAt: new Date().toISOString(), actor: sessionStorage.getItem('fms_auth_user') || 'Administrator' };
    if (cloud()) {
      const result = await FMSCloud.saveWorkforce({ _id: id, kind, payload: next }, payload.version || 0);
      await refresh();
      return result.record && result.record._id || id;
    }
    records = readLocal();
    const latest = records.find(row => row._id === id);
    if (latest && latest.version !== payload.version) throw Error('This record changed in another tab. Reload and try again.');
    if (latest?.kind === 'event' || (latest?.kind === 'payroll' && latest.status === 'Paid')) throw Error('This record is locked.');
    next.version = (latest?.version || 0) + 1;
    records = records.filter(row => row._id !== id).concat(next);
    localStorage.setItem(key, JSON.stringify(records)); emit();
    return id;
  }
  window.addEventListener('storage', event => { if (event.key === key && !cloud() && admin()) { records = readLocal(); emit(); } });
  window.addEventListener('offline', () => { if (cloud()) { connected = false; status = 'Offline • saving disabled'; emit(); } });
  window.addEventListener('online', () => { if (cloud()) refresh().catch(() => {}); });
  document.addEventListener('fms:cloud-status', event => {
    if (!cloud()) return;
    if (event.detail?.connected === false) { connected = false; status = 'Neon connection interrupted'; emit(); }
    else if (event.detail?.connected) refresh().catch(() => {});
  });
  window.FMSWorkforceStore = { init, save, rows: kind => records.filter(row => row.kind === kind), status: () => status, available: () => ready && admin(), live: () => connected, cloud };
})();
