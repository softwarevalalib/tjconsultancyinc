/* ============================================================
   js/data.js  —  Empty production defaults for TJ Consultancy FMS
   Live records come from FMSDB / Neon. This file only supplies
   fallback shapes so the dashboard never reads demo numbers.
   ============================================================ */

const FMS = window.FMS || {};

FMS.data = {
  kpi: {
    revenue: 0,
    profit: 0,
    expenses: 0,
    clients: 0,
  },

  transactions: [],

  revenueMonthly: {
    labels: [],
    income: [],
    expenses: [],
  },

  expenseBreakdown: {
    labels: [],
    values: [],
    colors: [],
  },

  inventory: [],

  staff: [],

  reportBarData: {
    labels: [],
    income: [],
    expenses: [],
  },

  invoices: [],
};
