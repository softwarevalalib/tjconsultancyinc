/* ============================================================
   js/enhancements.js — TJ Consultancy FMS
   Cross-cutting real-time features layered over the core app:

     1. Company / Institution name — live propagation everywhere
        (sidebar, topbar, page title, invoices, cross-tab)
     2. Legacy migration helpers (disabled): financial records must remain
        in Financial Management unless a user creates a separate record in
        another service.
     3. Invoice print: forced white background + a
        "select print options" dialog before the print window opens
     4. Password reset helper for staff accounts
   ============================================================ */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  /* ── shared real-time channel ─────────────────────────────── */
  var bc = ('BroadcastChannel' in window) ? new BroadcastChannel('fms_ui') : null;
  function broadcast (type, payload) {
    if (bc) { try { bc.postMessage({ type: type, payload: payload }); } catch (_) {} }
  }

  function sha256 (str) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) {
        return b.toString(16).padStart(2, '0');
      }).join('');
    });
  }

  function toast (msg) {
    var t = $('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._ent);
    t._ent = setTimeout(function () { t.classList.remove('show'); }, 3400);
  }

  function injectCSS (css) {
    var s = document.createElement('style');
    s.setAttribute('data-fms-enh', '1');
    s.textContent = css;
    document.head.appendChild(s);
  }

  /* ============================================================
     1. COMPANY NAME — one value, live everywhere
     ============================================================ */
  var COMPANY_KEY     = 'fms_institution_name';
  var DEFAULT_COMPANY = 'TJ Consultancy';
  var lastCompany     = null;

  function companyName () {
    try { return (localStorage.getItem(COMPANY_KEY) || '').trim() || DEFAULT_COMPANY; }
    catch (_) { return DEFAULT_COMPANY; }
  }

  /* Replace the visible brand text in the sidebar / topbar in place */
  function replaceBrandText (from, to) {
    var roots = [document.querySelector('.sidebar'), document.querySelector('.topbar')];
    roots.forEach(function (root) {
      if (!root) return;
      var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
      var n;
      while ((n = walker.nextNode())) {
        var txt = (n.nodeValue || '').trim();
        if (!txt) continue;
        if (txt === from || txt === DEFAULT_COMPANY) {
          n.nodeValue = n.nodeValue.replace(txt, to);
        }
      }
    });
    document.querySelectorAll('[data-company-name]').forEach(function (el) { el.textContent = to; });
  }

  function applyCompanyName (name, silent) {
    name = (name || '').trim() || DEFAULT_COMPANY;
    var from = lastCompany || DEFAULT_COMPANY;
    document.title = name + ' – FMS Dashboard';
    replaceBrandText(from, name);
    lastCompany = name;
    if (!silent) broadcast('company', name);
  }

  function initCompanyName () {
    lastCompany = companyName();
    applyCompanyName(lastCompany, true);

    /* Locate the Settings → General → Company Name input */
    var input = $('companyNameInput');
    if (!input) {
      var labels = document.querySelectorAll('.settings-card .form-label');
      for (var i = 0; i < labels.length; i++) {
        if (/^company name$/i.test((labels[i].textContent || '').trim())) {
          input = labels[i].parentNode.querySelector('input.form-input');
          if (input) { input.id = 'companyNameInput'; break; }
        }
      }
    }

    if (input) {
      input.value = companyName();
      var apply = function () {
        var v = (input.value || '').trim() || DEFAULT_COMPANY;
        try { localStorage.setItem(COMPANY_KEY, v); } catch (_) {}
        applyCompanyName(v);
        toast('Company name applied everywhere — “' + v + '”.');
      };
      input.addEventListener('input', apply);   /* takes effect as you type */
      input.addEventListener('change', apply);
      input.addEventListener('blur', apply);
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); apply(); }
      });
    }

    /* Real-time from another tab / window */
    window.addEventListener('storage', function (e) {
      if (e.key === COMPANY_KEY) applyCompanyName(companyName(), true);
    });
    if (bc) bc.onmessage = function (ev) {
      if (ev.data && ev.data.type === 'company') applyCompanyName(companyName(), true);
      if (ev.data && ev.data.type === 'chat') document.dispatchEvent(new CustomEvent('fms:ui-chat'));
    };
    /* Real-time after a backup restore / import */
    if (window.FMSDB) {
      FMSDB.on(function (d) {
        if (d.table === '*' || d.table === 'settings') applyCompanyName(companyName(), true);
      });
    }
  }

  /* ============================================================
     2. DEPARTMENT MIGRATION
        Financial Management Advisory → the 5 other departments
     ============================================================ */
  var MIG_FLAG = 'fms_dept_migrated_v2';

  function readTable (n) {
    try {
      var v = localStorage.getItem('fmsdb_' + n);
      var p = v ? JSON.parse(v) : [];
      return Array.isArray(p) ? p : [];
    } catch (_) { return []; }
  }
  function uid (p) { return (p || 'mig-') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function today () { return new Date().toISOString().slice(0, 10); }
  function num (v) { return parseFloat(String(v == null ? 0 : v).replace(/[^0-9.\-]/g, '')) || 0; }

  function migrate () {
    if (!window.FMSDB) return;
    var done = null;
    try { done = localStorage.getItem(MIG_FLAG); } catch (_) {}
    if (done) return;

    /* Source = the Financial Management Advisory (loans) records */
    var src = readTable('loans');
    if (!src.length) { try { localStorage.setItem(MIG_FLAG, '1'); } catch (_) {} return; }

    var maker = {
      research: function (l) {
        return {
          _id: uid('mig-res-'), client: l.clientName || l.client || '—',
          project: 'Advisory engagement – ' + (l.purpose || 'Financial Management Advisory'),
          type: 'Advisory & Strategy', value: String(l.amount || l.total || 0),
          date: l.startDate || today(), status: 'ongoing',
          notes: 'Migrated from Financial Management Advisory'
        };
      },
      assets: function (l) {
        return {
          _id: uid('mig-ast-'), owner: l.clientName || l.client || '—',
          name: 'Advisory-managed asset – ' + (l.purpose || 'Portfolio'),
          type: 'Advisory', value: String(l.amount || l.total || 0),
          date: l.startDate || today(), location: '—', status: 'active'
        };
      },
      bizdev: function (l) {
        return {
          _id: uid('mig-biz-'), company: l.clientName || l.client || '—',
          contact: l.clientName || '—', email: l.email || '—', phone: l.phone || '—',
          industry: 'Advisory', value: String(l.amount || l.total || 0),
          stage: 'Qualified', close: l.endDate || today()
        };
      },
      vehicles: function (l) {
        return {
          _id: uid('mig-veh-'), name: l.clientName || l.client || '—',
          email: l.email || '—', phone: l.phone || '—', type: 'Advisory transport',
          pickup: l.startDate || today(), ret: l.endDate || '',
          location: '—', rate: String(l.amount || 0), status: 'confirmed'
        };
      },
      printing: function (l) {
        return {
          _id: uid('mig-prn-'), name: l.clientName || l.client || '—',
          email: l.email || '—', phone: l.phone || '—', type: 'Advisory reports',
          qty: '1', paper: 'Standard 80gsm', deadline: l.endDate || today(),
          quote: String(l.amount || 0), status: 'received'
        };
      }
    };

    var addedTotal = 0;
    Object.keys(maker).forEach(function (k) {
      var existing = window.FMSDB.table(k, []);
      var seen = {};
      existing.forEach(function (r) {
        seen[(r.client || r.owner || r.company || r.name || '') + '|' + (r.value || r.rate || r.quote || '')] = true;
      });
      var added = 0;
      src.forEach(function (l) {
        var row = maker[k](l);
        var key = (row.client || row.owner || row.company || row.name) + '|' + (row.value || row.rate || row.quote);
        if (seen[key]) return;
        existing.push(row);
        seen[key] = true;
        added++;
      });
      if (added) window.FMSDB.set(k, existing);
      addedTotal += added;
    });

    try { localStorage.setItem(MIG_FLAG, String(Date.now())); } catch (_) {}
    if (addedTotal) {
      setTimeout(function () {
        toast('Financial Management Advisory data shared with the other 5 departments (' + addedTotal + ' records).');
      }, 900);
    }
  }

  /* ============================================================
     3. INVOICE — white background + "select print" dialog
     ============================================================ */
  function showPrintDialog () {
    if ($('printOptOverlay')) return;
    var ov = document.createElement('div');
    ov.className = 'print-opt-overlay';
    ov.id = 'printOptOverlay';
    ov.innerHTML =
      '<div class="print-opt-modal" role="dialog" aria-modal="true" aria-label="Print options">' +
        '<h3 class="print-opt-title"><i class="fas fa-print"></i> Print Invoice</h3>' +
        '<p class="print-opt-sub">Your invoice will open as a clean A4 portrait page. Continue to choose your printer.</p>' +
        '<div class="print-opt-grid">' +
          '<div class="print-opt-item"><span>Document</span><strong>This invoice</strong></div>' +
          '<div class="print-opt-item"><span>Paper size</span><strong>A4 portrait</strong></div>' +
        '</div>' +
        '<div class="print-opt-actions">' +
          '<button class="btn-secondary" id="poCancel">Cancel</button>' +
          '<button class="btn-primary" id="poPrint"><i class="fas fa-print"></i> Continue to Print</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);

    $('poCancel').addEventListener('click', function () { ov.remove(); });
    ov.addEventListener('click', function (e) { if (e.target === ov) ov.remove(); });
    $('poPrint').addEventListener('click', function () {
      ov.remove();
      setTimeout(function () {
        if (window.FMSInvoice && typeof window.FMSInvoice.print === 'function') window.FMSInvoice.print();
        else window.print();
      }, 60);
    });
  }

  function initInvoicePrint () {
    /* Invoice always renders on a clean white sheet */
    injectCSS('.inv-wrapper,.invoice-doc,.invoice-paper,#invoiceRenderArea,#printArea{background:#ffffff !important}' +
              '@media print{html,body{background:#ffffff !important}}');

    var btn = $('invoicePrintBtn');
    if (btn) {
      /* Capture phase: runs before the built-in handler, opens the options dialog */
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopImmediatePropagation();
        showPrintDialog();
      }, true);
    }
  }

  /* ============================================================
     4. RESET PASSWORD helper (used by the Staff Access list)
     ============================================================ */
  window.FMSResetStaffPassword = function (username, newPassword) {
    return FMSSha256(newPassword).then(function (hash) {
      var list = [];
      try { list = JSON.parse(localStorage.getItem('fms_staff_accounts_v1') || '[]'); } catch (_) {}
      var acc = list.find(function (a) {
        return String(a.username || '').toLowerCase() === String(username || '').toLowerCase();
      });
      if (!acc) return false;
      acc.passwordHash = hash;
      try { localStorage.setItem('fms_staff_accounts_v1', JSON.stringify(list)); } catch (_) {}
      broadcast('password');
      return true;
    });
  };

  /* ============================================================
     BOOT
     ============================================================ */
  function boot () {
    initCompanyName();
    initInvoicePrint();

    /* Do not copy a loan into other service tables. That legacy behaviour
       created synthetic records which inflated summaries and made reports
       disagree with the source system record. Existing records are left
       untouched; only new automatic duplication is prevented. */
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
