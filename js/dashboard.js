/* ═══════════════════════════════════════════════════
   dashboard.js — Dashboard metrics, portfolio, activities
   ═══════════════════════════════════════════════════ */

"use strict";

function loadDashboard() {
  renderSummaryCards();
  renderPortfolioTable(allClients);
  renderRecentActivities();
  buildPortfolioChart("bar");
  buildStatusChart();
  updateAdminPanelClientCount();
}

/* ─── SUMMARY METRIC CARDS ─── */
function renderSummaryCards() {
  const totalLoan = allClients.reduce((s, c) => s + (c.loan_amount || 0), 0);
  const totalPaid = allClients.reduce((s, c) => s + (c.amount_paid || 0), 0);
  const totalBalance = allClients.reduce(
    (s, c) => s + (c.remaining_balance || 0),
    0,
  );
  const totalInterest = allClients.reduce(
    (s, c) => s + (c.interest_amount || 0),
    0,
  );
  const totalBondPrin = allClients.reduce(
    (s, c) => s + (c.bonded_principal || 0),
    0,
  );
  const totalBondInt = allClients.reduce(
    (s, c) => s + (c.bonded_interest || 0),
    0,
  );
  const activeClients = allClients.filter((c) => c.status === "Active").length;
  const overdueClients = allClients.filter(
    (c) => c.status === "Overdue",
  ).length;

  const metrics = [
    {
      label: "Total Loan Portfolio",
      icon: "fa-wallet",
      value: fmtCurrency(totalLoan),
      sub: `${allClients.length} active loans`,
      trend: "+12%",
      trendUp: true,
      color: "#4f46e5",
      destination: "reports",
    },
    {
      label: "Total Collected",
      icon: "fa-hand-holding-usd",
      value: fmtCurrency(totalPaid),
      sub: "Payments received",
      trend: "+8.4%",
      trendUp: true,
      color: "#10b981",
      destination: "payments",
    },
    {
      label: "Outstanding Balance",
      icon: "fa-balance-scale",
      value: fmtCurrency(totalBalance),
      sub: "Remaining to collect",
      trend: "-3.1%",
      trendUp: false,
      color: "#ef4444",
      destination: "reports",
    },
    {
      label: "Total Interest",
      icon: "fa-percentage",
      value: fmtCurrency(totalInterest),
      sub: "Earned interest",
      trend: "+5.2%",
      trendUp: true,
      color: "#f59e0b",
      destination: "reports",
    },
    {
      label: "Bonded Principal",
      icon: "fa-shield-alt",
      value: fmtCurrency(totalBondPrin),
      sub: "Principal secured",
      trend: "",
      color: "#3b82f6",
      destination: "reports",
    },
    {
      label: "Bonded Interest",
      icon: "fa-lock",
      value: fmtCurrency(totalBondInt),
      sub: "Interest secured",
      trend: "",
      color: "#8b5cf6",
      destination: "reports",
    },
    {
      label: "Active Clients",
      icon: "fa-users",
      value: activeClients,
      sub: `${overdueClients} overdue`,
      trend: "",
      color: "#10b981",
      destination: "clients",
    },
    {
      label: "Avg. Flat Rate",
      icon: "fa-chart-line",
      value: fmtPct(
        allClients.reduce((s, c) => s + c.flat_rate, 0) /
          (allClients.length || 1),
      ),
      sub: "Portfolio average",
      trend: "",
      color: "#f59e0b",
      destination: "reports",
    },
  ];

  $("summary-cards").innerHTML = metrics
    .map(
      (m) => `
    <div class="metric-card" style="--mc-color:${m.color}" role="button" tabindex="0" aria-label="Open ${m.label}" onclick="showMetricDetail('${m.label}', '${m.destination}')" onkeydown="if(event.key === 'Enter' || event.key === ' ') { event.preventDefault(); showMetricDetail('${m.label}', '${m.destination}'); }">
      <div class="mc-label"><i class="fas ${m.icon}"></i>${m.label}</div>
      <div class="mc-value">${m.value}</div>
      ${m.sub ? `<div class="mc-sub">${m.sub}</div>` : ""}
      ${m.trend ? `<div class="mc-trend ${m.trendUp ? "up" : "down"}"><i class="fas fa-arrow-${m.trendUp ? "up" : "down"}"></i>${m.trend} this month</div>` : ""}
    </div>
  `,
    )
    .join("");
}

