/* ═══════════════════════════════════════════════════
   charts.js — Chart.js visualizations
   ═══════════════════════════════════════════════════ */

"use strict";

const CHART_COLORS = {
  primary: "#4f46e5",
  accent: "#10b981",
  warning: "#f59e0b",
  danger: "#ef4444",
  info: "#3b82f6",
  purple: "#8b5cf6",
  pink: "#ec4899",
  teal: "#14b8a6",
};

const CHART_PALETTE = [
  "#4f46e5",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
];

/* Shared motion makes every Chart.js graph enter smoothly and respond visibly. */
if (typeof Chart !== "undefined") {
  Chart.defaults.animation = {
    duration: 900,
    easing: "easeOutQuart",
  };
  Chart.defaults.transitions.active.animation.duration = 450;
}

let liveChartTimer = null;

function startLiveChartUpdates() {
  if (liveChartTimer) return;
  liveChartTimer = setInterval(async () => {
    const visiblePage = document.querySelector(".page:not(.hidden)");
    if (!visiblePage || !currentUser) return;
    await fetchClients();
    if (visiblePage.id === "page-dashboard") {
      renderSummaryCards();
      renderPortfolioTable(allClients);
      updatePortfolioChartInPlace();
      updateStatusChartInPlace();
    }
  }, 10000);
}

function updatePortfolioChartInPlace() {
  if (!portfolioChart) {
    buildPortfolioChart(currentChartType);
    return;
  }
  const labels = allClients.map(
    (c) =>
      c.client_name.split(" ")[0] +
      (c.client_type === "Corporation" ? " Corp" : ""),
  );
  const loanData = allClients.map((c) => c.loan_amount);
  const paidData = allClients.map((c) => c.amount_paid);
  const balData = allClients.map((c) => c.remaining_balance);
  portfolioChart.data.labels =
    currentChartType === "doughnut"
      ? allClients.map((c) => c.client_name)
      : labels;
  if (currentChartType === "doughnut") {
    portfolioChart.data.datasets[0].data = loanData;
  } else {
    portfolioChart.data.datasets[0].data = loanData;
    portfolioChart.data.datasets[1].data = paidData;
    portfolioChart.data.datasets[2].data = balData;
  }
  portfolioChart.update("active");
}

function updateStatusChartInPlace() {
  if (!statusChart) {
    buildStatusChart();
    return;
  }
  const statusCounts = {};
  allClients.forEach((client) => {
    statusCounts[client.status] = (statusCounts[client.status] || 0) + 1;
  });
  const labels = Object.keys(statusCounts);
  const colors = labels.map(
    (label) =>
      ({
        Active: "#10b981",
        Completed: "#3b82f6",
        Overdue: "#ef4444",
        Pending: "#f59e0b",
      })[label] || "#94a3b8",
  );
  statusChart.data.labels = labels;
  statusChart.data.datasets[0].data = Object.values(statusCounts);
  statusChart.data.datasets[0].backgroundColor = colors;
  statusChart.update("active");
  const legend = document.getElementById("status-legend");
  if (legend)
    legend.innerHTML = labels
      .map(
        (label, index) =>
          `<div class="legend-item"><div class="legend-left"><span class="legend-dot" style="background:${colors[index]}"></span><span>${label}</span></div><span class="legend-count">${statusCounts[label]}</span></div>`,
      )
      .join("");
}

/* ─── PORTFOLIO CHART (Bar / Line / Doughnut) ─── */
let currentChartType = "bar";

function buildPortfolioChart(type) {
  currentChartType = type;
  const canvas = document.getElementById("portfolio-chart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  if (portfolioChart) {
    portfolioChart.destroy();
    portfolioChart = null;
  }

  const labels = allClients.map(
    (c) =>
      c.client_name.split(" ")[0] +
      (c.client_type === "Corporation" ? " Corp" : ""),
  );
  const loanData = allClients.map((c) => c.loan_amount);
  const paidData = allClients.map((c) => c.amount_paid);
  const balData = allClients.map((c) => c.remaining_balance);

  if (type === "doughnut") {
    portfolioChart = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: allClients.map((c) => c.client_name),
        datasets: [
          {
            data: loanData,
            backgroundColor: CHART_PALETTE,
            borderWidth: 2,
            borderColor: "#ffffff",
            hoverBorderWidth: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "right",
            labels: {
              usePointStyle: true,
              pointStyle: "circle",
              padding: 12,
              font: { size: 11 },
            },
          },
          tooltip: {
            callbacks: {
              label: (ctx) =>
                " " + ctx.label + ": $" + ctx.raw.toLocaleString(),
            },
          },
        },
      },
    });
    return;
  }

  portfolioChart = new Chart(ctx, {
    type: type === "line" ? "line" : "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Loan Amount",
          data: loanData,
          backgroundColor:
            type === "line" ? "rgba(79,70,229,.1)" : "rgba(79,70,229,.8)",
          borderColor: CHART_COLORS.primary,
          borderWidth: type === "line" ? 2 : 0,
          borderRadius: type === "bar" ? 6 : 0,
          fill: type === "line",
          tension: 0.4,
          pointBackgroundColor: CHART_COLORS.primary,
          pointRadius: type === "line" ? 4 : 0,
        },
        {
          label: "Amount Paid",
          data: paidData,
          backgroundColor:
            type === "line" ? "rgba(16,185,129,.1)" : "rgba(16,185,129,.8)",
          borderColor: CHART_COLORS.accent,
          borderWidth: type === "line" ? 2 : 0,
          borderRadius: type === "bar" ? 6 : 0,
          fill: type === "line",
          tension: 0.4,
          pointBackgroundColor: CHART_COLORS.accent,
          pointRadius: type === "line" ? 4 : 0,
        },
        {
          label: "Remaining Balance",
          data: balData,
          backgroundColor:
            type === "line" ? "rgba(239,68,68,.08)" : "rgba(239,68,68,.75)",
          borderColor: CHART_COLORS.danger,
          borderWidth: type === "line" ? 2 : 0,
          borderRadius: type === "bar" ? 6 : 0,
          fill: type === "line",
          tension: 0.4,
          pointBackgroundColor: CHART_COLORS.danger,
          pointRadius: type === "line" ? 4 : 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          position: "top",
          labels: {
            usePointStyle: true,
            pointStyle: "circle",
            padding: 16,
            font: { size: 11.5 },
          },
        },
        tooltip: {
          callbacks: {
            label: (ctx) =>
              " " + ctx.dataset.label + ": $" + ctx.raw.toLocaleString(),
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 11 } } },
        y: {
          grid: { color: "rgba(0,0,0,.05)" },
          ticks: {
            font: { size: 11 },
            callback: (val) =>
              "$" + (val >= 1000 ? (val / 1000).toFixed(0) + "k" : val),
          },
        },
      },
    },
  });
}

