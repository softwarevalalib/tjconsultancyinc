/* ═══════════════════════════════════════════════════════════════
   finreports.js — Income Statement, Balance Sheet, Cash Flow, P&L
   ═══════════════════════════════════════════════════════════════ */

'use strict';

/* chart instances for the 4 report pages */
let isChart = null;
let bsChart = null;
let cfChart = null;
let plChart = null;

/* ─── MONTHS LABEL HELPER ─── */
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/* ═══════════════════════════════════════════════════════════════
   INCOME STATEMENT
   ═══════════════════════════════════════════════════════════════ */
function loadIncomeStatement() {
  const totalLoan      = allClients.reduce((s, c) => s + (c.loan_amount     || 0), 0);
  const totalInterest  = allClients.reduce((s, c) => s + (c.interest_amount || 0), 0);
  const totalPaid      = allClients.reduce((s, c) => s + (c.amount_paid     || 0), 0);
  const totalBalance   = allClients.reduce((s, c) => s + (c.remaining_balance || 0), 0);

  /* Revenue items */
  const interestIncome   = totalInterest;
  const loanFees         = totalLoan * 0.012;      // 1.2 % origination fee
  const lateCharges      = allClients.filter(c => c.status === 'Overdue').reduce((s,c) => s + c.loan_amount * 0.02, 0);
  const otherIncome      = totalLoan * 0.005;
  const totalRevenue     = interestIncome + loanFees + lateCharges + otherIncome;

  /* Expense items */
  const salaries         = totalRevenue * 0.28;
  const adminCosts       = totalRevenue * 0.09;
  const provisionBadDebt = totalBalance * 0.04;
  const technologyCosts  = totalRevenue * 0.05;
  const marketingCosts   = totalRevenue * 0.03;
  const otherExpenses    = totalRevenue * 0.02;
  const totalExpenses    = salaries + adminCosts + provisionBadDebt + technologyCosts + marketingCosts + otherExpenses;

  const netIncome        = totalRevenue - totalExpenses;
  const netMargin        = totalRevenue > 0 ? (netIncome / totalRevenue * 100) : 0;

  /* KPIs */
  $('is-kpis').innerHTML = buildKpiCards([
    { label: 'Total Revenue',  icon: 'fa-arrow-circle-up',   value: fmtCurrency(totalRevenue),  sub: 'All income sources',         color: '#10b981', trend: '+9.2%', up: true },
    { label: 'Total Expenses', icon: 'fa-arrow-circle-down', value: fmtCurrency(totalExpenses), sub: 'All operating costs',        color: '#ef4444', trend: '+4.1%', up: false },
    { label: 'Net Income',     icon: 'fa-hand-holding-usd',  value: fmtCurrency(netIncome),     sub: 'After all deductions',       color: '#4f46e5', trend: '+14.3%', up: true },
    { label: 'Net Margin',     icon: 'fa-percentage',        value: netMargin.toFixed(1) + '%', sub: 'Profit as % of revenue',     color: '#f59e0b', trend: '',      up: true }
  ]);

  /* Revenue table */
  const revenueRows = [
    { desc: 'Interest Income',           val: interestIncome },
    { desc: 'Loan Origination Fees',     val: loanFees },
    { desc: 'Late Payment Charges',      val: lateCharges },
    { desc: 'Other Income',              val: otherIncome }
  ];
  $('is-revenue-tbody').innerHTML = revenueRows.map(r => `
    <tr>
      <td class="indent">${r.desc}</td>
      <td class="amt-pos">${fmtCurrency(r.val)}</td>
      <td>${(r.val / totalRevenue * 100).toFixed(1)}%</td>
    </tr>`).join('');
  $('is-revenue-tfoot').innerHTML = `<tr>
    <td class="total-label">Total Revenue</td>
    <td class="total-value success" colspan="2">${fmtCurrency(totalRevenue)}</td></tr>`;

  /* Expense table */
  const expenseRows = [
    { desc: 'Staff Salaries & Benefits',  val: salaries },
    { desc: 'Administrative Costs',       val: adminCosts },
    { desc: 'Provision for Bad Debt',     val: provisionBadDebt },
    { desc: 'Technology & Systems',       val: technologyCosts },
    { desc: 'Marketing & Outreach',       val: marketingCosts },
    { desc: 'Other Operating Expenses',   val: otherExpenses }
  ];
  $('is-expense-tbody').innerHTML = expenseRows.map(r => `
    <tr>
      <td class="indent">${r.desc}</td>
      <td class="amt-neg">${fmtCurrency(r.val)}</td>
      <td>${(r.val / totalRevenue * 100).toFixed(1)}%</td>
    </tr>`).join('');
  $('is-expense-tfoot').innerHTML = `<tr>
    <td class="total-label">Total Expenses</td>
    <td class="total-value danger" colspan="2">${fmtCurrency(totalExpenses)}</td></tr>`;

  /* Net summary */
  $('is-net-summary').innerHTML = `
    <div class="fin-net-item ${netIncome >= 0 ? 'positive' : 'negative'}">
      <div class="fin-net-label">Net Income</div>
      <div class="fin-net-value">${fmtCurrency(netIncome)}</div>
      <div class="fin-net-sub">${netMargin.toFixed(1)}% margin</div>
    </div>
    <div class="fin-net-item neutral">
      <div class="fin-net-label">Total Revenue</div>
      <div class="fin-net-value">${fmtCurrency(totalRevenue)}</div>
      <div class="fin-net-sub">All income sources</div>
    </div>
    <div class="fin-net-item info-bg">
      <div class="fin-net-label">Total Expenses</div>
      <div class="fin-net-value">${fmtCurrency(totalExpenses)}</div>
      <div class="fin-net-sub">${(totalExpenses / totalRevenue * 100).toFixed(1)}% of revenue</div>
    </div>`;

  /* Chart */
  buildIsChart(totalRevenue, totalExpenses, netIncome);
}