function showMetricDetail(label, destination) {
  if (destination === "clients") {
    navigateTo("clients");
    const statusFilter = $("status-filter");
    if (statusFilter) {
      statusFilter.value = "Active";
      filterClients();
    }
    return;
  }
  if (destination === "payments") {
    navigateTo("payments");
    return;
  }
  navigateTo(destination || "reports");
}

/* ─── PORTFOLIO TABLE ─── */
let currentFilter = "all";

function filterPortfolio(type) {
  currentFilter = type;
  document
    .querySelectorAll(".filter-btn")
    .forEach((b) =>
      b.classList.toggle(
        "active",
        b.textContent.trim() ===
          (type === "all"
            ? "All"
            : type === "Corporation"
              ? "Corp"
              : "Individual"),
      ),
    );
  const filtered =
    type === "all"
      ? allClients
      : allClients.filter((c) => c.client_type === type);
  renderPortfolioTable(filtered);
}

function renderPortfolioTable(clients) {
  $("portfolio-tbody").innerHTML =
    clients
      .map((c) => {
        const pct =
          c.total_payment > 0
            ? Math.round((c.amount_paid / c.total_payment) * 100)
            : 0;
        return `
      <tr>
        <td>
          <div style="display:flex;align-items:center;gap:.6rem;">
            <div class="client-avatar" style="width:32px;height:32px;border-radius:8px;font-size:.8rem;">${getInitials(c.client_name)}</div>
            <span style="font-weight:600;">${c.client_name}</span>
          </div>
        </td>
        <td><span class="perm-tag">${c.client_type}</span></td>
        <td><strong>${fmtCurrency(c.loan_amount)}</strong></td>
        <td><span style="color:var(--accent);font-weight:600;">${fmtCurrency(c.amount_paid)}</span></td>
        <td><span style="color:${c.remaining_balance > 0 ? "var(--danger)" : "var(--accent)"};font-weight:600;">${fmtCurrency(c.remaining_balance)}</span></td>
        <td><span class="${getBadgeClass(c.status)}">${c.status}</span></td>
        <td>
          <button class="summary-btn" onclick="viewClientDetail('${c.id}')">
            <i class="fas fa-eye"></i> View Summary
          </button>
          <button class="summary-btn" onclick="openInvoice('${c.id}')">
            <i class="fas fa-file-invoice-dollar"></i> Invoice
          </button>
        </td>
      </tr>
    `;
      })
      .join("") ||
    '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:2rem;">No clients found</td></tr>';
}

/* ─── RECENT ACTIVITIES ─── */
function renderRecentActivities() {
  const recent = allActivities.slice(0, 6);
  $("recent-activities-tbody").innerHTML =
    recent
      .map(
        (a) => `
    <tr>
      <td><strong>${a.client_name}</strong></td>
      <td>${a.action}</td>
      <td><span class="${getBadgeClass(a.status)}">${a.status}</span></td>
      <td style="color:var(--text-muted);font-size:.82rem;">${a.performed_by}</td>
      <td>
        <button class="btn-view" onclick="viewClientFromActivity('${a.client_id}')">
          <i class="fas fa-eye"></i> View Account
        </button>
      </td>
    </tr>
  `,
      )
      .join("") ||
    '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:2rem;">No activities yet</td></tr>';
}

function viewClientFromActivity(clientId) {
  const client = allClients.find((c) => c.id === clientId);
  if (client) viewClientDetail(client.id);
  else showToast("Client not found.", "warning");
}

