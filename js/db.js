/* ============================================================
   js/db.js — TJ Consultancy FMS Local Database & Backup Engine
   ============================================================
   A real client-side database system:
     • IndexedDB  (durable database: tables + snapshots)
     • localStorage mirror (fast synchronous reads)
     • Auto-backup snapshots (kept in the 'backups' store)
     • Manual Export / Import full backup (JSON file)
     • Real-time sync:
         - same tab   → 'fms:db-change' CustomEvent
         - other tabs → 'storage' event + BroadcastChannel
   Exposed as window.FMSDB
   ============================================================ */
(function () {
  'use strict';

  const DB_NAME   = 'tj_fms_db';
  const DB_VER    = 1;
  const LS_PREFIX = 'fmsdb_';
  const DELETION_PREFIX = 'fmsdb_deleted_';
  const MAX_SNAP  = 10;

  const MEM = {};               // table -> live array reference
  let   idb = null;
  let   writeCount = 0;

  const bc = ('BroadcastChannel' in window) ? new BroadcastChannel('fms_rt') : null;

  /* ── localStorage mirror ─────────────────────────────────── */
  function lsKey (t) { return LS_PREFIX + t; }
  function lsRead (t) {
    try {
      const v = localStorage.getItem(lsKey(t));
      if (v !== null) { const p = JSON.parse(v); if (Array.isArray(p)) return p; }
    } catch (_) {}
    return null;
  }
  function lsWrite (t, rows) {
    try { localStorage.setItem(lsKey(t), JSON.stringify(rows)); } catch (_) {}
  }

  /* Any signed-in FMS user may permanently delete a business record. Server
     policies enforce the same rule for the shared production database. */
  function canDeleteRecords () {
    try {
      const role = sessionStorage.getItem('fms_auth_role');
      return role === 'admin' || role === 'staff';
    } catch (_) { return false; }
  }
  function deletionKey (name) { return DELETION_PREFIX + name; }
  function deletedIds (name) {
    try {
      const value = JSON.parse(localStorage.getItem(deletionKey(name)) || '[]');
      return new Set(Array.isArray(value) ? value.map(String) : []);
    } catch (_) { return new Set(); }
  }
  function saveDeletedIds (name, ids) {
    try { localStorage.setItem(deletionKey(name), JSON.stringify(Array.from(ids))); } catch (_) {}
  }
  function recordId (row) {
    if (!row || typeof row !== 'object') return '';
    if (row._id !== undefined && row._id !== null) return String(row._id);
    if (row.id !== undefined && row.id !== null) return String(row.id);
    return '';
  }
  function filterDeletedRows (name, rows) {
    const ids = deletedIds(name);
    return rows.filter(row => !ids.has(recordId(row)));
  }
  /* Remove the deleted payload from automatic, on-device snapshots too. The
     small deletion marker intentionally remains so an old backup cannot
     recreate the same record ID later. */
  function purgeDeletedRowsFromBackups (name, ids) {
    if (!idb || !ids || !ids.size) return;
    try {
      const tx = idb.transaction('backups', 'readwrite');
      const store = tx.objectStore('backups');
      const request = store.getAll();
      request.onsuccess = () => {
        (request.result || []).forEach(backup => {
          if (!backup || !backup.data || !Array.isArray(backup.data[name])) return;
          const next = backup.data[name].filter(row => !ids.has(recordId(row)));
          if (next.length !== backup.data[name].length) {
            backup.data[name] = next;
            try { store.put(backup); } catch (_) {}
          }
        });
      };
    } catch (_) {}
  }
  function rememberDeletedIds (name, ids) {
    if (!ids || !ids.length) return;
    const deleted = deletedIds(name);
    ids.forEach(id => { if (id !== undefined && id !== null && id !== '') deleted.add(String(id)); });
    saveDeletedIds(name, deleted);
    purgeDeletedRowsFromBackups(name, deleted);
  }
  function rowKey (row) {
    if (!row || typeof row !== 'object') return '';
    if (row._id !== undefined && row._id !== null) return '_:' + String(row._id);
    if (row.id !== undefined && row.id !== null) return 'i:' + String(row.id);
    return '';
  }
  /* Every shared record needs a stable key. Existing data normally has an
     `_id` or `id`; legacy rows without one are assigned an `_id` once before
     they are written, so Supabase can synchronise and protect them as an
     individual database row. */
  function ensureRowIds (rows, name) {
    if (!Array.isArray(rows)) return [];
    rows.forEach(row => {
      if (!row || typeof row !== 'object') return;
      if (row._id === undefined || row._id === null || row._id === '') {
        if (row.id === undefined || row.id === null || row.id === '') {
          row._id = uid((name || 'rec').slice(0, 3) + '-');
        }
      }
    });
    return rows;
  }
  function removedPersistedIds (name, nextRows) {
    const currentRows = lsRead(name) || MEM[name] || [];
    if (!currentRows.length) return [];
    const nextKeys = new Set(nextRows.map(rowKey).filter(Boolean));
    return currentRows
      .filter(row => !nextKeys.has(rowKey(row)))
      .map(recordId)
      .filter(Boolean);
  }

  /* ── IndexedDB ───────────────────────────────────────────── */
  function openDB () {
    return new Promise(resolve => {
      if (!('indexedDB' in window)) return resolve(null);
      try {
        const rq = indexedDB.open(DB_NAME, DB_VER);
        rq.onupgradeneeded = e => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('tables'))  db.createObjectStore('tables');
          if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings');
          if (!db.objectStoreNames.contains('backups')) db.createObjectStore('backups', { keyPath: 'ts' });
        };
        rq.onsuccess = e => { idb = e.target.result; resolve(idb); };
        rq.onerror   = () => resolve(null);
        rq.onblocked = () => resolve(null);
      } catch (_) { resolve(null); }
    });
  }
  function idbPutTable (t, rows) {
    if (!idb) return;
    try { idb.transaction('tables', 'readwrite').objectStore('tables').put(rows, t); } catch (_) {}
  }
  function idbGetTable (t) {
    return new Promise(res => {
      if (!idb) return res(null);
      try {
        const rq = idb.transaction('tables', 'readonly').objectStore('tables').get(t);
        rq.onsuccess = () => res(Array.isArray(rq.result) ? rq.result : null);
        rq.onerror   = () => res(null);
      } catch (_) { res(null); }
    });
  }
  function idbSetSetting (k, v) {
    if (!idb) return;
    try { idb.transaction('settings', 'readwrite').objectStore('settings').put(v, k); } catch (_) {}
  }

  /* ── Snapshots (automatic backups) ───────────────────────── */
  function snapshot (label) {
    if (!idb) return;
    try {
      const data = {};
      Object.keys(MEM).forEach(t => { data[t] = MEM[t]; });
      const rec = { ts: Date.now(), label: label || 'auto', data };
      const store = idb.transaction('backups', 'readwrite').objectStore('backups');
      store.put(rec);
      /* prune old snapshots */
      const all = store.getAllKeys();
      all.onsuccess = () => {
        const keys = (all.result || []).sort((a, b) => a - b);
        while (keys.length > MAX_SNAP) {
          const k = keys.shift();
          try { idb.transaction('backups', 'readwrite').objectStore('backups').delete(k); } catch (_) {}
        }
      };
    } catch (_) {}
  }

  /* ── Events / real-time ──────────────────────────────────── */
  function emit (table, remote) {
    try {
      document.dispatchEvent(new CustomEvent('fms:db-change', { detail: { table, remote: !!remote } }));
    } catch (_) {}
    if (!remote && bc) { try { bc.postMessage({ table }); } catch (_) {} }
  }

  /* Replace array contents in place so live references stay valid */
  function replaceInPlace (name, rows) {
    if (!Array.isArray(MEM[name])) { MEM[name] = rows.slice(); return; }
    MEM[name].length = 0;
    rows.forEach(r => MEM[name].push(r));
  }

  function receiveRemote (table) {
    if (!table) return;
    const rows = lsRead(table);
    if (rows === null) return;
    replaceInPlace(table, rows);
    emit(table, true);
  }

  window.addEventListener('storage', e => {
    if (e.key && e.key.indexOf(LS_PREFIX) === 0) receiveRemote(e.key.slice(LS_PREFIX.length));
  });
  if (bc) bc.onmessage = e => { if (e.data && e.data.table) receiveRemote(e.data.table); };

  /* ── Core API ────────────────────────────────────────────── */
  function table (name, seed) {
    if (MEM[name]) return MEM[name];
    let rows = lsRead(name);
    if (rows === null) rows = Array.isArray(seed) ? seed.map(r => ({ ...r })) : [];
    ensureRowIds(rows, name);
    rows = filterDeletedRows(name, rows);
    MEM[name] = rows;
    lsWrite(name, rows);
    idbPutTable(name, rows);
    return MEM[name];
  }

  function set (name, rows, silent) {
    if (!Array.isArray(rows)) rows = [];
    ensureRowIds(rows, name);
    const removedIds = removedPersistedIds(name, rows);
    if (removedIds.length && !canDeleteRecords()) {
      try {
        document.dispatchEvent(new CustomEvent('fms:delete-denied', { detail: { table: name } }));
      } catch (_) {}
      return false;
    }
    if (removedIds.length) rememberDeletedIds(name, removedIds);
    /* Callers can pass the live array returned by table(). Keep a shallow
       copy before replacing in place; otherwise clearing MEM[name] would
       also clear the input array and discard the just-added record. */
    const nextRows = filterDeletedRows(name, rows === MEM[name] ? rows.slice() : rows);
    replaceInPlace(name, nextRows);
    lsWrite(name, MEM[name]);
    idbPutTable(name, MEM[name]);
    if (++writeCount % 8 === 0) snapshot('auto');
    if (!silent) {
      emit(name);
      /* The cloud adapter is optional, so the offline app remains usable
         until a Supabase project is configured. It receives changes only
         after its authenticated initial load has completed. */
      try {
        if (window.FMSCloud && typeof window.FMSCloud.syncTable === 'function') {
          window.FMSCloud.syncTable(name);
        }
      } catch (_) {}
    }
    return true;
  }

  /* Apply a server-authorised replacement without scheduling another cloud
     write. Locally remembered deletions are never allowed back into the cache. */
  function replaceFromRemote (name, rows) {
    if (!Array.isArray(rows)) rows = [];
    const nextRows = filterDeletedRows(name, rows.map(row => ({ ...row })));
    ensureRowIds(nextRows, name);
    replaceInPlace(name, nextRows);
    lsWrite(name, MEM[name]);
    idbPutTable(name, MEM[name]);
    emit(name, true);
    return true;
  }

  function applyRemoteRecord (name, id, payload, deleted) {
    const key = String(id);
    if (deleted) return markDeletedRecord(name, key);
    const rows = table(name, []);
    const index = rows.findIndex(row => String(rowKey(row).slice(2)) === key || String(rowKey(row).slice(2)) === key);
    let nextRows;
    const next = payload && typeof payload === 'object' ? { ...payload } : null;
    if (!next) return false;
    ensureRowIds([next], name);
    nextRows = rows.slice();
    if (index === -1) nextRows.push(next); else nextRows[index] = next;
    return replaceFromRemote(name, nextRows);
  }

  /* The cloud adapter reads deletion tombstones during startup, before it
     hydrates the local cache. That closes the stale-backup window on a device
     that was offline when somebody else deleted a record. */
  function markDeletedRecord (name, id) {
    const key = String(id);
    rememberDeletedIds(name, [key]);
    const rows = MEM[name] || lsRead(name);
    if (!Array.isArray(rows)) return true;
    const nextRows = rows.filter(row => recordId(row) !== key);
    if (nextRows.length === rows.length) return true;
    return replaceFromRemote(name, nextRows);
  }

  function uid (prefix) {
    return (prefix || 'rec-') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function add (name, row, toEnd) {
    const t = table(name);
    if (!row._id) row._id = uid(name.slice(0, 3) + '-');
    if (toEnd) t.push(row); else t.unshift(row);
    set(name, t);
    return row;
  }

  /* The single permanent-delete command. It updates IndexedDB, the
     localStorage mirror, live arrays, other open tabs, and the optional
     cloud synchroniser through set(). Dashboard/report rows are projections
     of these source tables, so they disappear with the source record. */
  function deleteRecord (name, id) {
    const rows = table(name);
    const targetId = String(id);
    const nextRows = rows.filter(row => {
      const ids = row ? [row._id, row.id] : [];
      return !ids.some(rowId => rowId !== undefined && rowId !== null && String(rowId) === targetId);
    });
    if (nextRows.length === rows.length) return false;
    if (!canDeleteRecords()) {
      try { document.dispatchEvent(new CustomEvent('fms:delete-denied', { detail: { table: name } })); } catch (_) {}
      return false;
    }
    rememberDeletedIds(name, [targetId]);
    return set(name, nextRows);
  }

  const remove = deleteRecord; /* backwards-compatible command name */

  function update (name, id, patch) {
    const t = table(name);
    const r = t.find(x => x._id === id || x.id === id);
    if (r) Object.assign(r, patch);
    set(name, t);
  }

  /* ── Full backup export / import ─────────────────────────── */
  function exportAll () {
    const dump = { app: 'TJ-FMS', version: 1, exported: new Date().toISOString(), tables: {}, localStorage: {} };
    Object.keys(MEM).forEach(t => { dump.tables[t] = MEM[t]; });
    /* include every fms* branding / account / settings key */
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.indexOf('fms') === 0 || k.indexOf(LS_PREFIX) === 0)) {
          dump.localStorage[k] = localStorage.getItem(k);
        }
      }
    } catch (_) {}
    return JSON.stringify(dump, null, 2);
  }

  function downloadBackup () {
    const blob = new Blob([exportAll()], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'TJ_FMS_Backup_' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function importAll (json) {
    const dump = JSON.parse(json);
    if (!dump || typeof dump !== 'object') throw new Error('Invalid backup file');
    if (dump.tables) {
      Object.keys(dump.tables).forEach(t => { if (Array.isArray(dump.tables[t])) set(t, dump.tables[t], true); });
    }
    if (dump.localStorage) {
      Object.keys(dump.localStorage).forEach(k => {
        /* Table rows and deletion markers are handled above. Merging an old
           backup's localStorage copy must never overwrite a newer deletion. */
        if (k.indexOf(LS_PREFIX) === 0 || k.indexOf(DELETION_PREFIX) === 0) return;
        try { localStorage.setItem(k, dump.localStorage[k]); } catch (_) {}
      });
    }
    Object.keys(MEM).forEach(t => {
      emit(t);
      try { if (window.FMSCloud && typeof window.FMSCloud.syncTable === 'function') window.FMSCloud.syncTable(t); } catch (_) {}
    });
    emit('*');
    return true;
  }

  function listBackups () {
    return new Promise(res => {
      if (!idb) return res([]);
      try {
        const rq = idb.transaction('backups', 'readonly').objectStore('backups').getAll();
        rq.onsuccess = () => res((rq.result || []).sort((a, b) => b.ts - a.ts));
        rq.onerror   = () => res([]);
      } catch (_) { res([]); }
    });
  }

  function restoreBackup (ts) {
    return new Promise(res => {
      if (!idb) return res(false);
      try {
        const rq = idb.transaction('backups', 'readonly').objectStore('backups').get(ts);
        rq.onsuccess = () => {
          const rec = rq.result;
          if (!rec || !rec.data) return res(false);
          Object.keys(rec.data).forEach(t => set(t, rec.data[t], true));
          Object.keys(MEM).forEach(t => {
            emit(t);
            try { if (window.FMSCloud && typeof window.FMSCloud.syncTable === 'function') window.FMSCloud.syncTable(t); } catch (_) {}
          });
          emit('*');
          res(true);
        };
        rq.onerror = () => res(false);
      } catch (_) { res(false); }
    });
  }

  function stats () {
    const out = {};
    Object.keys(MEM).forEach(t => { out[t] = MEM[t].length; });
    return out;
  }

  function on (cb) { document.addEventListener('fms:db-change', e => cb(e.detail || {})); }

  function setSetting (k, v) {
    try { localStorage.setItem('fms_setting_' + k, JSON.stringify(v)); } catch (_) {}
    idbSetSetting(k, v);
  }
  function getSetting (k, fallback) {
    try {
      const v = localStorage.getItem('fms_setting_' + k);
      return v === null ? fallback : JSON.parse(v);
    } catch (_) { return fallback; }
  }

  /* ── Boot: open IDB, hydrate newer data from it ──────────── */
  const ready = openDB().then(async db => {
    if (!db) return;
    /* For every table already touched, prefer IDB copy when LS is empty */
    for (const name of Object.keys(MEM)) {
      const lsHas = lsRead(name) !== null;
      if (!lsHas) {
        const rows = await idbGetTable(name);
        if (rows) {
          const nextRows = filterDeletedRows(name, rows);
          replaceInPlace(name, nextRows); lsWrite(name, nextRows); emit(name, true);
        }
      }
    }
    /* First run of the day → automatic snapshot */
    try {
      const last = +(localStorage.getItem('fmsdb_last_snap') || 0);
      if (Date.now() - last > 24 * 3600 * 1000) {
        localStorage.setItem('fmsdb_last_snap', String(Date.now()));
        snapshot('daily');
      }
    } catch (_) {}
    document.dispatchEvent(new CustomEvent('fms:db-ready'));
  });

  window.FMSDB = {
    ready, table, set, add, remove, deleteRecord, update, uid,
    exportAll, downloadBackup, importAll,
    listBackups, restoreBackup, snapshot, stats, on,
    setSetting, getSetting,
    replaceFromRemote, applyRemoteRecord, markDeletedRecord,
    listTables: () => Object.keys(MEM),
    hasTable: name => !!MEM[name] || lsRead(name) !== null,
    canDelete: canDeleteRecords
  };
})();
