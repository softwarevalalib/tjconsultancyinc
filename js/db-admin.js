/* ============================================================
   js/db-admin.js — TJ Consultancy FMS
   Database & Backup settings card controller
   ============================================================
   Powers the "Database & Backup" card in Settings:
     • Live record counts per table
     • Export full backup (JSON download)
     • Import / restore from a backup file
     • Create manual snapshot
     • List recent auto-snapshots with one-click restore
   ============================================================ */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);

  function showToast (msg) {
    const t = $('toast'); if (!t) return;
    t.textContent = msg; t.classList.add('show');
    clearTimeout(t._dbt); t._dbt = setTimeout(() => t.classList.remove('show'), 3500);
  }

  const LABELS = {
    loans: 'Loans', research: 'Research & Consulting', assets: 'Assets',
    bizdev: 'Business Dev', vehicles: 'Vehicle Hire', printing: 'Printing', staff: 'Staff'
  };

  function renderStats () {
    const box = $('dbStats');
    if (!box || !window.FMSDB) return;
    const s = FMSDB.stats();
    const keys = Object.keys(LABELS).filter(k => k in s);
    box.innerHTML = keys.length
      ? keys.map(k => `<span class="db-stat"><strong>${s[k]}</strong>${LABELS[k]}</span>`).join('')
      : '<span class="db-stat">Database initialising…</span>';
  }

  function renderBackups () {
    const box = $('dbBackupList');
    if (!box || !window.FMSDB) return;
    FMSDB.listBackups().then(list => {
      if (!list.length) {
        box.innerHTML = '<p style="color:#94a3b8;font-size:0.8rem;padding:6px 0">No snapshots yet — one is created automatically every day and after every few changes.</p>';
        return;
      }
      box.innerHTML = list.slice(0, 6).map(b => `
        <div class="db-backup-row">
          <div>
            <div class="db-bk-label"><i class="fas fa-clock-rotate-left" style="color:#0277bd;margin-right:5px"></i>${b.label === 'daily' ? 'Daily backup' : b.label === 'manual' ? 'Manual snapshot' : 'Auto snapshot'}</div>
            <div class="db-bk-time">${new Date(b.ts).toLocaleString('en-GB')}</div>
          </div>
          <button class="btn-secondary" style="padding:4px 12px;font-size:0.76rem" data-restore="${b.ts}"><i class="fas fa-rotate-left"></i> Restore</button>
        </div>`).join('');

      box.querySelectorAll('[data-restore]').forEach(btn => {
        btn.addEventListener('click', () => {
          if (!confirm('Restore the database to this snapshot? Current unsaved changes will be replaced.')) return;
          FMSDB.restoreBackup(+btn.dataset.restore).then(ok => {
            showToast(ok ? 'Backup restored — all records updated.' : 'Restore failed.');
          });
        });
      });
    });
  }

  function init () {
    if (!window.FMSDB) return;

    const expBtn = $('dbExportBtn');
    if (expBtn) expBtn.addEventListener('click', () => {
      FMSDB.downloadBackup();
      showToast('Full database backup downloaded.');
    });

    const snapBtn = $('dbSnapshotBtn');
    if (snapBtn) snapBtn.addEventListener('click', () => {
      FMSDB.snapshot('manual');
      setTimeout(renderBackups, 300);
      showToast('Snapshot created.');
    });

    const impInput = $('dbImportInput');
    if (impInput) impInput.addEventListener('change', () => {
      const f = impInput.files[0];
      impInput.value = '';
      if (!f) return;
      const reader = new FileReader();
      reader.onload = e => {
        try {
          FMSDB.importAll(String(e.target.result));
          renderStats(); renderBackups();
          showToast('Backup imported — all records restored.');
        } catch (err) {
          showToast('Import failed: not a valid FMS backup file.');
        }
      };
      reader.readAsText(f);
    });

    renderStats();
    renderBackups();

    /* Live record counts */
    let t = null;
    FMSDB.on(() => { clearTimeout(t); t = setTimeout(renderStats, 400); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { if (window.FMSDB) FMSDB.ready.then(init); else init(); });
  } else if (window.FMSDB) {
    FMSDB.ready.then(init);
  } else {
    init();
  }
})();