/* ─── CLIENT DETAIL MODAL ─── */
function viewClientDetail(clientId) {
  const c = allClients.find((x) => x.id === clientId);
  if (!c) return;
  $("client-detail-title").innerHTML =
    `<i class="fas fa-user-circle" style="color:var(--primary)"></i> ${c.client_name} — Account Details`;

  const pct =
    c.total_payment > 0
      ? Math.round((c.amount_paid / c.total_payment) * 100)
      : 0;
  const loanDate = c.loan_date
    ? new Date(c.loan_date).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "N/A";

  $("client-detail-body").innerHTML = `
    <div class="client-detail-header">
      <div class="client-detail-avatar">${getInitials(c.client_name)}</div>
      <div class="client-detail-info">
        <h2>${c.client_name}</h2>
        <p>${c.client_type} · Loan Date: ${loanDate}</p>
        <span class="${getBadgeClass(c.status)}">${c.status}</span>
      </div>
    </div>

    <div class="detail-metrics-grid">
      <div class="detail-metric" onclick="showToast('Loan Amount: ${fmtCurrency(c.loan_amount)}','info')">
        <label><i class="fas fa-dollar-sign" style="color:var(--primary)"></i> Loan Amount</label>
        <div class="dm-value primary">${fmtCurrency(c.loan_amount)}</div>
      </div>
      <div class="detail-metric" onclick="showToast('Flat Rate: ${fmtPct(c.flat_rate)} per month','info')">
        <label><i class="fas fa-percentage" style="color:var(--warning)"></i> Rate / Month</label>
        <div class="dm-value">${fmtPct(c.flat_rate)}<span style="font-size:.65rem;font-weight:500;color:var(--text-muted);margin-left:.2rem;">/mo</span></div>
      </div>
      <div class="detail-metric" onclick="showToast('Duration: ${c.duration_months} months','info')">
        <label><i class="fas fa-calendar" style="color:var(--info)"></i> Duration</label>
        <div class="dm-value">${c.duration_months} mo</div>
      </div>
      <div class="detail-metric" onclick="showToast('Interest Amount: ${fmtCurrency(c.interest_amount)}','info')">
        <label><i class="fas fa-chart-line" style="color:var(--warning)"></i> Interest</label>
        <div class="dm-value" style="color:var(--warning)">${fmtCurrency(c.interest_amount)}</div>
      </div>
      <div class="detail-metric" onclick="showToast('Total Repayment: ${fmtCurrency(c.total_payment)}','info')">
        <label><i class="fas fa-receipt" style="color:var(--primary)"></i> Total Repayment</label>
        <div class="dm-value primary">${fmtCurrency(c.total_payment)}</div>
      </div>
      <div class="detail-metric" onclick="showToast('Monthly Principal: ${fmtCurrency(c.monthly_principal || 0)}','info')">
        <label><i class="fas fa-coins" style="color:var(--accent)"></i> Monthly Principal</label>
        <div class="dm-value success">${fmtCurrency(c.monthly_principal || 0)}</div>
      </div>
      <div class="detail-metric" onclick="showToast('Monthly Interest: ${fmtCurrency(c.monthly_interest || 0)}','info')">
        <label><i class="fas fa-chart-bar" style="color:var(--info)"></i> Monthly Interest</label>
        <div class="dm-value" style="color:var(--info)">${fmtCurrency(c.monthly_interest || 0)}</div>
      </div>
      <div class="detail-metric" onclick="showToast('Bonded Principal: ${fmtCurrency(c.bonded_principal)}','info')">
        <label><i class="fas fa-shield-alt" style="color:var(--info)"></i> Bonded Principal</label>
        <div class="dm-value">${fmtCurrency(c.bonded_principal)}</div>
      </div>
      <div class="detail-metric" onclick="showToast('Bonded Interest: ${fmtCurrency(c.bonded_interest)}','info')">
        <label><i class="fas fa-lock" style="color:#8b5cf6"></i> Bonded Interest</label>
        <div class="dm-value" style="color:#8b5cf6">${fmtCurrency(c.bonded_interest)}</div>
      </div>
      <div class="detail-metric" onclick="showToast('Amount Paid: ${fmtCurrency(c.amount_paid)}','success')">
        <label><i class="fas fa-check-circle" style="color:var(--accent)"></i> Amount Paid</label>
        <div class="dm-value success">${fmtCurrency(c.amount_paid)}</div>
      </div>
      <div class="detail-metric" onclick="showToast('Remaining Balance: ${fmtCurrency(c.remaining_balance)}','${c.remaining_balance > 0 ? "warning" : "success"}')">
        <label><i class="fas fa-balance-scale" style="color:var(--danger)"></i> Remaining Balance</label>
        <div class="dm-value ${c.remaining_balance > 0 ? "danger" : "success"}">${fmtCurrency(c.remaining_balance)}</div>
      </div>
    </div>

    <div class="progress-bar-wrap" style="margin-bottom:1.25rem;">
      <div class="progress-label">
        <span>Payment Progress</span>
        <strong>${pct}% Paid</strong>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" style="width:${pct}%"></div>
      </div>
    </div>

    <div style="display:flex;gap:.75rem;justify-content:flex-end;padding-top:.5rem;border-top:1px solid var(--border)">
      <button class="btn-secondary btn-sm" onclick="closeModal('client-detail-modal')">Close</button>
      <button class="btn-primary btn-sm" onclick="closeModal('client-detail-modal');openEditClientModal('${c.id}')">
        <i class="fas fa-edit"></i> Edit Client
      </button>
      <button class="btn-primary btn-sm" onclick="openInvoice('${c.id}')">
        <i class="fas fa-file-invoice-dollar"></i> Invoice
      </button>
    </div>
  `;

  openModal("client-detail-modal");
}

