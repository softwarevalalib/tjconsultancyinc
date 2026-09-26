/**
 * loan-engine.js
 * TJ Consultancy FMS — Financial Management Loan Engine
 *
 * Handles:
 *  - Loan Entry form (auto-calculated fields)
 *  - Loan Entry (full calculated record table)
 *  - Monthly Schedule (per-client amortisation with status tracking)
 *  - Per-client Report Modal
 *  - CSV Export for each view
 *  - Print support for schedule & report
 *
 * Monthly flat-rate loan formulas:
 *   monthlyInterest = principal × (monthlyRate/100)
 *   interest        = monthlyInterest × duration
 *   total          = principal + interest
 *   monthlyPrinc   = principal / duration
 *   monthlyInt     = interest  / duration
 *   monthlyTotal   = monthlyPrinc + monthlyInt
 *   balance[n]     = principal − n × monthlyPrinc  (floors to 0 on last)
 */

(function () {
  "use strict";

  /* ─────────────────────────────────────────────────────────────
     UTILITIES
  ───────────────────────────────────────────────────────────── */

  function uid() {
    return (
      "loan-" +
      Math.random().toString(36).slice(2, 10) +
      Date.now().toString(36)
    );
  }

  function fmtMoney(val) {
    if (val === null || val === undefined || val === "" || isNaN(+val))
      return "—";
    return (
      "$" +
      (+val).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    );
  }

  /* Store and allocate money in cents whenever it is used in a repayment
     schedule. This prevents fractional-cent rounding from leaving a visible
     difference between the payment rows and the loan total. */
  function toCents(value) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue)
      ? Math.round((numericValue + Number.EPSILON) * 100)
      : 0;
  }

  function fromCents(value) {
    return value / 100;
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  /** Add n months to an ISO date string, return new ISO date string */
  function addMonths(isoDate, n) {
    const [year, month, day] = isoDate.split("-").map(Number);
    const targetMonth = month - 1 + n;
    const targetYear = year + Math.floor(targetMonth / 12);
    const targetMonthIndex = ((targetMonth % 12) + 12) % 12;
    const finalDay = Math.min(
      day,
      new Date(Date.UTC(targetYear, targetMonthIndex + 1, 0)).getUTCDate(),
    );

    return [targetYear, targetMonthIndex + 1, finalDay]
      .map((part, index) => (index === 0 ? String(part) : String(part).padStart(2, "0")))
      .join("-");
  }

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  function paymentMonthName(month) {
    return MONTH_NAMES[Number(month) - 1] || "—";
  }

  /* The month selector sets the first monthly due date. If that calendar
     month has already passed (or is the start month), it is the next year. */
  function firstPaymentDate(startDate, paymentMonth) {
    if (!startDate) return "";
    const [startYear, startMonth, startDay] = startDate.split("-").map(Number);
    const selectedMonth = Number(paymentMonth);
    if (!Number.isInteger(selectedMonth) || selectedMonth < 1 || selectedMonth > 12) {
      return addMonths(startDate, 1);
    }

    let year = startYear;
    if (selectedMonth <= startMonth) year += 1;
    const day = Math.min(
      startDay,
      new Date(Date.UTC(year, selectedMonth, 0)).getUTCDate(),
    );
    return [year, String(selectedMonth).padStart(2, "0"), String(day).padStart(2, "0")].join("-");
  }

  function defaultPaymentMonth(startDate) {
    if (!startDate) return "";
    const month = Number(startDate.slice(5, 7));
    return String(month === 12 ? 1 : month + 1);
  }

  function showToastLoan(msg) {
    // Re-use global showToast if available, else console.warn
    if (typeof showToast === "function") {
      showToast(msg);
    } else {
      console.warn("[LoanEngine]", msg);
    }
  }

  function $(id) {
    return document.getElementById(id);
  }
  function $$(sel, ctx) {
    return Array.from((ctx || document).querySelectorAll(sel));
  }

  /* Every signed-in FMS user may delete a business record. The shared backend
     enforces this rule for cloud data as well. */
  function canDeleteRecords() {
    return !!(window.FMSDB && typeof FMSDB.canDelete === 'function' && FMSDB.canDelete());
  }

  /* ─────────────────────────────────────────────────────────────
     LOAN STORE  (in-memory, seed data included)
  ───────────────────────────────────────────────────────────── */

  /**
   * Each loan record:
   *  id, number, clientName, date, amount, rate, duration,
   *  interest, total, monthlyPrincipal, monthlyInterest, monthlyTotal,
   *  amountPay (the calculated monthly payment), nextPaymentMonth,
   *  payments: [{ id, paymentNo?, amountCents, paidAt }].
   *
   * paidPayments is retained only to read existing saved records. New payment
   * entries are stored as cents so partial payments stay exact.
   */
  let loanStore = [];
  let loanCounter = 0;
  let entryHighlightId = null;
  let entryHighlightTimer = null;
  let loanSummaryFilter = "";
  const selectedLoanIds = new Set();

  // ── Seed data ──────────────────────────────────────────────
  const SEED_LOANS = [
    {
      clientName: "Apex Ltd",
      date: "2023-06-01",
      amount: 50000,
      rate: 12,
      duration: 24,
    },
    {
      clientName: "Zenith Corp",
      date: "2023-09-15",
      amount: 30000,
      rate: 10,
      duration: 12,
    },
    {
      clientName: "BrightPath Ltd",
      date: "2024-01-01",
      amount: 75000,
      rate: 15,
      duration: 36,
    },
    {
      clientName: "Summit Group",
      date: "2024-04-01",
      amount: 20000,
      rate: 8,
      duration: 18,
    },
    {
      clientName: "Horizon Finance",
      date: "2024-07-01",
      amount: 100000,
      rate: 11,
      duration: 48,
    },
  ];

  /* ─────────────────────────────────────────────────────────────
     CALCULATION CORE
  ───────────────────────────────────────────────────────────── */

  /**
   * calcLoan(principal, rate, duration)
   * Returns { interest, total, monthlyPrincipal, monthlyInterest, monthlyTotal }
   */
  function calcLoan(principal, rate, duration) {
    const principalCents = toCents(principal);
    const p = fromCents(principalCents);
    const r = +rate;
    const d = +duration;
    if (!p || !r || !d || d < 1 || !Number.isInteger(d)) return null;

    /* The agreed rate applies each month to the original principal. Round the
       monthly charge to cents first, then multiply it by the term. This makes
       the example $1,000 × 12.50% × 6 exactly $750.00 in interest. */
    const monthlyInterestCents = Math.round(
      (principalCents * r) / 100 + Number.EPSILON,
    );
    const interestCents = monthlyInterestCents * d;
    const interest = fromCents(interestCents);
    const total = fromCents(principalCents + interestCents);
    // Match the regular schedule rows, which use whole cents and put any
    // principal remainder on the final instalment.
    const monthlyPrincipal = fromCents(Math.floor(principalCents / d));
    const monthlyInterest = fromCents(monthlyInterestCents);
    const monthlyTotal = monthlyPrincipal + monthlyInterest;

    return {
      principal: p,
      interest,
      total,
      monthlyPrincipal,
      monthlyInterest,
      monthlyTotal,
    };
  }

  function paymentState(loan) {
    const schedule = buildSchedule(loan);
    const paidRows = schedule.filter((row) => row.status === "paid");
    const partialRows = schedule.filter((row) => row.status === "partial");
    const unpaidRows = schedule.filter((row) => row.remainingCents > 0);
    const paidCents = schedule.reduce((sum, row) => sum + row.paidCents, 0);
    const outstandingCents = schedule.reduce((sum, row) => sum + row.remainingCents, 0);
    return {
      schedule,
      paidRows,
      partialRows,
      unpaidRows,
      paidAmount: fromCents(paidCents),
      outstanding: fromCents(outstandingCents),
      paidCents,
      outstandingCents,
      nextPayment: unpaidRows[0] || null,
    };
  }

  /**
   * buildSchedule(loan)
   * Returns monthly rows with planned totals plus exact paid and remaining
   * amounts. Status: 'paid' | 'partial' | 'pending' | 'overdue'.
   */
  function buildSchedule(loan) {
    const rows = [];
    const today = todayISO();
    const calc = loan.customSchedule
      ? { principal: Number(loan.amount), interest: Number(loan.interest) }
      : calcLoan(loan.amount, loan.rate, loan.duration);
    if (!calc) return rows;

    const principalCents = toCents(calc.principal);
    const interestCents = toCents(calc.interest);
    const basePrincipalCents = loan.customSchedule
      ? toCents(loan.monthlyPrincipal)
      : Math.floor(principalCents / loan.duration);
    const baseInterestCents = Math.floor(interestCents / loan.duration);
    let balanceCents = principalCents;
    let remainingInterestCents = interestCents;
    const firstDueDate = loan.firstPaymentDate || firstPaymentDate(loan.date, loan.nextPaymentMonth);

    for (let n = 1; n <= loan.duration; n++) {
      const dueDate = addMonths(firstDueDate, n - 1);

      // Allocate any remainder to the last instalment. Every displayed row is
      // therefore in cents and the payment totals equal the original loan.
      const principalCentsForPayment =
        n === loan.duration ? balanceCents : basePrincipalCents;
      const interestCentsForPayment =
        n === loan.duration ? remainingInterestCents : baseInterestCents;
      balanceCents -= principalCentsForPayment;
      remainingInterestCents -= interestCentsForPayment;

      rows.push({
        paymentNo: n,
        dueDate,
        principal: fromCents(principalCentsForPayment),
        interest: fromCents(interestCentsForPayment),
        total: fromCents(principalCentsForPayment + interestCentsForPayment),
        principalCents: principalCentsForPayment,
        interestCents: interestCentsForPayment,
        totalCents: principalCentsForPayment + interestCentsForPayment,
        paidPrincipalCents: 0,
        paidInterestCents: 0,
        paidCents: 0,
        paidAmount: 0,
        remainingCents: principalCentsForPayment + interestCentsForPayment,
        remaining: fromCents(principalCentsForPayment + interestCentsForPayment),
        status: dueDate < today ? "overdue" : "pending",
        balance: fromCents(Math.max(0, balanceCents)),
      });
    }

    const rawPayments = Array.isArray(loan.payments) ? loan.payments : [];
    const legacyPaid = loan.paidPayments instanceof Set
      ? Array.from(loan.paidPayments)
      : Array.isArray(loan.paidPayments) ? loan.paidPayments : [];
    const payments = legacyPaid.map((paymentNo) => {
        const target = rows[Number(paymentNo) - 1];
        return target ? { paymentNo, amountCents: target.totalCents } : null;
      }).filter(Boolean).concat(rawPayments).sort((a, b) =>
        String(a.paidAt || "").localeCompare(String(b.paidAt || "")),
      );

    /* Named monthly payments stay on their selected due row. Opening payments
       without a row number are applied to the earliest unpaid amount. */
    payments.forEach((payment) => {
      let cents = Math.max(0, toCents(
        payment && payment.amountCents !== undefined
          ? fromCents(payment.amountCents)
          : payment && payment.amount,
      ));
      const numberedRow = rows[Number(payment && payment.paymentNo) - 1];
      const targets = numberedRow && (payment.component === "principal" || payment.component === "interest")
        ? rows.slice(numberedRow.paymentNo - 1)
        : numberedRow ? [numberedRow] : rows;
      for (const row of targets) {
        if (!cents) break;
        const type = payment && payment.component;
        const remainingPrincipal = row.principalCents - row.paidPrincipalCents;
        const remainingInterest = row.interestCents - row.paidInterestCents;
        if (type === "principal" || !type || type === "total") {
          const applied = Math.min(cents, remainingPrincipal);
          row.paidPrincipalCents += applied;
          cents -= applied;
        }
        if (cents && (type === "interest" || !type || type === "total")) {
          const applied = Math.min(cents, remainingInterest);
          row.paidInterestCents += applied;
          cents -= applied;
        }
        row.paidCents = row.paidPrincipalCents + row.paidInterestCents;
        row.remainingCents = row.totalCents - row.paidCents;
      }
    });

    let outstandingCents = rows.reduce((sum, row) => sum + row.totalCents, 0);
    rows.forEach((row) => {
      row.paidAmount = fromCents(row.paidCents);
      row.remaining = fromCents(row.remainingCents);
      outstandingCents -= row.paidCents;
      row.balance = fromCents(Math.max(0, outstandingCents));
      if (row.remainingCents === 0) row.status = "paid";
      else if (row.paidCents > 0) row.status = "partial";
      else if (row.dueDate < today) row.status = "overdue";
      else row.status = "pending";
    });
    return rows;
  }

  /* ─────────────────────────────────────────────────────────────
     STORE HELPERS
  ───────────────────────────────────────────────────────────── */

  function addLoan(fields) {
    const normalisedName = String(fields.clientName || "").trim().toLocaleLowerCase();
    if (normalisedName && loanStore.filter((loan) => String(loan.clientName || "").trim().toLocaleLowerCase() === normalisedName).length >= 2) {
      showToastLoan(`"${fields.clientName}" already has two loan records.`);
      return null;
    }
    const customPrincipalCents = toCents(fields.monthlyPrincipal);
    const customInterestCents = toCents(fields.fixedInterest);
    const isCustomSchedule = customPrincipalCents > 0 && fields.fixedInterest !== undefined;
    const customDuration = Number(fields.duration);
    const calc = isCustomSchedule && Number.isInteger(customDuration) && customDuration > 0
      ? {
          principal: fromCents(customPrincipalCents * customDuration),
          interest: fromCents(customInterestCents),
          total: fromCents(customPrincipalCents * customDuration + customInterestCents),
          monthlyPrincipal: fromCents(customPrincipalCents),
          monthlyInterest: fromCents(Math.floor(customInterestCents / customDuration)),
          monthlyTotal: fromCents(customPrincipalCents + Math.floor(customInterestCents / customDuration)),
        }
      : calcLoan(fields.amount, fields.rate, fields.duration);
    if (!calc) return null;

    loanCounter += 1;
    const initialAmountPaidCents = toCents(fields.amountPaid || 0);
    if (initialAmountPaidCents > toCents(calc.total)) return null;
    const nextPaymentMonth = Number(fields.nextPaymentMonth) || Number(defaultPaymentMonth(fields.date));
    const loan = {
      id: uid(),
      number: loanCounter,
      clientName: fields.clientName,
      date: fields.date,
      createdAt: Date.now(),
      amount: calc.principal,
      rate: isCustomSchedule
        ? (calc.principal > 0 ? (calc.interest / customDuration / calc.principal) * 100 : 0)
        : +fields.rate,
      duration: +fields.duration,
      customSchedule: isCustomSchedule,
      interest: calc.interest,
      total: calc.total,
      monthlyPrincipal: calc.monthlyPrincipal,
      monthlyInterest: calc.monthlyInterest,
      monthlyTotal: calc.monthlyTotal,
      amountPay: calc.monthlyTotal,
      nextPaymentMonth,
      firstPaymentDate: firstPaymentDate(fields.date, nextPaymentMonth),
      parentLoanId: fields.parentLoanId || null,
      payments: initialAmountPaidCents > 0 ? [{
        id: uid(),
        amountCents: initialAmountPaidCents,
        paidAt: fields.date || todayISO(),
        source: "opening",
      }] : [],
      paidPayments: new Set(),
    };
    loanStore.unshift(loan);
    persistLoans();
    return loan;
  }

  function normaliseLoanCalculations(loan) {
    if (loan.customSchedule) {
      loan.amount = fromCents(toCents(loan.monthlyPrincipal) * Number(loan.duration));
      loan.interest = fromCents(toCents(loan.interest));
      loan.total = fromCents(toCents(loan.amount) + toCents(loan.interest));
      loan.monthlyPrincipal = fromCents(toCents(loan.monthlyPrincipal));
      loan.monthlyInterest = fromCents(Math.floor(toCents(loan.interest) / Number(loan.duration)));
      loan.monthlyTotal = loan.monthlyPrincipal + loan.monthlyInterest;
      loan.amountPay = loan.monthlyTotal;
      loan.nextPaymentMonth = Number(loan.nextPaymentMonth) || Number(defaultPaymentMonth(loan.date));
      loan.firstPaymentDate = firstPaymentDate(loan.date, loan.nextPaymentMonth);
      if (!Array.isArray(loan.payments)) loan.payments = [];
      return loan;
    }
    const calc = calcLoan(loan.amount, loan.rate, loan.duration);
    if (!calc) return loan;

    loan.amount = calc.principal;
    loan.interest = calc.interest;
    loan.total = calc.total;
    loan.monthlyPrincipal = calc.monthlyPrincipal;
    loan.monthlyInterest = calc.monthlyInterest;
    loan.monthlyTotal = calc.monthlyTotal;
    loan.amountPay = calc.monthlyTotal;
    loan.nextPaymentMonth = Number(loan.nextPaymentMonth) || Number(defaultPaymentMonth(loan.date));
    loan.firstPaymentDate = firstPaymentDate(loan.date, loan.nextPaymentMonth);
    if (!Array.isArray(loan.payments)) loan.payments = [];
    return loan;
  }

  function recordMonthlyPayment(loanId, paymentNo, amount, component, paidAt) {
    const loan = getLoanById(loanId);
    if (!loan) return false;
    const state = paymentState(loan);
    const row = state.schedule.find((item) => item.paymentNo === Number(paymentNo));
    const amountText = String(amount === null || amount === undefined ? "" : amount).trim();
    const amountCents = toCents(amountText);
    if (!row || !/^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(amountText) || amountCents <= 0) {
      showToastLoan("Enter an Amount Paid greater than $0.00.");
      return false;
    }
    const parsedPaidAt = paidAt && /^\d{4}-\d{2}-\d{2}$/.test(paidAt)
      ? new Date(paidAt + "T00:00:00")
      : null;
    if (!parsedPaidAt || Number.isNaN(parsedPaidAt.getTime()) || parsedPaidAt.toISOString().slice(0, 10) !== paidAt) {
      showToastLoan("Select a valid payment date.");
      return false;
    }
    const laterRows = state.schedule.filter((item) => item.paymentNo >= row.paymentNo);
    const componentRemaining = component === "principal"
      ? laterRows.reduce((sum, item) => sum + item.principalCents - item.paidPrincipalCents, 0)
      : component === "interest"
        ? laterRows.reduce((sum, item) => sum + item.interestCents - item.paidInterestCents, 0)
        : row.remainingCents;
    if (amountCents > componentRemaining) {
      showToastLoan(`Amount cannot exceed the remaining ${component} balance from this installment forward: ${fmtMoney(fromCents(componentRemaining))}.`);
      return false;
    }
    loan.payments = Array.isArray(loan.payments) ? loan.payments : [];
    loan.payments.push({
      id: uid(),
      paymentNo: row.paymentNo,
      component: component || "total",
      amountCents,
      paidAt,
      source: "monthly",
    });
    persistLoans();
    renderSchedule(loanId);
    renderEntryTable();
    renderDataSheet();
    syncCount();
    showToastLoan(`Recorded ${fmtMoney(fromCents(amountCents))} for ${loan.clientName}.`);
    return true;
  }

  function removeLoan(id) {
    if (!canDeleteRecords()) {
      showToastLoan('Sign in to delete loan records.');
      return false;
    }
    const loan = getLoanById(id);
    if (!loan) return false;
    loanStore = loanStore.filter((l) => l.id !== id);
    loanCounter = loanStore.reduce((m, l) => Math.max(m, l.number), 0);
    persistLoans();
    return true;
  }

  function deleteLoanFromSystem(id) {
    const loan = getLoanById(id);
    if (!loan) return;
    if (!canDeleteRecords()) {
      showToastLoan('Sign in to delete loan records.');
      return;
    }
    if (!window.confirm('Delete the loan record for "' + loan.clientName + '"? This removes it immediately from the FMS database.')) return;
    if (!removeLoan(id)) return;
    renderEntryTable();
    renderDataSheet();
    populateScheduleSelect();
    syncCount();
    showToastLoan('Loan record deleted.');
  }

  function getLoanById(id) {
    return loanStore.find((l) => l.id === id) || null;
  }

  function reconcileLoanSelection() {
    const existing = new Set(loanStore.map((loan) => String(loan.id)));
    selectedLoanIds.forEach((id) => {
      if (!existing.has(String(id))) selectedLoanIds.delete(id);
    });
  }

  function updateLoanSelectionControls(visibleRows) {
    const selectAll = $("loanSelectAll");
    const deleteBtn = $("loanBulkDeleteBtn");
    const selectedCount = loanStore.filter((loan) => selectedLoanIds.has(String(loan.id))).length;
    const visibleSelected = visibleRows.filter((loan) => selectedLoanIds.has(String(loan.id))).length;

    if (selectAll) {
      selectAll.checked = visibleRows.length > 0 && visibleSelected === visibleRows.length;
      selectAll.indeterminate = visibleSelected > 0 && visibleSelected < visibleRows.length;
      selectAll.disabled = visibleRows.length === 0;
    }
    if (deleteBtn) {
      deleteBtn.disabled = !canDeleteRecords() || selectedCount === 0;
      deleteBtn.innerHTML = `<i class="fas fa-trash"></i> Delete Selected${selectedCount ? ` (${selectedCount})` : ""}`;
      deleteBtn.title = selectedCount
        ? `Delete ${selectedCount} selected loan record${selectedCount === 1 ? "" : "s"}`
        : "Select one or more loan records first";
    }
  }

  function deleteSelectedLoans() {
    if (!canDeleteRecords()) {
      showToastLoan("Sign in to delete loan records.");
      return;
    }
    reconcileLoanSelection();
    const selectedLoans = loanStore.filter((loan) => selectedLoanIds.has(String(loan.id)));
    if (!selectedLoans.length) {
      showToastLoan("Select one or more loan records first.");
      return;
    }

    const count = selectedLoans.length;
    if (!window.confirm(`Delete ${count} selected loan record${count === 1 ? "" : "s"}? This removes the selected records immediately from the FMS database.`)) return;

    loanStore = loanStore.filter((loan) => !selectedLoanIds.has(String(loan.id)));
    loanCounter = loanStore.reduce((max, loan) => Math.max(max, loan.number || 0), 0);
    selectedLoanIds.clear();
    persistLoans();
    renderEntryTable();
    renderDataSheet();
    populateScheduleSelect();
    syncCount();
    showToastLoan(`${count} loan record${count === 1 ? "" : "s"} deleted.`);
  }

  /* ─────────────────────────────────────────────────────────────
     COUNT SYNC  (keep tab badge + fin-client-count in sync)
  ───────────────────────────────────────────────────────────── */

  function syncCount() {
    const n = loanStore.length;
    const countEl = $("fin-client-count");
    const tabEl = $("tab-count-financial");
    if (countEl) countEl.textContent = n;
    if (tabEl) tabEl.textContent = n;
    renderLoanSummary();
  }

  /* A read-only overview of the same calculated records shown in Loan Entry. */
  function renderLegacyLoanSummary() {
    const panel = $("loanSummaryPanel");
    if (!panel) return;

    if (!loanStore.length) {
      panel.innerHTML = `
        <div class="loan-summary-empty">
          <i class="fas fa-chart-pie"></i>
          <h3>Loan Summary</h3>
          <p>No loan records yet. Add a loan in <strong>Loan Entry</strong> to see calculated totals here.</p>
        </div>`;
      return;
    }

    const totals = loanStore.reduce(
      (acc, loan) => {
        const schedule = buildSchedule(loan);
        const paidRows = schedule.filter((row) => row.status === "paid");
        const overdueRows = schedule.filter((row) => row.status === "overdue");
        const paidPrincipal = paidRows.reduce(
          (sum, row) => sum + row.principal,
          0,
        );
        acc.principal += +loan.amount || 0;
        acc.interest += +loan.interest || 0;
        acc.repayment += +loan.total || 0;
        acc.outstanding += Math.max(0, (+loan.amount || 0) - paidPrincipal);
        acc.active += paidRows.length === loan.duration ? 0 : 1;
        acc.overdue += overdueRows.length > 0 ? 1 : 0;
        return acc;
      },
      {
        principal: 0,
        interest: 0,
        repayment: 0,
        outstanding: 0,
        active: 0,
        overdue: 0,
      },
    );

    panel.innerHTML = `
      <div class="loan-summary-heading">
        <div>
          <span class="loan-summary-eyebrow"><i class="fas fa-chart-pie"></i> Financial Management</span>
          <h3>Loan Summary</h3>
          <p>Live calculated totals from Loan Entry.</p>
        </div>
        <span class="loan-summary-count">${loanStore.length} record${loanStore.length === 1 ? "" : "s"}</span>
      </div>
      <div class="loan-summary-metrics">
        <div class="loan-summary-metric"><span>Principal issued</span><strong>${fmtMoney(totals.principal)}</strong></div>
        <div class="loan-summary-metric"><span>Interest expected</span><strong>${fmtMoney(totals.interest)}</strong></div>
        <div class="loan-summary-metric"><span>Total repayment</span><strong>${fmtMoney(totals.repayment)}</strong></div>
        <div class="loan-summary-metric"><span>Outstanding principal</span><strong>${fmtMoney(totals.outstanding)}</strong></div>
        <div class="loan-summary-metric"><span>Active / overdue</span><strong>${totals.active} / ${totals.overdue}</strong></div>
      </div>
      <div class="loan-summary-table-wrap">
        <div class="loan-summary-table-title"><h4>Portfolio overview</h4><span>One live record per loan</span></div>
        <div class="table-responsive">
          <table class="data-table loan-summary-table">
            <thead><tr><th>#</th><th>Client / Loan</th><th>Start / Term</th><th class="col-money">Principal</th><th class="col-money">Total Repayment</th><th>Payment Progress</th><th>Next Payment</th><th class="col-money">Outstanding</th><th>Status</th></tr></thead>
            <tbody>${loanStore
              .flatMap((loan, loanIndex) =>
                buildSchedule(loan).map(
                  (row) => `
              <tr>
                <td class="col-num">${loanIndex + 1}</td>
                <td><strong>${escH(loan.clientName)}</strong><small>${fmtDate(loan.date)} · ${loan.duration} months</small></td>
                <td class="col-num">${row.paymentNo}</td>
                <td>${fmtDate(row.dueDate)}</td>
                <td class="col-money">${fmtMoney(row.principal)}</td>
                <td class="col-money">${fmtMoney(row.total)}</td>
                <td>${statusBadge(row.status)}</td>
                <td class="col-money">${fmtMoney(row.balance)}</td>
              </tr>`,
                ),
              )
              .join("")}</tbody>
          </table>
        </div>
      </div>`;
  }

  /* ─────────────────────────────────────────────────────────────
     SUB-TAB SWITCHING
  ───────────────────────────────────────────────────────────── */

  function renderLoanSummary() {
    const panel = $("loanSummaryPanel");
    if (!panel) return;

    if (!loanStore.length) {
      panel.innerHTML = `
        <div class="loan-summary-empty">
          <i class="fas fa-chart-pie"></i>
          <h3>Loan Summary</h3>
          <p>No loan records yet. Add a loan in <strong>Loan Entry</strong> to see calculated totals here.</p>
        </div>`;
      return;
    }

    const totals = loanStore.reduce((acc, loan) => {
      const state = paymentState(loan);
      const schedule = state.schedule;
      const paidRows = state.paidRows;
      const overdueRows = schedule.filter((row) => row.status === "overdue");

      acc.principal += Number(loan.amount) || 0;
      acc.interest += Number(loan.interest) || 0;
      acc.repayment += Number(loan.total) || 0;
      acc.paid += state.paidAmount;
      acc.outstanding += state.outstanding;
      acc.active += state.outstandingCents === 0 ? 0 : 1;
      acc.overdue += overdueRows.length ? 1 : 0;
      return acc;
    }, { principal: 0, interest: 0, repayment: 0, paid: 0, outstanding: 0, active: 0, overdue: 0 });

    const loanSummaryFilterLabels = {
      principal: "Principal issued",
      interest: "Interest expected",
      repayment: "Total repayment",
      paid: "Amount paid",
      outstanding: "Outstanding balance",
      active: "Active / overdue",
    };
    const matchingLoans = loanStore.filter((loan) => {
      if (!loanSummaryFilter) return true;
      const state = paymentState(loan);
      switch (loanSummaryFilter) {
        case "principal": return toCents(loan.amount) > 0;
        case "interest": return toCents(loan.interest) > 0;
        case "repayment": return toCents(loan.total) > 0;
        case "paid": return state.paidCents > 0;
        case "outstanding": return state.outstandingCents > 0;
        case "active": return state.outstandingCents > 0 || state.schedule.some((row) => row.status === "overdue");
        default: return true;
      }
    });
    const rows = matchingLoans.map((loan, loanIndex) => {
      const state = paymentState(loan);
      const paidRows = state.paidRows;
      const paidAmount = state.paidAmount;
      const nextPayment = state.nextPayment;
      const outstanding = state.outstanding;
      const progress = loan.total ? Math.round((paidAmount / loan.total) * 100) : 0;
      const loanNumber = loan.number || loanIndex + 1;

      return `
        <tr class="loan-summary-row-clickable" data-loan-id="${escH(loan.id)}" tabindex="0" aria-label="Open Loan Entry details for ${escH(loan.clientName)}" title="Open this loan in Loan Entry">
          <td class="col-num">${loanNumber}</td>
          <td class="loan-summary-client"><strong>${escH(loan.clientName)}</strong><small>Loan #${loanNumber} &middot; ${loan.rate}% per month</small></td>
          <td><strong>${fmtDate(loan.date)}</strong><small>${loan.duration} month term</small></td>
          <td class="col-money">${fmtMoney(loan.amount)}</td>
          <td class="col-money">${fmtMoney(loan.total)}</td>
          <td class="col-money">${fmtMoney(loan.amountPay || loan.monthlyTotal)}</td>
          <td class="loan-summary-progress"><strong>${fmtMoney(paidAmount)} of ${fmtMoney(loan.total)}</strong><span class="loan-summary-progress-track"><span style="width:${progress}%"></span></span><small>${paidRows.length} / ${loan.duration} instalments paid · ${progress}% complete</small></td>
          <td class="loan-summary-next">${nextPayment ? `<strong>${fmtDate(nextPayment.dueDate)}</strong><small>${fmtMoney(nextPayment.remaining)} remaining · ${nextPayment.status === "overdue" ? "Overdue" : nextPayment.status === "partial" ? "Part paid" : "Due"}</small>` : '<strong>Complete</strong><small>All payments received</small>'}</td>
          <td class="col-money">${fmtMoney(paidAmount)}</td>
          <td class="col-money loan-summary-outstanding">${fmtMoney(outstanding)}</td>
          <td>${loanStatusBadge(loan)}</td>
        </tr>`;
    }).join("");

    panel.innerHTML = `
      <div class="loan-summary-heading">
        <div>
          <span class="loan-summary-eyebrow"><i class="fas fa-chart-pie"></i> Financial Management</span>
          <h3>Loan Summary</h3>
          <p>Live totals and repayment progress from Loan Entry.</p>
        </div>
        <span class="loan-summary-count">${loanStore.length} record${loanStore.length === 1 ? "" : "s"}</span>
      </div>
      <div class="loan-summary-metrics">
        <button type="button" class="loan-summary-metric${loanSummaryFilter === "principal" ? " is-active" : ""}" data-summary-filter="principal" aria-pressed="${loanSummaryFilter === "principal"}" title="Show loans with principal issued"><span>Principal issued</span><strong>${fmtMoney(totals.principal)}</strong></button>
        <button type="button" class="loan-summary-metric${loanSummaryFilter === "interest" ? " is-active" : ""}" data-summary-filter="interest" aria-pressed="${loanSummaryFilter === "interest"}" title="Show loans with interest"><span>Interest expected</span><strong>${fmtMoney(totals.interest)}</strong></button>
        <button type="button" class="loan-summary-metric${loanSummaryFilter === "repayment" ? " is-active" : ""}" data-summary-filter="repayment" aria-pressed="${loanSummaryFilter === "repayment"}" title="Show loans with a repayment total"><span>Total repayment</span><strong>${fmtMoney(totals.repayment)}</strong></button>
        <button type="button" class="loan-summary-metric${loanSummaryFilter === "paid" ? " is-active" : ""}" data-summary-filter="paid" aria-pressed="${loanSummaryFilter === "paid"}" title="Show loans with payments recorded"><span>Amount paid</span><strong>${fmtMoney(totals.paid)}</strong></button>
        <button type="button" class="loan-summary-metric${loanSummaryFilter === "outstanding" ? " is-active" : ""}" data-summary-filter="outstanding" aria-pressed="${loanSummaryFilter === "outstanding"}" title="Show loans with an outstanding balance"><span>Outstanding balance</span><strong>${fmtMoney(totals.outstanding)}</strong></button>
        <button type="button" class="loan-summary-metric${loanSummaryFilter === "active" ? " is-active" : ""}" data-summary-filter="active" aria-pressed="${loanSummaryFilter === "active"}" title="Show active or overdue loans"><span>Active / overdue</span><strong>${totals.active} / ${totals.overdue}</strong></button>
      </div>
      <div class="loan-summary-table-wrap">
        <div class="loan-summary-table-title"><div><h4>Portfolio overview</h4><span>Spreadsheet view — one clear, live record per client loan.</span></div><span class="loan-summary-live"><i class="fas fa-circle"></i> Live</span></div>
        <div class="table-responsive">
          <table class="data-table loan-summary-table spreadsheet-table">
            <colgroup><col class="portfolio-col-number"><col class="portfolio-col-client"><col class="portfolio-col-term"><col class="portfolio-col-money"><col class="portfolio-col-money"><col class="portfolio-col-money"><col class="portfolio-col-progress"><col class="portfolio-col-next"><col class="portfolio-col-money"><col class="portfolio-col-money"><col class="portfolio-col-status"></colgroup>
            <thead><tr><th scope="col">#</th><th scope="col">Client / Loan</th><th scope="col">Start / Term</th><th scope="col" class="col-money">Principal</th><th scope="col" class="col-money">Total Repayment</th><th scope="col" class="col-money">Amount Pay / mo</th><th scope="col">Payment Progress</th><th scope="col">Next Payment</th><th scope="col" class="col-money">Amount Paid</th><th scope="col" class="col-money">Outstanding</th><th scope="col">Status</th></tr></thead>
            <tbody>${rows || `<tr><td colspan="11" class="empty-state">No loan records match ${escH(loanSummaryFilterLabels[loanSummaryFilter] || "this filter")}.</td></tr>`}</tbody>
          </table>
        </div>
      </div>`;
  }

  function initSubTabs() {
    const summaryPanel = $("loanSummaryPanel");
    if (summaryPanel) {
      summaryPanel.addEventListener("click", (event) => {
        const card = event.target.closest("[data-summary-filter]");
        if (card) {
          const selectedFilter = card.dataset.summaryFilter;
          loanSummaryFilter = loanSummaryFilter === selectedFilter ? "" : selectedFilter;
          renderLoanSummary();
          return;
        }
        const row = event.target.closest(".loan-summary-row-clickable[data-loan-id]");
        if (row) openInLoanEntry(row.dataset.loanId);
      });
      summaryPanel.addEventListener("keydown", (event) => {
        const row = event.target.closest(".loan-summary-row-clickable[data-loan-id]");
        if (!row || (event.key !== "Enter" && event.key !== " ")) return;
        event.preventDefault();
        openInLoanEntry(row.dataset.loanId);
      });
    }
    $$(".loan-subtab").forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = btn.dataset.loanTab;
        $$(".loan-subtab").forEach((b) => {
          b.classList.toggle("active", b.dataset.loanTab === target);
          b.setAttribute(
            "aria-selected",
            b.dataset.loanTab === target ? "true" : "false",
          );
        });
        $$(".loan-subpanel").forEach((p) => {
          p.classList.toggle("active", p.id === "loan-tab-" + target);
        });
        if (target === "summary") renderLoanSummary();
        if (target === "entry") renderDataSheet();
        if (target === "schedule") populateScheduleSelect();
      });
    });
  }

  /**
   * Open the matching Loan Entry row. Both views use the
   * same stored record, so no copying or duplicate client record is created.
   */
  function openInLoanEntry(loanId) {
    const loan = getLoanById(loanId);
    if (!loan) {
      showToastLoan("Loan record not found.");
      return;
    }

    const financialTab = document.querySelector(
      '.svc-tab[data-svc="financial"]',
    );
    if (financialTab && !financialTab.classList.contains("active"))
      financialTab.click();

    const entryTab = document.querySelector(
      '.loan-subtab[data-loan-tab="entry"]',
    );
    if (entryTab) entryTab.click();

    const entrySearch = $("sheet-search");
    if (entrySearch) entrySearch.value = "";
    entryHighlightId = loanId;
    renderDataSheet();

    requestAnimationFrame(() => {
      const row = document.querySelector(
        '#loan-sheet-tbody tr[data-loan-id="' + loanId + '"]',
      );
      if (row) row.scrollIntoView({ behavior: "smooth", block: "center" });
    });

    clearTimeout(entryHighlightTimer);
    entryHighlightTimer = setTimeout(() => {
      if (entryHighlightId === loanId) {
        entryHighlightId = null;
        renderDataSheet();
      }
    }, 2400);
  }

  /* ─────────────────────────────────────────────────────────────
     LOAN ENTRY — AUTO-CALCULATION
  ───────────────────────────────────────────────────────────── */

  function updateCalcDisplay() {
    const amtEl = $("loan-amount");
    const ratEl = $("loan-rate");
    const durEl = $("loan-duration");
    const dateEl = $("loan-date");
    const paymentMonthEl = $("loan-next-payment-month");
    if (!amtEl || !ratEl || !durEl) return;

    const calc = calcLoan(amtEl.value, ratEl.value, durEl.value);

    const fields = [
      { id: "calc-interest", val: calc ? calc.interest : null },
      { id: "calc-total", val: calc ? calc.total : null },
      {
        id: "calc-monthly-principal",
        val: calc ? calc.monthlyPrincipal : null,
      },
      { id: "calc-monthly-interest", val: calc ? calc.monthlyInterest : null },
      { id: "calc-amount-pay", val: calc ? calc.monthlyTotal : null },
    ];

    fields.forEach((f) => {
      const el = $(f.id);
      if (!el) return;
      if (f.val !== null) {
        el.textContent = fmtMoney(f.val);
        el.classList.add("is-filled");
      } else {
        el.textContent = "—";
        el.classList.remove("is-filled");
      }
    });

    const next = $("calc-next-payment");
    if (next) {
      next.textContent = dateEl && dateEl.value
        ? fmtDate(firstPaymentDate(dateEl.value, paymentMonthEl && paymentMonthEl.value))
        : "—";
      next.classList.toggle("is-filled", !!(dateEl && dateEl.value));
    }
  }

  function initLoanForm() {
    const form = $("loanForm");
    const clearB = $("loanFormClearBtn");
    if (!form) return;

    // Wire live-calculation listeners
    ["loan-amount", "loan-rate", "loan-duration", "loan-date", "loan-next-payment-month"].forEach((id) => {
      const el = $(id);
      if (el) {
        el.addEventListener("input", updateCalcDisplay);
        el.addEventListener("change", updateCalcDisplay);
      }
    });

    // Set default date to today
    const dateEl = $("loan-date");
    if (dateEl && !dateEl.value) dateEl.value = todayISO();
    const paymentMonthEl = $("loan-next-payment-month");
    if (paymentMonthEl && !paymentMonthEl.value) paymentMonthEl.value = defaultPaymentMonth(dateEl && dateEl.value);

    // Clear button
    if (clearB) {
      clearB.addEventListener("click", () => {
        form.reset();
        if (dateEl) dateEl.value = todayISO();
        if (paymentMonthEl) paymentMonthEl.value = defaultPaymentMonth(dateEl && dateEl.value);
        updateCalcDisplay();
      });
    }

    // Submit
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const clientName = $("loan-client")?.value.trim();
      const date = $("loan-date")?.value;
      const amount = $("loan-amount")?.value;
      const rate = $("loan-rate")?.value;
      const duration = $("loan-duration")?.value;
      const amountPaid = $("loan-amount-paid")?.value;
      const nextPaymentMonth = $("loan-next-payment-month")?.value;

      if (!clientName) {
        showToastLoan("Client Name is required.");
        return;
      }
      if (!date) {
        showToastLoan("Loan Start Date is required.");
        return;
      }
      if (!amount || +amount <= 0) {
        showToastLoan("Loan Amount must be greater than 0.");
        return;
      }
      if (!rate || +rate <= 0) {
        showToastLoan("Rate per month must be greater than 0.");
        return;
      }
      if (!duration || !Number.isInteger(+duration) || +duration < 1) {
        showToastLoan("Payment Term must be a whole number of months (1 or more).");
        return;
      }
      if (!nextPaymentMonth) {
        showToastLoan("Please select the next payment month.");
        return;
      }
      const calc = calcLoan(amount, rate, duration);
      if (amountPaid !== "" && (+amountPaid < 0 || toCents(amountPaid) > toCents(calc.total))) {
        showToastLoan("Amount Paid must be between $0.00 and the total repayment.");
        return;
      }

      const loan = addLoan({ clientName, date, amount, rate, duration, amountPaid, nextPaymentMonth });
      if (!loan) {
        showToastLoan("Could not calculate loan — check inputs.");
        return;
      }

      form.reset();
      if (dateEl) dateEl.value = todayISO();
      if (paymentMonthEl) paymentMonthEl.value = defaultPaymentMonth(dateEl && dateEl.value);
      updateCalcDisplay();

      renderEntryTable();
      renderDataSheet();
      populateScheduleSelect();
      syncCount();

      showToastLoan("Loan record added successfully.");
    });
  }

  /* ─────────────────────────────────────────────────────────────
     LOAN ENTRY TABLE
  ───────────────────────────────────────────────────────────── */

  function loanStatusBadge(loan) {
    const state = paymentState(loan);
    const sched = state.schedule;
    const overdue = sched.filter((r) => r.status === "overdue").length;
    const paid = sched.filter((r) => r.status === "paid").length;
    if (state.outstandingCents === 0)
      return '<span class="badge-paid"><i class="fas fa-check"></i> Settled</span>';
    if (overdue > 0)
      return '<span class="badge-overdue"><i class="fas fa-exclamation-circle"></i> Overdue</span>';
    return '<span class="badge-active"><i class="fas fa-clock"></i> Active</span>';
  }

  function renderEntryTable(filter) {
    const tbody = $("fin-tbody");
    if (!tbody) return;

    const q = (filter || $("fin-search")?.value || "").toLowerCase();
    const rows = loanStore.filter(
      (l) => !q || l.clientName.toLowerCase().includes(q),
    ).sort((a, b) => {
      if (a.clientName.trim().toLocaleLowerCase() === b.clientName.trim().toLocaleLowerCase() && a.customSchedule !== b.customSchedule) {
        return a.customSchedule ? 1 : -1;
      }
      return 0;
    });

    if (rows.length === 0) {
      tbody.innerHTML =
        '<tr class="loan-empty-row"><td colspan="15"><span class="empty-state-msg">No loan records yet. Use the form above to add one.</span></td></tr>';
      return;
    }

    tbody.innerHTML = rows
      .map((loan, index) => {
        // ── Use shared calcLoan helper so formulas stay consistent ──
        const c = loan.customSchedule
          ? { interest: loan.interest, total: loan.total, monthlyPrincipal: loan.monthlyPrincipal, monthlyInterest: loan.monthlyInterest }
          : calcLoan(loan.amount, loan.rate, loan.duration);
        const interest = c ? c.interest : 0;
        const totalRepay = c ? c.total : parseFloat(loan.amount) || 0;
        const monthlyPrinc = c ? c.monthlyPrincipal : 0;
        const monthlyInt = c ? c.monthlyInterest : 0;
        const state = paymentState(loan);
        const nextPayment = state.nextPayment;

        return `
      <tr data-loan-id="${loan.id}"${loan.id === entryHighlightId ? ' class="loan-entry-highlight"' : ""}>
        <td class="col-num">${index + 1}</td>
        <td class="col-name"><strong>${escH(loan.clientName)}</strong></td>
        <td class="col-date">${fmtDate(loan.date)}</td>
        <td class="col-money">${fmtMoney(loan.amount)}</td>
        <td class="col-pct">${loan.rate}%</td>
        <td class="col-dur">${loan.duration} mo</td>
        <td class="col-money col-calc">${fmtMoney(interest)}</td>
        <td class="col-money col-calc">${fmtMoney(totalRepay)}</td>
        <td class="col-money col-calc">${fmtMoney(monthlyPrinc)}</td>
        <td class="col-money col-calc">${fmtMoney(monthlyInt)}</td>
        <td class="col-money col-calc">${fmtMoney(loan.amountPay || (c && c.monthlyTotal))}</td>
        <td class="col-money col-calc">${fmtMoney(state.paidAmount)}</td>
        <td>${nextPayment ? `${fmtDate(nextPayment.dueDate)}<br><small>${fmtMoney(nextPayment.remaining)} due</small>` : "Complete"}</td>
        <td>${loanStatusBadge(loan)}</td>
        <td class="col-actions loan-entry-actions" style="white-space:nowrap;">
          <button class="btn-view-report"  data-loan-id="${loan.id}" title="Report"><i class="fas fa-file-alt"></i></button>
          <button class="btn-view-invoice" data-loan-id="${loan.id}" title="Invoice"><i class="fas fa-file-invoice-dollar"></i></button>
        </td>
      </tr>`;
      })
      .join("");

    // Wire report buttons
    tbody.querySelectorAll(".btn-view-report").forEach((btn) => {
      btn.addEventListener("click", () => openReportModal(btn.dataset.loanId));
    });
    // Wire invoice buttons
    tbody.querySelectorAll(".btn-view-invoice").forEach((btn) => {
      btn.addEventListener("click", () => {
        const loan = getLoanById(btn.dataset.loanId);
        if (loan && window.FMSInvoice) window.FMSInvoice.open(loan);
      });
    });
  }

  function initEntrySearch() {
    const el = $("fin-search");
    if (el) el.addEventListener("input", () => renderEntryTable(el.value));
  }

  function initEntryExport() {
    const btn = $("loanExportBtn");
    if (btn)
      btn.addEventListener("click", () =>
        exportCSV(buildEntryCSV(), "loan_records"),
      );
  }

  function buildEntryCSV() {
    const header = [
      "#",
      "Client Name",
      "Date",
      "Loan Amount (USD)",
      "Rate (% p.m.)",
      "Duration (months)",
      "Amount Pay / Month (USD)",
      "Amount Paid (USD)",
      "Outstanding (USD)",
      "Next Payment Date",
      "Payment Transactions",
      "Status",
    ];
    const rows = loanStore.map((l, index) => [
      index + 1,
      l.clientName,
      l.date,
      l.amount,
      l.rate,
      l.duration,
      (l.amountPay || l.monthlyTotal || 0).toFixed(2),
      paymentState(l).paidAmount.toFixed(2),
      paymentState(l).outstanding.toFixed(2),
      paymentState(l).nextPayment ? paymentState(l).nextPayment.dueDate : "Complete",
      paymentTransactionsText(l),
      buildSchedule(l).filter((r) => r.status === "overdue").length > 0
        ? "Overdue"
        : buildSchedule(l).every((r) => r.status === "paid")
          ? "Settled"
          : "Active",
    ]);
    return [header, ...rows].map((r) => r.map(csvEsc).join(",")).join("\n");
  }

  /* ─────────────────────────────────────────────────────────────
     LOAN ENTRY
  ───────────────────────────────────────────────────────────── */

  function renderDataSheet(filter) {
    const tbody = $("loan-sheet-tbody");
    const tfoot = $("loan-sheet-tfoot");
    if (!tbody) return;

    reconcileLoanSelection();
    const q = (filter || $("sheet-search")?.value || "").toLowerCase();
    const rows = loanStore.filter(
      (l) => !q || l.clientName.toLowerCase().includes(q),
    ).sort((a, b) => {
      if (a.clientName.trim().toLocaleLowerCase() === b.clientName.trim().toLocaleLowerCase() && a.customSchedule !== b.customSchedule) {
        return a.customSchedule ? 1 : -1;
      }
      return 0;
    });

    if (rows.length === 0) {
      tbody.innerHTML =
        '<tr class="loan-empty-row"><td colspan="16"><span class="empty-state-msg">No loan records yet. Click <strong>Add Loan</strong> to create the first entry.</span></td></tr>';
      if (tfoot) tfoot.innerHTML = "";
      updateLoanSelectionControls(rows);
      return;
    }

    tbody.innerHTML = rows
      .map(
        (l, index) => {
          const state = paymentState(l);
          const nextPayment = state.nextPayment;
          const rowClasses = [
            l.id === entryHighlightId ? "loan-entry-highlight" : "",
            selectedLoanIds.has(String(l.id)) ? "loan-row-selected" : "",
          ].filter(Boolean).join(" ");
          return `
      <tr data-loan-id="${l.id}"${rowClasses ? ` class="${rowClasses}"` : ""}>
        <td class="loan-select-cell"><input class="loan-row-select" type="checkbox" data-loan-id="${l.id}" aria-label="Select ${escH(l.clientName)}"${selectedLoanIds.has(String(l.id)) ? " checked" : ""}></td>
        <td class="col-num">${index + 1}</td>
        <td><strong>${escH(l.clientName)}</strong>${l.customSchedule ? '<small class="loan-additional-entry-label">Additional loan entry</small>' : ""}</td>
        <td>${fmtDate(l.date)}</td>
        <td class="col-money">${fmtMoney(l.amount)}</td>
        <td class="col-pct">${l.rate}%</td>
        <td class="col-dur">${l.duration}</td>
        <td class="col-money col-calc">${fmtMoney(l.interest)}</td>
        <td class="col-money col-calc">${fmtMoney(l.total)}</td>
        <td class="col-money col-calc">${fmtMoney(l.monthlyPrincipal)}</td>
        <td class="col-money col-calc">${fmtMoney(l.monthlyInterest)}</td>
        <td class="col-money col-calc">${fmtMoney(l.amountPay || l.monthlyTotal)}</td>
        <td class="col-money col-calc">${fmtMoney(state.paidAmount)}</td>
        <td class="col-money col-calc">${fmtMoney(state.outstanding)}</td>
        <td>${nextPayment ? `<strong>${paymentMonthName(nextPayment.dueDate.slice(5, 7))}</strong><small>${fmtDate(nextPayment.dueDate)}</small>` : "Complete"}</td>
        <td class="loan-entry-actions" style="white-space:nowrap;">
          <button class="btn-open-loan-entry" data-loan-id="${l.id}" title="View in Loan Entry"><i class="fas fa-eye"></i> View</button>
          <button class="btn-edit-loan" data-loan-id="${l.id}" title="Edit Record"><i class="fas fa-pen"></i> Edit</button>
          <button class="btn-view-invoice" data-loan-id="${l.id}" title="View Invoice"><i class="fas fa-file-invoice-dollar"></i> Invoice</button>
        </td>
      </tr>
    `;
        },
      )
      .join("");

    // Wire edit buttons in Loan Entry
    tbody.querySelectorAll(".btn-edit-loan").forEach((btn) => {
      btn.addEventListener("click", () =>
        openEditLoanModal(btn.dataset.loanId),
      );
    });

    tbody.querySelectorAll(".btn-open-loan-entry").forEach((btn) => {
      btn.addEventListener("click", () => openInLoanEntry(btn.dataset.loanId));
    });

    // Wire invoice buttons in Loan Entry
    tbody.querySelectorAll(".btn-view-invoice").forEach((btn) => {
      btn.addEventListener("click", () => {
        const loan = getLoanById(btn.dataset.loanId);
        if (loan && window.FMSInvoice) window.FMSInvoice.open(loan);
      });
    });

    tbody.querySelectorAll(".loan-row-select").forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        const id = String(checkbox.dataset.loanId || "");
        if (checkbox.checked) selectedLoanIds.add(id);
        else selectedLoanIds.delete(id);
        const row = checkbox.closest("tr");
        if (row) row.classList.toggle("loan-row-selected", checkbox.checked);
        updateLoanSelectionControls(rows);
      });
    });

    // Totals footer
    const totals = rows.reduce(
      (acc, l) => {
        acc.amount += l.amount;
        acc.interest += l.interest;
        acc.total += l.total;
        acc.paid += paymentState(l).paidAmount;
        acc.outstanding += paymentState(l).outstanding;
        return acc;
      },
      { amount: 0, interest: 0, total: 0, paid: 0, outstanding: 0 },
    );

    if (tfoot) {
      tfoot.innerHTML = `
        <tr>
          <td colspan="4"><strong>TOTALS (${rows.length} loan${rows.length !== 1 ? "s" : ""})</strong></td>
          <td class="col-money">${fmtMoney(totals.amount)}</td>
          <td class="col-pct">—</td>
          <td class="col-dur">—</td>
          <td class="col-money col-calc">${fmtMoney(totals.interest)}</td>
          <td class="col-money col-calc">${fmtMoney(totals.total)}</td>
          <td class="col-money col-calc">—</td>
          <td class="col-money col-calc">—</td>
          <td class="col-money col-calc">—</td>
          <td class="col-money col-calc">${fmtMoney(totals.paid)}</td>
          <td class="col-money col-calc">${fmtMoney(totals.outstanding)}</td>
          <td>—</td>
          <td>—</td>
        </tr>
      `;
    }
    updateLoanSelectionControls(rows);
  }

  function initSheetSearch() {
    const el = $("sheet-search");
    if (el) el.addEventListener("input", () => renderDataSheet(el.value));
  }

  function initLoanSelection() {
    const selectAll = $("loanSelectAll");
    if (selectAll) {
      selectAll.addEventListener("change", () => {
        const q = ($("sheet-search")?.value || "").toLowerCase();
        const visibleRows = loanStore.filter(
          (loan) => !q || loan.clientName.toLowerCase().includes(q),
        );
        if (selectAll.checked) visibleRows.forEach((loan) => selectedLoanIds.add(String(loan.id)));
        else visibleRows.forEach((loan) => selectedLoanIds.delete(String(loan.id)));
        renderDataSheet(q);
      });
    }

    const deleteBtn = $("loanBulkDeleteBtn");
    if (deleteBtn) deleteBtn.addEventListener("click", deleteSelectedLoans);
  }

  function initSheetExport() {
    const btn = $("sheetExportBtn");
    if (btn)
      btn.addEventListener("click", () =>
        exportCSV(buildSheetCSV(), "loan_entry"),
      );
  }

  function buildSheetCSV() {
    const header = [
      "#",
      "Client Name",
      "Date",
      "Loan Amount (USD)",
      "Rate (% p.m.)",
      "Duration (months)",
      "Interest Amount (USD)",
      "Total Repayment (USD)",
      "Monthly Principal (USD)",
      "Monthly Interest (USD)",
      "Monthly Amount Due (USD)",
      "Amount Paid (USD)",
      "Outstanding (USD)",
      "Next Payment Date",
      "Payment Transactions",
    ];
    const rows = loanStore.map((l, index) => [
      index + 1,
      l.clientName,
      l.date,
      l.amount,
      l.rate,
      l.duration,
      l.interest.toFixed(2),
      l.total.toFixed(2),
      l.monthlyPrincipal.toFixed(2),
      l.monthlyInterest.toFixed(2),
      (l.amountPay || l.monthlyTotal || 0).toFixed(2),
      paymentState(l).paidAmount.toFixed(2),
      paymentState(l).outstanding.toFixed(2),
      paymentState(l).nextPayment ? paymentState(l).nextPayment.dueDate : "Complete",
      paymentTransactionsText(l),
    ]);
    return [header, ...rows].map((r) => r.map(csvEsc).join(",")).join("\n");
  }

  function paymentTransactions(loan) {
    return (Array.isArray(loan.payments) ? loan.payments : [])
      .slice()
      .sort((a, b) => String(a.paidAt || "").localeCompare(String(b.paidAt || "")));
  }

  function paymentTransactionsText(loan) {
    return paymentTransactions(loan).map((payment) => {
      const component = payment.component === "principal" ? "Principal" : payment.component === "interest" ? "Interest" : "Opening/combined";
      const amount = payment.amountCents !== undefined ? fromCents(payment.amountCents) : Number(payment.amount) || 0;
      const month = payment.paymentNo ? `Installment ${payment.paymentNo}` : "Opening";
      return `${fmtDate(payment.paidAt)} ${component} ${fmtMoney(amount)} (${month})`;
    }).join(" | ");
  }

  function paymentTransactionsMarkup(loan) {
    const transactions = paymentTransactions(loan);
    if (!transactions.length) return '<small>No payments recorded</small>';
    return transactions.map((payment) => {
      const component = payment.component === "principal" ? "Principal" : payment.component === "interest" ? "Interest" : "Opening/combined";
      const amount = payment.amountCents !== undefined ? fromCents(payment.amountCents) : Number(payment.amount) || 0;
      const month = payment.paymentNo ? ` · Installment ${payment.paymentNo}` : "";
      return `<small>${fmtDate(payment.paidAt)} · ${component} · ${fmtMoney(amount)}${month}</small>`;
    }).join("");
  }

  /* ─────────────────────────────────────────────────────────────
     MONTHLY SCHEDULE
  ───────────────────────────────────────────────────────────── */

  function populateScheduleSelect() {
    const sel = $("schedClientSelect");
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML =
      '<option value="">— Select a client —</option>' +
      loanStore
        .map(
          (l) =>
            `<option value="${l.id}"${l.id === cur ? " selected" : ""}>${escH(l.clientName)} (#${l.number})</option>`,
        )
        .join("");
    // If previously selected client still exists, re-render
    if (cur && getLoanById(cur)) renderSchedule(cur);
    else clearSchedule();
  }

  function clearSchedule() {
    const placeholder = $("schedPlaceholder");
    const table = $("loanScheduleTable");
    const banner = $("loanClientBanner");
    const progressWrap = $("loanProgressWrap");
    const paymentHistory = $("loanPaymentHistory");
    if (placeholder) placeholder.style.display = "";
    if (table) table.style.display = "none";
    if (banner) banner.style.display = "none";
    if (progressWrap) progressWrap.style.display = "none";
    if (paymentHistory) paymentHistory.style.display = "none";
  }

  function renderSchedule(loanId) {
    const loan = getLoanById(loanId);
    if (!loan) {
      clearSchedule();
      return;
    }

    const placeholder = $("schedPlaceholder");
    const table = $("loanScheduleTable");
    const tbody = $("loan-sched-tbody");
    const tfoot = $("loan-sched-tfoot");
    const banner = $("loanClientBanner");
    const progressWrap = $("loanProgressWrap");

    if (placeholder) placeholder.style.display = "none";
    if (table) table.style.display = "";
    if (banner) banner.style.display = "";
    if (progressWrap) progressWrap.style.display = "";

    // Banner stats
    setValue("bannerClient", escH(loan.clientName));
    setValue("bannerAmount", fmtMoney(loan.amount));
    setValue("bannerInterest", fmtMoney(loan.interest));
    setValue("bannerTotal", fmtMoney(loan.total));
    setValue("bannerDuration", loan.duration + " months");

    const state = paymentState(loan);
    const sched = state.schedule;
    const paid = state.paidRows.length;
    const progress = loan.total ? Math.round((state.paidAmount / loan.total) * 100) : 0;
    setValue("bannerProgress", `${fmtMoney(state.paidAmount)} of ${fmtMoney(loan.total)}`);

    // Progress bar
    const fill = $("loanProgressFill");
    const label = $("loanProgressLabel");
    if (fill) fill.style.width = progress + "%";
    if (label) label.textContent = `${paid} / ${loan.duration} instalments paid · ${progress}% repaid`;

    if (!tbody) return;

    // Totals footer
    const sumPrinc = sched.reduce((a, r) => a + r.principal, 0);
    const sumInt = sched.reduce((a, r) => a + r.interest, 0);
    const sumTot = sched.reduce((a, r) => a + r.total, 0);
    const sumPaid = state.paidAmount;
    const sumRemaining = state.outstanding;
    if (tfoot) {
      tfoot.innerHTML = `
        <tr>
          <td colspan="2"><strong>TOTALS</strong></td>
          <td class="col-money">${fmtMoney(sumPrinc)}</td>
          <td class="col-money">${fmtMoney(sumInt)}</td>
          <td class="col-money">${fmtMoney(sumTot)}</td>
          <td class="col-money">${fmtMoney(sumPaid)}</td>
          <td class="col-money">${fmtMoney(sumRemaining)}</td>
          <td>—</td><td>—</td>
        </tr>
      `;
  }

  // Wire mark-paid buttons
    // (We insert them via statusBadge – but for schedule we also add a button)
    // Re-render rows with mark-paid button for pending/overdue
    tbody.innerHTML = sched
      .map(
        (row) => `
      <tr class="row-${row.status}" data-pay="${row.paymentNo}">
        <td class="col-num">${row.paymentNo}</td>
        <td>${fmtDate(row.dueDate)}</td>
        <td class="col-money">${fmtMoney(row.principal)}</td>
        <td class="col-money">${fmtMoney(row.interest)}</td>
        <td class="col-money">${fmtMoney(row.total)}</td>
        <td class="col-money">${fmtMoney(row.paidAmount)}</td>
        <td class="col-money">${fmtMoney(row.remaining)}</td>
        <td>
          ${statusBadge(row.status)}
          ${
            row.status !== "paid"
              ? `<span class="schedule-payment-entry"><select class="payment-component-select" aria-label="Payment type"><option value="principal">Principal only (${fmtMoney(fromCents(row.principalCents - row.paidPrincipalCents))})</option><option value="interest">Interest only (${fmtMoney(fromCents(row.interestCents - row.paidInterestCents))})</option></select><input type="date" class="payment-date-input" value="${todayISO()}" aria-label="Actual payment date for instalment ${row.paymentNo}"><input type="number" class="payment-amount-input" data-pay-no="${row.paymentNo}" data-loan-id="${loan.id}" min="0.01" step="0.01" inputmode="decimal" placeholder="Amount Paid" aria-label="Amount Paid for payment ${row.paymentNo}"><button class="btn-record-payment" data-pay-no="${row.paymentNo}" data-loan-id="${loan.id}"><i class="fas fa-check"></i> Record</button></span>`
              : ""
          }
        </td>
        <td class="col-money">${fmtMoney(row.balance)}</td>
      </tr>
    `,
      )
      .join("");

    function enteredAmount(button) {
      const selector = `.payment-amount-input[data-loan-id="${button.dataset.loanId}"][data-pay-no="${button.dataset.payNo}"]`;
      return tbody.querySelector(selector);
    }

    tbody.querySelectorAll(".btn-record-payment").forEach((btn) => {
      btn.addEventListener("click", () => {
        const input = enteredAmount(btn);
        const entry = btn.closest(".schedule-payment-entry");
        const component = entry?.querySelector(".payment-component-select")?.value || "principal";
        const paidAt = entry?.querySelector(".payment-date-input")?.value || "";
        recordMonthlyPayment(btn.dataset.loanId, btn.dataset.payNo, input && input.value, component, paidAt);
      });
    });
    renderPaymentHistory(loan);
  }

  function renderPaymentHistory(loan) {
    const section = $("loanPaymentHistory");
    const tbody = $("loan-payment-history-body");
    if (!section || !tbody) return;
    const transactions = (Array.isArray(loan.payments) ? loan.payments : [])
      .slice()
      .sort((a, b) => String(b.paidAt || "").localeCompare(String(a.paidAt || "")));
    section.style.display = "";
    tbody.innerHTML = transactions.length
      ? transactions.map((payment) => {
          const type = payment.component === "principal" ? "Principal" : payment.component === "interest" ? "Interest" : "Combined / opening payment";
          const amount = payment.amountCents !== undefined ? fromCents(payment.amountCents) : Number(payment.amount) || 0;
          const dueRow = payment.paymentNo ? buildSchedule(loan).find((row) => row.paymentNo === Number(payment.paymentNo)) : null;
          const scheduleMonth = dueRow ? `Installment ${payment.paymentNo} · Due ${fmtDate(dueRow.dueDate)}` : "Opening payment";
          return `<tr><td>${fmtDate(payment.paidAt)}</td><td>${scheduleMonth}</td><td>${type}</td><td class="col-money">${fmtMoney(amount)}</td></tr>`;
        }).join("")
      : '<tr><td colspan="4">No payments recorded for this loan yet.</td></tr>';
  }

  function initScheduleSelect() {
    const sel = $("schedClientSelect");
    if (sel) {
      sel.addEventListener("change", () => {
        if (sel.value) renderSchedule(sel.value);
        else clearSchedule();
      });
    }
  }

  function initSchedExport() {
    const btn = $("schedExportBtn");
    if (btn) {
      btn.addEventListener("click", () => {
        const sel = $("schedClientSelect");
        if (!sel || !sel.value) {
          showToastLoan("Please select a client first.");
          return;
        }
        const loan = getLoanById(sel.value);
        if (!loan) return;
        exportCSV(
          buildScheduleCSV(loan),
          "schedule_" + loan.clientName.replace(/\s+/g, "_"),
        );
      });
    }
  }

  function initSchedPrint() {
    const btn = $("schedPrintBtn");
    if (btn) {
      btn.addEventListener("click", () => {
        const sel = $("schedClientSelect");
        if (!sel || !sel.value) {
          showToastLoan("Please select a client first.");
          return;
        }
        window.print();
      });
    }
  }

  function buildScheduleCSV(loan) {
    const header = [
      "Client Name",
      "Payment #",
      "Due Date",
      "Principal Payment (USD)",
      "Interest Payment (USD)",
      "Total Payment (USD)",
      "Amount Paid (USD)",
      "Remaining (USD)",
      "Status",
      "Loan Balance (USD)",
    ];
    const rows = buildSchedule(loan).map((r) => [
      loan.clientName,
      r.paymentNo,
      r.dueDate,
      r.principal.toFixed(2),
      r.interest.toFixed(2),
      r.total.toFixed(2),
      r.paidAmount.toFixed(2),
      r.remaining.toFixed(2),
      r.status,
      r.balance.toFixed(2),
    ]);
    return [header, ...rows].map((r) => r.map(csvEsc).join(",")).join("\n");
  }

  /* ─────────────────────────────────────────────────────────────
     PER-CLIENT REPORT MODAL
  ───────────────────────────────────────────────────────────── */

  function openReportModal(loanId) {
    const loan = getLoanById(loanId);
    if (!loan) return;

    const modal = $("loanReportModal");
    const title = $("loanReportTitle");
    const sub = $("loanReportSub");
    const summary = $("loanReportSummary");
    const tbody = $("loan-report-tbody");
    const tfoot = $("loan-report-tfoot");
    if (!modal) return;

    if (title) title.textContent = `Loan Report — ${loan.clientName}`;
    if (sub)
      sub.textContent = `Loan #${loan.number} · Started ${fmtDate(loan.date)} · ${loan.duration}-month term`;

    const state = paymentState(loan);
    const sched = state.schedule;
    const paid = state.paidRows.length;
    const partial = state.partialRows.length;
    const overdue = sched.filter((r) => r.status === "overdue").length;
    const pending = sched.filter((r) => r.status === "pending").length;
    const paidAmt = state.paidAmount;
    const progress = loan.total ? Math.round((paidAmt / loan.total) * 100) : 0;

    if (summary) {
      summary.innerHTML = `
        <div class="loan-report-stat">
          <span class="loan-report-stat-label">Loan Amount</span>
          <span class="loan-report-stat-val blue">${fmtMoney(loan.amount)}</span>
        </div>
        <div class="loan-report-stat">
          <span class="loan-report-stat-label">Rate</span>
          <span class="loan-report-stat-val">${loan.rate}% p.m.</span>
        </div>
        <div class="loan-report-stat">
          <span class="loan-report-stat-label">Duration</span>
          <span class="loan-report-stat-val">${loan.duration} months</span>
        </div>
        <div class="loan-report-stat">
          <span class="loan-report-stat-label">Interest Amount</span>
          <span class="loan-report-stat-val amber">${fmtMoney(loan.interest)}</span>
        </div>
        <div class="loan-report-stat">
          <span class="loan-report-stat-label">Total Repayment</span>
          <span class="loan-report-stat-val">${fmtMoney(loan.total)}</span>
        </div>
        <div class="loan-report-stat">
          <span class="loan-report-stat-label">Monthly Amount Due</span>
          <span class="loan-report-stat-val blue">${fmtMoney(loan.amountPay || loan.monthlyTotal)}</span>
        </div>
        <div class="loan-report-stat">
          <span class="loan-report-stat-label">Paid So Far</span>
          <span class="loan-report-stat-val green">${fmtMoney(paidAmt)}</span>
        </div>
        <div class="loan-report-stat">
          <span class="loan-report-stat-label">Outstanding Balance</span>
          <span class="loan-report-stat-val ${state.outstandingCents === 0 ? "green" : "blue"}">${fmtMoney(state.outstanding)}</span>
        </div>
        <div class="loan-report-stat">
          <span class="loan-report-stat-label">Payments</span>
          <span class="loan-report-stat-val">
            <span style="color:#4ade80">${paid} paid</span> · 
            <span style="color:#38bdf8">${partial} partial</span> · 
            <span style="color:#fbbf24">${pending} pending</span> · 
            <span style="color:#f87171">${overdue} overdue</span>
          </span>
        </div>
        <div class="loan-report-stat">
          <span class="loan-report-stat-label">Completion</span>
          <span class="loan-report-stat-val ${progress === 100 ? "green" : overdue > 0 ? "red" : "blue"}">${progress}%</span>
        </div>
      `;
    }

    if (tbody) {
      tbody.innerHTML = sched
        .map(
          (row) => `
        <tr class="row-${row.status}">
          <td class="col-num">${row.paymentNo}</td>
          <td>${fmtDate(row.dueDate)}</td>
          <td class="col-money">${fmtMoney(row.principal)}</td>
          <td class="col-money">${fmtMoney(row.interest)}</td>
          <td class="col-money">${fmtMoney(row.total)}</td>
          <td class="col-money">${fmtMoney(row.paidAmount)}</td>
          <td class="col-money">${fmtMoney(row.remaining)}</td>
          <td>${statusBadge(row.status)}</td>
          <td class="col-money">${fmtMoney(row.balance)}</td>
        </tr>
      `,
        )
        .join("");
    }

    // Report tfoot
    const sumP = sched.reduce((a, r) => a + r.principal, 0);
    const sumI = sched.reduce((a, r) => a + r.interest, 0);
    const sumT = sched.reduce((a, r) => a + r.total, 0);
    if (tfoot) {
      tfoot.innerHTML = `
        <tr>
          <td colspan="2"><strong>TOTALS</strong></td>
          <td class="col-money">${fmtMoney(sumP)}</td>
          <td class="col-money">${fmtMoney(sumI)}</td>
          <td class="col-money">${fmtMoney(sumT)}</td>
          <td class="col-money">${fmtMoney(state.paidAmount)}</td>
          <td class="col-money">${fmtMoney(state.outstanding)}</td>
          <td>—</td><td>—</td>
        </tr>
      `;
    }

    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";

    // Store current loanId for print/export
    modal.dataset.currentLoan = loanId;

    // ── Update Prev / Next navigation state ──────────────────────
    _syncNavButtons(loanId);
  }

  /* ── Navigation helper: refresh counter + button disabled states ── */
  function _syncNavButtons(activeLoanId) {
    const prevBtn = $("reportPrevBtn");
    const nextBtn = $("reportNextBtn");
    const counter = $("loanNavCounter");
    if (!prevBtn || !nextBtn) return;

    // loanStore is newest-first (unshift). Visual order: newest = 1.
    // "Previous" means the next-newer entry (lower array index).
    // "Next"     means the next-older  entry (higher array index).
    const idx = loanStore.findIndex((l) => l.id === activeLoanId);
    const total = loanStore.length;

    if (counter) {
      counter.textContent = total > 0 ? `${idx + 1} / ${total}` : "—";
    }

    // Prev → go to idx-1 (newer record; disabled when idx === 0)
    prevBtn.disabled = idx <= 0;
    // Next → go to idx+1 (older record; disabled when idx === last)
    nextBtn.disabled = idx < 0 || idx >= total - 1;
  }

  function closeReportModal() {
    const modal = $("loanReportModal");
    if (!modal) return;
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  function initReportModal() {
    const closeBtn = $("loanReportClose");
    const backdrop = $("loanReportBackdrop");
    const printBtn = $("reportPrintBtn");
    const invoiceBtn = $("reportInvoiceBtn");
    if (closeBtn) closeBtn.addEventListener("click", closeReportModal);
    if (backdrop) backdrop.addEventListener("click", closeReportModal);
    // ESC key
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeReportModal();
    });
    if (printBtn) {
      printBtn.addEventListener("click", () => window.print());
    }
    if (invoiceBtn) {
      invoiceBtn.addEventListener("click", () => {
        const modal = $("loanReportModal");
        const loanId = modal && modal.dataset.currentLoan;
        const loan = loanId ? getLoanById(loanId) : null;
        if (loan && window.FMSInvoice) window.FMSInvoice.open(loan);
      });
    }

    // ── Prev / Next record navigation ───────────────────────────
    const prevBtn = $("reportPrevBtn");
    const nextBtn = $("reportNextBtn");

    if (prevBtn) {
      prevBtn.addEventListener("click", () => {
        const modal = $("loanReportModal");
        const cur = modal && modal.dataset.currentLoan;
        const idx = loanStore.findIndex((l) => l.id === cur);
        const target = loanStore[idx - 1]; // lower index = newer record
        if (target) openReportModal(target.id);
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener("click", () => {
        const modal = $("loanReportModal");
        const cur = modal && modal.dataset.currentLoan;
        const idx = loanStore.findIndex((l) => l.id === cur);
        const target = loanStore[idx + 1]; // higher index = older record
        if (target) openReportModal(target.id);
      });
    }
  }

  /* ─────────────────────────────────────────────────────────────
     ADD LOAN MODAL  (triggered from Loan Entry)
  ───────────────────────────────────────────────────────────── */

  /** Clear and reset the modal calc display fields (now <input> elements) */
  function resetModalCalcDisplay() {
    [
      "modal-calc-interest",
      "modal-calc-total",
      "modal-calc-monthly-principal",
      "modal-calc-monthly-interest",
      "modal-calc-amount-pay",
      "modal-calc-next-payment",
    ].forEach((id) => {
      const el = $(id);
      if (el) {
        el.value = "";
        el.placeholder = "—";
        el.classList.remove("is-filled");
      }
    });
  }

  /** Live-calculate preview values inside the modal (populates <input> fields) */
  function updateModalCalcDisplay() {
    const amtEl = $("modal-loan-amount");
    const ratEl = $("modal-loan-rate");
    const durEl = $("modal-loan-duration");
    const dateEl = $("modal-loan-date");
    const paymentMonthEl = $("modal-loan-next-payment-month");
    if (!amtEl || !ratEl || !durEl) return;

    const calc = calcLoan(amtEl.value, ratEl.value, durEl.value);

    const fields = [
      { id: "modal-calc-interest", val: calc ? calc.interest : null },
      { id: "modal-calc-total", val: calc ? calc.total : null },
      {
        id: "modal-calc-monthly-principal",
        val: calc ? calc.monthlyPrincipal : null,
      },
      {
        id: "modal-calc-monthly-interest",
        val: calc ? calc.monthlyInterest : null,
      },
      { id: "modal-calc-amount-pay", val: calc ? calc.monthlyTotal : null },
    ];

    fields.forEach((f) => {
      const el = $(f.id);
      if (!el) return;
      if (f.val !== null) {
        el.value = fmtMoney(f.val);
        el.classList.add("is-filled");
      } else {
        el.value = "";
        el.placeholder = "—";
        el.classList.remove("is-filled");
      }
    });

    const next = $("modal-calc-next-payment");
    if (next) {
      next.value = dateEl && dateEl.value
        ? fmtDate(firstPaymentDate(dateEl.value, paymentMonthEl && paymentMonthEl.value))
        : "";
      next.placeholder = "—";
      next.classList.toggle("is-filled", !!(dateEl && dateEl.value));
    }
  }

  /* ─────────────────────────────────────────────────────────────
     EDIT LOAN MODAL  (pre-populate #loanAddModal in edit mode)
  ───────────────────────────────────────────────────────────── */

  /**
   * openEditLoanModal(loanId)
   * Reuses #loanAddModal with an 'edit mode' flag stored on the form.
   * Pre-fills all fields with current loan values; on submit, updates
   * the existing record in loanStore instead of clearing and adding.
   */
  function openEditLoanModal(loanId) {
    const loan = getLoanById(loanId);
    if (!loan) {
      showToastLoan("Loan record not found.");
      return;
    }

    const modal = $("loanAddModal");
    const form = $("loanFormModal");
    const titleEl = $("loanAddModalTitle");
    const submitBtn = form && form.querySelector('button[type="submit"]');
    if (!modal || !form) return;

    // Mark form as edit mode
    form.dataset.editLoanId = loanId;

    // Pre-fill core fields
    const clientEl = $("modal-loan-client");
    if (clientEl) clientEl.value = loan.clientName;
    const dateEl = $("modal-loan-date");
    if (dateEl) dateEl.value = loan.date;
    const amountEl = $("modal-loan-amount");
    if (amountEl) amountEl.value = loan.amount;
    const rateEl = $("modal-loan-rate");
    if (rateEl) {
      const rateValue = String(loan.rate);
      if (!Array.from(rateEl.options).some((option) => option.value === rateValue)) {
        const option = document.createElement("option");
        option.value = rateValue;
        option.textContent = `${loan.rate}% per month (calculated)`;
        rateEl.appendChild(option);
      }
      rateEl.value = rateValue;
    }
    const durationEl = $("modal-loan-duration");
    if (durationEl) durationEl.value = loan.duration;
    const paymentMonthEl = $("modal-loan-next-payment-month");
    if (paymentMonthEl) paymentMonthEl.value = loan.nextPaymentMonth || defaultPaymentMonth(loan.date);
    const amountPaidEl = $("modal-loan-amount-paid");
    if (amountPaidEl) amountPaidEl.value = paymentState(loan).paidAmount.toFixed(2);

    // Pre-fill editable calc fields
    const calcFields = [
      { id: "modal-calc-interest", val: loan.interest },
      { id: "modal-calc-total", val: loan.total },
      { id: "modal-calc-monthly-principal", val: loan.monthlyPrincipal },
      { id: "modal-calc-monthly-interest", val: loan.monthlyInterest },
      { id: "modal-calc-amount-pay", val: loan.amountPay || loan.monthlyTotal },
    ];
    calcFields.forEach((f) => {
      const el = $(f.id);
      if (!el) return;
      el.value = fmtMoney(f.val);
      el.classList.add("is-filled");
    });
    const nextPayment = $("modal-calc-next-payment");
    if (nextPayment) {
      const state = paymentState(loan);
      nextPayment.value = state.nextPayment ? fmtDate(state.nextPayment.dueDate) : "Complete";
      nextPayment.classList.add("is-filled");
    }

    // Update modal title and submit button label to signal edit mode
    if (titleEl) titleEl.textContent = "Edit Loan Record";
    if (submitBtn)
      submitBtn.innerHTML = '<i class="fas fa-save"></i> Update Loan Record';

    // Show modal
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";

    // Focus client name field
    setTimeout(() => {
      const cl = $("modal-loan-client");
      if (cl) cl.focus();
    }, 80);
  }

  function openAddLoanModal() {
    const modal = $("loanAddModal");
    if (!modal) return;

    // Reset the form (and clear any edit-mode flag)
    const form = $("loanFormModal");
    if (form) {
      form.reset();
      delete form.dataset.editLoanId;
    }
    resetModalCalcDisplay();

    // Restore modal title and submit button to add-mode defaults
    const titleEl = $("loanAddModalTitle");
    if (titleEl) titleEl.textContent = "Add New Client Loan";
    const submitBtn = form && form.querySelector('button[type="submit"]');
    if (submitBtn)
      submitBtn.innerHTML =
        '<i class="fas fa-plus-circle"></i> Save Loan Record';

    // Default date = today
    const dateEl = $("modal-loan-date");
    if (dateEl) dateEl.value = todayISO();
    const paymentMonthEl = $("modal-loan-next-payment-month");
    if (paymentMonthEl) paymentMonthEl.value = defaultPaymentMonth(dateEl && dateEl.value);

    // Show modal
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";

    // Focus first field
    setTimeout(() => {
      const cl = $("modal-loan-client");
      if (cl) cl.focus();
    }, 80);
  }

  function closeAddLoanModal() {
    const modal = $("loanAddModal");
    if (!modal) return;
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    // Clear edit-mode flag and restore default title/button text
    const form = $("loanFormModal");
    if (form) delete form.dataset.editLoanId;
    const titleEl = $("loanAddModalTitle");
    if (titleEl) titleEl.textContent = "Add New Client Loan";
    const submitBtn = form && form.querySelector('button[type="submit"]');
    if (submitBtn)
      submitBtn.innerHTML =
        '<i class="fas fa-plus-circle"></i> Save Loan Record';
  }

  function initAddLoanModal() {
    // Open button (Loan Entry header — primary trigger)
    const openBtn = $("addClientSheetBtn");
    if (openBtn) openBtn.addEventListener("click", openAddLoanModal);

    // Sub-task 3: Import button — file picker trigger
    const importBtn = $("sheetImportBtn");
    if (importBtn) {
      importBtn.addEventListener("click", () => {
        const picker = document.createElement("input");
        picker.type = "file";
        picker.accept = ".csv,text/csv";
        picker.addEventListener("change", () => {
          const file = picker.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = (ev) => {
            try {
              const lines = ev.target.result.trim().split(/\r?\n/);
              const header = lines[0]
                .split(",")
                .map((h) => h.replace(/^"|"$/g, "").trim().toLowerCase());
              const idx = {
                name: header.findIndex(
                  (h) => h.includes("client") || h.includes("name"),
                ),
                date: header.findIndex((h) => h.includes("date")),
                amount: header.findIndex(
                  (h) =>
                    h.includes("amount") &&
                    !h.includes("interest") &&
                    !h.includes("total") &&
                    !h.includes("monthly"),
                ),
                rate: header.findIndex((h) => h.includes("rate")),
                duration: header.findIndex(
                  (h) => h.includes("duration") || h.includes("month"),
                ),
                amountPaid: header.findIndex((h) => h.includes("amount paid")),
                nextPayment: header.findIndex((h) => h.includes("next payment")),
              };
              let imported = 0;
              let firstImportedId = null;
              lines.slice(1).forEach((row) => {
                const cols = row
                  .split(",")
                  .map((c) => c.replace(/^"|"$/g, "").trim());
                const clientName = idx.name >= 0 ? cols[idx.name] : "";
                const date = idx.date >= 0 ? cols[idx.date] : todayISO();
                const amount = idx.amount >= 0 ? cols[idx.amount] : "";
                const rate = idx.rate >= 0 ? cols[idx.rate] : "";
                const duration = idx.duration >= 0 ? cols[idx.duration] : "";
                const amountPaid = idx.amountPaid >= 0 ? cols[idx.amountPaid] : "";
                const nextPayment = idx.nextPayment >= 0 ? cols[idx.nextPayment] : "";
                const nextPaymentMonth = /^\d{4}-\d{2}-\d{2}$/.test(nextPayment)
                  ? String(Number(nextPayment.slice(5, 7)))
                  : "";
                if (clientName && +amount > 0 && +rate > 0 && Number.isInteger(+duration) && +duration >= 1) {
                  const loan = addLoan({
                    clientName,
                    date,
                    amount,
                    rate,
                    duration,
                    amountPaid,
                    nextPaymentMonth: nextPaymentMonth || defaultPaymentMonth(date),
                  });
                  if (!firstImportedId && loan) firstImportedId = loan.id;
                  if (loan) imported++;
                }
              });
              renderEntryTable();
              renderDataSheet();
              populateScheduleSelect();
              syncCount();
              if (firstImportedId) openInLoanEntry(firstImportedId);
              showToastLoan(`Imported ${imported} record(s) to Loan Entry.`);
            } catch (err) {
              showToastLoan("Import failed — check CSV format.");
            }
          };
          reader.readAsText(file);
        });
        picker.click();
      });
    }

    // Sub-task 3: Invoice button — open report for selected/first client
    const invoiceBtn = $("sheetInvoiceBtn");
    if (invoiceBtn) {
      invoiceBtn.addEventListener("click", () => {
        if (!loanStore.length) {
          showToastLoan("No records — add a client first.");
          return;
        }
        openReportModal(loanStore[0].id);
      });
    }

    // Print the Loan Entry table
    const printSheetBtn = $("sheetPrintBtn");
    if (printSheetBtn) {
      printSheetBtn.addEventListener("click", () => window.print());
    }

    // Download the Loan Entry table as CSV
    const downloadBtn = $("sheetDownloadBtn");
    if (downloadBtn) {
      downloadBtn.addEventListener("click", () => {
        if (!loanStore.length) {
          showToastLoan("No data to download.");
          return;
        }
        const csv = buildSheetCSV();
        if (!csv) {
          showToastLoan("Nothing to download.");
          return;
        }
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "loan-entry-" + todayISO() + ".csv";
        a.click();
        URL.revokeObjectURL(url);
        showToastLoan("Loan Entry downloaded.");
      });
    }

    // Close × button
    const closeBtn = $("loanAddClose");
    if (closeBtn) closeBtn.addEventListener("click", closeAddLoanModal);

    // Cancel button
    const cancelBtn = $("loanModalCancelBtn");
    if (cancelBtn) cancelBtn.addEventListener("click", closeAddLoanModal);

    // Backdrop click
    const backdrop = $("loanAddBackdrop");
    if (backdrop) backdrop.addEventListener("click", closeAddLoanModal);

    // ESC key — only close add-modal when it is open
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        const modal = $("loanAddModal");
        if (modal && modal.classList.contains("open")) closeAddLoanModal();
      }
    });

    // Live auto-calculation on modal inputs
    ["modal-loan-amount", "modal-loan-rate", "modal-loan-duration", "modal-loan-date", "modal-loan-next-payment-month"].forEach(
      (id) => {
        const el = $(id);
        if (el) {
          el.addEventListener("input", updateModalCalcDisplay);
          el.addEventListener("change", updateModalCalcDisplay);
        }
      },
    );

    // Reset (clear) button inside modal
    const clearBtn = $("loanModalClearBtn");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        const form = $("loanFormModal");
        if (form) form.reset();
        const dateEl = $("modal-loan-date");
        if (dateEl) dateEl.value = todayISO();
        const paymentMonthEl = $("modal-loan-next-payment-month");
        if (paymentMonthEl) paymentMonthEl.value = defaultPaymentMonth(dateEl && dateEl.value);
        resetModalCalcDisplay();
        const cl = $("modal-loan-client");
        if (cl) cl.focus();
      });
    }

    // Form submission
    const form = $("loanFormModal");
    if (!form) return;

    form.addEventListener("submit", (e) => {
      e.preventDefault();

      const clientName = $("modal-loan-client")?.value.trim();
      const date = $("modal-loan-date")?.value;
      const amount = $("modal-loan-amount")?.value;
      const rate = $("modal-loan-rate")?.value;
      const duration = $("modal-loan-duration")?.value;
      const amountPaid = $("modal-loan-amount-paid")?.value;
      const nextPaymentMonth = $("modal-loan-next-payment-month")?.value;

      // Validation
      if (!clientName) {
        showToastLoan("Client Name is required.");
        return;
      }
      if (!date) {
        showToastLoan("Loan Start Date is required.");
        return;
      }
      if (!amount || +amount <= 0) {
        showToastLoan("Loan Amount must be greater than 0.");
        return;
      }
      const editingLoanForValidation = form.dataset.editLoanId ? getLoanById(form.dataset.editLoanId) : null;
      const keepsExistingCustomLoan = !!(editingLoanForValidation && editingLoanForValidation.customSchedule &&
        toCents(amount) === toCents(editingLoanForValidation.amount) &&
        Number(rate) === Number(editingLoanForValidation.rate) &&
        Number(duration) === Number(editingLoanForValidation.duration));
      if (!rate || (+rate <= 0 && !keepsExistingCustomLoan)) {
        showToastLoan("Rate per month must be greater than 0.");
        return;
      }
      if (!duration || !Number.isInteger(+duration) || +duration < 1) {
        showToastLoan("Payment Term must be a whole number of months (1 or more).");
        return;
      }
      if (!nextPaymentMonth) {
        showToastLoan("Please select the next payment month.");
        return;
      }
      const submittedCalc = keepsExistingCustomLoan
        ? {
            principal: editingLoanForValidation.amount,
            interest: editingLoanForValidation.interest,
            total: editingLoanForValidation.total,
            monthlyPrincipal: editingLoanForValidation.monthlyPrincipal,
            monthlyInterest: editingLoanForValidation.monthlyInterest,
            monthlyTotal: editingLoanForValidation.monthlyTotal,
          }
        : calcLoan(amount, rate, duration);
      if (!submittedCalc) {
        showToastLoan("Could not calculate loan — check principal, rate, and term.");
        return;
      }
      if (amountPaid !== "" && (+amountPaid < 0 || toCents(amountPaid) > toCents(submittedCalc.total))) {
        showToastLoan("Amount Paid must be between $0.00 and the total repayment.");
        return;
      }
      const editIdForLimit = form.dataset.editLoanId;
      const clientLoanCount = loanStore.filter((loan) => loan.clientName.trim().toLocaleLowerCase() === clientName.toLocaleLowerCase() && loan.id !== editIdForLimit).length;
      if (!editIdForLimit && clientLoanCount + 1 > 2) {
        showToastLoan("A client can have up to two loan records.");
        return;
      }

      // ── EDIT MODE: update existing record ──────────────────────
      const editId = form.dataset.editLoanId;
      if (editId) {
        const existing = getLoanById(editId);
        if (!existing) {
          showToastLoan("Could not find loan to update.");
          return;
        }

        const retainsCustomSchedule = existing.customSchedule &&
          toCents(amount) === toCents(existing.amount) &&
          Number(rate) === Number(existing.rate) &&
          Number(duration) === Number(existing.duration);
        const calc = retainsCustomSchedule
          ? { principal: existing.amount, interest: existing.interest, total: existing.total, monthlyPrincipal: existing.monthlyPrincipal, monthlyInterest: existing.monthlyInterest, monthlyTotal: existing.monthlyTotal }
          : submittedCalc;
        if (!calc) {
          showToastLoan("Could not calculate loan — check inputs.");
          return;
        }

        const paidBeforeEditCents = paymentState(existing).paidCents;
        const requestedPaidCents = amountPaid === "" ? paidBeforeEditCents : toCents(amountPaid);
        if (requestedPaidCents < paidBeforeEditCents) {
          showToastLoan("Amount Paid cannot be reduced here because recorded payments are retained. Add a correcting payment through the schedule if needed.");
          return;
        }
        if (requestedPaidCents > toCents(calc.total)) {
          showToastLoan("Amount Paid cannot exceed the revised total repayment.");
          return;
        }

        // Update all mutable fields; retain recorded payments as an audit trail.
        existing.clientName = clientName;
        existing.date = date;
        existing.amount = calc.principal;
        existing.rate = +rate;
        existing.duration = +duration;
        existing.interest = calc.interest;
        existing.total = calc.total;
        existing.monthlyPrincipal = calc.monthlyPrincipal;
        existing.customSchedule = retainsCustomSchedule;
        existing.monthlyInterest = calc.monthlyInterest;
        existing.monthlyTotal = calc.monthlyTotal;
        existing.amountPay = calc.monthlyTotal;
        existing.nextPaymentMonth = Number(nextPaymentMonth);
        existing.firstPaymentDate = firstPaymentDate(date, nextPaymentMonth);
        if (requestedPaidCents > paidBeforeEditCents) {
          existing.payments = Array.isArray(existing.payments) ? existing.payments : [];
          existing.payments.push({
            id: uid(),
            amountCents: requestedPaidCents - paidBeforeEditCents,
            paidAt: todayISO(),
            source: "adjustment",
          });
        }
        persistLoans();

        // Refresh all views
        renderEntryTable();
        renderDataSheet();
        populateScheduleSelect();
        syncCount();

        closeAddLoanModal();
        openInLoanEntry(existing.id);
        showToastLoan(`Loan record for "${clientName}" updated in Loan Entry.`);
        return;
      }

      // ── ADD MODE: retain the existing portfolio and add this client ──
      const loan = addLoan({ clientName, date, amount, rate, duration, amountPaid, nextPaymentMonth });
      if (!loan) {
        showToastLoan("Could not calculate loan — check inputs.");
        return;
      }

      // Refresh all three sub-tabs
      renderEntryTable();
      renderDataSheet();
      populateScheduleSelect();
      syncCount();

      // Open the same saved record in Loan Entry on the Dashboard.
      closeAddLoanModal();
      openInLoanEntry(loan.id);
      showToastLoan(`Loan record for "${clientName}" added to Loan Entry.`);
    });
  }

  /* ─────────────────────────────────────────────────────────────
     STATUS BADGE HELPER
  ───────────────────────────────────────────────────────────── */

  function statusBadge(status) {
    switch (status) {
      case "paid":
        return '<span class="badge-paid"><i class="fas fa-check-circle"></i> Paid</span>';
      case "partial":
        return '<span class="badge-partial"><i class="fas fa-coins"></i> Part paid</span>';
      case "overdue":
        return '<span class="badge-overdue"><i class="fas fa-exclamation-circle"></i> Overdue</span>';
      case "pending":
        return '<span class="badge-pending"><i class="fas fa-clock"></i> Pending</span>';
      default:
        return '<span class="badge-pending">' + status + "</span>";
    }
  }

  /* ─────────────────────────────────────────────────────────────
     CSV EXPORT HELPER
  ───────────────────────────────────────────────────────────── */

  function csvEsc(val) {
    const s = String(val === null || val === undefined ? "" : val);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  function exportCSV(csv, filename) {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download =
      filename + "_" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1000);
  }

  /* ─────────────────────────────────────────────────────────────
     HTML ESCAPE
  ───────────────────────────────────────────────────────────── */

  function escH(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* ─────────────────────────────────────────────────────────────
     DOM SETTER HELPER
  ───────────────────────────────────────────────────────────── */

  function setValue(id, html) {
    const el = $(id);
    if (el) el.innerHTML = html;
  }

  /* ─────────────────────────────────────────────────────────────
     SEED LOADER
  ───────────────────────────────────────────────────────────── */

  function loadSeedData() {
    SEED_LOANS.forEach((s) => addLoan(s));
    // For demonstration: mark some early payments as paid for the first two loans
    if (loanStore.length >= 1) {
      const l0 = loanStore[loanStore.length - 1]; // oldest (Apex Ltd - added first)
      // Mark first 18 payments paid (loan is 24 months, started 2023-06-01 → many past)
      for (let i = 1; i <= 18; i++) l0.paidPayments.add(i);
    }
    if (loanStore.length >= 2) {
      const l1 = loanStore[loanStore.length - 2]; // Zenith Corp
      // 12-month loan from 2023-09-15 → now fully past due
      for (let i = 1; i <= 12; i++) l1.paidPayments.add(i);
    }
    if (loanStore.length >= 3) {
      const l2 = loanStore[loanStore.length - 3]; // BrightPath Ltd
      for (let i = 1; i <= 8; i++) l2.paidPayments.add(i);
    }
    if (loanStore.length >= 4) {
      const l3 = loanStore[loanStore.length - 4]; // Summit Group
      for (let i = 1; i <= 4; i++) l3.paidPayments.add(i);
    }
  }

  /* ─────────────────────────────────────────────────────────────
     FMSDB PERSISTENCE — loan records stay permanently in the DB
  ───────────────────────────────────────────────────────────── */
  function serializeLoans() {
    return loanStore.map((l) =>
      Object.assign({}, l, {
        paidPayments: l.paidPayments ? Array.from(l.paidPayments) : [],
      }),
    );
  }
  function persistLoans() {
    if (window.FMSDB) {
      try {
        FMSDB.set("loans", serializeLoans());
      } catch (_) {}
    }
  }
  function hydrateFromDB() {
    if (!window.FMSDB) return;
    try {
      const hasSavedLoans = typeof FMSDB.hasTable === 'function' && FMSDB.hasTable("loans");
      const rows = FMSDB.table("loans", null);
      if (!rows || (!rows.length && !hasSavedLoans)) {
        loadSeedData();
        persistLoans();
        return;
      }
      loanStore = rows.map((r) =>
        normaliseLoanCalculations(
          Object.assign({}, r, { paidPayments: new Set(r.paidPayments || []) }),
        ),
      );
      loanCounter = loanStore.reduce((m, l) => Math.max(m, l.number || 0), 0);
    } catch (_) {}
  }
  if (window.FMSDB) {
    FMSDB.on((d) => {
      if (!d || (d.table !== "loans" && d.table !== "*") || !d.remote) return;
      try {
        const rows = FMSDB.table("loans");
        loanStore = rows.map((r) =>
          normaliseLoanCalculations(
            Object.assign({}, r, { paidPayments: new Set(r.paidPayments || []) }),
          ),
        );
        loanCounter = loanStore.reduce((m, l) => Math.max(m, l.number || 0), 0);
        renderEntryTable();
        renderDataSheet();
        populateScheduleSelect();
        syncCount();
      } catch (_) {}
    });
  }

  /* ─────────────────────────────────────────────────────────────
     INITIALISE
  ───────────────────────────────────────────────────────────── */

  function init() {
    /* Load persisted loan database (seeds demo portfolio on very first run) */
    hydrateFromDB();
    initSubTabs();
    initLoanForm();
    initEntrySearch();
    initEntryExport();
    initSheetSearch();
    initLoanSelection();
    initSheetExport();
    initScheduleSelect();
    initSchedExport();
    initSchedPrint();
    initReportModal();
    initAddLoanModal();

    // Initial renders
    renderEntryTable();
    renderDataSheet();
    populateScheduleSelect();
    syncCount();
  }

  // Wait for DOM
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Expose for debugging
  window.LoanEngine = {
    loanStore,
    calcLoan,
    buildSchedule,
    renderDataSheet,
    renderSchedule,
    openNotificationTarget: function (loanId) {
      if (!getLoanById(loanId)) return false;
      openInLoanEntry(loanId);
      return true;
    },
  };
})();