function buildIsChart(revenue, expenses, netIncome) {
  const canvas = document.getElementById('is-chart');
  if (!canvas) return;
  if (isChart) { isChart.destroy(); isChart = null; }
  const ctx = canvas.getContext('2d');
  const factor = revenue / 6;
  const monthlyRev = MONTHS.map((_, i) => Math.round(factor * (0.75 + Math.random() * 0.5)));
  const monthlyExp = monthlyRev.map(r => Math.round(r * (expenses / revenue) * (0.9 + Math.random() * 0.2)));
  const monthlyNet = monthlyRev.map((r, i) => r - monthlyExp[i]);

  isChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: MONTHS,
      datasets: [
        { label: 'Revenue', data: monthlyRev, backgroundColor: 'rgba(16,185,129,.75)', borderRadius: 5 },
        { label: 'Expenses', data: monthlyExp, backgroundColor: 'rgba(239,68,68,.7)', borderRadius: 5 },
        { label: 'Net Income', data: monthlyNet, type: 'line', borderColor: '#4f46e5', backgroundColor: 'rgba(79,70,229,.08)', borderWidth: 2, fill: true, tension: .4, pointRadius: 3, pointBackgroundColor: '#4f46e5' }
      ]
    },
    options: chartBaseOptions('$')
  });
}

/* ═══════════════════════════════════════════════════════════════
   BALANCE SHEET
   ═══════════════════════════════════════════════════════════════ */