function invoiceEscape(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character],
  );
}

function buildInvoiceHtml(client, invoiceRecord = null) {
  const companyName =
    document.querySelector(".company-title")?.textContent.trim() ||
    $("login-company-name")?.textContent.trim() ||
    "Financial Management Services";
  const logo = localStorage.getItem("fms_logo");
  const invoiceNumber =
    invoiceRecord?.invoice_number ||
    "INV-" +
      new Date().toISOString().slice(0, 10).replace(/-/g, "") +
      "-" +
      String(client.id).slice(-6).toUpperCase();
  const issueDate = new Date(
    invoiceRecord?.issue_date || Date.now(),
  ).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const loanDate = client.loan_date
    ? new Date(client.loan_date).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "N/A";
  const logoHtml = logo
    ? `<img class="invoice-logo" src="${logo}" alt="${invoiceEscape(companyName)} logo">`
    : '<div class="invoice-logo-fallback"><i class="fas fa-chart-line"></i></div>';
  return `
    <article class="invoice-document">
      <header class="invoice-letterhead">
        <div class="invoice-brand">${logoHtml}<div><h1>${invoiceEscape(companyName)}</h1><p>Financial Management Services</p></div></div>
        <div class="invoice-heading"><span>INVOICE</span><strong>${invoiceNumber}</strong><small>Issued ${issueDate}</small></div>
      </header>
      <div class="invoice-parties"><div><span class="invoice-label">BILLED TO</span><strong>${invoiceEscape(client.client_name)}</strong><small>${invoiceEscape(client.client_type || "Client")}</small></div><div><span class="invoice-label">LOAN DATE</span><strong>${loanDate}</strong><small>Status: ${invoiceEscape(client.status || "Pending")}</small></div></div>
      <table class="invoice-table"><thead><tr><th>Description</th><th>Details</th><th class="invoice-number">Amount</th></tr></thead><tbody>
        <tr><td>Loan Principal</td><td>${client.duration_months || 0} month term at ${fmtPct(client.flat_rate || 0)} per month</td><td class="invoice-number">${fmtCurrency(client.loan_amount)}</td></tr>
        <tr><td>Interest Charge</td><td>Flat-rate interest for the full term</td><td class="invoice-number">${fmtCurrency(client.interest_amount)}</td></tr>
      </tbody><tfoot><tr><th colspan="2">Total Repayment</th><th class="invoice-number">${fmtCurrency(client.total_payment)}</th></tr></tfoot></table>
      <div class="invoice-summary"><div><span>Monthly Principal</span><strong>${fmtCurrency(client.monthly_principal || 0)}</strong></div><div><span>Monthly Interest</span><strong>${fmtCurrency(client.monthly_interest || 0)}</strong></div><div><span>Amount Paid</span><strong>${fmtCurrency(client.amount_paid || 0)}</strong></div><div class="invoice-balance"><span>Balance Due</span><strong>${fmtCurrency(client.remaining_balance || 0)}</strong></div></div>
      <footer class="invoice-footer"><strong>Thank you for your business.</strong><span>Generated from the Financial Management System on ${issueDate}</span></footer>
    </article>`;
}

function openInvoice(clientId, invoiceRecord = null) {
  const client = allClients.find((item) => item.id === clientId);
  if (!client) return showToast("Client not found.", "error");
  $("invoice-preview").innerHTML = buildInvoiceHtml(client, invoiceRecord);
  $("invoice-preview").dataset.clientId = clientId;
  $("invoice-preview").dataset.invoiceId = invoiceRecord?.id || "";
  closeModal("client-detail-modal");
  openModal("invoice-modal");
}

async function loadInvoices() {
  try {
    const response = await fetch("tables/invoices?limit=500&sort=created_at");
    await requireApiSuccess(response, "Invoices could not be loaded.");
    const result = await response.json();
    allInvoices = result.data || [];
  } catch (error) {
    allInvoices = [];
    showToast(error.message || "Invoices could not be loaded.", "error");
  }
}

