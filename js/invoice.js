/**
 * invoice.js — TJ Consultancy FMS
 * Microsoft-style Invoice Generator
 *
 * Reads institution settings from localStorage:
 *   fms_institution_name     – Institution / company name
 *   fms_institution_location – Address / location
 *   fms_president_name       – Name of the president / authorised signatory
 *   fms_logo_url             – Company logo (DataURL)
 *
 * Public API (attached to window):
 *   window.FMSInvoice.open(loan)   – open the invoice modal for a given loan object
 *   window.FMSInvoice.close()      – close the modal
 */

(function () {
  'use strict';

  /* ── localStorage keys ───────────────────────────────────── */
  const LS_INST_NAME     = 'fms_institution_name';
  const LS_INST_LOCATION = 'fms_institution_location';
  const LS_PRESIDENT     = 'fms_president_name';
  const LS_LOGO          = 'fms_logo_url';
  const LS_INVOICE_CTR   = 'fms_invoice_counter';
  let currentInvoice     = null;

  function lsGet (k, fallback) {
    try { return localStorage.getItem(k) || fallback; } catch (_) { return fallback; }
  }
  function lsSet (k, v) { try { localStorage.setItem(k, v); } catch (_) {} }

  /* ── Helpers ─────────────────────────────────────────────── */
  const $ = id => document.getElementById(id);

  function fmtMoney (val) {
    if (val === null || val === undefined || isNaN(+val)) return '$0.00';
    return '$' + (+val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtDate (iso) {
    if (!iso) return '—';
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }

  function todayISO () {
    return new Date().toISOString().slice(0, 10);
  }

  function nextInvoiceNumber () {
    const ctr = parseInt(lsGet(LS_INVOICE_CTR, '0'), 10) + 1;
    lsSet(LS_INVOICE_CTR, String(ctr));
    return 'INV-' + String(ctr).padStart(5, '0');
  }

  function escH (str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ── Build Loan Report Calculation section ───────────────── */
  function buildLoanReportSection (loan, presidentName) {
    /* Use loan values, falling back to the canonical defaults */
    const principal = parseFloat(loan.amount)   || 1000;
    const rate      = parseFloat(loan.rate)      || 15;
    const duration  = parseFloat(loan.duration)  || 6;

    /* Flat-rate formula: interest = principal × (rate/100) × (months/12) */
    const monthlyInterest = Math.round((principal * rate + Number.EPSILON)) / 100;
    const interest       = Number.isFinite(Number(loan.interest))
      ? Number(loan.interest)
      : monthlyInterest * duration;
    const totalDue       = principal + interest;
    const presidentShare = totalDue * 0.50;
    const clientShare    = totalDue * 0.50;

    return `
      <!-- ── LOAN REPORT CALCULATION ─────────────────────────── -->
      <div class="inv-loan-report">

        <div class="inv-lr-header">
          <div class="inv-lr-header-icon"><i class="fas fa-calculator"></i></div>
          <div class="inv-lr-header-text">
            <div class="inv-lr-title">Loan Report &amp; Calculation</div>
            <div class="inv-lr-subtitle">Flat-rate interest summary · ${duration}-month term</div>
          </div>
        </div>

        <!-- Calculation breakdown table -->
        <div class="inv-lr-table-wrap">
          <table class="inv-lr-table">
            <thead>
              <tr>
                <th class="inv-lr-th">PARAMETER</th>
                <th class="inv-lr-th">FORMULA / BASIS</th>
                <th class="inv-lr-th inv-lr-th-right">AMOUNT (USD)</th>
              </tr>
            </thead>
            <tbody>
              <tr class="inv-lr-tr">
                <td class="inv-lr-td">
                  <span class="inv-lr-dot inv-lr-dot--blue"></span>
                  <span class="inv-lr-row-label">Principal (P)</span>
                </td>
                <td class="inv-lr-td inv-lr-td-formula">Loan capital disbursed</td>
                <td class="inv-lr-td inv-lr-td-right">${fmtMoney(principal)}</td>
              </tr>
              <tr class="inv-lr-tr">
                <td class="inv-lr-td">
                  <span class="inv-lr-dot inv-lr-dot--amber"></span>
                  <span class="inv-lr-row-label">Monthly Rate (R)</span>
                </td>
                <td class="inv-lr-td inv-lr-td-formula">Monthly flat interest rate</td>
                <td class="inv-lr-td inv-lr-td-right">${rate}% p.m.</td>
              </tr>
              <tr class="inv-lr-tr">
                <td class="inv-lr-td">
                  <span class="inv-lr-dot inv-lr-dot--slate"></span>
                  <span class="inv-lr-row-label">Duration (T)</span>
                </td>
                <td class="inv-lr-td inv-lr-td-formula">Loan term in months</td>
                <td class="inv-lr-td inv-lr-td-right">${duration} months</td>
              </tr>
              <tr class="inv-lr-tr inv-lr-tr--accent">
                <td class="inv-lr-td">
                  <span class="inv-lr-dot inv-lr-dot--teal"></span>
                  <span class="inv-lr-row-label">Interest (I)</span>
                </td>
                <td class="inv-lr-td inv-lr-td-formula">
                  I = P × R × T<br>
                  <span class="inv-lr-formula-detail">= ${fmtMoney(principal)} × ${rate}% × ${duration}/12</span>
                </td>
                <td class="inv-lr-td inv-lr-td-right inv-lr-td-highlight">${fmtMoney(interest)}</td>
              </tr>
              <tr class="inv-lr-tr inv-lr-tr--total">
                <td class="inv-lr-td inv-lr-td-total-label" colspan="2">
                  <i class="fas fa-equals inv-lr-eq-icon"></i>
                  Total Amount Due (P + I)
                </td>
                <td class="inv-lr-td inv-lr-td-right inv-lr-td-total">${fmtMoney(totalDue)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- President's share strip -->
        <div class="inv-lr-share-strip">
          <div class="inv-lr-share-badge">
            <i class="fas fa-user-tie"></i>
            <span>President's 50% Share</span>
          </div>
          <div class="inv-lr-share-calc">
            <span class="inv-lr-share-expr">${fmtMoney(totalDue)} × 50%</span>
            <i class="fas fa-arrow-right inv-lr-arrow"></i>
            <span class="inv-lr-share-result">${fmtMoney(presidentShare)}</span>
          </div>
        </div>

        <!-- Two share boxes -->
        <div class="inv-lr-split-boxes">
          <div class="inv-lr-split-box inv-lr-split-box--pres">
            <div class="inv-lr-split-icon"><i class="fas fa-user-tie"></i></div>
            <div class="inv-lr-split-body">
              <div class="inv-lr-split-name">${escH(presidentName || 'President')}</div>
              <div class="inv-lr-split-role">President · 50% Entitlement</div>
              <div class="inv-lr-split-amount">${fmtMoney(presidentShare)}</div>
              <div class="inv-lr-split-basis">50% of ${fmtMoney(totalDue)} total repayment</div>
            </div>
          </div>
          <div class="inv-lr-split-box inv-lr-split-box--client">
            <div class="inv-lr-split-icon"><i class="fas fa-user"></i></div>
            <div class="inv-lr-split-body">
              <div class="inv-lr-split-name">Remaining Balance</div>
              <div class="inv-lr-split-role">Institutional Reserve · 50%</div>
              <div class="inv-lr-split-amount">${fmtMoney(clientShare)}</div>
              <div class="inv-lr-split-basis">50% of ${fmtMoney(totalDue)} total repayment</div>
            </div>
          </div>
        </div>

        <!-- Summary footer line -->
        <div class="inv-lr-footer-line">
          <i class="fas fa-info-circle"></i>
          Calculation basis: Flat-rate method — interest does not compound.
          Total repayment of <strong>${fmtMoney(totalDue)}</strong> is split equally:
          <strong>${fmtMoney(presidentShare)}</strong> to the President and
          <strong>${fmtMoney(clientShare)}</strong> to Institutional Reserve.
        </div>

      </div>
    `;
  }

  /* ── Build HTML for the printable invoice ────────────────── */
  function buildLegacyInvoiceHTML (loan) {
    const institutionName     = lsGet(LS_INST_NAME,     'TJ Consultancy');
    const institutionLocation = lsGet(LS_INST_LOCATION, '—');
    const presidentName       = lsGet(LS_PRESIDENT,     '—');
    const logoUrl             = lsGet(LS_LOGO,          '');
    const invoiceNumber       = nextInvoiceNumber();
    const invoiceDate         = fmtDate(todayISO());
    const dueDate             = fmtDate(loan.date);

    /* Logo HTML */
    const logoHTML = logoUrl
      ? '<img src="' + logoUrl + '" alt="' + escH(institutionName) + ' Logo" class="inv-logo-img" />'
      : '<div class="inv-logo-placeholder"><i class="fas fa-building"></i></div>';

    /* Colour accent bar */
    return `
      <div class="inv-wrapper" id="invoicePrintArea">

        <!-- ── HEADER BAND ─────────────────────────────────── -->
        <div class="inv-header-band">
          <div class="inv-brand-block">
            <div class="inv-logo-wrap">
              ${logoHTML}
            </div>
            <div class="inv-brand-text">
              <div class="inv-company-name">${escH(institutionName)}</div>
              <div class="inv-company-location">
                <i class="fas fa-map-marker-alt"></i>
                ${escH(institutionLocation)}
              </div>
            </div>
          </div>
          <div class="inv-title-block">
            <div class="inv-title-word">INVOICE</div>
            <div class="inv-number-badge">${escH(invoiceNumber)}</div>
          </div>
        </div>

        <!-- ── META ROW ────────────────────────────────────── -->
        <div class="inv-meta-row">
          <div class="inv-meta-item">
            <span class="inv-meta-label">Invoice Date</span>
            <span class="inv-meta-value">${invoiceDate}</span>
          </div>
          <div class="inv-meta-item">
            <span class="inv-meta-label">Loan Start Date</span>
            <span class="inv-meta-value">${dueDate}</span>
          </div>
          <div class="inv-meta-item">
            <span class="inv-meta-label">Reference</span>
            <span class="inv-meta-value">Loan #${loan.number}</span>
          </div>
          <div class="inv-meta-item inv-meta-item--status">
            <span class="inv-status-pill">ISSUED</span>
          </div>
        </div>

        <!-- ── BILL-TO SECTION ──────────────────────────────── -->
        <div class="inv-bill-section">
          <div class="inv-bill-to">
            <div class="inv-section-label">BILL TO</div>
            <div class="inv-client-name">${escH(loan.clientName)}</div>
            <div class="inv-client-sub">Loan Client</div>
          </div>
          <div class="inv-bill-from">
            <div class="inv-section-label">ISSUED BY</div>
            <div class="inv-from-name">${escH(institutionName)}</div>
            <div class="inv-from-location">${escH(institutionLocation)}</div>
          </div>
        </div>

        <!-- ── LINE ITEMS TABLE ─────────────────────────────── -->
        <div class="inv-table-wrap">
          <table class="inv-table">
            <thead>
              <tr>
                <th class="inv-th inv-th-desc">DESCRIPTION</th>
                <th class="inv-th inv-th-detail">DETAILS</th>
                <th class="inv-th inv-th-amount">AMOUNT (USD)</th>
              </tr>
            </thead>
            <tbody>
              <tr class="inv-tr">
                <td class="inv-td inv-td-desc">
                  <div class="inv-item-title">Principal Loan Amount</div>
                  <div class="inv-item-sub">Capital disbursed — ${loan.duration} month term @ ${loan.rate}% per month</div>
                </td>
                <td class="inv-td inv-td-detail">
                  <span class="inv-pill inv-pill-blue">Principal</span>
                </td>
                <td class="inv-td inv-td-amount">${fmtMoney(loan.amount)}</td>
              </tr>
              <tr class="inv-tr">
                <td class="inv-td inv-td-desc">
                  <div class="inv-item-title">Interest Charge</div>
                  <div class="inv-item-sub">Flat interest: Principal × ${loan.rate}% × ${loan.duration}/12 months</div>
                </td>
                <td class="inv-td inv-td-detail">
                  <span class="inv-pill inv-pill-amber">Interest</span>
                </td>
                <td class="inv-td inv-td-amount">${fmtMoney(loan.interest)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- ── TOTALS SECTION ───────────────────────────────── -->
        <div class="inv-totals-section">
          <div class="inv-totals-table">
            <div class="inv-totals-row">
              <span class="inv-totals-label">Subtotal (Principal)</span>
              <span class="inv-totals-val">${fmtMoney(loan.amount)}</span>
            </div>
            <div class="inv-totals-row">
              <span class="inv-totals-label">Interest Charges</span>
              <span class="inv-totals-val">${fmtMoney(loan.interest)}</span>
            </div>
            <div class="inv-totals-row inv-totals-row--divider"></div>
            <div class="inv-totals-row inv-totals-row--grand">
              <span class="inv-totals-label inv-totals-label--grand">TOTAL PAYMENT DUE</span>
              <span class="inv-totals-val inv-totals-val--grand">${fmtMoney(loan.total)}</span>
            </div>
          </div>
        </div>

        <!-- ── PAYMENT SUMMARY BOXES ────────────────────────── -->
        <div class="inv-summary-boxes">
          <div class="inv-sum-box inv-sum-box--blue">
            <div class="inv-sum-icon"><i class="fas fa-hand-holding-usd"></i></div>
            <div class="inv-sum-content">
              <div class="inv-sum-label">Principal Amount</div>
              <div class="inv-sum-value">${fmtMoney(loan.amount)}</div>
            </div>
          </div>
          <div class="inv-sum-box inv-sum-box--amber">
            <div class="inv-sum-icon"><i class="fas fa-percentage"></i></div>
            <div class="inv-sum-content">
              <div class="inv-sum-label">Interest Amount</div>
              <div class="inv-sum-value">${fmtMoney(loan.interest)}</div>
            </div>
          </div>
          <div class="inv-sum-box inv-sum-box--green">
            <div class="inv-sum-icon"><i class="fas fa-dollar-sign"></i></div>
            <div class="inv-sum-content">
              <div class="inv-sum-label">Total Payment</div>
              <div class="inv-sum-value">${fmtMoney(loan.total)}</div>
            </div>
          </div>
        </div>

        <!-- ── NOTES ────────────────────────────────────────── -->
        <div class="inv-notes">
          <div class="inv-notes-title">Payment Terms &amp; Notes</div>
          <p class="inv-notes-body">
            Payment is due as per the agreed monthly repayment schedule. Monthly instalment:
            <strong>${fmtMoney(loan.monthlyTotal || (loan.total / loan.duration))}</strong>
            over <strong>${loan.duration} months</strong>.
            Please reference Invoice <strong>${escH(invoiceNumber)}</strong> with all payments.
          </p>
        </div>

        ${buildLoanReportSection(loan, presidentName)}

        <!-- ── SIGNATURE ─────────────────────────────────────── -->
        <div class="inv-signature-row">
          <div class="inv-sig-block">
            <div class="inv-sig-line"></div>
            <div class="inv-sig-name">${escH(presidentName)}</div>
            <div class="inv-sig-title">President / Authorised Signatory</div>
            <div class="inv-sig-company">${escH(institutionName)}</div>
          </div>
          <div class="inv-sig-block inv-sig-block--client">
            <div class="inv-sig-line"></div>
            <div class="inv-sig-name">${escH(loan.clientName)}</div>
            <div class="inv-sig-title">Client Signature</div>
            <div class="inv-sig-company">Date: _______________</div>
          </div>
        </div>

        <!-- ── FOOTER BAND ──────────────────────────────────── -->
        <div class="inv-footer-band">
          <span><i class="fas fa-building"></i> ${escH(institutionName)}</span>
          <span><i class="fas fa-map-marker-alt"></i> ${escH(institutionLocation)}</span>
          <span><i class="fas fa-file-invoice"></i> ${escH(invoiceNumber)}</span>
        </div>

      </div>
    `;
  }

  /* ── Open modal ──────────────────────────────────────────── */
  function resolveCurrentLoan () {
    if (!currentInvoice) return null;

    if (currentInvoice.loanId && window.FMSDB) {
      try {
        const liveLoans = FMSDB.table('loans', []);
        const liveLoan = liveLoans.find(row => row.id === currentInvoice.loanId);
        if (liveLoan) return Object.assign({}, liveLoan);
        if (Array.isArray(liveLoans)) return null;
      } catch (_) {}
    }

    return currentInvoice.fallbackLoan || null;
  }

  function getRepaymentState (loan, total, duration) {
    const paidPayments = loan.paidPayments instanceof Set
      ? Array.from(loan.paidPayments)
      : Array.isArray(loan.paidPayments) ? loan.paidPayments : [];

    try {
      if (window.LoanEngine && typeof window.LoanEngine.buildSchedule === 'function') {
        const schedule = window.LoanEngine.buildSchedule(Object.assign({}, loan, {
          paidPayments: new Set(paidPayments)
        }));
        const paidRows = schedule.filter(row => row.status === 'paid');
        const paidAmount = paidRows.reduce((sum, row) => sum + (Number(row.total) || 0), 0);
        return {
          paidCount: paidRows.length,
          paidAmount,
          outstanding: Math.max(0, total - paidAmount)
        };
      }
    } catch (_) {}

    const paidCount = paidPayments.filter(payment => Number(payment) >= 1 && Number(payment) <= duration).length;
    const paidAmount = duration ? Math.min(total, (total / duration) * paidCount) : 0;
    return { paidCount, paidAmount, outstanding: Math.max(0, total - paidAmount) };
  }

  function buildInvoiceHTML (loan, invoice) {
    const institutionName = lsGet(LS_INST_NAME, 'TJ Consultancy');
    const institutionLocation = lsGet(LS_INST_LOCATION, '');
    const logoUrl = lsGet(LS_LOGO, '');
    const loanNumber = loan.number || '---';
    const duration = Number(loan.duration) || 0;
    const total = Number(loan.total) || (Number(loan.amount) + Number(loan.interest)) || 0;
    const monthlyPayment = Number(loan.monthlyTotal) || (duration ? total / duration : total);
    const repayment = getRepaymentState(loan, total, duration);
    const mark = escH(institutionName.trim().slice(0, 2).toUpperCase() || 'TJ');
    const logo = logoUrl
      ? `<img class="inv-simple-logo" src="${logoUrl}" alt="${escH(institutionName)} logo">`
      : `<div class="inv-simple-mark">${mark}</div>`;

    return `
      <section class="inv-simple" id="invoicePrintArea">
        <header class="inv-simple-header">
          <div class="inv-simple-brand">
            ${logo}
            <div>
              <h1>${escH(institutionName)}</h1>
              ${institutionLocation ? `<p>${escH(institutionLocation)}</p>` : ''}
            </div>
          </div>
          <div class="inv-simple-title">
            <span>INVOICE</span>
            <strong>${escH(invoice.number)}</strong>
          </div>
        </header>

        <div class="inv-simple-meta">
          <div><span>Issue date</span><strong>${fmtDate(invoice.issuedOn)}</strong></div>
          <div><span>Loan reference</span><strong>Loan #${escH(loanNumber)}</strong></div>
          <div><span>Loan start</span><strong>${fmtDate(loan.date)}</strong></div>
        </div>

        <div class="inv-simple-parties">
          <div>
            <span class="inv-simple-label">Bill to</span>
            <strong>${escH(loan.clientName)}</strong>
            <p>Loan client</p>
          </div>
          <div>
            <span class="inv-simple-label">Issued by</span>
            <strong>${escH(institutionName)}</strong>
            ${institutionLocation ? `<p>${escH(institutionLocation)}</p>` : ''}
          </div>
        </div>

        <table class="inv-simple-table">
          <thead><tr><th>Description</th><th>Details</th><th>Amount (USD)</th></tr></thead>
          <tbody>
            <tr><td><strong>Principal loan amount</strong></td><td>${duration} month term at ${escH(loan.rate)}% per month</td><td>${fmtMoney(loan.amount)}</td></tr>
            <tr><td><strong>Flat interest charge</strong></td><td>Agreed loan interest</td><td>${fmtMoney(loan.interest)}</td></tr>
          </tbody>
        </table>

        <div class="inv-simple-total">
          <div><span>Total repayment</span><strong>${fmtMoney(total)}</strong></div>
          <div><span>Payments received</span><strong>${fmtMoney(repayment.paidAmount)}</strong></div>
          <div class="inv-simple-grand-total"><span>Outstanding payment due</span><strong>${fmtMoney(repayment.outstanding)}</strong></div>
        </div>

        <div class="inv-simple-terms">
          <span>Payment plan</span>
          <strong>${fmtMoney(monthlyPayment)} per month for ${duration} month${duration === 1 ? '' : 's'} (${repayment.paidCount} of ${duration} payments received)</strong>
          <p>Please use invoice ${escH(invoice.number)} as the payment reference.</p>
        </div>

        <footer class="inv-simple-footer">
          <span>Thank you for your business.</span>
          <span>${escH(institutionName)} &middot; ${escH(invoice.number)}</span>
        </footer>
      </section>`;
  }

  function renderCurrentInvoice () {
    const area = $('invoiceRenderArea');
    const loan = resolveCurrentLoan();
    if (!area || !loan || !currentInvoice) return null;

    currentInvoice.fallbackLoan = loan;
    area.innerHTML = buildInvoiceHTML(loan, currentInvoice);
    return loan;
  }

  function openInvoice (loan) {
    if (!loan) return;

    const modal   = $('invoiceModal');
    const area    = $('invoiceRenderArea');
    if (!modal || !area) return;

    /* Keep a stable invoice number while the visible data refreshes live. */
    currentInvoice = {
      loanId: loan.id || null,
      fallbackLoan: Object.assign({}, loan),
      number: nextInvoiceNumber(),
      issuedOn: todayISO()
    };
    renderCurrentInvoice();

    /* Reveal modal */
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  /* ── Close modal ─────────────────────────────────────────── */
  function closeInvoice () {
    const modal = $('invoiceModal');
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  /* ── Print ───────────────────────────────────────────────── */
  function printLegacyInvoice () {
    const area = $('invoicePrintArea');
    if (!area) { window.print(); return; }

    /* Clone into a new window for clean print */
    const printWin = window.open('', '_blank', 'width=900,height=700');
    if (!printWin) { window.print(); return; }

    const styles = Array.from(document.styleSheets)
      .map(ss => {
        try {
          return Array.from(ss.cssRules).map(r => r.cssText).join('\n');
        } catch (_) { return ''; }
      })
      .join('\n');

    printWin.document.open();
    printWin.document.write(
      '<!DOCTYPE html><html><head>' +
      '<meta charset="UTF-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>Invoice</title>' +
      '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" />' +
      '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">' +
      '<style>' + styles + '</style>' +
      '<style>@page{size:A4 portrait;margin:12mm}@media print{body{margin:0;padding:0;background:#fff!important;color:#000!important}.inv-wrapper{box-sizing:border-box!important;box-shadow:none!important;border:none!important;max-width:100%!important;width:100%!important;padding:0!important}}</style>' +
      '</head><body>' +
      area.outerHTML +
      '<' + 'script>window.onload=function(){setTimeout(function(){window.print();window.close();},600)};' + '<\/script>' +
      '</body></html>'
    );
    printWin.document.close();
  }

  /* ── Wire modal controls after DOM ready ─────────────────── */
  function printInvoice () {
    renderCurrentInvoice();
    const area = $('invoicePrintArea');
    if (!area) return;

    const printWin = window.open('', '_blank', 'width=900,height=900');
    if (!printWin) {
      window.print();
      return;
    }

    const printStyles = `
      @page { size: A4 portrait; margin: 0; }
      * { box-sizing: border-box; }
      html, body { width: 210mm; min-height: 297mm; margin: 0; padding: 0; background: #fff; color: #172033; font-family: Arial, Helvetica, sans-serif; }
      .inv-simple { width: 210mm; min-height: 297mm; padding: 14mm; display: flex; flex-direction: column; background: #fff; }
      .inv-simple-header { display: flex; justify-content: space-between; gap: 12mm; padding-bottom: 8mm; border-bottom: 2px solid #163a70; }
      .inv-simple-brand { display: flex; align-items: center; gap: 4mm; min-width: 0; }
      .inv-simple-logo, .inv-simple-mark { width: 15mm; height: 15mm; border-radius: 2mm; object-fit: contain; flex: 0 0 auto; }
      .inv-simple-mark { display: flex; align-items: center; justify-content: center; background: #163a70; color: #fff; font-size: 14pt; font-weight: 700; }
      .inv-simple-brand h1 { margin: 0; color: #163a70; font-size: 16pt; line-height: 1.2; }
      .inv-simple-brand p, .inv-simple-parties p, .inv-simple-terms p { margin: 1.5mm 0 0; color: #64748b; font-size: 9pt; line-height: 1.4; }
      .inv-simple-title { text-align: right; color: #163a70; }
      .inv-simple-title span { display: block; font-size: 20pt; font-weight: 800; letter-spacing: .08em; }
      .inv-simple-title strong { display: block; margin-top: 2mm; color: #475569; font-size: 9pt; }
      .inv-simple-meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5mm; padding: 6mm 0; border-bottom: 1px solid #dbe3ef; }
      .inv-simple-meta span, .inv-simple-label, .inv-simple-total span, .inv-simple-terms > span { display: block; color: #64748b; font-size: 7.5pt; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
      .inv-simple-meta strong { display: block; margin-top: 1.5mm; font-size: 9.5pt; }
      .inv-simple-parties { display: grid; grid-template-columns: 1fr 1fr; gap: 10mm; padding: 7mm 0; }
      .inv-simple-parties strong { display: block; margin-top: 2mm; color: #163a70; font-size: 11pt; }
      .inv-simple-table { width: 100%; border-collapse: collapse; font-size: 9pt; }
      .inv-simple-table th { padding: 3.5mm; background: #163a70; color: #fff; text-align: left; font-size: 7.5pt; letter-spacing: .06em; text-transform: uppercase; }
      .inv-simple-table th:last-child, .inv-simple-table td:last-child { text-align: right; white-space: nowrap; }
      .inv-simple-table td { padding: 4mm 3.5mm; border-bottom: 1px solid #dbe3ef; vertical-align: top; }
      .inv-simple-table td:nth-child(2) { color: #64748b; }
      .inv-simple-total { width: 72mm; margin: 7mm 0 0 auto; }
      .inv-simple-total > div { display: flex; justify-content: space-between; gap: 8mm; padding: 2mm 0; font-size: 9pt; }
      .inv-simple-total strong { white-space: nowrap; }
      .inv-simple-grand-total { margin-top: 2mm; padding: 4mm !important; background: #eef5ff; border-top: 2px solid #163a70; color: #163a70; }
      .inv-simple-grand-total strong { font-size: 13pt; }
      .inv-simple-terms { margin-top: 9mm; padding: 5mm; background: #f8fafc; border-left: 3px solid #2f80c0; }
      .inv-simple-terms strong { display: block; margin-top: 2mm; font-size: 10pt; }
      .inv-simple-footer { display: flex; justify-content: space-between; gap: 6mm; margin-top: auto; padding-top: 7mm; color: #64748b; border-top: 1px solid #dbe3ef; font-size: 8pt; }
      @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    `;

    printWin.document.open();
    printWin.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escH(currentInvoice ? currentInvoice.number : 'Invoice')}</title><style>${printStyles}</style></head><body>${area.outerHTML}<script>window.onload=function(){window.focus();setTimeout(function(){window.print();},150)};window.onafterprint=function(){window.close()};<\/script></body></html>`);
    printWin.document.close();
  }

  function initInvoiceModal () {
    const closeBtn  = $('invoiceModalClose');
    const backdrop  = $('invoiceModalBackdrop');
    const printBtn  = $('invoicePrintBtn');

    if (closeBtn)  closeBtn.addEventListener('click', closeInvoice);
    if (backdrop)  backdrop.addEventListener('click', closeInvoice);
    if (printBtn)  printBtn.addEventListener('click', printInvoice);

    document.addEventListener('fms:db-change', event => {
      const change = event.detail || {};
      const modal = $('invoiceModal');
      if (currentInvoice && modal && modal.classList.contains('open') && (change.table === 'loans' || change.table === '*')) {
        if (!renderCurrentInvoice()) closeInvoice();
      }
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        const modal = $('invoiceModal');
        if (modal && modal.classList.contains('open')) closeInvoice();
      }
    });

    /* ── Institution details settings UI ───────────────────── */
    loadInstDetails();
    wireInstDetailsSave();
  }

  /* ── Load saved institution details into Settings form ───── */
  function loadInstDetails () {
    const nameEl  = $('instNameInput');
    const locEl   = $('instLocationInput');
    const presEl  = $('presidentNameInput');
    if (nameEl)  nameEl.value  = lsGet(LS_INST_NAME,     '');
    if (locEl)   locEl.value   = lsGet(LS_INST_LOCATION, '');
    if (presEl)  presEl.value  = lsGet(LS_PRESIDENT,     '');
  }

  /* ── Save institution details on button click ─────────────── */
  function wireInstDetailsSave () {
    const btn    = $('saveInstDetailsBtn');
    const status = $('instSaveStatus');
    if (!btn) return;

    btn.addEventListener('click', () => {
      const name = ($('instNameInput')?.value  || '').trim();
      const loc  = ($('instLocationInput')?.value || '').trim();
      const pres = ($('presidentNameInput')?.value || '').trim();

      if (!name) {
        showInstStatus('Institution Name is required.', false, status);
        return;
      }

      lsSet(LS_INST_NAME,     name);
      lsSet(LS_INST_LOCATION, loc);
      lsSet(LS_PRESIDENT,     pres);

      const invoiceModal = $('invoiceModal');
      if (currentInvoice && invoiceModal && invoiceModal.classList.contains('open')) {
        renderCurrentInvoice();
      }

      /* Also update sidebar brand name if it matches old value */
      const brandEl = document.querySelector('.brand-name');
      if (brandEl && name) brandEl.textContent = name;

      showInstStatus('Institution details saved successfully!', true, status);
    });
  }

  function showInstStatus (msg, success, el) {
    if (!el) return;
    el.style.display     = 'block';
    el.style.background  = success ? 'rgba(34,197,94,0.1)'   : 'rgba(239,68,68,0.1)';
    el.style.color       = success ? '#4ade80'               : '#f87171';
    el.style.border      = success ? '1px solid rgba(34,197,94,0.25)' : '1px solid rgba(239,68,68,0.25)';
    el.style.borderRadius= '8px';
    el.style.padding     = '7px 12px';
    el.textContent       = msg;
    clearTimeout(el._timer);
    el._timer = setTimeout(() => { el.style.display = 'none'; }, 3500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initInvoiceModal);
  } else {
    initInvoiceModal();
  }

  /* ── Public API ──────────────────────────────────────────── */
  window.FMSInvoice = {
    open  : openInvoice,
    close : closeInvoice,
    print : printInvoice
  };

})();