function loadBalanceSheet() {
  const totalLoan      = allClients.reduce((s, c) => s + (c.loan_amount      || 0), 0);
  const totalPaid      = allClients.reduce((s, c) => s + (c.amount_paid      || 0), 0);
  const totalBalance   = allClients.reduce((s, c) => s + (c.remaining_balance || 0), 0);
  const totalBondPrin  = allClients.reduce((s, c) => s + (c.bonded_principal  || 0), 0);
  const totalBondInt   = allClients.reduce((s, c) => s + (c.bonded_interest   || 0), 0);
  const totalInterest  = allClients.reduce((s, c) => s + (c.interest_amount   || 0), 0);

  /* ASSETS */
  const cashOnHand       = totalPaid * 0.35;
  const loanReceivables  = totalBalance;
  const bondedAssets     = totalBondPrin + totalBondInt;
  const fixedAssets      = totalLoan * 0.07;
  const otherAssets      = totalLoan * 0.03;
  const totalAssets      = cashOnHand + loanReceivables + bondedAssets + fixedAssets + otherAssets;

  /* LIABILITIES */
  const borrowings       = totalLoan * 0.4;
  const depositorFunds   = totalLoan * 0.22;
  const accruedInterest  = totalInterest * 0.15;
  const otherLiabilities = totalLoan * 0.03;
  const totalLiabilities = borrowings + depositorFunds + accruedInterest + otherLiabilities;

  /* EQUITY */
  const equity           = totalAssets - totalLiabilities;
  const retainedEarnings = equity * 0.6;
  const shareCapital     = equity * 0.4;

  /* KPIs */
  $('bs-kpis').innerHTML = buildKpiCards([
    { label: 'Total Assets',      icon: 'fa-coins',         value: fmtCurrency(totalAssets),      sub: 'All company assets',       color: '#10b981', trend: '+7.4%',  up: true  },
    { label: 'Total Liabilities', icon: 'fa-hand-holding-usd', value: fmtCurrency(totalLiabilities), sub: 'Obligations owed',      color: '#ef4444', trend: '+2.1%',  up: false },
    { label: 'Shareholders Equity', icon: 'fa-shield-alt',  value: fmtCurrency(equity),           sub: 'Net worth',                color: '#4f46e5', trend: '+11.6%', up: true  },
    { label: 'Debt-to-Equity',    icon: 'fa-percent',       value: (totalLiabilities / equity).toFixed(2) + 'x', sub: 'Leverage ratio', color: '#f59e0b', trend: '',       up: true }
  ]);

  /* Assets table */
  const assetRows = [
    { desc: 'Cash & Cash Equivalents',    val: cashOnHand,      indent: true  },
    { desc: 'Loan Receivables',            val: loanReceivables, indent: true  },
    { desc: 'Bonded Assets (Principal)',   val: totalBondPrin,   indent: true  },
    { desc: 'Bonded Assets (Interest)',    val: totalBondInt,    indent: true  },
    { desc: 'Fixed Assets',               val: fixedAssets,     indent: true  },
    { desc: 'Other Assets',               val: otherAssets,     indent: true  }
  ];
  $('bs-assets-tbody').innerHTML = assetRows.map(r => `
    <tr><td class="${r.indent ? 'indent' : ''}">${r.desc}</td><td class="amt-pos">${fmtCurrency(r.val)}</td></tr>`).join('');
  $('bs-assets-tfoot').innerHTML = `<tr>
    <td class="total-label">Total Assets</td>
    <td class="total-value success">${fmtCurrency(totalAssets)}</td></tr>`;

  /* Liabilities & Equity table */
  const liabRows = [
    { desc: 'Borrowings & Loans Payable', val: borrowings,       indent: true  },
    { desc: 'Depositor Funds',            val: depositorFunds,   indent: true  },
    { desc: 'Accrued Interest Payable',   val: accruedInterest,  indent: true  },
    { desc: 'Other Liabilities',          val: otherLiabilities, indent: true  },
    { desc: 'Retained Earnings',          val: retainedEarnings, indent: false },
    { desc: 'Share Capital',              val: shareCapital,     indent: false }
  ];
  $('bs-liab-tbody').innerHTML = liabRows.map(r => `
    <tr><td class="${r.indent ? 'indent' : ''}">${r.desc}</td><td class="${r.indent ? 'amt-neg' : 'amt-pos'}">${fmtCurrency(r.val)}</td></tr>`).join('');
  $('bs-liab-tfoot').innerHTML = `<tr>
    <td class="total-label">Total Liabilities + Equity</td>
    <td class="total-value success">${fmtCurrency(totalAssets)}</td></tr>`;

  /* Chart */
  buildBsChart(cashOnHand, loanReceivables, bondedAssets, fixedAssets, otherAssets, totalLiabilities, equity);
}

