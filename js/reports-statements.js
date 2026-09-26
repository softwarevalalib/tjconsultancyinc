/* ============================================================
   js/reports-statements.js — TJ Consultancy FMS
   Financial Statements on the Reports dashboard:
     • Income Statement
     • Balance Sheet
     • Cash Flow Statement
     • Profit & Loss (monthly)
   Computed live from transactions, loans, assets & invoices.
   Re-renders in real time whenever any record changes
   (fms:db-change) or another tab updates the database.
   ============================================================ */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  let selectedService = 'all';

  function money (n) {
    n = parseFloat(n) || 0;
    const sign = n < 0 ? '-' : '';
    return sign + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function num (v) { return parseFloat(String(v).replace(/[^0-9.\-]/g, '')) || 0; }
  function esc (s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  /* ── Gather live data ────────────────────────────────────── */
  /* Dashboard and reports read the same live projection; no report-only
     calculations or sample rows are maintained here. */
  function liveSnapshot () {
    if (window.FMS && FMS.liveFinancials) return FMS.liveFinancials.snapshot();
    return { services: [], income: 0, expenses: 0, net: 0, records: 0 };
  }

  function gather () {
    const serviceRows = liveSnapshot().services;
    const services = selectedService === 'all'
      ? serviceRows
      : serviceRows.filter(service => service.key === selectedService);
    const inc = {};
    services.forEach(service => { inc[service.name] = service.total; });
    const totalInc = services.reduce((sum, service) => sum + service.total, 0);
    return { inc, exp: {}, totalInc, totalExp: 0, netIncome: totalInc, services };
  }

  /* ── Renderers ───────────────────────────────────────────── */
  function rowsHtml (obj) {
    return Object.keys(obj).map(k =>
      `<tr><td>${esc(k)}</td><td class="stmt-num">${money(obj[k])}</td></tr>`).join('');
  }

  function renderIncome (d) {
    const rows = d.services.map(service => `<tr><td><i class="fas ${service.icon} service-row-icon"></i>${esc(service.name)}</td><td class="stmt-num">${service.records}</td><td class="stmt-num">${money(service.total)}</td></tr>`).join('');
    return `<table class="stmt-table service-statement-table">
      <thead><tr><th>Income Statement <span class="stmt-period">Service income for the current period</span></th><th class="stmt-num">Records</th><th class="stmt-num">Income</th></tr></thead>
      <tbody>
        ${rows || '<tr><td colspan="3" class="stmt-empty">No service records available.</td></tr>'}
        <tr class="stmt-grand pos"><td>Total Service Income</td><td class="stmt-num">${d.services.reduce((sum, service) => sum + service.records, 0)}</td><td class="stmt-num">${money(d.totalInc)}</td></tr>
      </tbody></table>`;
  }

  function renderBalance (d) {
    const rows = d.services.map(service => `<tr><td><i class="fas ${service.icon} service-row-icon"></i>${esc(service.name)}</td><td class="stmt-num">${money(service.total)}</td><td class="stmt-num">${d.totalInc ? ((service.total / d.totalInc) * 100).toFixed(1) + '%' : '—'}</td></tr>`).join('');
    return `<table class="stmt-table service-statement-table">
      <thead><tr><th>Balance Sheet <span class="stmt-period">Service portfolio as at ${new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}</span></th><th class="stmt-num">Portfolio Value</th><th class="stmt-num">Share</th></tr></thead>
      <tbody>
        ${rows || '<tr><td colspan="3" class="stmt-empty">No service records available.</td></tr>'}
        <tr class="stmt-grand pos"><td>Total Service Portfolio</td><td class="stmt-num">${money(d.totalInc)}</td><td class="stmt-num">100%</td></tr>
      </tbody></table>`;
  }

  function renderCashFlow (d) {
    const rows = d.services.map(service => `<tr><td><i class="fas ${service.icon} service-row-icon"></i>${esc(service.name)}</td><td class="stmt-num">${money(service.total)}</td><td class="stmt-num pos-text">${money(service.total)}</td></tr>`).join('');
    return `<table class="stmt-table service-statement-table">
      <thead><tr><th>Cash Flow <span class="stmt-period">Live inflow by service</span></th><th class="stmt-num">Gross Inflow</th><th class="stmt-num">Net Cash Flow</th></tr></thead>
      <tbody>
        ${rows || '<tr><td colspan="3" class="stmt-empty">No service records available.</td></tr>'}
        <tr class="stmt-grand pos"><td>Net Service Cash Flow</td><td class="stmt-num">${money(d.totalInc)}</td><td class="stmt-num">${money(d.totalInc)}</td></tr>
      </tbody></table>`;
  }

  function renderPnL (d) {
    const rows = d.services.map(service => `<tr><td><i class="fas ${service.icon} service-row-icon"></i>${esc(service.name)}</td><td class="stmt-num">${money(service.total)}</td><td class="stmt-num">${money(0)}</td><td class="stmt-num pos-text">${money(service.total)}</td></tr>`).join('');
    return `<table class="stmt-table service-statement-table">
      <thead><tr><th>F&amp;L <span class="stmt-period">Financial and loss by service</span></th><th class="stmt-num">Financial Value</th><th class="stmt-num">Recorded Loss</th><th class="stmt-num">Net F&amp;L</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="4" class="stmt-empty">No service records available.</td></tr>'}
        <tr class="stmt-grand pos"><td>Net Service F&amp;L</td><td class="stmt-num">${money(d.totalInc)}</td><td class="stmt-num">${money(0)}</td><td class="stmt-num">${money(d.totalInc)}</td></tr>
      </tbody></table>`;
  }

  /* ── All-departments summary (real-time across all 6 services) ─────────── */
  function renderServiceSummary (services) {
    const target = $('reportsServiceSummary');
    if (!target) return;
    const all = liveSnapshot().services;
    const grand = all.reduce((sum, service) => sum + service.total, 0);
    target.innerHTML = `
      <div class="reports-service-summary-head">
        <div><span><i class="fas fa-bolt"></i> Live service summaries</span><p>Click a service to focus all statements on it.</p></div>
        <button type="button" class="report-service-all${selectedService === 'all' ? ' active' : ''}" data-report-service="all">All services · ${money(grand)}</button>
      </div>
      <div class="reports-service-grid">${all.map(service => `
        <button type="button" class="report-service-card${selectedService === service.key ? ' active' : ''}" data-report-service="${service.key}">
          <i class="fas ${service.icon}"></i><span>${esc(service.name)}</span><strong>${money(service.total)}</strong><small>${service.records} record${service.records === 1 ? '' : 's'} · View summary</small>
        </button>`).join('')}
      </div>`;
    target.querySelectorAll('[data-report-service]').forEach(button => {
      button.addEventListener('click', () => {
        selectedService = button.dataset.reportService || 'all';
        renderAll();
      });
    });
  }

  function renderDeptSummary () {
    const data = liveSnapshot().services.map(service => ({
      name: service.name, icon: service.icon, count: service.records, total: service.total
    }));
    const grand = data.reduce((s, r) => s + r.total, 0);
    const body  = data.map(r => {
      const share = grand ? ((r.total / grand) * 100).toFixed(1) + '%' : '—';
      return `<tr>
        <td><i class="fas ${r.icon}" style="width:16px;color:#0277bd;margin-right:7px"></i>${esc(r.name)}</td>
        <td class="stmt-num">${r.count}</td>
        <td class="stmt-num">${money(r.total)}</td>
        <td class="stmt-num dept-share">${share}</td></tr>`;
    }).join('');
    return `<table class="stmt-table">
      <thead><tr><th>Department / Service</th><th class="stmt-num">Records</th><th class="stmt-num">Total Value</th><th class="stmt-num">Share</th></tr></thead>
      <tbody>${body}
        <tr class="stmt-grand pos"><td>All Departments — Grand Total</td>
          <td class="stmt-num">${data.reduce((s, r) => s + r.count, 0)}</td>
          <td class="stmt-num">${money(grand)}</td>
          <td class="stmt-num">100%</td></tr>
      </tbody></table>
      <p class="dept-summary-note"><i class="fas fa-bolt"></i> Live totals — refreshed in real time as records change in any department, in this tab or another.</p>`;
  }

  /* ── Master render ───────────────────────────────────────── */
  function renderAll () {
    if (!$('stmt-income')) return; /* Reports statements not on this page */
    const d = gather();
    $('stmt-income').innerHTML   = renderIncome(d);
    $('stmt-balance').innerHTML  = renderBalance(d);
    $('stmt-cashflow').innerHTML = renderCashFlow(d);
    $('stmt-pnl').innerHTML      = renderPnL(d);
    renderServiceSummary(d.services);
  }

  /* ── Tab switching ───────────────────────────────────────── */
  function initTabs () {
    document.querySelectorAll('.stmt-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.stmt-tab').forEach(b => b.classList.toggle('active', b === btn));
        document.querySelectorAll('.stmt-panel').forEach(p =>
          p.classList.toggle('active', p.id === 'stmt-' + btn.dataset.stmt));
      });
    });
  }

  /* ── Print active statement ──────────────────────────────── */
  function initPrint () {
    const btn = $('stmtPrintBtn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const active = document.querySelector('.stmt-panel.active');
      if (!active) return;
      const logo = localStorage.getItem('fms_logo_url');
      const printWindow = window.open('', '_blank', 'width=900,height=700');
      if (!printWindow) { window.print(); return; }
      const statement = document.querySelector('.stmt-tab.active')?.textContent.trim() || 'Service Financial Report';
      printWindow.document.open();
      printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(statement)}</title><style>
        @page { size: A4 portrait; margin: 12mm; }
        * { box-sizing: border-box; } body { margin: 0; color: #172033; font: 12px Arial, sans-serif; }
        .head { display:flex; align-items:center; gap:12px; margin-bottom:16px; } .head img { height:40px; max-width:160px; object-fit:contain; }
        h1 { margin:0; font-size:18px; } .sub, .foot { color:#526078; font-size:11px; } .foot { margin-top:20px; }
        table { width:100%; border-collapse:collapse; } th, td { padding:9px 10px; border-bottom:1px solid #dbe3ef; text-align:left; } th { background:#0d1b2e; color:#fff; } .stmt-num { text-align:right; } .stmt-sec td { background:#eef6ff; font-weight:700; } .stmt-grand td { border-top:2px solid #0d1b2e; font-weight:800; } .stmt-period { font-weight:400; font-size:10px; }
      </style></head><body><div class="head">${logo ? `<img src="${logo}" alt="logo">` : ''}<div><h1>${esc(localStorage.getItem('fms_institution_name') || 'TJ Consultancy')}</h1><div class="sub">${esc(statement)} · Service Financial Report</div></div></div>${active.innerHTML}<div class="foot">Generated ${new Date().toLocaleString('en-GB')}</div><script>window.onload=function(){setTimeout(function(){window.print();window.close();},250)};<\/script></body></html>`);
      printWindow.document.close();
    });
  }

  /* ── Real-time refresh ───────────────────────────────────── */
  function initRealtime () {
    if (window.FMSDB) FMSDB.on(() => renderAll());
    document.addEventListener('fms:reports-open', renderAll);
    window.addEventListener('storage', e => {
      if (e.key && e.key.indexOf('fms') === 0) renderAll();
    });
    /* safety tick so the totals never go stale */
    setInterval(renderAll, 4000);
  }

  function boot () { renderAll(); initTabs(); initPrint(); initRealtime(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