async function renderInvoicesPage() {
  await loadInvoices();
  const body = $("invoice-register-tbody");
  if (!body) return;
  body.innerHTML =
    allInvoices
      .map((invoice) => {
        const client = allClients.find((item) => item.id === invoice.client_id);
        if (!client) return "";
        const issueDate = new Date(invoice.issue_date).toLocaleDateString(
          "en-US",
          { year: "numeric", month: "short", day: "numeric" },
        );
        return `<tr>
      <td><strong>${invoiceEscape(invoice.invoice_number)}</strong><small class="invoice-client-type">${invoiceEscape(invoice.status)}</small></td>
      <td><strong>${invoiceEscape(client.client_name)}</strong><small class="invoice-client-type">${invoiceEscape(client.client_type || "Client")}</small></td>
      <td>${issueDate}</td>
      <td>${fmtCurrency(client.total_payment)}</td>
      <td><span class="${getBadgeClass(invoice.status)}">${invoiceEscape(invoice.status)}</span></td>
      <td class="invoice-row-actions"><button class="btn-secondary btn-sm" onclick="openSavedInvoice('${invoice.id}')"><i class="fas fa-eye"></i> View</button><button class="btn-secondary btn-sm" onclick="openInvoiceEditor('${invoice.id}')"><i class="fas fa-edit"></i> Edit</button></td>
    </tr>`;
      })
      .join("") ||
    '<tr><td colspan="6" class="invoice-empty-state">No invoices yet. Click Add Invoice to issue one.</td></tr>';
}

function openInvoiceEditor(invoiceId = "") {
  if (!allClients.length)
    return showToast("Add a client before creating an invoice.", "warning");
  const invoice = allInvoices.find((item) => item.id === invoiceId);
  const today = new Date().toISOString().slice(0, 10);
  $("invoice-editor-form").reset();
  $("invoice-edit-id").value = invoice?.id || "";
  $("invoice-client-id").innerHTML = allClients
    .map(
      (client) =>
        `<option value="${client.id}">${invoiceEscape(client.client_name)}</option>`,
    )
    .join("");
  $("invoice-client-id").value = invoice?.client_id || allClients[0].id;
  $("invoice-number").value =
    invoice?.invoice_number ||
    `INV-${today.replace(/-/g, "")}-${String(Date.now()).slice(-4)}`;
  $("invoice-status").value = invoice?.status || "Issued";
  $("invoice-issue-date").value = invoice?.issue_date?.slice(0, 10) || today;
  $("invoice-due-date").value = invoice?.due_date?.slice(0, 10) || "";
  $("invoice-notes").value = invoice?.notes || "";
  $("invoice-editor-title").innerHTML =
    `<i class="fas fa-file-invoice-dollar"></i> ${invoice ? "Edit Invoice" : "Add Invoice"}`;
  openModal("invoice-editor-modal");
}