function buildBsChart(cash, receivables, bonded, fixed, other, liab, equity) {
  const canvas = document.getElementById('bs-chart');
  if (!canvas) return;
  if (bsChart) { bsChart.destroy(); bsChart = null; }
  bsChart = new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: ['Cash & Equivalents', 'Loan Receivables', 'Bonded Assets', 'Fixed Assets', 'Other Assets', 'Liabilities'],
      datasets: [{
        data: [cash, receivables, bonded, fixed, other, liab],
        backgroundColor: ['#10b981','#4f46e5','#3b82f6','#f59e0b','#8b5cf6','#ef4444'],
        borderWidth: 2, borderColor: '#fff', hoverBorderWidth: 3
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { usePointStyle: true, pointStyle: 'circle', padding: 12, font: { size: 11 } } },
        tooltip: { callbacks: { label: ctx => ' ' + ctx.label + ': ' + fmtCurrency(ctx.raw) } }
      }
    }
  });
}

/* ═══════════════════════════════════════════════════════════════
   CASH FLOW
   ═══════════════════════════════════════════════════════════════ */
function loadCashFlow() {
  const totalLoan     = allClients.reduce((s, c) => s + (c.loan_amount      || 0), 0);
  const totalPaid     = allClients.reduce((s, c) => s + (c.amount_paid      || 0), 0);
  const totalInterest = allClients.reduce((s, c) => s + (c.interest_amount  || 0), 0);

  /* Operating */
  const interestReceived  = totalInterest * 0.72;
  const feesReceived      = totalLoan * 0.012;
  const salariesPaid      = -(totalInterest * 0.28);
  const adminPaid         = -(totalInterest * 0.09);
  const taxesPaid         = -(totalInterest * 0.08);
  const netOperating      = interestReceived + feesReceived + salariesPaid + adminPaid + taxesPaid;

  /* Investing */
  const loansDisburse     = -(totalLoan * 0.45);
  const loanRepayReceived = totalPaid * 0.5;
  const assetPurchase     = -(totalLoan * 0.015);
  const netInvesting      = loansDisburse + loanRepayReceived + assetPurchase;

  /* Financing */
  const capitalRaised     = totalLoan * 0.3;
  const borrowingProceeds = totalLoan * 0.25;
  const dividendsPaid     = -(totalInterest * 0.05);
  const debtRepaid        = -(totalLoan * 0.12);
  const netFinancing      = capitalRaised + borrowingProceeds + dividendsPaid + debtRepaid;

  const netCashChange     = netOperating + netInvesting + netFinancing;
  const openingBalance    = totalPaid * 0.2;
  const closingBalance    = openingBalance + netCashChange;

  /* KPIs */
  $('cf-kpis').innerHTML = buildKpiCards([
    { label: 'Operating CF',  icon: 'fa-cogs',       value: fmtCurrency(netOperating),  sub: 'Core operations',       color: '#10b981', trend: '+6.8%',  up: true  },
    { label: 'Investing CF',  icon: 'fa-building',   value: fmtCurrency(netInvesting),  sub: 'Investment activities', color: '#3b82f6', trend: '-12.4%', up: false },
    { label: 'Financing CF',  icon: 'fa-university', value: fmtCurrency(netFinancing),  sub: 'Capital & debt',        color: '#f59e0b', trend: '+3.2%',  up: true  },
    { label: 'Closing Balance', icon: 'fa-piggy-bank', value: fmtCurrency(closingBalance), sub: 'End of period cash',  color: '#4f46e5', trend: '',       up: true  }
  ]);

  /* Operating table */
  const opRows = [
    { desc: 'Interest Received from Clients', val: interestReceived  },
    { desc: 'Fees & Charges Received',        val: feesReceived      },
    { desc: 'Salaries & Benefits Paid',       val: salariesPaid      },
    { desc: 'Administrative Expenses Paid',   val: adminPaid         },
    { desc: 'Taxes Paid',                     val: taxesPaid         }
  ];
  $('cf-operating-tbody').innerHTML = opRows.map(r => `
    <tr><td class="indent">${r.desc}</td>
    <td class="${r.val >= 0 ? 'amt-pos' : 'amt-neg'}">${r.val >= 0 ? fmtCurrency(r.val) : '(' + fmtCurrency(Math.abs(r.val)) + ')'}</td></tr>`).join('');
  $('cf-operating-tfoot').innerHTML = `<tr>
    <td class="total-label">Net Cash from Operating</td>
    <td class="total-value ${netOperating >= 0 ? 'success' : 'danger'}">${fmtCurrency(netOperating)}</td></tr>`;

  /* Investing table */
  const invRows = [
    { desc: 'Loans Disbursed to Clients',  val: loansDisburse     },
    { desc: 'Loan Repayments Received',    val: loanRepayReceived  },
    { desc: 'Asset Purchases',             val: assetPurchase      }
  ];
  $('cf-investing-tbody').innerHTML = invRows.map(r => `
    <tr><td class="indent">${r.desc}</td>
    <td class="${r.val >= 0 ? 'amt-pos' : 'amt-neg'}">${r.val >= 0 ? fmtCurrency(r.val) : '(' + fmtCurrency(Math.abs(r.val)) + ')'}</td></tr>`).join('');
  $('cf-investing-tfoot').innerHTML = `<tr>
    <td class="total-label">Net Cash from Investing</td>
    <td class="total-value ${netInvesting >= 0 ? 'success' : 'danger'}">${fmtCurrency(netInvesting)}</td></tr>`;

  /* Financing table */
  const finRows = [
    { desc: 'Capital Raised',             val: capitalRaised     },
    { desc: 'Borrowing Proceeds',         val: borrowingProceeds  },
    { desc: 'Dividends Paid',             val: dividendsPaid      },
    { desc: 'Debt Repaid',                val: debtRepaid         }
  ];
  $('cf-financing-tbody').innerHTML = finRows.map(r => `
    <tr><td class="indent">${r.desc}</td>
    <td class="${r.val >= 0 ? 'amt-pos' : 'amt-neg'}">${r.val >= 0 ? fmtCurrency(r.val) : '(' + fmtCurrency(Math.abs(r.val)) + ')'}</td></tr>`).join('');
  $('cf-financing-tfoot').innerHTML = `<tr>
    <td class="total-label">Net Cash from Financing</td>
    <td class="total-value ${netFinancing >= 0 ? 'success' : 'danger'}">${fmtCurrency(netFinancing)}</td></tr>`;

  /* Chart */
  buildCfChart(netOperating, netInvesting, netFinancing, openingBalance);
}

