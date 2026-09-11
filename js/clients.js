/* ═══════════════════════════════════════════════════
   clients.js — Client CRUD, grid rendering, search
   ═══════════════════════════════════════════════════ */

"use strict";

let pendingClientImport = [];

const CLIENT_IMPORT_HEADERS = [
  "Client",
  "Diasb. Date",
  "Loan Amount USD",
  "Flat Rate / Month",
  "Duration / Month",
  "Interest Amount USD",
  "Total Repayment USD",
  "Monthly Principal Payment USD",
  "Monthly Interest Payment USD",
];

function downloadClientImportTemplate() {
  const csv = CLIENT_IMPORT_HEADERS.join(",") + "\n";
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "client_bulk_upload_template.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function parseCsvLine(line) {
  const values = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && line[index + 1] === '"' && quoted) {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      values.push(value.trim());
      value = "";
    } else {
      value += character;
    }
  }
  values.push(value.trim());
  return values;
}

function parseCsvText(text) {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim());
  if (!lines.length) throw new Error("The CSV file is empty.");
  const headers = parseCsvLine(lines[0]).map((header) =>
    header.toLowerCase().replace(/[^a-z0-9]/g, ""),
  );
  const dateIndex =
    headers.indexOf("disbdate") !== -1
      ? headers.indexOf("disbdate")
      : headers.indexOf("diasbdate");
  const clientIndex =
    headers.indexOf("client") !== -1
      ? headers.indexOf("client")
      : headers.indexOf("datasetclient");
  const requiredIndexes = [
    clientIndex,
    dateIndex,
    headers.indexOf("loanamountusd"),
    headers.indexOf("flatratemonth"),
    headers.indexOf("durationmonth"),
  ];
  if (requiredIndexes.some((index) => index === -1)) {
    throw new Error(
      "Missing required columns. Download the CSV template to see the exact format.",
    );
  }

  const columnIndex = (name) => headers.indexOf(name);
  const optionalIndex = (name) => columnIndex(name);
  return lines.slice(1).map((line, rowIndex) => {
    const values = parseCsvLine(line);
    const valueAt = (index) => (index >= 0 ? values[index] || "" : "");
    const clientName = valueAt(requiredIndexes[0]);
    const dateValue = valueAt(dateIndex);
    const loan = parseImportNumber(valueAt(requiredIndexes[2]));
    const rate = parseImportNumber(valueAt(requiredIndexes[3]));
    const duration = parseImportNumber(valueAt(requiredIndexes[4]));
    const interestValue = parseImportNumber(
      valueAt(optionalIndex("interestamountusd")),
    );
    const totalValue = parseImportNumber(
      valueAt(optionalIndex("totalrepaymentusd")),
    );
    const principalValue = parseImportNumber(
      valueAt(optionalIndex("monthlyprincipalpaymentusd")),
    );
    const monthlyInterestValue = parseImportNumber(
      valueAt(optionalIndex("monthlyinterestpaymentusd")),
    );
    const interest = Number.isFinite(interestValue)
      ? interestValue
      : loan * (rate / 100) * duration;
    const total = Number.isFinite(totalValue) ? totalValue : loan + interest;
    const errors = [];
    if (!clientName) errors.push("Client name is required");
    if (!dateValue || Number.isNaN(new Date(dateValue).getTime()))
      errors.push("Valid disbursement date is required");
    if (!Number.isFinite(loan) || loan < 0)
      errors.push("Loan amount must be a number");
    if (!Number.isFinite(rate) || rate < 0)
      errors.push("Flat rate must be a number");
    if (!Number.isFinite(duration) || duration <= 0)
      errors.push("Duration must be greater than zero");
    return {
      rowNumber: rowIndex + 2,
      valid: errors.length === 0,
      errors,
      payload: {
        client_name: clientName,
        client_type: "Individual",
        loan_amount: loan,
        flat_rate: rate,
        duration_months: duration,
        interest_amount: interest,
        total_payment: total,
        monthly_principal: Number.isFinite(principalValue)
          ? principalValue
          : loan / duration,
        monthly_interest: Number.isFinite(monthlyInterestValue)
          ? monthlyInterestValue
          : interest / duration,
        bonded_principal: loan / 2,
        bonded_interest: interest / 2,
        amount_paid: 0,
        remaining_balance: total,
        status: "Pending",
        loan_date: new Date(dateValue).toISOString(),
      },
    };
  });
}