async function saveInvoice(event) {
  event.preventDefault();
  const id = $("invoice-edit-id").value;
  const payload = {
    invoice_number: $("invoice-number").value.trim(),
    client_id: $("invoice-client-id").value,
    status: $("invoice-status").value,
    issue_date: new Date(
      `${$("invoice-issue-date").value}T00:00:00`,
    ).toISOString(),
    due_date: $("invoice-due-date").value
      ? new Date(`${$("invoice-due-date").value}T00:00:00`).toISOString()
      : null,
    notes: $("invoice-notes").value.trim() || null,
  };
  try {
    const response = await fetch(
      id ? `tables/invoices/${id}` : "tables/invoices",
      {
        method: id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    await requireApiSuccess(response, "Invoice could not be saved.");
    closeModal("invoice-editor-modal");
    await renderInvoicesPage();
    showToast(
      id ? "Invoice updated successfully." : "Invoice issued successfully.",
      "success",
    );
  } catch (error) {
    showToast(error.message || "Invoice could not be saved.", "error");
  }
}

function openSavedInvoice(invoiceId) {
  const invoice = allInvoices.find((item) => item.id === invoiceId);
  if (invoice) openInvoice(invoice.client_id, invoice);
}

let selectedPaymentMethod = "Bank";

async function renderPaymentsPage() {
  await fetchPayments();
  const body = $("payments-tbody");
  if (!body) return;
  body.innerHTML =
    allPayments
      .map((payment) => {
        const client = allClients.find((item) => item.id === payment.client_id);
        return `<tr><td><strong>${invoiceEscape(payment.payment_reference)}</strong></td><td>${invoiceEscape(client?.client_name || "Unknown client")}</td><td>${invoiceEscape(payment.method)}</td><td>${fmtCurrency(payment.amount)}</td><td><span class="${getBadgeClass(payment.status)}">${invoiceEscape(payment.status)}</span></td><td>${new Date(payment.created_at).toLocaleDateString()}</td></tr>`;
      })
      .join("") ||
    '<tr><td colspan="6" class="invoice-empty-state">No payments recorded yet.</td></tr>';
}

function selectPaymentMethod(method) {
  selectedPaymentMethod = method;
  document
    .querySelectorAll(".payment-method")
    .forEach((button) =>
      button.classList.toggle("active", button.dataset.method === method),
    );
  const instructions = {
    Bank: "Transfer to the registered company bank account and enter the bank transaction reference.",
    "Mobile Money":
      "Send the payment using your mobile money wallet and enter the transaction ID.",
    "Orange Money":
      "Send the payment through Orange Money and enter the transaction ID.",
  };
  $("payment-method-instructions").textContent = instructions[method];
}

function openPaymentModal(clientId = "") {
  if (!allClients.length)
    return showToast("Add a client before making a payment.", "warning");
  $("payment-form").reset();
  $("payment-client-id").innerHTML = allClients
    .map(
      (client) =>
        `<option value="${client.id}">${invoiceEscape(client.client_name)} — Balance ${fmtCurrency(client.remaining_balance)}</option>`,
    )
    .join("");
  if (clientId) $("payment-client-id").value = clientId;
  selectPaymentMethod("Bank");
  openModal("payment-modal");
}

async function submitPayment(event) {
  event.preventDefault();
  const clientId = $("payment-client-id").value;
  const client = allClients.find((item) => item.id === clientId);
  const amount = Number($("payment-amount").value);
  if (!client || !Number.isFinite(amount) || amount <= 0)
    return showToast("Enter a valid payment amount.", "error");
  if (amount > Number(client.remaining_balance || 0))
    return showToast(
      "Payment cannot be greater than the outstanding balance.",
      "error",
    );
  const payload = {
    client_id: clientId,
    payment_reference: $("payment-reference").value.trim(),
    amount,
    method: selectedPaymentMethod,
    status: "Completed",
    account_reference: $("payment-account-reference").value.trim() || null,
    notes: $("payment-notes").value.trim() || null,
  };
  try {
    const response = await fetch("tables/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    await requireApiSuccess(response, "Payment could not be submitted.");
    const payment = await response.json();
    allPayments.unshift(payment);
    const newAmountPaid = Number(client.amount_paid || 0) + amount;
    const newBalance = Math.max(
      0,
      Number(client.remaining_balance || 0) - amount,
    );
    const clientResponse = await fetch("tables/clients/" + clientId, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount_paid: newAmountPaid,
        remaining_balance: newBalance,
        status: newBalance <= 0 ? "Completed" : client.status,
      }),
    });
    await requireApiSuccess(
      clientResponse,
      "Payment was recorded but the client balance could not be updated.",
    );
    Object.assign(client, {
      amount_paid: newAmountPaid,
      remaining_balance: newBalance,
      status: newBalance <= 0 ? "Completed" : client.status,
    });
    closeModal("payment-modal");
    await renderPaymentsPage();
    renderClientsGrid();
    showToast("Payment submitted successfully.", "success");
  } catch (error) {
    showToast(error.message || "Payment could not be submitted.", "error");
  }
}

function getInvoiceDocument() {
  const clientId = $("invoice-preview").dataset.clientId;
  return allClients.find((item) => item.id === clientId);
}

function getInvoiceRecord() {
  const invoiceId = $("invoice-preview").dataset.invoiceId;
  return allInvoices.find((item) => item.id === invoiceId) || null;
}