function buildCfChart(op, inv, fin, opening) {
  const canvas = document.getElementById('cf-chart');
  if (!canvas) return;
  if (cfChart) { cfChart.destroy(); cfChart = null; }

  /* Monthly simulated running balance */
  const monthlyOp  = MONTHS.map(() => op  / 12 * (0.8 + Math.random() * 0.4));
  const monthlyInv = MONTHS.map(() => inv / 12 * (0.7 + Math.random() * 0.6));
  const monthlyFin = MONTHS.map(() => fin / 12 * (0.8 + Math.random() * 0.4));
  const cumulBal   = MONTHS.map((_, i) => {
    const monthly = monthlyOp[i] + monthlyInv[i] + monthlyFin[i];
    return opening + (monthly * (i + 1));
  });

  cfChart = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: MONTHS,
      datasets: [
        { label: 'Operating',  data: monthlyOp,  backgroundColor: 'rgba(16,185,129,.75)', borderRadius: 5 },
        { label: 'Investing',  data: monthlyInv, backgroundColor: 'rgba(59,130,246,.7)',  borderRadius: 5 },
        { label: 'Financing',  data: monthlyFin, backgroundColor: 'rgba(245,158,11,.7)',  borderRadius: 5 },
        { label: 'Cumulative Balance', data: cumulBal, type: 'line', borderColor: '#4f46e5', backgroundColor: 'rgba(79,70,229,.06)', borderWidth: 2, fill: true, tension: .4, pointRadius: 3, pointBackgroundColor: '#4f46e5' }
      ]
    },
    options: chartBaseOptions('$')
  });
}

