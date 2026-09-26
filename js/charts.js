/* ============================================================
   js/charts.js  —  Chart.js initialisation for TJ FMS
   ============================================================ */

(function () {
  'use strict';

  /* The dashboard remains fully usable when the CDN is unavailable (for
     example offline or during a first local load). The live figures and
     records must never fail merely because Chart.js could not be loaded. */
  if (typeof window.Chart === 'undefined') {
    console.warn('[FMS] Chart.js is unavailable; live charts will load when the library is available.');
    FMS.charts = {
      initDashboard: function () {},
      initReports: function () {},
      updateRevenue: function () {},
      refresh: function () {}
    };
    window.FMS = FMS;
    return;
  }

  /* ---------- shared chart defaults ---------- */
  Chart.defaults.font.family = "'Inter', sans-serif";
  Chart.defaults.font.size   = 12;
  Chart.defaults.color       = '#8a94a6';

  const GRID_COLOR   = 'rgba(0,0,0,0.05)';
  const TOOLTIP_OPTS = {
    backgroundColor : '#1e2a3a',
    titleColor      : '#fff',
    bodyColor       : '#cbd5e1',
    padding         : 10,
    cornerRadius    : 8,
    displayColors   : true,
    boxPadding      : 4
  };

  /* ---- Utility ---- */
  function fmt (n) {
    return '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 0 });
  }

  function liveFinancials () {
    return (window.FMS && FMS.liveFinancials) || null;
  }

  /* ==========================================================
     1.  REVENUE LINE CHART  (Dashboard)
     ========================================================== */
  function buildRevenueChart (nMonths) {
    const ctx = document.getElementById('revenueChart');
    if (!ctx) return;

    const count   = parseInt(nMonths, 10) || 6;
    const d       = liveFinancials();
    const series  = d ? d.monthlySeries(count) : { labels: [], income: [], expenses: [] };
    const labels  = series.labels;
    const income  = series.income;
    const expenses= series.expenses;

    if (FMS.revenueChart) {
      FMS.revenueChart.data.labels          = labels;
      FMS.revenueChart.data.datasets[0].data= income;
      FMS.revenueChart.data.datasets[1].data= expenses;
      FMS.revenueChart.update('active');
      return;
    }

    FMS.revenueChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label        : 'Income',
            data         : income,
            borderColor  : '#3b82f6',
            backgroundColor: 'rgba(59,130,246,0.08)',
            borderWidth  : 2.5,
            pointBackgroundColor: '#3b82f6',
            pointRadius  : 4,
            pointHoverRadius: 6,
            tension      : 0.4,
            fill         : true
          },
          {
            label        : 'Expenses',
            data         : expenses,
            borderColor  : '#f59e0b',
            backgroundColor: 'rgba(245,158,11,0.08)',
            borderWidth  : 2.5,
            pointBackgroundColor: '#f59e0b',
            pointRadius  : 4,
            pointHoverRadius: 6,
            tension      : 0.4,
            fill         : true
          }
        ]
      },
      options: {
        responsive       : true,
        maintainAspectRatio: false,
        interaction      : { mode: 'index', intersect: false },
        plugins          : {
          legend: { position: 'top', align: 'end', labels: { boxWidth: 12, padding: 16 } },
          tooltip: { ...TOOLTIP_OPTS, callbacks: { label: ctx => ' ' + fmt(ctx.raw) } }
        },
        scales: {
          x: { grid: { color: GRID_COLOR }, border: { dash: [3,3] } },
          y: {
            grid : { color: GRID_COLOR },
            border: { dash: [3,3] },
            ticks: { callback: v => '$' + (v/1000) + 'k' }
          }
        }
      }
    });
  }

  /* ==========================================================
     2.  VALUE BY SERVICE DOUGHNUT  (Dashboard)
     ========================================================== */
  function buildExpenseChart () {
    const ctx = document.getElementById('expenseChart');
    if (!ctx) return;

    const live = liveFinancials();
    const d = live ? live.valueByService() : { labels: [], values: [], colors: [] };
    const labels = d.labels.length ? d.labels : ['No valued records'];
    const values = d.values.length ? d.values : [0];
    const colors = d.colors.length ? d.colors : ['#cbd5e1'];

    if (FMS.expenseChart) {
      FMS.expenseChart.data.labels = labels;
      FMS.expenseChart.data.datasets[0].data = values;
      FMS.expenseChart.data.datasets[0].backgroundColor = colors;
      FMS.expenseChart.update('active');
      return;
    }

    FMS.expenseChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data            : values,
          backgroundColor : colors,
          borderColor     : '#fff',
          borderWidth     : 3,
          hoverOffset     : 6
        }]
      },
      options: {
        responsive        : true,
        maintainAspectRatio: false,
        cutout            : '65%',
        plugins           : {
          legend: {
            position: 'bottom',
            labels  : { boxWidth: 12, padding: 14, font: { size: 12 } }
          },
          tooltip: {
            ...TOOLTIP_OPTS,
            callbacks: { label: ctx => ' ' + ctx.label + ': ' + fmt(ctx.raw) }
          }
        }
      }
    });
  }

  /* ==========================================================
     3.  REPORT BAR CHART  (Reports view)
     ========================================================== */
  function buildReportBarChart () {
    const ctx = document.getElementById('reportBarChart');
    if (!ctx) return;
    const live = liveFinancials();
    const d = live ? live.monthlySeries(12) : { labels: [], income: [], expenses: [] };

    if (FMS.reportBarChart) {
      FMS.reportBarChart.data.labels = d.labels;
      FMS.reportBarChart.data.datasets[0].data = d.income;
      FMS.reportBarChart.data.datasets[1].data = d.expenses;
      FMS.reportBarChart.update('active');
      return;
    }

    FMS.reportBarChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels  : d.labels,
        datasets: [
          {
            label          : 'Income',
            data           : d.income,
            backgroundColor: 'rgba(59,130,246,0.75)',
            borderRadius   : 5,
            borderSkipped  : false
          },
          {
            label          : 'Expenses',
            data           : d.expenses,
            backgroundColor: 'rgba(245,158,11,0.75)',
            borderRadius   : 5,
            borderSkipped  : false
          }
        ]
      },
      options: {
        responsive        : true,
        maintainAspectRatio: false,
        interaction       : { mode: 'index', intersect: false },
        plugins: {
          legend : { position: 'top', align: 'end', labels: { boxWidth: 12, padding: 16 } },
          tooltip: { ...TOOLTIP_OPTS, callbacks: { label: ctx => ' ' + fmt(ctx.raw) } }
        },
        scales: {
          x: { grid: { display: false } },
          y: {
            grid : { color: GRID_COLOR },
            border: { dash: [3,3] },
            ticks: { callback: v => '$' + (v/1000) + 'k' }
          }
        }
      }
    });
  }

  /* ---- Public API ---- */
  FMS.charts = {
    initDashboard : function (months) {
      buildRevenueChart(months);
      buildExpenseChart();
    },
    initReports: buildReportBarChart,
    updateRevenue: buildRevenueChart,
    refresh: function (months) {
      buildRevenueChart(months);
      buildExpenseChart();
      buildReportBarChart();
    }
  };

  window.FMS = FMS;
})();