function invoicePageHtml(client, invoiceRecord = null) {
  const styles = `
    @page{size:A4;margin:12mm}*{box-sizing:border-box}body{margin:0;padding:0;background:#fff;color:#1e293b;font-family:Arial,sans-serif}
    .invoice-document{width:100%;min-height:273mm;max-width:210mm;margin:auto;padding:18mm;background:#fff}
    .invoice-letterhead,.invoice-parties,.invoice-footer{display:flex;justify-content:space-between;gap:1rem}
    .invoice-letterhead{align-items:flex-start;padding-bottom:1.5rem;border-bottom:3px solid #4f46e5}
    .invoice-brand{display:flex;align-items:center;gap:.75rem}.invoice-logo,.invoice-logo-fallback{width:54px;height:54px;object-fit:contain;border-radius:10px}
    .invoice-logo-fallback{display:flex;align-items:center;justify-content:center;color:#fff;background:#4f46e5;font-size:1.4rem}
    .invoice-brand h1{font-size:1.25rem;color:#3730a3;margin:0}.invoice-brand p,.invoice-heading small,.invoice-parties small,.invoice-footer span{display:block;color:#64748b;font-size:.78rem;margin:.15rem 0}
    .invoice-heading{text-align:right}.invoice-heading span{display:block;color:#4f46e5;font-size:1.5rem;font-weight:800;letter-spacing:.08em}.invoice-heading strong{display:block;font-size:.85rem}
    .invoice-parties{padding:1.5rem 0}.invoice-parties>div:last-child{text-align:right}.invoice-parties strong,.invoice-parties small{display:block}.invoice-label{display:block;color:#64748b;font-size:.68rem;font-weight:800;letter-spacing:.08em;margin-bottom:.25rem}
    .invoice-table{width:100%;border-collapse:collapse;font-size:.85rem}.invoice-table th,.invoice-table td{padding:.8rem .6rem;border-bottom:1px solid #e2e8f0;text-align:left}.invoice-table thead th{background:#4f46e5;color:#fff;font-size:.7rem;text-transform:uppercase}.invoice-table .invoice-number{text-align:right;white-space:nowrap}.invoice-table tfoot th{color:#3730a3;font-size:1rem;border-bottom:0}
    .invoice-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:.6rem;margin:1.5rem 0}.invoice-summary div{padding:.75rem;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px}.invoice-summary span,.invoice-summary strong{display:block}.invoice-summary span{color:#64748b;font-size:.7rem}.invoice-summary strong{margin-top:.2rem;font-size:.9rem}.invoice-summary .invoice-balance{background:#eef2ff;border-color:#818cf8}.invoice-balance strong{color:#3730a3}
    .invoice-footer{align-items:flex-end;padding-top:1rem;border-top:1px solid #e2e8f0}@media print{body{padding:0}}@media(max-width:640px){.invoice-document{padding:1rem}.invoice-summary{grid-template-columns:repeat(2,1fr)}}`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Invoice - ${invoiceEscape(client.client_name)}</title><style>${styles}</style></head><body>${buildInvoiceHtml(client, invoiceRecord)}</body></html>`;
}

function openInvoicePrintWindow(client, saveAsPdf, invoiceRecord = null) {
  const printWindow = window.open("", "_blank", "width=960,height=760");
  if (!printWindow) {
    showToast(
      "Please allow pop-ups to download or print the invoice.",
      "warning",
    );
    return;
  }
  printWindow.document.write(invoicePageHtml(client, invoiceRecord));
  printWindow.document.close();
  printWindow.addEventListener("load", () => {
    printWindow.document.title = `Invoice - ${client.client_name}`;
    printWindow.focus();
    printWindow.print();
  });
  showToast(
    saveAsPdf
      ? "Choose Save as PDF in the print dialog."
      : "Invoice ready to print.",
    "info",
  );
}

function downloadInvoice() {
  const client = getInvoiceDocument();
  if (!client) return;
  openInvoicePrintWindow(client, true, getInvoiceRecord());
}

function printInvoice() {
  const client = getInvoiceDocument();
  if (!client) return;
  openInvoicePrintWindow(client, false, getInvoiceRecord());
}

/* ─── REPORTS PAGE ─── */
function loadReports() {
  const totalLoan = allClients.reduce((s, c) => s + (c.loan_amount || 0), 0);
  const totalPaid = allClients.reduce((s, c) => s + (c.amount_paid || 0), 0);
  const totalBalance = allClients.reduce(
    (s, c) => s + (c.remaining_balance || 0),
    0,
  );
  const totalInt = allClients.reduce((s, c) => s + (c.interest_amount || 0), 0);
  const collections = allClients.filter((c) => c.status === "Completed").length;

  const stats = [
    {
      icon: "fa-wallet",
      color: "#4f46e5",
      bg: "#ede9fe",
      label: "Total Portfolio",
      value: fmtCurrency(totalLoan),
    },
    {
      icon: "fa-hand-holding-usd",
      color: "#10b981",
      bg: "#d1fae5",
      label: "Total Collected",
      value: fmtCurrency(totalPaid),
    },
    {
      icon: "fa-balance-scale",
      color: "#ef4444",
      bg: "#fee2e2",
      label: "Outstanding",
      value: fmtCurrency(totalBalance),
    },
    {
      icon: "fa-percentage",
      color: "#f59e0b",
      bg: "#fef3c7",
      label: "Total Interest",
      value: fmtCurrency(totalInt),
    },
    {
      icon: "fa-check-double",
      color: "#3b82f6",
      bg: "#dbeafe",
      label: "Completed Loans",
      value: collections,
    },
    {
      icon: "fa-users",
      color: "#8b5cf6",
      bg: "#ede9fe",
      label: "Total Clients",
      value: allClients.length,
    },
  ];

  $("reports-summary").innerHTML = stats
    .map(
      (s) => `
    <div class="report-stat">
      <div class="rs-icon" style="background:${s.bg};color:${s.color}"><i class="fas ${s.icon}"></i></div>
      <div class="rs-label">${s.label}</div>
      <div class="rs-value" style="color:${s.color}">${s.value}</div>
    </div>
  `,
    )
    .join("");

  // Full register table
  $("full-register-tbody").innerHTML = allClients
    .map(
      (c, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>
        <div style="display:flex;align-items:center;gap:.6rem;">
          <div class="client-avatar" style="width:30px;height:30px;border-radius:8px;font-size:.75rem;">${getInitials(c.client_name)}</div>
          <span style="font-weight:600;">${c.client_name}</span>
        </div>
      </td>
      <td>${fmtCurrency(c.loan_amount)}</td>
      <td>${fmtPct(c.flat_rate)}</td>
      <td>${c.duration_months} mo</td>
      <td>${fmtCurrency(c.interest_amount)}</td>
      <td><strong>${fmtCurrency(c.total_payment)}</strong></td>
      <td style="color:var(--accent);font-weight:600;">${fmtCurrency(c.amount_paid)}</td>
      <td style="color:${c.remaining_balance > 0 ? "var(--danger)" : "var(--accent)"};font-weight:600;">${fmtCurrency(c.remaining_balance)}</td>
      <td><span class="${getBadgeClass(c.status)}">${c.status}</span></td>
    </tr>
  `,
    )
    .join("");

  buildMonthlyChart();
}