/* ═══════════════════════════════════════════════════════════════
   PROFIT & LOSS
   ═══════════════════════════════════════════════════════════════ */
function loadProfitLoss() {
  const totalLoan     = allClients.reduce((s, c) => s + (c.loan_amount      || 0), 0);
  const totalInterest = allClients.reduce((s, c) => s + (c.interest_amount  || 0), 0);
  const totalPaid     = allClients.reduce((s, c) => s + (c.amount_paid      || 0), 0);

  /* Income */
  const interestIncome   = totalInterest;
  const originationFees  = totalLoan * 0.012;
  const penaltyIncome    = allClients.filter(c => c.status === 'Overdue').reduce((s, c) => s + c.loan_amount * 0.02, 0);
  const serviceIncome    = totalPaid * 0.008;
  const grossIncome      = interestIncome + originationFees + penaltyIncome + serviceIncome;

  /* Costs */
  const costOfFunds      = totalLoan * 0.065;       // funding cost
  const provisionLoss    = totalLoan * 0.025;       // provision for credit losses
  const grossProfit      = grossIncome - costOfFunds - provisionLoss;

  /* Operating expenses */
  const staffCost        = grossIncome * 0.28;
  const overheads        = grossIncome * 0.10;
  const depreciation     = grossIncome * 0.03;
  const totalOpex        = staffCost + overheads + depreciation;

  /* EBIT */
  const ebit             = grossProfit - totalOpex;
  const interestExpense  = totalLoan * 0.015;
  const ebt              = ebit - interestExpense;
  const taxProvision     = Math.max(0, ebt * 0.25);
  const netProfit        = ebt - taxProvision;

  const grossMargin      = grossIncome > 0 ? (grossProfit / grossIncome * 100) : 0;
  const netMargin        = grossIncome > 0 ? (netProfit   / grossIncome * 100) : 0;
  const ebitMargin       = grossIncome > 0 ? (ebit        / grossIncome * 100) : 0;

  /* KPIs */
  $('pl-kpis').innerHTML = buildKpiCards([
    { label: 'Gross Income',   icon: 'fa-money-bill-wave', value: fmtCurrency(grossIncome),  sub: 'All revenue sources',     color: '#10b981', trend: '+11.2%', up: true  },
    { label: 'Gross Profit',   icon: 'fa-arrow-up',        value: fmtCurrency(grossProfit),  sub: 'After cost of funds',     color: '#3b82f6', trend: '+8.7%',  up: true  },
    { label: 'EBIT',           icon: 'fa-chart-bar',       value: fmtCurrency(ebit),         sub: `Margin ${ebitMargin.toFixed(1)}%`, color: '#8b5cf6', trend: '+6.3%', up: true },
    { label: 'Net Profit',     icon: 'fa-check-double',    value: fmtCurrency(netProfit),    sub: `Net margin ${netMargin.toFixed(1)}%`, color: '#f59e0b', trend: '+13.1%', up: true }
  ]);

  /* Income table */
  const incRows = [
    { desc: 'Interest Income',          val: interestIncome,  margin: (interestIncome  / grossIncome * 100).toFixed(1) },
    { desc: 'Loan Origination Fees',    val: originationFees, margin: (originationFees / grossIncome * 100).toFixed(1) },
    { desc: 'Penalty & Late Charges',   val: penaltyIncome,   margin: (penaltyIncome   / grossIncome * 100).toFixed(1) },
    { desc: 'Service & Processing Fees',val: serviceIncome,   margin: (serviceIncome   / grossIncome * 100).toFixed(1) }
  ];
  $('pl-income-tbody').innerHTML = incRows.map(r => `
    <tr>
      <td class="indent">${r.desc}</td>
      <td class="amt-pos">${fmtCurrency(r.val)}</td>
      <td>${r.margin}%</td>
    </tr>`).join('');
  $('pl-income-tfoot').innerHTML = `<tr>
    <td class="total-label">Total Gross Income</td>
    <td class="total-value success">${fmtCurrency(grossIncome)}</td>
    <td class="total-value success">100%</td></tr>`;

  /* Costs table */
  const costRows = [
    { desc: 'Cost of Funds',             val: costOfFunds,     margin: (costOfFunds     / grossIncome * 100).toFixed(1) },
    { desc: 'Provision for Credit Loss', val: provisionLoss,   margin: (provisionLoss   / grossIncome * 100).toFixed(1) },
    { desc: 'Staff Costs',               val: staffCost,       margin: (staffCost       / grossIncome * 100).toFixed(1) },
    { desc: 'Overheads & Admin',         val: overheads,       margin: (overheads       / grossIncome * 100).toFixed(1) },
    { desc: 'Depreciation',              val: depreciation,    margin: (depreciation    / grossIncome * 100).toFixed(1) },
    { desc: 'Interest Expense',          val: interestExpense, margin: (interestExpense / grossIncome * 100).toFixed(1) },
    { desc: 'Tax Provision (25%)',        val: taxProvision,    margin: (taxProvision    / grossIncome * 100).toFixed(1) }
  ];
  $('pl-costs-tbody').innerHTML = costRows.map(r => `
    <tr>
      <td class="indent">${r.desc}</td>
      <td class="amt-neg">${fmtCurrency(r.val)}</td>
      <td>${r.margin}%</td>
    </tr>`).join('');
  $('pl-costs-tfoot').innerHTML = `<tr>
    <td class="total-label">Total Costs</td>
    <td class="total-value danger">${fmtCurrency(grossIncome - netProfit)}</td>
    <td class="total-value danger">${(100 - netMargin).toFixed(1)}%</td></tr>`;

  /* Net summary */
  $('pl-net-summary').innerHTML = `
    <div class="fin-net-item positive">
      <div class="fin-net-label">Gross Profit</div>
      <div class="fin-net-value">${fmtCurrency(grossProfit)}</div>
      <div class="fin-net-sub">${grossMargin.toFixed(1)}% gross margin</div>
    </div>
    <div class="fin-net-item neutral">
      <div class="fin-net-label">EBIT</div>
      <div class="fin-net-value">${fmtCurrency(ebit)}</div>
      <div class="fin-net-sub">${ebitMargin.toFixed(1)}% EBIT margin</div>
    </div>
    <div class="fin-net-item ${netProfit >= 0 ? 'positive' : 'negative'}">
      <div class="fin-net-label">Net Profit</div>
      <div class="fin-net-value">${fmtCurrency(netProfit)}</div>
      <div class="fin-net-sub">${netMargin.toFixed(1)}% net margin</div>
    </div>
    <div class="fin-net-item info-bg">
      <div class="fin-net-label">Tax Provision</div>
      <div class="fin-net-value">${fmtCurrency(taxProvision)}</div>
      <div class="fin-net-sub">25% effective rate</div>
    </div>`;

  /* Chart */
  buildPlChart(grossIncome, costOfFunds + provisionLoss, totalOpex, ebit, netProfit);
}

