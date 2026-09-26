/* HR has its own admin-only cloud table. Production HR data stays in memory,
   outside the shared business-record cache and local backup exports. */
(function () {
  'use strict';
  const key = 'fms_workforce_demo_v1';
  let records = [], client, workspace, channel, ready = false, connected = false;
  let status = 'Loading workforce…';
  const cloud = () => !!window.FMSCloud?.hasConfiguration();
  const admin = () => sessionStorage.getItem('fms_auth_role') === 'admin';
  const emit = () => document.dispatchEvent(new CustomEvent('fms:workforce-change'));
  function readLocal() { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch (_) { return []; } }
  async function refresh() {
    if (!client || !workspace) return;
    const all = [];
    for (let from = 0; ; from += 1000) {
      const r = await client.from('fms_hr_records').select('*').eq('workspace_id', workspace).order('id').range(from, from+999);
      if (r.error) throw r.error;
      all.push(...r.data);
      if (r.data.length < 1000) break;
    }
    records = all.map(r => ({ ...r.payload, _id: r.id, kind: r.kind, version: r.version }));
    emit();
  }
  async function init() {
    if (window.FMSCloud) await FMSCloud.ready;
    if (!admin()) { status = 'Administrator access required'; emit(); return; }
    if (!cloud()) {
      records = readLocal(); ready = true; status = 'Local demo • saved in this browser • terminals require cloud setup'; emit(); return;
    }
    try {
      client = FMSCloud.getClient(); workspace = FMSCloud.getProfile()?.workspace_id;
      if (!client || !workspace) throw Error('Sign in to the configured workspace.');
      await refresh(); ready = true;
      channel = client.channel('workforce-' + workspace).on('postgres_changes', { event: '*', schema: 'public', table: 'fms_hr_records', filter: 'workspace_id=eq.'+workspace }, () => {
        refresh().catch(() => { status = 'Refresh failed • reconnect to reload'; emit(); });
      }).subscribe(async state => {
        connected = state === 'SUBSCRIBED';
        status = connected ? 'Live • connected to workspace' : 'Live connection interrupted • reconnecting';
        if (connected) try { await refresh(); } catch (_) { status = 'Unable to refresh workforce data'; connected = false; }
        emit();
      });
    } catch (e) { status = 'Workforce unavailable • apply the HR migration and verify administrator access. ' + e.message; emit(); }
  }
  async function save(kind, payload) {
    if (!admin() || !ready) throw Error('Workforce is not ready or access is denied.');
    if (cloud() && (!connected || !navigator.onLine)) throw Error('Reconnect before saving workforce changes.');
    const id = payload._id || crypto.randomUUID();
    const previous = records.find(r=>r._id===id);
    const next = { ...payload, _id: id, kind, updatedAt: new Date().toISOString(), actor: sessionStorage.getItem('fms_auth_user') || 'Administrator' };
    if (client) {
      const row = { workspace_id: workspace, id, kind, payload: next };
      let query = previous ? client.from('fms_hr_records').update(row).eq('workspace_id',workspace).eq('id',id).eq('version',payload.version) : client.from('fms_hr_records').insert(row);
      const result = await query.select().maybeSingle();
      if (result.error) throw Error(result.error.message);
      if (!result.data) { await refresh(); throw Error('This record changed elsewhere. Review the latest version and try again.'); }
      await refresh();
    } else {
      records = readLocal();
      const latest = records.find(r=>r._id===id);
      if (latest && latest.version !== payload.version) throw Error('This record changed in another tab. Reload and try again.');
      if (latest?.kind === 'event' || (latest?.kind === 'payroll' && latest.status === 'Paid')) throw Error('This record is locked.');
      next.version = (latest?.version || 0)+1;
      records = records.filter(r=>r._id!==id).concat(next);
      localStorage.setItem(key, JSON.stringify(records)); emit();
    }
    return id;
  }
  window.addEventListener('storage', e => { if (e.key === key && !cloud() && admin()) { records = readLocal(); emit(); } });
  window.addEventListener('offline', () => { if (cloud()) { connected = false; status = 'Offline • saving disabled'; emit(); } });
  window.addEventListener('online', () => { if (client) refresh().then(()=>{ status=connected?'Live • connected to workspace':'Connection restored • waiting for live subscription'; emit(); }).catch(()=>{}); });
  window.FMSWorkforceStore = { init, save, rows: kind => records.filter(r=>r.kind===kind), status: () => status, available: () => ready && admin(), live: () => connected, cloud };
})();