/* ─── ACTIVITIES PAGE ─── */
function renderActivitiesPage() {
  renderFullActivitiesTable(allActivities);
  populateActivityClientDropdown();
}

function renderFullActivitiesTable(activities) {
  $("full-activities-tbody").innerHTML =
    activities
      .map(
        (a, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${a.client_name}</strong></td>
      <td>${a.action}</td>
      <td><span class="${getBadgeClass(a.status)}">${a.status}</span></td>
      <td style="color:var(--text-muted);">${a.performed_by}</td>
      <td>
        <button class="btn-view" onclick="viewClientFromActivity('${a.client_id}')">
          <i class="fas fa-eye"></i> View Account
        </button>
      </td>
    </tr>
  `,
      )
      .join("") ||
    '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--text-muted);">No activities found</td></tr>';
}

function filterActivities() {
  const q = $("activity-search").value.toLowerCase();
  const filtered = allActivities.filter(
    (a) =>
      a.client_name.toLowerCase().includes(q) ||
      a.action.toLowerCase().includes(q) ||
      a.status.toLowerCase().includes(q) ||
      a.performed_by.toLowerCase().includes(q),
  );
  renderFullActivitiesTable(filtered);
}

function openAddActivityModal() {
  populateActivityClientDropdown();
  openModal("activity-form-modal");
}

function populateActivityClientDropdown() {
  const sel = $("af-client");
  if (!sel) return;
  sel.innerHTML = allClients
    .map(
      (c) =>
        `<option value="${c.id}" data-name="${c.client_name}">${c.client_name}</option>`,
    )
    .join("");
}

function fillClientId(sel) {
  // clientId tracked by value attr
}

async function saveActivity(e) {
  e.preventDefault();
  const clientSel = $("af-client");
  const clientId = clientSel.value;
  const clientName =
    clientSel.options[clientSel.selectedIndex]?.dataset.name ||
    clientSel.options[clientSel.selectedIndex]?.text ||
    "";
  const action = $("af-action").value;
  const status = $("af-status").value;

  try {
    const res = await fetch("tables/activities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_name: clientName,
        action,
        status,
        performed_by: currentUser?.name || "Admin",
      }),
    });
    const newActivity = await res.json();
    allActivities.unshift(newActivity);
    renderFullActivitiesTable(allActivities);
    renderRecentActivities();
    closeModal("activity-form-modal");
    showToast("Activity logged successfully!", "success");
  } catch (err) {
    showToast("Failed to save activity.", "error");
  }
}

/* ─── HELPERS ─── */
function getInitials(name) {
  return (name || "")
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function updateAdminPanelClientCount() {
  const el = $("ap-total-clients");
  if (el) el.textContent = allClients.length;
}