function buildPlChart(income, cog, opex, ebit, net) {
  const canvas = document.getElementById('pl-chart');
  if (!canvas) return;
  if (plChart) { plChart.destroy(); plChart = null; }

  const monthlyInc  = MONTHS.map(() => income / 12 * (0.8 + Math.random() * 0.4));
  const monthlyCog  = monthlyInc.map(r => r * (cog / income)  * (0.9 + Math.random() * 0.2));
  const monthlyOpex = monthlyInc.map(r => r * (opex / income) * (0.9 + Math.random() * 0.2));
  const monthlyNet  = monthlyInc.map((r, i) => r - monthlyCog[i] - monthlyOpex[i]);

  plChart = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: MONTHS,
      datasets: [
        { label: 'Gross Income',    data: monthlyInc,  backgroundColor: 'rgba(16,185,129,.75)', borderRadius: 5 },
        { label: 'Cost of Funds',   data: monthlyCog,  backgroundColor: 'rgba(239,68,68,.7)',   borderRadius: 5 },
        { label: 'Operating Costs', data: monthlyOpex, backgroundColor: 'rgba(245,158,11,.7)',  borderRadius: 5 },
        { label: 'Net Profit',      data: monthlyNet,  type: 'line', borderColor: '#4f46e5', backgroundColor: 'rgba(79,70,229,.07)', borderWidth: 2, fill: true, tension: .4, pointRadius: 3, pointBackgroundColor: '#4f46e5' }
      ]
    },
    options: chartBaseOptions('$')
  });
}

