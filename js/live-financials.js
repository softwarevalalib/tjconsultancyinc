/* ============================================================
   js/live-financials.js — canonical live financial record view

   Dashboard metrics, charts, recent transactions, and reports all use
   this one projection of the FMS database.  It never saves a second copy
   of a record, so there is no separate dashboard/report dataset to drift
   away from the service record that a user entered.
   ============================================================ */
(function () {
  'use strict';

  /* data.js declares FMS as a top-level lexical binding. Re-use that same
     object instead of declaring another global FMS constant. */
  const fms = window.FMS || (typeof FMS !== 'undefined' ? FMS : {});

  const SERVICES = [
    {
      key: 'fin', table: 'loans', code: 'LOAN',
      name: 'Financial Management', icon: 'fa-coins',
      value: row => firstNumber(row.total, row.amount, row.principal, row.loanAmount),
      date: row => row.date || row.startDate || row.createdAt,
      client: row => row.clientName || row.client || row.borrower,
      description: row => `${row.clientName || row.client || 'Financial record'}${row.number ? ' — Loan #' + row.number : ''}`,
      status: row => loanStatus(row)
    },
    {
      key: 'res', table: 'research', code: 'RESEARCH',
      name: 'Research & Consulting', icon: 'fa-flask',
      value: row => firstNumber(row.value), date: row => row.date || row.createdAt,
      client: row => row.client,
      description: row => row.project || row.client || 'Research record',
      status: row => row.status
    },
    {
      key: 'asset', table: 'assets', code: 'ASSET',
      name: 'Asset Management', icon: 'fa-boxes',
      value: row => firstNumber(row.value), date: row => row.date || row.createdAt,
      client: row => row.owner || row.client,
      description: row => row.name || row.owner || 'Asset record',
      status: row => row.status
    },
    {
      key: 'biz', table: 'bizdev', code: 'BIZDEV',
      name: 'Business Development', icon: 'fa-rocket',
      value: row => firstNumber(row.value), date: row => row.close || row.createdAt,
      client: row => row.company || row.contact,
      description: row => row.company || row.contact || 'Business development record',
      status: row => row.stage || row.status
    },
    {
      key: 'veh', table: 'vehicles', code: 'VEHICLE',
      name: 'Vehicle Hire', icon: 'fa-car',
      value: row => firstNumber(row.rate), date: row => row.pickup || row.createdAt,
      client: row => row.name || row.client,
      description: row => `${row.name || row.client || 'Vehicle booking'}${row.type ? ' — ' + row.type : ''}`,
      status: row => row.status
    },
    {
      key: 'prn', table: 'printing', code: 'PRINT',
      name: 'Printing', icon: 'fa-print',
      value: row => firstNumber(row.quote), date: row => row.deadline || row.createdAt,
      client: row => row.name || row.client,
      description: row => `${row.name || row.client || 'Print order'}${row.type ? ' — ' + row.type : ''}`,
      status: row => row.status
    }
  ];

  function number (value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const parsed = Number(String(value === undefined || value === null ? '' : value).replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function firstNumber () {
    for (let i = 0; i < arguments.length; i += 1) {
      const value = arguments[i];
      if (value !== undefined && value !== null && value !== '') return number(value);
    }
    return 0;
  }

  function readTable (name) {
    try {
      if (window.FMSDB && typeof window.FMSDB.table === 'function') return FMSDB.table(name, []);
      const stored = localStorage.getItem('fmsdb_' + name);
      const rows = stored ? JSON.parse(stored) : [];
      return Array.isArray(rows) ? rows : [];
    } catch (_) {
      return [];
    }
  }

  function recordId (row, index) {
    const id = row && (row._id ?? row.id ?? row.number);
    return id === undefined || id === null || id === '' ? 'row-' + (index + 1) : String(id);
  }

  function dateValue (value) {
    if (!value) return 0;
    const date = new Date(value);
    const timestamp = date.getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
  }

  function displayDate (value) {
    if (!value) return '';
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : '';
  }

  function loanStatus (row) {
    const totalCents = Math.round(number(row.total) * 100);
    const paidCents = (Array.isArray(row.payments) ? row.payments : []).reduce((sum, payment) => {
      const cents = payment && payment.amountCents !== undefined
        ? number(payment.amountCents)
        : Math.round(number(payment && payment.amount) * 100);
      return sum + Math.max(0, cents);
    }, 0);
    const legacyPaid = Array.isArray(row.paidPayments) ? row.paidPayments.length : 0;
    const duration = number(row.duration);
    if (totalCents > 0 && (paidCents >= totalCents || (duration > 0 && legacyPaid >= duration))) return 'completed';
    return 'active';
  }

  function normaliseStatus (status) {
    const value = String(status || 'active').trim().toLowerCase();
    if (/(paid|complete|delivered|closed won|ready)/.test(value)) return 'completed';
    if (/(overdue)/.test(value)) return 'overdue';
    if (/(pending|partial|received|under review|draft)/.test(value)) return 'pending';
    if (/(cancelled|closed lost|disposed|inactive)/.test(value)) return 'cancelled';
    return 'active';
  }

  function snapshot () {
    const services = SERVICES.map(service => {
      const transactions = readTable(service.table).map((row, index) => {
        const rawDate = service.date(row);
        const amount = service.value(row);
        const id = recordId(row, index);
        return {
          id: service.code + ':' + id,
          sourceId: id,
          source: service.key,
          table: service.table,
          date: displayDate(rawDate),
          timestamp: dateValue(rawDate),
          description: String(service.description(row) || service.name),
          category: service.name,
          type: amount < 0 ? 'expense' : 'income',
          amount,
          status: normaliseStatus(service.status(row)),
          client: String(service.client(row) || '').trim()
        };
      });
      return {
        key: service.key,
        table: service.table,
        name: service.name,
        icon: service.icon,
        records: transactions.length,
        total: transactions.reduce((sum, transaction) => sum + transaction.amount, 0),
        transactions
      };
    });

    const transactions = services
      .flatMap(service => service.transactions)
      .sort((a, b) => b.timestamp - a.timestamp || a.id.localeCompare(b.id));
    const income = transactions.reduce((sum, transaction) => sum + (transaction.amount > 0 ? transaction.amount : 0), 0);
    const expenses = transactions.reduce((sum, transaction) => sum + (transaction.amount < 0 ? Math.abs(transaction.amount) : 0), 0);
    const clients = new Set(transactions.map(transaction => transaction.client.toLowerCase()).filter(Boolean));
    const statuses = transactions.reduce((totals, transaction) => {
      totals[transaction.status] = (totals[transaction.status] || 0) + 1;
      return totals;
    }, { active: 0, completed: 0, pending: 0, overdue: 0, cancelled: 0 });

    return {
      services,
      transactions,
      income,
      expenses,
      net: income - expenses,
      clients: clients.size,
      records: transactions.length,
      statuses
    };
  }

  function monthlySeries (months) {
    const data = snapshot();
    const count = Math.max(1, parseInt(months, 10) || 6);
    const dated = data.transactions.filter(transaction => transaction.timestamp);
    const latest = dated.reduce((max, transaction) => Math.max(max, transaction.timestamp), 0) || Date.now();
    const end = new Date(latest);
    const start = new Date(end.getFullYear(), end.getMonth() - count + 1, 1);
    const buckets = [];
    const lookup = new Map();

    for (let offset = 0; offset < count; offset += 1) {
      const date = new Date(start.getFullYear(), start.getMonth() + offset, 1);
      const key = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
      const bucket = {
        key,
        label: date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        income: 0,
        expenses: 0
      };
      buckets.push(bucket);
      lookup.set(key, bucket);
    }

    data.transactions.forEach(transaction => {
      if (!transaction.date) return;
      const key = transaction.date.slice(0, 7);
      const bucket = lookup.get(key);
      if (!bucket) return;
      if (transaction.amount < 0) bucket.expenses += Math.abs(transaction.amount);
      else bucket.income += transaction.amount;
    });

    return {
      labels: buckets.map(bucket => bucket.label),
      income: buckets.map(bucket => bucket.income),
      expenses: buckets.map(bucket => bucket.expenses)
    };
  }

  function valueByService () {
    const data = snapshot();
    const services = data.services.filter(service => service.total !== 0);
    return {
      labels: services.map(service => service.name),
      values: services.map(service => Math.abs(service.total)),
      colors: ['#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#14b8a6', '#ef4444']
    };
  }

  fms.liveFinancials = { SERVICES, snapshot, monthlySeries, valueByService };
  window.FMS = fms;
})();