function parseImportNumber(value) {
  if (!value) return NaN;
  const parsed = Number(String(value).replace(/[$,%\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : NaN;
}

function previewClientCsv(event) {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      pendingClientImport = parseCsvText(reader.result);
      renderClientImportPreview();
      openModal("client-import-modal");
    } catch (error) {
      pendingClientImport = [];
      showToast(error.message, "error");
    }
  };
  reader.onerror = () => showToast("Could not read the CSV file.", "error");
  reader.readAsText(file);
}

function renderClientImportPreview() {
  const summary = $("client-import-summary");
  const previewBody = $("client-import-preview").querySelector("tbody");
  const validCount = pendingClientImport.filter((row) => row.valid).length;
  summary.textContent = `${validCount} valid row(s) ready to import, ${pendingClientImport.length - validCount} row(s) with errors.`;
  previewBody.innerHTML = pendingClientImport
    .map(
      (row) => `
    <tr>
      <td>${row.rowNumber}</td>
      <td>${escapeHtml(row.payload.client_name)}</td>
      <td>${row.payload.loan_date.slice(0, 10)}</td>
      <td>${fmtCurrency(row.payload.loan_amount)}</td>
      <td>${fmtPct(row.payload.flat_rate)}</td>
      <td>${row.payload.duration_months}</td>
      <td class="${row.valid ? "import-valid" : "import-invalid"}">${row.valid ? "Ready" : escapeHtml(row.errors.join("; "))}</td>
    </tr>
  `,
    )
    .join("");
  $("client-import-confirm").disabled = validCount === 0;
}

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
}

async function importClientsFromCsv() {
  const validRows = pendingClientImport.filter((row) => row.valid);
  if (!validRows.length) return;
  const button = $("client-import-confirm");
  button.disabled = true;
  button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Importing...';
  let imported = 0;
  try {
    for (const row of validRows) {
      const response = await fetch("tables/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(row.payload),
      });
      if (!response.ok)
        throw new Error(`Import failed on CSV row ${row.rowNumber}.`);
      allClients.push(await response.json());
      imported += 1;
    }
    closeModal("client-import-modal");
    pendingClientImport = [];
    renderClientsGrid();
    if (
      $("page-dashboard") &&
      !$("page-dashboard").classList.contains("hidden")
    )
      loadDashboard();
    showToast(`${imported} client(s) imported successfully.`, "success");
  } catch (error) {
    showToast(error.message || "Bulk import failed.", "error");
  } finally {
    button.disabled = false;
    button.innerHTML = '<i class="fas fa-upload"></i> Import Valid Rows';
  }
}

/* ─── RENDER GRID ─── */
function renderClientsGrid(data) {
  const clients = data || allClients;
  const grid = $("clients-grid");
  if (!clients.length) {
    grid.innerHTML =
      '<div style="text-align:center;padding:3rem;color:var(--text-muted);"><i class="fas fa-users" style="font-size:2rem;display:block;margin-bottom:.5rem;"></i>No clients found.</div>';
    return;
  }
  grid.innerHTML = clients.map((c) => buildClientCard(c)).join("");
}

function buildClientCard(c) {
  const pct =
    c.total_payment > 0
      ? Math.min(100, Math.round((c.amount_paid / c.total_payment) * 100))
      : 0;
  const loanDate = c.loan_date
    ? new Date(c.loan_date).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
      })
    : "";
  const monthlyTotal = (c.monthly_principal || 0) + (c.monthly_interest || 0);
  return `
    <div class="client-card" onclick="viewClientDetail('${c.id}')">
      <div class="client-card-header">
        <div class="client-avatar">${getInitials(c.client_name)}</div>
        <div class="client-card-info">
          <div class="client-name">${c.client_name}</div>
          <div class="client-type">${c.client_type} · ${loanDate}</div>
        </div>
        <div class="client-card-actions" onclick="event.stopPropagation()">
          <button class="btn-primary btn-sm btn-icon" title="View" onclick="viewClientDetail('${c.id}')"><i class="fas fa-eye"></i></button>
          <button class="btn-secondary btn-sm btn-icon" title="Edit" onclick="openEditClientModal('${c.id}')"><i class="fas fa-edit"></i></button>
          <button class="btn-primary btn-sm btn-icon" title="Open invoice" onclick="openInvoice('${c.id}')"><i class="fas fa-file-invoice-dollar"></i></button>
          <button class="btn-danger btn-sm btn-icon" title="Delete" onclick="confirmDeleteClient('${c.id}')"><i class="fas fa-trash"></i></button>
        </div>
      </div>

      <div style="margin-bottom:.5rem;">
        <span class="${getBadgeClass(c.status)}">${c.status}</span>
      </div>

      <div class="client-metrics">
        <div class="client-metric">
          <label>Loan Amount</label>
          <span class="highlight">${fmtCurrency(c.loan_amount)}</span>
        </div>
        <div class="client-metric">
          <label>Rate/Month</label>
          <span>${fmtPct(c.flat_rate)}</span>
        </div>
        <div class="client-metric">
          <label>Monthly Payment</label>
          <span class="success">${fmtCurrency(monthlyTotal)}</span>
        </div>
        <div class="client-metric">
          <label>Remaining</label>
          <span class="${c.remaining_balance > 0 ? "danger" : "success"}">${fmtCurrency(c.remaining_balance)}</span>
        </div>
      </div>

      <!-- Monthly breakdown pill -->
      <div class="monthly-breakdown-row">
        <div class="mb-pill">
          <i class="fas fa-coins"></i>
          <span>Principal <strong>${fmtCurrency(c.monthly_principal || 0)}</strong></span>
        </div>
        <div class="mb-divider"></div>
        <div class="mb-pill">
          <i class="fas fa-chart-line"></i>
          <span>Interest <strong>${fmtCurrency(c.monthly_interest || 0)}</strong></span>
        </div>
        <div class="mb-divider"></div>
        <div class="mb-pill accent">
          <i class="fas fa-calendar-alt"></i>
          <span>${c.duration_months || 0} months</span>
        </div>
      </div>

      <div class="progress-bar-wrap">
        <div class="progress-label">
          <span>Repayment Progress</span>
          <strong>${pct}%</strong>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width:${pct}%"></div>
        </div>
      </div>
    </div>
  `;
}