/* ═══════════════════════════════════════════════════════════════
   SHARED HELPERS
   ═══════════════════════════════════════════════════════════════ */

function buildKpiCards(items) {
  return items.map(k => `
    <div class="fin-kpi-card" style="--kpi-color:${k.color}">
      <div class="fin-kpi-label"><i class="fas ${k.icon}"></i>${k.label}</div>
      <div class="fin-kpi-value">${k.value}</div>
      <div class="fin-kpi-sub">${k.sub}</div>
      ${k.trend ? `<div class="fin-kpi-trend ${k.up ? 'up' : 'down'}"><i class="fas fa-arrow-${k.up ? 'up' : 'down'}"></i>${k.trend} vs last period</div>` : ''}
    </div>`).join('');
}

function chartBaseOptions(prefix) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'top', labels: { usePointStyle: true, pointStyle: 'circle', padding: 14, font: { size: 11 } } },
      tooltip: { callbacks: { label: ctx => ' ' + ctx.dataset.label + ': ' + (prefix || '') + ctx.raw.toLocaleString(undefined, { maximumFractionDigits: 0 }) } }
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 11 } } },
      y: { grid: { color: 'rgba(0,0,0,.05)' }, ticks: { font: { size: 11 }, callback: v => '$' + (Math.abs(v) >= 1000 ? (v/1000).toFixed(0) + 'k' : v) } }
    }
  };
}

/* CSV export for any fin report page */
function exportFinReport(reportKey) {
  const labels = {
    'income-statement': 'Income_Statement',
    'balance-sheet':    'Balance_Sheet',
    'cash-flow':        'Cash_Flow',
    'profit-loss':      'Profit_and_Loss'
  };
  const tbodies = {
    'income-statement': ['is-revenue-tbody', 'is-expense-tbody'],
    'balance-sheet':    ['bs-assets-tbody',  'bs-liab-tbody'],
    'cash-flow':        ['cf-operating-tbody','cf-investing-tbody','cf-financing-tbody'],
    'profit-loss':      ['pl-income-tbody',   'pl-costs-tbody']
  };
  let csv = 'Description,Amount (USD)\n';
  (tbodies[reportKey] || []).forEach(id => {
    const tbody = document.getElementById(id);
    if (!tbody) return;
    tbody.querySelectorAll('tr').forEach(tr => {
      const cells = tr.querySelectorAll('td');
      if (cells.length >= 2) csv += '"' + cells[0].textContent.trim() + '","' + cells[1].textContent.trim() + '"\n';
    });
  });
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = labels[reportKey] + '_TDJ.csv'; a.click();
  URL.revokeObjectURL(url);
  showToast('Report exported!', 'success');
}
