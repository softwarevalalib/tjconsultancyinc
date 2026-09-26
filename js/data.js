/* ============================================================
   js/data.js  —  Sample data for TJ Consultancy FMS
   ============================================================ */

const FMS = window.FMS || {};

FMS.data = {

  kpi: {
    revenue: 428_750,
    profit:  189_200,
    expenses: 239_550,
    clients:  62
  },

  transactions: [
    { id:'TXN-001', date:'2024-07-03', description:'Strategy Consulting – Apex Ltd',  category:'Consulting',  type:'income',  amount: 18500, status:'paid'     },
    { id:'TXN-002', date:'2024-07-05', description:'Office Supplies Q3',               category:'Operations', type:'expense', amount: -1250, status:'paid'     },
    { id:'TXN-003', date:'2024-07-08', description:'Financial Audit – Zenith Corp',    category:'Consulting',  type:'income',  amount: 32000, status:'paid'     },
    { id:'TXN-004', date:'2024-07-10', description:'Software Licences (Annual)',        category:'Technology', type:'expense', amount: -5800, status:'paid'     },
    { id:'TXN-005', date:'2024-07-12', description:'Risk Management Retainer',         category:'Consulting',  type:'income',  amount: 12000, status:'pending'  },
    { id:'TXN-006', date:'2024-07-15', description:'Team Training & Development',      category:'HR',         type:'expense', amount: -3200, status:'paid'     },
    { id:'TXN-007', date:'2024-07-17', description:'Digital Marketing Campaign',       category:'Marketing',  type:'expense', amount: -7500, status:'paid'     },
    { id:'TXN-008', date:'2024-07-19', description:'M&A Advisory – Horizon Group',     category:'Consulting',  type:'income',  amount: 54000, status:'paid'     },
    { id:'TXN-009', date:'2024-07-21', description:'Cloud Infrastructure (AWS)',       category:'Technology', type:'expense', amount: -2900, status:'paid'     },
    { id:'TXN-010', date:'2024-07-23', description:'Payroll Processing – July',        category:'HR',         type:'expense', amount:-48000, status:'paid'     },
    { id:'TXN-011', date:'2024-07-25', description:'Business Development Retainer',    category:'Consulting',  type:'income',  amount: 15000, status:'overdue'  },
    { id:'TXN-012', date:'2024-07-27', description:'Legal & Compliance Services',      category:'Operations', type:'expense', amount: -4200, status:'paid'     },
    { id:'TXN-013', date:'2024-07-29', description:'Tax Optimisation – BrightPath',    category:'Consulting',  type:'income',  amount: 22000, status:'pending'  },
    { id:'TXN-014', date:'2024-08-01', description:'Office Rent – August',             category:'Operations', type:'expense', amount: -9500, status:'paid'     },
    { id:'TXN-015', date:'2024-08-03', description:'Corporate Finance – Vanguard',     category:'Consulting',  type:'income',  amount: 41000, status:'paid'     },
    { id:'TXN-016', date:'2024-08-05', description:'Utilities – August',               category:'Operations', type:'expense', amount:  -780, status:'paid'     },
    { id:'TXN-017', date:'2024-08-07', description:'IPO Readiness Advisory',           category:'Consulting',  type:'income',  amount: 68000, status:'paid'     },
    { id:'TXN-018', date:'2024-08-09', description:'Subscription Tools (SaaS)',        category:'Technology', type:'expense', amount: -1600, status:'paid'     },
    { id:'TXN-019', date:'2024-08-11', description:'Client Hospitality – Q3 Summit',  category:'Marketing',  type:'expense', amount: -6200, status:'pending'  },
    { id:'TXN-020', date:'2024-08-13', description:'Wealth Management Advisory',      category:'Consulting',  type:'income',  amount: 28000, status:'paid'     },
  ],

  revenueMonthly: {
    labels: ['Feb','Mar','Apr','May','Jun','Jul','Aug'],
    income:   [62000, 71000, 58000, 84000, 79000, 95000, 112000],
    expenses: [38000, 42000, 35000, 51000, 48000, 58000,  68000],
  },

  expenseBreakdown: {
    labels: ['HR & Payroll','Operations','Technology','Marketing','Legal'],
    values: [48, 21, 14, 10, 7],
    colors: ['#3b82f6','#f59e0b','#a855f7','#22c55e','#ef4444'],
  },

  inventory: [],

  staff: [
    { id:1, name:'Sarah Okonkwo',   role:'Senior Finance Analyst',  dept:'Finance',    email:'s.okonkwo@tjconsultancy.com',   status:'Active',   initials:'SO', color:'#3b82f6' },
    { id:2, name:'James Adeyemi',   role:'Lead Consultant',          dept:'Consulting', email:'j.adeyemi@tjconsultancy.com',   status:'Active',   initials:'JA', color:'#a855f7' },
    { id:3, name:'Maria Santos',    role:'Compliance Manager',       dept:'Operations', email:'m.santos@tjconsultancy.com',    status:'Active',   initials:'MS', color:'#22c55e' },
    { id:4, name:'David Chen',      role:'HR Business Partner',      dept:'HR',         email:'d.chen@tjconsultancy.com',      status:'Remote',   initials:'DC', color:'#f59e0b' },
    { id:5, name:'Amaka Obi',       role:'Marketing Strategist',     dept:'Marketing',  email:'a.obi@tjconsultancy.com',       status:'Active',   initials:'AO', color:'#ef4444' },
    { id:6, name:'Thomas Hughes',   role:'Financial Controller',     dept:'Finance',    email:'t.hughes@tjconsultancy.com',    status:'On Leave', initials:'TH', color:'#14b8a6' },
    { id:7, name:'Priya Nair',      role:'Business Analyst',         dept:'Consulting', email:'p.nair@tjconsultancy.com',      status:'Active',   initials:'PN', color:'#6366f1' },
    { id:8, name:'Kevin Osei',      role:'Operations Manager',       dept:'Operations', email:'k.osei@tjconsultancy.com',      status:'Active',   initials:'KO', color:'#ec4899' },
    { id:9, name:'Lena Fischer',    role:'Tax Consultant',           dept:'Finance',    email:'l.fischer@tjconsultancy.com',   status:'Remote',   initials:'LF', color:'#0ea5e9' },
    { id:10,name:'Samuel Eze',      role:'Junior Consultant',        dept:'Consulting', email:'s.eze@tjconsultancy.com',       status:'Active',   initials:'SE', color:'#d97706' },
    { id:11,name:'Fatima Al-Razi',  role:'Digital Marketing Exec',   dept:'Marketing',  email:'f.alrazi@tjconsultancy.com',    status:'Active',   initials:'FA', color:'#7c3aed' },
    { id:12,name:'Chris Murphy',    role:'IT Systems Admin',         dept:'Operations', email:'c.murphy@tjconsultancy.com',    status:'Active',   initials:'CM', color:'#059669' },
  ],

  reportBarData: {
    labels: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep'],
    income:   [52000,62000,71000,58000,84000,79000,95000,112000,88000],
    expenses: [31000,38000,42000,35000,51000,48000,58000,68000,54000],
  },

  invoices: [
    { id:'INV-2024-001', client:'Apex Ltd',          description:'Strategy Consulting – Q3 Retainer',    issueDate:'2024-07-01', dueDate:'2024-07-31', amount: 18500, status:'paid'    },
    { id:'INV-2024-002', client:'Zenith Corp',        description:'Financial Audit Services – FY2023',    issueDate:'2024-07-05', dueDate:'2024-08-04', amount: 32000, status:'paid'    },
    { id:'INV-2024-003', client:'Horizon Group',      description:'M&A Advisory – Phase 1',               issueDate:'2024-07-10', dueDate:'2024-08-09', amount: 54000, status:'paid'    },
    { id:'INV-2024-004', client:'BrightPath Ltd',     description:'Tax Optimisation Consultancy',         issueDate:'2024-07-18', dueDate:'2024-08-17', amount: 22000, status:'pending' },
    { id:'INV-2024-005', client:'Vanguard Finance',   description:'Corporate Finance Advisory',           issueDate:'2024-08-01', dueDate:'2024-08-31', amount: 41000, status:'paid'    },
    { id:'INV-2024-006', client:'Crestview Partners', description:'Risk Management Retainer – August',    issueDate:'2024-08-03', dueDate:'2024-09-02', amount: 12000, status:'overdue' },
    { id:'INV-2024-007', client:'Orion Capital',      description:'IPO Readiness Advisory Package',       issueDate:'2024-08-07', dueDate:'2024-09-06', amount: 68000, status:'paid'    },
    { id:'INV-2024-008', client:'Delta Wealth',       description:'Wealth Management Programme',          issueDate:'2024-08-13', dueDate:'2024-09-12', amount: 28000, status:'paid'    },
    { id:'INV-2024-009', client:'NovaBridge Inc',     description:'Business Development Retainer',        issueDate:'2024-08-20', dueDate:'2024-09-19', amount: 15000, status:'overdue' },
    { id:'INV-2024-010', client:'Summit Group',       description:'Compliance & Regulatory Review',       issueDate:'2024-08-25', dueDate:'2024-09-24', amount: 19500, status:'pending' },
    { id:'INV-2024-011', client:'Meridian Trust',     description:'Financial Modelling & Forecasting',    issueDate:'2024-09-01', dueDate:'2024-09-30', amount: 23000, status:'pending' },
    { id:'INV-2024-012', client:'BlueSky Capital',    description:'Investment Strategy Review Q3',        issueDate:'2024-09-05', dueDate:'2024-10-04', amount: 37000, status:'paid'    },
  ]
};