/* ─── SEARCH/FILTER ─── */
function filterClients() {
  const q = $("client-search").value.toLowerCase();
  const statusVal = $("status-filter").value;
  const filtered = allClients.filter((c) => {
    const matchQ =
      !q ||
      c.client_name.toLowerCase().includes(q) ||
      c.client_type.toLowerCase().includes(q);
    const matchS = !statusVal || c.status === statusVal;
    return matchQ && matchS;
  });
  renderClientsGrid(filtered);
}

/* ─── WIRE AUTO-CALCULATE LISTENERS (called once at app start) ─── */
function wireAutoCalculateListeners() {
  ["cf-loan", "cf-rate", "cf-duration", "cf-paid"].forEach((id) => {
    const el = $(id);
    if (el && !el.dataset.calcWired) {
      el.addEventListener("input", autoCalculate);
      el.dataset.calcWired = "1";
    }
  });
}

/* ─── ADD CLIENT MODAL ─── */
function openAddClientModal() {
  $("client-form-title").innerHTML =
    '<i class="fas fa-user-plus" style="color:var(--primary)"></i> Add New Client';
  $("client-form").reset();
  $("cf-id").value = "";
  $("cf-date").value = new Date().toISOString().slice(0, 10);
  $("cf-paid").value = "0";
  // Reset calculated preview to empty state
  $("calc-preview").innerHTML = `
    <div class="calc-empty-state">
      <i class="fas fa-calculator"></i>
      <span>Enter loan amount, rate, and duration above to see calculated values</span>
    </div>`;
  wireAutoCalculateListeners();
  openModal("client-form-modal");
}

/* ─── EDIT CLIENT ─── */
function openEditClientModal(clientId) {
  const c = allClients.find((x) => x.id === clientId);
  if (!c) return;

  $("client-form-title").innerHTML =
    '<i class="fas fa-edit" style="color:var(--primary)"></i> Edit Client — ' +
    c.client_name;
  $("cf-id").value = c.id;
  $("cf-name").value = c.client_name;
  $("cf-type").value = c.client_type;
  $("cf-loan").value = c.loan_amount;
  $("cf-rate").value = c.flat_rate;
  $("cf-duration").value = c.duration_months;
  $("cf-paid").value = c.amount_paid;
  $("cf-status").value = c.status;
  $("cf-date").value = c.loan_date
    ? new Date(c.loan_date).toISOString().slice(0, 10)
    : "";

  autoCalculate();
  openModal("client-form-modal");
}