function switchChart(type) {
  document
    .querySelectorAll(".chart-btn")
    .forEach((b) =>
      b.classList.toggle(
        "active",
        b.textContent.toLowerCase() === type ||
          (type === "doughnut" && b.textContent.trim() === "Donut"),
      ),
    );
  buildPortfolioChart(type);
}

/* ─── STATUS PIE CHART ─── */
function buildStatusChart() {
  const canvas = document.getElementById("status-chart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  if (statusChart) {
    statusChart.destroy();
    statusChart = null;
  }

  const statusCounts = {};
  allClients.forEach((c) => {
    statusCounts[c.status] = (statusCounts[c.status] || 0) + 1;
  });

  const statusColors = {
    Active: "#10b981",
    Completed: "#3b82f6",
    Overdue: "#ef4444",
    Pending: "#f59e0b",
  };
  const labels = Object.keys(statusCounts);
  const data = Object.values(statusCounts);
  const colors = labels.map((l) => statusColors[l] || "#94a3b8");

  statusChart = new Chart(ctx, {
    type: "pie",
    data: {
      labels,
      datasets: [
        {
          data,
          backgroundColor: colors,
          borderWidth: 2,
          borderColor: "#ffffff",
          hoverBorderWidth: 3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: (ctx) => " " + ctx.label + ": " + ctx.raw },
        },
      },
    },
  });

  // Render legend
  const legend = document.getElementById("status-legend");
  if (legend) {
    legend.innerHTML = labels
      .map(
        (l, i) => `
      <div class="legend-item">
        <div class="legend-left">
          <span class="legend-dot" style="background:${colors[i]}"></span>
          <span>${l}</span>
        </div>
        <span class="legend-count">${data[i]}</span>
      </div>
    `,
      )
      .join("");
  }
}

/* ─── MONTHLY COLLECTIONS CHART ─── */
function buildMonthlyChart() {
  const canvas = document.getElementById("monthly-chart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  if (monthlyChart) {
    monthlyChart.destroy();
    monthlyChart = null;
  }

  // Build simulated monthly data from clients
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const totalLoan = allClients.reduce((s, c) => s + c.loan_amount, 0);
  const totalPaid = allClients.reduce((s, c) => s + c.amount_paid, 0);
  const avgMonthly = totalPaid / 12;

  // Simulate cumulative monthly collections with some variance
  const collected = months.map((_, i) => {
    const variance = 0.8 + Math.random() * 0.4;
    return Math.round(avgMonthly * (i <= 8 ? 1 : 0.5) * variance);
  });

  const disbursed = months.map((_, i) => {
    if (i < 9) return 0;
    const c = allClients[i % allClients.length];
    return c ? c.loan_amount / 12 : 0;
  });

  monthlyChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: months,
      datasets: [
        {
          label: "Collections",
          data: collected,
          backgroundColor: "rgba(16,185,129,.8)",
          borderColor: CHART_COLORS.accent,
          borderWidth: 0,
          borderRadius: 6,
          yAxisID: "y",
        },
        {
          label: "Disbursements",
          data: allClients.map((c) => Math.round(c.loan_amount / 12)),
          type: "line",
          borderColor: CHART_COLORS.primary,
          backgroundColor: "rgba(79,70,229,.08)",
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointRadius: 4,
          pointBackgroundColor: CHART_COLORS.primary,
          yAxisID: "y",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          position: "top",
          labels: {
            usePointStyle: true,
            pointStyle: "circle",
            padding: 16,
            font: { size: 11.5 },
          },
        },
        tooltip: {
          callbacks: {
            label: (ctx) =>
              " " + ctx.dataset.label + ": $" + ctx.raw.toLocaleString(),
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 11 } } },
        y: {
          grid: { color: "rgba(0,0,0,.05)" },
          ticks: {
            font: { size: 11 },
            callback: (val) =>
              "$" + (val >= 1000 ? (val / 1000).toFixed(0) + "k" : val),
          },
        },
      },
    },
  });
}