/* ─── AUTO-CALCULATE ─── */
// Formula: flat rate per month
//   interest          = loan × (rate/100) × duration
//   total_repayment   = loan + interest
//   monthly_principal = loan / duration
//   monthly_interest  = interest / duration
function autoCalculate() {
  const loan = parseFloat($("cf-loan").value) || 0;
  const rate = parseFloat($("cf-rate").value) || 0;
  const duration = parseInt($("cf-duration").value) || 0;
  const paid = parseFloat($("cf-paid").value) || 0;

  if (!loan || !rate || !duration) {
    $("calc-preview").innerHTML = `
      <div class="calc-empty-state">
        <i class="fas fa-calculator"></i>
        <span>Enter loan amount, rate, and duration above to see calculated values</span>
      </div>`;
    return;
  }

  // Monthly flat rate formula
  const interest = loan * (rate / 100) * duration;
  const total = loan + interest;
  const monthlyPrincipal = loan / duration;
  const monthlyInterest = interest / duration;
  const remaining = Math.max(0, total - paid);
  const bondPrin = loan / 2;
  const bondInt = interest / 2;

  $("calc-preview").innerHTML = `
    <div class="calc-item">
      <label><i class="fas fa-chart-line" style="color:var(--warning);margin-right:.25rem;"></i>Interest Amount</label>
      <span class="warning">${fmtCurrency(interest)}</span>
    </div>
    <div class="calc-item">
      <label><i class="fas fa-receipt" style="color:var(--primary);margin-right:.25rem;"></i>Total Repayment</label>
      <span>${fmtCurrency(total)}</span>
    </div>
    <div class="calc-item">
      <label><i class="fas fa-calendar-check" style="color:var(--accent);margin-right:.25rem;"></i>Monthly Principal</label>
      <span class="accent">${fmtCurrency(monthlyPrincipal)}</span>
    </div>
    <div class="calc-item">
      <label><i class="fas fa-coins" style="color:var(--info);margin-right:.25rem;"></i>Monthly Interest</label>
      <span class="info">${fmtCurrency(monthlyInterest)}</span>
    </div>
    <div class="calc-item">
      <label><i class="fas fa-balance-scale" style="color:var(--danger);margin-right:.25rem;"></i>Remaining Balance</label>
      <span style="color:${remaining > 0 ? "var(--danger)" : "var(--accent)"}">${fmtCurrency(remaining)}</span>
    </div>
    <div class="calc-item">
      <label><i class="fas fa-shield-alt" style="color:var(--info);margin-right:.25rem;"></i>Bonded Principal</label>
      <span class="info">${fmtCurrency(bondPrin)}</span>
    </div>
    <div class="calc-item">
      <label><i class="fas fa-lock" style="color:#8b5cf6;margin-right:.25rem;"></i>Bonded Interest</label>
      <span style="color:#8b5cf6">${fmtCurrency(bondInt)}</span>
    </div>
    <div class="calc-item">
      <label><i class="fas fa-info-circle" style="color:var(--text-muted);margin-right:.25rem;"></i>Rate Summary</label>
      <span style="color:var(--text-muted);font-size:.78rem">${rate}%/mo × ${duration}mo</span>
    </div>
  `;
}

/* ─── SAVE CLIENT ─── */
async function saveClient(e) {
  e.preventDefault();
  const id = $("cf-id").value;
  const loan = parseFloat($("cf-loan").value) || 0;
  const rate = parseFloat($("cf-rate").value) || 0;
  const duration = parseInt($("cf-duration").value) || 0;
  const paid = parseFloat($("cf-paid").value) || 0;

  // Monthly flat rate formula
  const interest = loan * (rate / 100) * duration;
  const total = loan + interest;
  const monthlyPrincipal = duration > 0 ? loan / duration : 0;
  const monthlyInterest = duration > 0 ? interest / duration : 0;
  const remaining = Math.max(0, total - paid);
  const bondPrin = loan / 2;
  const bondInt = interest / 2;

  const payload = {
    client_name: $("cf-name").value.trim(),
    client_type: $("cf-type").value,
    loan_amount: loan,
    flat_rate: rate,
    duration_months: duration,
    interest_amount: interest,
    total_payment: total,
    monthly_principal: monthlyPrincipal,
    monthly_interest: monthlyInterest,
    bonded_principal: bondPrin,
    bonded_interest: bondInt,
    amount_paid: paid,
    remaining_balance: remaining,
    status: $("cf-status").value,
    loan_date: new Date($("cf-date").value).toISOString(),
  };

  try {
    if (id) {
      // Update
      const res = await fetch("tables/clients/" + id, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      await requireApiSuccess(res, "The client could not be updated.");
      const updated = await res.json();
      const idx = allClients.findIndex((c) => c.id === id);
      if (idx !== -1) allClients[idx] = { ...allClients[idx], ...updated };
      showToast("Client updated successfully!", "success");
    } else {
      // Create
      const res = await fetch("tables/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      await requireApiSuccess(res, "The client could not be added.");
      const created = await res.json();
      allClients.push(created);
      showToast("Client added successfully!", "success");
    }
    closeModal("client-form-modal");
    renderClientsGrid();
    if ($("page-dashboard").classList.contains("hidden") === false) {
      loadDashboard();
    }
  } catch (err) {
    showToast(
      err.message || "Failed to save client. Please try again.",
      "error",
    );
  }
}

/* ─── DELETE CLIENT ─── */
function confirmDeleteClient(clientId) {
  const c = allClients.find((x) => x.id === clientId);
  if (!c) return;
  if (
    confirm("Are you sure you want to delete client: " + c.client_name + "?")
  ) {
    deleteClient(clientId);
  }
}

async function deleteClient(clientId) {
  try {
    await fetch("tables/clients/" + clientId, { method: "DELETE" });
    allClients = allClients.filter((c) => c.id !== clientId);
    renderClientsGrid();
    showToast("Client deleted.", "success");
  } catch (err) {
    showToast("Failed to delete client.", "error");
  }
}
