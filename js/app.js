/* ============================================================
   js/app.js  —  Application logic for TJ Consultancy FMS
   ============================================================ */

(function () {
  "use strict";

  /* ============================================================
     HELPERS
     ============================================================ */
  const $ = (id) => document.getElementById(id);
  const $$ = (sel) => document.querySelectorAll(sel);

  function canDeleteRecords() {
    return !!(
      window.FMSDB &&
      typeof FMSDB.canDelete === "function" &&
      FMSDB.canDelete()
    );
  }

  function fmt(n) {
    const sign = n < 0 ? "-" : "";
    return (
      sign +
      "$" +
      Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 0 })
    );
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  function esc(value) {
    return String(value === undefined || value === null ? "" : value).replace(
      /[&<>"']/g,
      (char) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[char],
    );
  }

  function animateCount(el, target, prefix) {
    if (!el) return;
    const dur = 900;
    const start = performance.now();
    const from = 0;
    (function step(now) {
      const p = Math.min((now - start) / dur, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      const val = Math.round(from + (target - from) * ease);
      el.textContent = (prefix || "") + Math.abs(val).toLocaleString("en-US");
      if (p < 1) requestAnimationFrame(step);
    })(start);
  }

  function showToast(msg, duration) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove("show"), duration || 3000);
  }

  /* ============================================================
     TOPBAR DATE + LIVE CLOCK
     ============================================================ */
  function updateDateTime() {
    const dateEl = $("topbarDate");
    const timeEl = $("topbarTime");
    if (!dateEl && !timeEl) return;

    const now = new Date();
    if (dateEl) {
      dateEl.textContent = now.toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      });
      dateEl.dateTime = now.toISOString().slice(0, 10);
    }
    if (timeEl) {
      timeEl.textContent = now.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      });
      timeEl.dateTime = now.toISOString();
    }
  }
  updateDateTime();
  /* Align the first refresh with the next second, then keep the clock moving
     without visible digit-width jumps. */
  setTimeout(function startLiveClock() {
    updateDateTime();
    setInterval(updateDateTime, 1000);
  }, 1000 - (Date.now() % 1000));

  /* ============================================================
     SIDEBAR TOGGLE
     ============================================================ */
  const sidebar = $("sidebar");
  const wrapper = $("mainWrapper");
  const overlay = $("sidebarOverlay");
  const toggleBtn = $("sidebarToggle");
  let isMobile = window.innerWidth <= 900;

  function openMobileSidebar() {
    sidebar.classList.add("mobile-open");
    overlay.classList.add("active");
    document.body.style.overflow = "hidden";
  }

  function closeMobileSidebar() {
    sidebar.classList.remove("mobile-open");
    overlay.classList.remove("active");
    document.body.style.overflow = "";
  }

  function toggleDesktopSidebar() {
    const coll = sidebar.classList.toggle("collapsed");
    wrapper.classList.toggle("sidebar-collapsed", coll);
  }

  toggleBtn.addEventListener("click", () => {
    if (isMobile) {
      sidebar.classList.contains("mobile-open")
        ? closeMobileSidebar()
        : openMobileSidebar();
    } else {
      toggleDesktopSidebar();
    }
  });

  overlay.addEventListener("click", closeMobileSidebar);

  window.addEventListener("resize", () => {
    const nowMobile = window.innerWidth <= 900;
    if (nowMobile !== isMobile) {
      isMobile = nowMobile;
      if (!isMobile) {
        closeMobileSidebar();
        sidebar.classList.remove("mobile-open");
      } else {
        sidebar.classList.remove("collapsed");
        wrapper.classList.remove("sidebar-collapsed");
      }
    }
  });

  /* Compact sidebar toggle (Settings) */
  const compactToggle = $("compactToggle");
  if (compactToggle) {
    compactToggle.addEventListener("change", () => {
      if (!isMobile) toggleDesktopSidebar();
    });
  }

  /* ============================================================
     NAVIGATION
     ============================================================ */
  const views = {
    dashboard: "Dashboard",
    reports: "Reports",
    clients: "Clients",
    inventory: "Inventory",
    staff: "Staff",
    salary: "Staff Salary",
    attendance: "Attendance",
    leave: "Leave Management",
    settings: "Settings",
  };
  let currentView = "dashboard";

  function switchView(viewKey) {
    if (!views[viewKey]) return;
    if (["salary", "attendance", "leave"].includes(viewKey) && sessionStorage.getItem("fms_auth_role") !== "admin") return;

    // Hide all views
    $$(".view").forEach((v) => v.classList.remove("active"));
    // Show target
    const el = $("view-" + viewKey);
    if (el) el.classList.add("active");

    // Update nav links
    $$(".nav-link").forEach((a) => {
      a.classList.toggle("active", a.dataset.view === viewKey);
    });

    // Update page title & breadcrumb
    const title = views[viewKey];
    const ptEl = $("pageTitle");
    const bcEl = $("breadcrumbCurrent");
    if (ptEl) ptEl.textContent = title;
    if (bcEl) bcEl.textContent = title;

    currentView = viewKey;

    // Lazy-init charts
    if (viewKey === "dashboard") initDashboardView();
    if (viewKey === "reports") initReportsView();
    if (viewKey === "clients") renderClientsView();

    // Close mobile sidebar after nav
    if (isMobile) closeMobileSidebar();
  }

  // Nav link clicks
  $$(".nav-link").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      switchView(link.dataset.view);
    });
  });

  // "View All" btn on dashboard transactions
  $$("[data-view]").forEach((el) => {
    if (!el.classList.contains("nav-link")) {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        switchView(el.dataset.view);
      });
    }
  });

  /* ============================================================
     DASHBOARD VIEW
     ============================================================ */
  function liveFinancialSnapshot() {
    if (window.FMS && FMS.liveFinancials) return FMS.liveFinancials.snapshot();
    return {
      transactions: [],
      income: 0,
      expenses: 0,
      net: 0,
      clients: 0,
      records: 0,
      statuses: {
        active: 0,
        completed: 0,
        pending: 0,
        overdue: 0,
        cancelled: 0,
      },
    };
  }

  function setText(id, value) {
    const element = $(id);
    if (element) element.textContent = value;
  }

  function renderDashboardMetrics(data) {
    setText("kpi-revenue", fmt(data.income));
    setText("kpi-profit", fmt(data.net));
    setText("kpi-expenses", fmt(data.expenses));
    setText("kpi-clients", data.clients.toLocaleString());
    setText(
      "kpi-revenue-change",
      data.records +
        (data.records === 1 ? " live system record" : " live system records"),
    );
    setText("kpi-profit-change", "Calculated from the same live records");
    setText(
      "kpi-expenses-change",
      data.expenses
        ? "From negative-value records"
        : "No expense records in the system",
    );
    setText("kpi-clients-change", "Unique clients in live records");
  }

  function renderQuickStats(data) {
    setText("quickRecordCount", data.records.toLocaleString());
    setText(
      "quickCompletedCount",
      (data.statuses.completed || 0).toLocaleString(),
    );
    setText("quickPendingCount", (data.statuses.pending || 0).toLocaleString());
    setText("quickOverdueCount", (data.statuses.overdue || 0).toLocaleString());
    setText("quickActiveCount", (data.statuses.active || 0).toLocaleString());
    setText("quickClientCount", data.clients.toLocaleString());
  }

  function initDashboardView() {
    const data = liveFinancialSnapshot();

    // Every dashboard number is calculated from the FMSDB rows, not samples.
    renderDashboardMetrics(data);
    renderQuickStats(data);

    // Recent transactions table (last 6)
    renderRecentTx(data.transactions);

    // Charts
    const filter = $("revenueFilter");
    FMS.charts.initDashboard(filter ? filter.value : 6);
  }

  function renderRecentTx(transactions) {
    const tbody = $("recentTxBody");
    if (!tbody) return;
    const rows = (transactions || []).slice(0, 6);
    if (!rows.length) {
      tbody.innerHTML =
        '<tr><td colspan="5" class="empty-state">No system records yet. Add a record in a service workspace.</td></tr>';
      return;
    }
    tbody.innerHTML = rows
      .map((t) => {
        const amtClass = t.amount >= 0 ? "amount-pos" : "amount-neg";
        return `<tr class="dashboard-transaction-row" data-transaction-table="${esc(t.table)}" data-transaction-id="${esc(t.sourceId)}" tabindex="0" title="Open this record in the Dashboard" aria-label="Open ${esc(t.description)} in the Dashboard">
        <td><code style="font-size:12px;color:#6366f1">${esc(t.id)}</code></td>
        <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis"><button type="button" class="dashboard-transaction-link" aria-label="Open ${esc(t.description)} in the Dashboard">${esc(t.description)} <i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i></button></td>
        <td>${esc(t.category)}</td>
        <td class="${amtClass}">${fmt(t.amount)}</td>
        <td><span class="status-badge ${esc(t.status)}">${esc(capitalise(t.status))}</span></td>
      </tr>`;
      })
      .join("");
  }

  function openDashboardTransaction(table, recordId) {
    const serviceByTable = {
      loans: "financial",
      research: "research",
      assets: "assets",
      bizdev: "bizdev",
      vehicles: "vehicles",
      printing: "printing",
    };
    const service = serviceByTable[table];
    switchView("dashboard");
    if (!service) return;

    const serviceTab = document.querySelector('.svc-tab[data-svc="' + service + '"]');
    if (serviceTab) serviceTab.click();
    if (table === "loans") {
      const entryTab = document.querySelector('.loan-subtab[data-loan-tab="entry"]');
      if (entryTab) entryTab.click();
      if (recordId && window.LoanEngine && typeof window.LoanEngine.openNotificationTarget === "function") {
        window.LoanEngine.openNotificationTarget(recordId);
      }
    }
  }

  const recentTxBody = $("recentTxBody");
  if (recentTxBody) {
    recentTxBody.addEventListener("click", (event) => {
      const row = event.target.closest(".dashboard-transaction-row[data-transaction-table]");
      if (row) openDashboardTransaction(row.dataset.transactionTable, row.dataset.transactionId);
    });
    recentTxBody.addEventListener("keydown", (event) => {
      const row = event.target.closest(".dashboard-transaction-row[data-transaction-table]");
      if (!row || (event.key !== "Enter" && event.key !== " ")) return;
      event.preventDefault();
      openDashboardTransaction(row.dataset.transactionTable, row.dataset.transactionId);
    });
  }

  // Revenue filter
  const revenueFilter = $("revenueFilter");
  if (revenueFilter) {
    revenueFilter.addEventListener("change", () => {
      FMS.charts.updateRevenue(revenueFilter.value);
    });
  }

  /* ============================================================
     REPORTS VIEW
     ============================================================ */
  let txPage = 1;
  const TX_PER_PAGE = 8;
  let filteredTx = [];

  function liveTransactions() {
    return liveFinancialSnapshot().transactions;
  }

  function refreshTransactions(resetPage) {
    const query = ((txSearch && txSearch.value) || "").toLowerCase().trim();
    const transactions = liveTransactions();
    filteredTx = query
      ? transactions.filter((t) =>
          [t.description, t.id, t.category, t.status].some((value) =>
            String(value).toLowerCase().includes(query),
          ),
        )
      : transactions;
    if (resetPage) txPage = 1;
    const maxPage = Math.max(1, Math.ceil(filteredTx.length / TX_PER_PAGE));
    txPage = Math.min(txPage, maxPage);
    renderFullTxTable();
    renderPagination();
  }

  function initReportsView() {
    refreshTransactions();
    if (FMS.charts) FMS.charts.initReports();
    document.dispatchEvent(new CustomEvent("fms:reports-open"));
  }

  function renderFullTxTable() {
    const tbody = $("fullTxBody");
    if (!tbody) return;
    const start = (txPage - 1) * TX_PER_PAGE;
    const page = filteredTx.slice(start, start + TX_PER_PAGE);
    if (page.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="7" class="empty-state">No transactions found.</td></tr>';
      return;
    }
    tbody.innerHTML = page
      .map((t) => {
        const amtClass = t.amount >= 0 ? "amount-pos" : "amount-neg";
        return `<tr>
        <td>${fmtDate(t.date)}</td>
        <td><code style="font-size:12px;color:#6366f1">${esc(t.id)}</code></td>
        <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis">${esc(t.description)}</td>
        <td>${esc(t.category)}</td>
        <td><span class="status-badge ${t.type === "income" ? "paid" : "cancelled"}" style="background:${t.type === "income" ? "#dcfce7" : "#f1f5f9"};color:${t.type === "income" ? "#15803d" : "#64748b"}">${esc(capitalise(t.type))}</span></td>
        <td class="${amtClass}">${fmt(t.amount)}</td>
        <td><span class="status-badge ${esc(t.status)}">${esc(capitalise(t.status))}</span></td>
      </tr>`;
      })
      .join("");
  }

  function renderPagination() {
    const pg = $("txPagination");
    if (!pg) return;
    const total = Math.ceil(filteredTx.length / TX_PER_PAGE);
    if (total <= 1) {
      pg.innerHTML = "";
      return;
    }

    let html = `<button class="pg-btn" ${txPage === 1 ? "disabled" : ""} id="pgPrev"><i class="fas fa-chevron-left"></i></button>`;
    for (let i = 1; i <= total; i++) {
      html += `<button class="pg-btn ${i === txPage ? "active" : ""}" data-pg="${i}">${i}</button>`;
    }
    html += `<button class="pg-btn" ${txPage === total ? "disabled" : ""} id="pgNext"><i class="fas fa-chevron-right"></i></button>`;
    pg.innerHTML = html;

    pg.querySelectorAll("[data-pg]").forEach((btn) => {
      btn.addEventListener("click", () => {
        txPage = parseInt(btn.dataset.pg);
        renderFullTxTable();
        renderPagination();
      });
    });
    const prev = $("pgPrev"),
      next = $("pgNext");
    if (prev)
      prev.addEventListener("click", () => {
        if (txPage > 1) {
          txPage--;
          renderFullTxTable();
          renderPagination();
        }
      });
    if (next)
      next.addEventListener("click", () => {
        if (txPage < total) {
          txPage++;
          renderFullTxTable();
          renderPagination();
        }
      });
  }

  // Search transactions
  const txSearch = $("txSearch");
  if (txSearch) {
    txSearch.addEventListener("input", () => {
      refreshTransactions(true);
    });
  }

  /* ============================================================
     INVENTORY VIEW — persistent office stock, synchronised by FMSDB
     ============================================================ */
  let inventoryRows = [];

  function inventoryStatus(item) {
    const quantity = Math.max(0, Number(item.quantity) || 0);
    const reorder = Math.max(0, Number(item.reorderLevel) || 0);
    if (quantity === 0) return { label: "Out of Stock", className: "overdue" };
    if (quantity <= reorder)
      return { label: "Low Stock", className: "pending" };
    return { label: "In Stock", className: "paid" };
  }

  function inventoryValue(item) {
    return (
      Math.max(0, Number(item.quantity) || 0) *
      Math.max(0, Number(item.unitCost) || 0)
    );
  }

  function loadInventory() {
    inventoryRows = window.FMSDB ? FMSDB.table("inventory", []) : inventoryRows;
  }

  function renderInventorySummary() {
    const totals = inventoryRows.reduce(
      (summary, item) => {
        const quantity = Math.max(0, Number(item.quantity) || 0);
        summary.items += 1;
        summary.units += quantity;
        summary.value += inventoryValue(item);
        if (inventoryStatus(item).label !== "In Stock") summary.attention += 1;
        return summary;
      },
      { items: 0, units: 0, value: 0, attention: 0 },
    );

    const setText = (id, value) => {
      const el = $(id);
      if (el) el.textContent = value;
    };
    setText("inventorySummaryItems", totals.items.toLocaleString());
    setText("inventorySummaryUnits", totals.units.toLocaleString());
    setText("inventorySummaryValue", fmt(totals.value));
    setText("inventorySummaryAttention", totals.attention.toLocaleString());
    setText("inventoryTableUnits", totals.units.toLocaleString());
    setText("inventoryTableValue", fmt(totals.value));
    setText(
      "inventoryTableAttention",
      totals.attention +
        (totals.attention === 1
          ? " item needs attention"
          : " items need attention"),
    );
  }

  function renderInventory(filter) {
    const tableBody = $("inventoryTableBody");
    renderInventorySummary();
    if (!tableBody) return;
    const query = String(
      filter == null ? ($("inventorySearch") || {}).value || "" : filter,
    )
      .toLowerCase()
      .trim();
    const visible = inventoryRows.filter(
      (item) =>
        !query ||
        [item.name, item.category, item.location]
          .join(" ")
          .toLowerCase()
          .includes(query),
    );
    if (!visible.length) {
      tableBody.innerHTML =
        '<tr><td colspan="9" class="empty-state">No inventory items found. Use Add Inventory Item to create the first office stock record.</td></tr>';
      return;
    }
    tableBody.innerHTML = visible
      .map((item) => {
        const status = inventoryStatus(item);
        return `<tr>
        <td><strong>${escHtml(item.name)}</strong></td>
        <td>${escHtml(item.category || "Other")}</td>
        <td>${escHtml(item.location || "—")}</td>
        <td>${Math.max(0, Number(item.quantity) || 0).toLocaleString()}</td>
        <td>${Math.max(0, Number(item.reorderLevel) || 0).toLocaleString()}</td>
        <td>${fmt(Math.max(0, Number(item.unitCost) || 0))}</td>
        <td>${fmt(inventoryValue(item))}</td>
        <td><span class="status-badge ${status.className}">${status.label}</span></td>
        <td>
          <div class="inventory-row-actions">
            <button class="btn-row-edit" data-inventory-edit="${item._id}" title="Edit item"><i class="fas fa-pen"></i><span>Edit</span></button>
            <button class="btn-row-download" data-inventory-download="${item._id}" title="Download item CSV"><i class="fas fa-download"></i><span>Download</span></button>
            <button class="btn-row-print" data-inventory-print="${item._id}" title="Print item"><i class="fas fa-print"></i><span>Print</span></button>
            ${canDeleteRecords() ? '<button class="btn-row-delete" data-inventory-delete="' + item._id + '" title="Delete item" aria-label="Delete item"><i class="fas fa-trash"></i></button>' : ""}
          </div>
        </td>
      </tr>`;
      })
      .join("");
    tableBody.querySelectorAll("[data-inventory-edit]").forEach((button) => {
      button.addEventListener("click", () => {
        const item = inventoryRows.find(
          (row) => row._id === button.dataset.inventoryEdit,
        );
        if (item) openInventoryModal(item);
      });
    });
    tableBody
      .querySelectorAll("[data-inventory-download]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          const item = inventoryRows.find(
            (row) => row._id === button.dataset.inventoryDownload,
          );
          if (item) downloadInventoryItem(item);
        });
      });
    tableBody.querySelectorAll("[data-inventory-print]").forEach((button) => {
      button.addEventListener("click", () => {
        const item = inventoryRows.find(
          (row) => row._id === button.dataset.inventoryPrint,
        );
        if (item) printInventoryItem(item);
      });
    });
    tableBody.querySelectorAll("[data-inventory-delete]").forEach((button) => {
      button.addEventListener("click", () => {
        if (!canDeleteRecords()) {
          showToast("Sign in to delete inventory items.");
          return;
        }
        const item = inventoryRows.find(
          (row) => row._id === button.dataset.inventoryDelete,
        );
        if (
          !item ||
          !confirm(
            'Delete "' +
              item.name +
              '" from the inventory? This action removes it immediately.',
          )
        )
          return;
        if (
          window.FMSDB &&
          !FMSDB.deleteRecord("inventory", button.dataset.inventoryDelete)
        ) {
          loadInventory();
          renderInventory();
          showToast("The inventory item could not be deleted.");
          return;
        }
        if (window.FMSDB) loadInventory();
        else
          inventoryRows = inventoryRows.filter(
            (item) => item._id !== button.dataset.inventoryDelete,
          );
        renderInventory();
        showToast("Inventory item deleted from the system.");
      });
    });
  }

  function escHtml(value) {
    return String(value == null ? "" : value).replace(
      /[&<>'"]/g,
      (char) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          "'": "&#39;",
          '"': "&quot;",
        })[char],
    );
  }

  function csvCell(value) {
    return '"' + String(value == null ? "" : value).replace(/"/g, '""') + '"';
  }

  function downloadInventoryItem(item) {
    const status = inventoryStatus(item).label;
    const rows = [
      ["Inventory Field", "Value"],
      ["Item", item.name],
      ["Category", item.category || "Other"],
      ["Location", item.location || "—"],
      ["Quantity", Math.max(0, Number(item.quantity) || 0)],
      ["Reorder Level", Math.max(0, Number(item.reorderLevel) || 0)],
      ["Unit Cost", fmt(Math.max(0, Number(item.unitCost) || 0))],
      ["Stock Value", fmt(inventoryValue(item))],
      ["Status", status],
      [
        "Last Updated",
        item.updatedAt ? new Date(item.updatedAt).toLocaleString() : "—",
      ],
    ];
    const csv =
      "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const safeName =
      String(item.name || "inventory-item")
        .trim()
        .replace(/[^a-z0-9]+/gi, "-")
        .replace(/^-|-$/g, "") || "inventory-item";
    link.href = url;
    link.download = safeName + "-inventory.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast("Inventory item downloaded.");
  }

  function printInventoryItem(item) {
    const printWindow = window.open("", "_blank", "width=760,height=640");
    if (!printWindow) {
      showToast("Allow pop-ups in your browser to print this inventory item.");
      return;
    }
    const status = inventoryStatus(item).label;
    const fields = [
      ["Item", item.name],
      ["Category", item.category || "Other"],
      ["Location", item.location || "—"],
      ["Quantity", Math.max(0, Number(item.quantity) || 0).toLocaleString()],
      [
        "Reorder Level",
        Math.max(0, Number(item.reorderLevel) || 0).toLocaleString(),
      ],
      ["Unit Cost", fmt(Math.max(0, Number(item.unitCost) || 0))],
      ["Stock Value", fmt(inventoryValue(item))],
      ["Status", status],
      [
        "Last Updated",
        item.updatedAt ? new Date(item.updatedAt).toLocaleString() : "—",
      ],
    ];
    const rows = fields
      .map(
        ([label, value]) =>
          "<tr><th>" +
          escHtml(label) +
          "</th><td>" +
          escHtml(value) +
          "</td></tr>",
      )
      .join("");
    printWindow.document.write(
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Inventory — ${escHtml(item.name)}</title><style>body{font-family:Arial,sans-serif;color:#172033;margin:36px}h1{margin:0 0 6px;font-size:24px}p{margin:0 0 24px;color:#64748b}table{width:100%;border-collapse:collapse}th,td{padding:11px 13px;border:1px solid #dbe3ef;text-align:left}th{width:36%;background:#f1f5f9;color:#0f2a4a}td{font-weight:600}@media print{body{margin:20px}}</style></head><body><h1>Inventory Item</h1><p>Printed ${escHtml(new Date().toLocaleString())}</p><table>${rows}</table></body></html>`,
    );
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  const inventoryModal = $("inventoryModal");
  let editingInventoryId = null;
  function openInventoryModal(item) {
    editingInventoryId = item ? item._id : null;
    const isEditing = !!item;
    const fields = {
      inventoryName: isEditing ? item.name : "",
      inventoryLocation: isEditing
        ? item.location === "—"
          ? ""
          : item.location
        : "",
      inventoryQuantity: isEditing
        ? Math.max(0, Number(item.quantity) || 0)
        : 1,
      inventoryReorderLevel: isEditing
        ? Math.max(0, Number(item.reorderLevel) || 0)
        : 0,
      inventoryUnitCost: isEditing
        ? Math.max(0, Number(item.unitCost) || 0)
        : 0,
    };
    Object.keys(fields).forEach((id) => {
      const field = $(id);
      if (field) field.value = fields[id];
    });
    const category = $("inventoryCategory");
    if (category) {
      const categoryValue = isEditing ? item.category : "Office Supplies";
      category.value = Array.from(category.options).some(
        (option) => option.value === categoryValue,
      )
        ? categoryValue
        : "Other";
    }
    const title = $("inventoryModalTitle");
    if (title)
      title.textContent = isEditing
        ? "Edit Inventory Item"
        : "Add Inventory Item";
    if (saveInventoryBtn)
      saveInventoryBtn.innerHTML = isEditing
        ? '<i class="fas fa-save"></i> Update Item'
        : "Save Item";
    if (inventoryModal) inventoryModal.classList.add("open");
    setTimeout(() => $("inventoryName")?.focus(), 40);
  }
  function closeInventoryModal() {
    editingInventoryId = null;
    if (inventoryModal) inventoryModal.classList.remove("open");
  }

  const addInventoryBtn = $("addInventoryBtn");
  const closeInventoryBtn = $("closeInventoryModal");
  const cancelInventoryBtn = $("cancelInventory");
  const saveInventoryBtn = $("saveInventory");
  if (addInventoryBtn)
    addInventoryBtn.addEventListener("click", () => openInventoryModal());
  if (closeInventoryBtn)
    closeInventoryBtn.addEventListener("click", closeInventoryModal);
  if (cancelInventoryBtn)
    cancelInventoryBtn.addEventListener("click", closeInventoryModal);
  if (inventoryModal)
    inventoryModal.addEventListener("click", (e) => {
      if (e.target === inventoryModal) closeInventoryModal();
    });
  if (saveInventoryBtn)
    saveInventoryBtn.addEventListener("click", () => {
      const name = $("inventoryName")?.value.trim();
      const quantity = Number($("inventoryQuantity")?.value);
      if (!name) {
        showToast("Enter an inventory item name.");
        return;
      }
      if (!Number.isFinite(quantity) || quantity < 0) {
        showToast("Quantity must be zero or greater.");
        return;
      }
      const itemDetails = {
        name,
        category: $("inventoryCategory")?.value || "Other",
        location: $("inventoryLocation")?.value.trim() || "—",
        quantity,
        reorderLevel: Math.max(
          0,
          Number($("inventoryReorderLevel")?.value) || 0,
        ),
        unitCost: Math.max(0, Number($("inventoryUnitCost")?.value) || 0),
        updatedAt: Date.now(),
      };
      const existingItem =
        editingInventoryId &&
        inventoryRows.find((item) => item._id === editingInventoryId);
      const isEditing = !!existingItem;
      if (existingItem) {
        Object.assign(existingItem, itemDetails);
      } else {
        inventoryRows.unshift(
          Object.assign(
            { _id: window.FMSDB ? FMSDB.uid("inv-") : "inv-" + Date.now() },
            itemDetails,
          ),
        );
      }
      if (window.FMSDB) FMSDB.set("inventory", inventoryRows);
      /* Clear a prior search so the item that was just saved is immediately
       visible in the register as well as included in the live totals. */
      if (inventorySearch) inventorySearch.value = "";
      renderInventory("");
      closeInventoryModal();
      showToast(
        isEditing ? "Inventory item updated." : "Inventory item added.",
      );
    });
  const inventorySearch = $("inventorySearch");
  if (inventorySearch)
    inventorySearch.addEventListener("input", () =>
      renderInventory(inventorySearch.value),
    );
  if (window.FMSDB)
    FMSDB.on((change) => {
      if (change.table === "inventory" || change.table === "*") {
        loadInventory();
        renderInventory();
      }
    });

  /* ============================================================
     STAFF VIEW
     ============================================================ */
  let staffList = FMS.data.staff.map((s) => ({ ...s }));
  let nextStaffId = 200;

  function renderStaff(list) {
    const grid = $("staffGrid");
    if (!grid) return;
    if (list.length === 0) {
      grid.innerHTML =
        '<p class="empty-state" style="padding:40px;grid-column:1/-1">No staff found.</p>';
      return;
    }
    grid.innerHTML = list
      .map(
        (s) => `
      <div class="staff-card">
        <div class="staff-avatar" style="background:${s.color}">${s.initials}</div>
        <p class="staff-name">${s.name}</p>
        <p class="staff-role">${s.role}</p>
        <p class="staff-dept"><i class="fas fa-sitemap" style="margin-right:4px;opacity:.5;font-size:11px"></i>${s.dept}</p>
        <p class="staff-email"><a href="mailto:${s.email}" style="color:inherit">${s.email}</a></p>
        <div class="staff-card-footer">
          <span class="status-badge ${s.status === "On Leave" ? "leave" : s.status.toLowerCase()}">${s.status}</span>
        </div>
      </div>
    `,
      )
      .join("");
  }

  function filterStaff() {
    const q = ($("staffSearch")?.value || "").toLowerCase().trim();
    const dept = $("deptFilter")?.value || "";
    const stat = $("statusFilter")?.value || "";
    const list = staffList.filter(
      (s) =>
        (!q ||
          s.name.toLowerCase().includes(q) ||
          s.role.toLowerCase().includes(q)) &&
        (!dept || s.dept === dept) &&
        (!stat || s.status === stat),
    );
    renderStaff(list);
  }

  ["staffSearch", "deptFilter", "statusFilter"].forEach((id) => {
    const el = $(id);
    if (el) el.addEventListener("input", filterStaff);
  });

  // Add Staff Modal
  const staffModal = $("staffModal");
  const addStaffBtn = $("addStaffBtn");
  const closeStaffMod = $("closeStaffModal");
  const cancelStaff = $("cancelStaff");
  const saveStaffBtn = $("saveStaff");

  const STAFF_COLORS = [
    "#3b82f6",
    "#a855f7",
    "#22c55e",
    "#f59e0b",
    "#ef4444",
    "#14b8a6",
    "#6366f1",
    "#ec4899",
  ];

  function openStaffModal() {
    [
      "staffName",
      "staffRole",
      "staffEmail",
      "staffUsername",
      "staffPassword",
    ].forEach((id) => {
      const el = $(id);
      if (el) el.value = "";
    });
    const dept = $("staffDept");
    if (dept) dept.value = "Finance";
    const status = $("staffStatus");
    if (status) status.value = "Active";
    document
      .querySelectorAll('#staffPermissions input[type="checkbox"]')
      .forEach((input) => {
        input.checked =
          input.value === "dashboard" || input.value === "inventory";
      });
    staffModal.classList.add("open");
    setTimeout(() => $("staffName")?.focus(), 50);
  }

  function closeStaffModal() {
    staffModal.classList.remove("open");
  }

  if (addStaffBtn) addStaffBtn.addEventListener("click", openStaffModal);
  if (closeStaffMod) closeStaffMod.addEventListener("click", closeStaffModal);
  if (cancelStaff) cancelStaff.addEventListener("click", closeStaffModal);
  staffModal.addEventListener("click", (e) => {
    if (e.target === staffModal) closeStaffModal();
  });

  if (saveStaffBtn) {
    saveStaffBtn.addEventListener("click", async () => {
      const name = $("staffName")?.value.trim();
      const role = $("staffRole")?.value.trim();
      const dept = $("staffDept")?.value || "Finance";
      const email = $("staffEmail")?.value.trim();
      const username = $("staffUsername")?.value.trim();
      const password = $("staffPassword")?.value || "";
      const status = $("staffStatus")?.value || "Active";
      const permissions = Array.from(
        document.querySelectorAll("#staffPermissions input:checked"),
      ).map((input) => input.value);

      if (
        !window.StaffSheetAPI ||
        typeof window.StaffSheetAPI.addStaff !== "function"
      ) {
        showToast("The Staff Spreadsheet is not ready yet. Please try again.");
        return;
      }

      saveStaffBtn.disabled = true;
      try {
        await window.StaffSheetAPI.addStaff({
          name,
          role,
          dept,
          email,
          username,
          password,
          status,
          permissions,
        });
        closeStaffModal();
        showToast(`${name} added to the Staff Spreadsheet with login access.`);
      } catch (error) {
        showToast(
          error && error.message
            ? error.message
            : "Could not add this staff member.",
        );
      } finally {
        saveStaffBtn.disabled = false;
      }
    });
  }

  /* ============================================================
     INVOICES (inside Reports view)
     ============================================================ */
  const INV_PER_PAGE = 8;
  let invPage = 1;
  let filteredInv = [...FMS.data.invoices];
  let selectedInvIds = new Set();

  function fmtInvDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  function renderInvoiceTable() {
    const tbody = $("invoiceTableBody");
    if (!tbody) return;

    const start = (invPage - 1) * INV_PER_PAGE;
    const page = filteredInv.slice(start, start + INV_PER_PAGE);

    if (page.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="8" class="empty-state">No invoices found.</td></tr>';
      return;
    }

    tbody.innerHTML = page
      .map((inv) => {
        const checked = selectedInvIds.has(inv.id) ? "checked" : "";
        const rowSel = selectedInvIds.has(inv.id) ? "row-selected" : "";
        return `<tr class="${rowSel}" data-inv-id="${inv.id}">
        <td class="col-check">
          <input type="checkbox" class="inv-checkbox" data-id="${inv.id}" ${checked} aria-label="Select invoice ${inv.id}" />
        </td>
        <td><span class="invoice-num">${inv.id}</span></td>
        <td style="font-weight:500">${inv.client}</td>
        <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${inv.description}</td>
        <td>${fmtInvDate(inv.issueDate)}</td>
        <td>${fmtInvDate(inv.dueDate)}</td>
        <td class="amount-pos">$${inv.amount.toLocaleString("en-US")}</td>
        <td><span class="status-badge ${inv.status}">${capitalise(inv.status)}</span></td>
      </tr>`;
      })
      .join("");

    // Wire row checkboxes
    tbody.querySelectorAll(".inv-checkbox").forEach((cb) => {
      cb.addEventListener("change", () => {
        const id = cb.dataset.id;
        if (cb.checked) selectedInvIds.add(id);
        else selectedInvIds.delete(id);
        updateInvoiceActionState();
        renderInvoiceTable(); // re-render to keep row highlight in sync
      });
    });

    // Sync select-all state
    const all = $("invoiceSelectAll");
    if (all) {
      const allIds = page.map((i) => i.id);
      all.checked =
        allIds.length > 0 && allIds.every((id) => selectedInvIds.has(id));
      all.indeterminate =
        !all.checked && allIds.some((id) => selectedInvIds.has(id));
    }
  }

  function renderInvoicePagination() {
    const pg = $("invoicePagination");
    if (!pg) return;
    const total = Math.ceil(filteredInv.length / INV_PER_PAGE);
    if (total <= 1) {
      pg.innerHTML = "";
      return;
    }

    let html = `<button class="pg-btn" ${invPage === 1 ? "disabled" : ""} id="invPgPrev"><i class="fas fa-chevron-left"></i></button>`;
    for (let i = 1; i <= total; i++) {
      html += `<button class="pg-btn ${i === invPage ? "active" : ""}" data-inv-pg="${i}">${i}</button>`;
    }
    html += `<button class="pg-btn" ${invPage === total ? "disabled" : ""} id="invPgNext"><i class="fas fa-chevron-right"></i></button>`;
    pg.innerHTML = html;

    pg.querySelectorAll("[data-inv-pg]").forEach((btn) => {
      btn.addEventListener("click", () => {
        invPage = parseInt(btn.dataset.invPg);
        renderInvoiceTable();
        renderInvoicePagination();
      });
    });
    const prev = $("invPgPrev"),
      next = $("invPgNext");
    if (prev)
      prev.addEventListener("click", () => {
        if (invPage > 1) {
          invPage--;
          renderInvoiceTable();
          renderInvoicePagination();
        }
      });
    if (next)
      next.addEventListener("click", () => {
        if (invPage < total) {
          invPage++;
          renderInvoiceTable();
          renderInvoicePagination();
        }
      });
  }

  function updateInvoiceActionState() {
    const count = selectedInvIds.size;
    const dlBtn = $("downloadInvoiceBtn");
    const prBtn = $("printInvoiceBtn");
    const selLabel = $("invoiceSelectedLabel");

    if (dlBtn) dlBtn.classList.toggle("btn-disabled", count === 0);
    if (prBtn) prBtn.classList.toggle("btn-disabled", count === 0);
    if (selLabel) {
      selLabel.textContent =
        count > 0 ? `${count} invoice${count > 1 ? "s" : ""} selected` : "";
    }
  }

  // Select-all checkbox
  const invSelectAll = $("invoiceSelectAll");
  if (invSelectAll) {
    invSelectAll.addEventListener("change", () => {
      const start = (invPage - 1) * INV_PER_PAGE;
      const page = filteredInv.slice(start, start + INV_PER_PAGE);
      page.forEach((inv) => {
        if (invSelectAll.checked) selectedInvIds.add(inv.id);
        else selectedInvIds.delete(inv.id);
      });
      updateInvoiceActionState();
      renderInvoiceTable();
    });
  }

  // Invoice search
  const invoiceSearch = $("invoiceSearch");
  if (invoiceSearch) {
    invoiceSearch.addEventListener("input", () => {
      applyInvoiceFilters();
    });
  }

  // Invoice status filter
  const invoiceStatusFilter = $("invoiceStatusFilter");
  if (invoiceStatusFilter) {
    invoiceStatusFilter.addEventListener("change", applyInvoiceFilters);
  }

  function applyInvoiceFilters() {
    const q = ($("invoiceSearch")?.value || "").toLowerCase().trim();
    const stat = $("invoiceStatusFilter")?.value || "";
    filteredInv = FMS.data.invoices.filter(
      (inv) =>
        (!q ||
          inv.id.toLowerCase().includes(q) ||
          inv.client.toLowerCase().includes(q) ||
          inv.description.toLowerCase().includes(q)) &&
        (!stat || inv.status === stat),
    );
    invPage = 1;
    selectedInvIds.clear();
    updateInvoiceActionState();
    renderInvoiceTable();
    renderInvoicePagination();
  }

  /* ---- Download Invoice (CSV) ---- */
  const downloadInvoiceBtn = $("downloadInvoiceBtn");
  if (downloadInvoiceBtn) {
    // Start disabled
    downloadInvoiceBtn.classList.add("btn-disabled");

    downloadInvoiceBtn.addEventListener("click", () => {
      const selected = FMS.data.invoices.filter((inv) =>
        selectedInvIds.has(inv.id),
      );
      if (selected.length === 0) {
        showToast("Please select at least one invoice.");
        return;
      }

      const header = [
        "Invoice #",
        "Client",
        "Description",
        "Issue Date",
        "Due Date",
        "Amount (USD)",
        "Status",
      ];
      const rows = selected.map((inv) => [
        inv.id,
        inv.client,
        '"' + inv.description.replace(/"/g, '""') + '"',
        fmtInvDate(inv.issueDate),
        fmtInvDate(inv.dueDate),
        inv.amount,
        capitalise(inv.status),
      ]);

      const csvContent = [header, ...rows].map((r) => r.join(",")).join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `TJ_Consultancy_Invoices_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showToast(
        `${selected.length} invoice${selected.length > 1 ? "s" : ""} downloaded as CSV.`,
      );
    });
  }

  /* ---- Print Invoice ---- */
  const printInvoiceBtn = $("printInvoiceBtn");
  if (printInvoiceBtn) {
    // Start disabled
    printInvoiceBtn.classList.add("btn-disabled");

    printInvoiceBtn.addEventListener("click", () => {
      const selected = FMS.data.invoices.filter((inv) =>
        selectedInvIds.has(inv.id),
      );
      if (selected.length === 0) {
        showToast("Please select at least one invoice to print.");
        return;
      }

      const printArea = $("printArea");
      if (!printArea) return;

      // Build a clean printable page for each selected invoice
      const pages = selected
        .map((inv, idx) => {
          const pageBreak =
            idx < selected.length - 1 ? "page-break-after:always;" : "";
          return `<div style="${pageBreak}margin-bottom:40px">
          <div class="print-header">
            <div>
              <div class="print-logo-name">TJ Consultancy</div>
              <div class="print-logo-sub">Finance Management System</div>
              <div style="margin-top:8px;font-size:12px;color:#374151">
                123 Finance House, London EC1A 1BB<br>
                info@tjconsultancy.com &nbsp;|&nbsp; +44 20 0000 0000
              </div>
            </div>
            <div style="text-align:right">
              <div class="print-invoice-lbl">Invoice</div>
              <div class="print-invoice-id">${inv.id}</div>
              <div style="margin-top:6px;font-size:12px;color:#374151">
                <strong>Status:</strong> ${capitalise(inv.status).toUpperCase()}
              </div>
            </div>
          </div>

          <div class="print-meta">
            <div>
              <div class="print-meta-label">Bill To</div>
              <div class="print-meta-value">${inv.client}</div>
            </div>
            <div>
              <div class="print-meta-label">Issue Date</div>
              <div class="print-meta-value">${fmtInvDate(inv.issueDate)}</div>
            </div>
            <div>
              <div class="print-meta-label">Due Date</div>
              <div class="print-meta-value">${fmtInvDate(inv.dueDate)}</div>
            </div>
          </div>

          <table class="print-table">
            <thead>
              <tr>
                <th style="width:50%">Description</th>
                <th>Category</th>
                <th style="text-align:right">Amount (USD)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>${inv.description}</td>
                <td>Consulting Services</td>
                <td style="text-align:right">$${inv.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
              </tr>
              <tr class="print-total-row">
                <td colspan="2"><strong>Total Due</strong></td>
                <td style="text-align:right"><strong>$${inv.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</strong></td>
              </tr>
            </tbody>
          </table>

          <div class="print-footer">
            Thank you for your business. Please make payment by ${fmtInvDate(inv.dueDate)}.<br>
            TJ Consultancy Ltd &nbsp;|&nbsp; Registered in England &amp; Wales No. 00000000 &nbsp;|&nbsp; VAT No. GB000000000
          </div>
        </div>`;
        })
        .join("");

      printArea.style.display = "block";
      printArea.innerHTML = pages;
      window.print();
      printArea.style.display = "none";
      printArea.innerHTML = "";

      showToast(
        `Printing ${selected.length} invoice${selected.length > 1 ? "s" : ""}…`,
      );
    });
  }

  /* ---- Init invoices when Reports view opens ---- */
  function initInvoiceSection() {
    filteredInv = [...FMS.data.invoices];
    invPage = 1;
    selectedInvIds.clear();
    updateInvoiceActionState();
    renderInvoiceTable();
    renderInvoicePagination();
  }

  /* ============================================================
     SETTINGS VIEW
     ============================================================ */
  const saveSettingsBtn = $("saveSettingsBtn");
  if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener("click", () => {
      showToast("Settings saved successfully!");
    });
  }

  /* ── Website URL setting ──────────────────────────────────────── */
  const WEBSITE_URL_KEY = "fms_website_url";
  const WEBSITE_URL_DEFAULT = "https://tjconsultancy.com";

  /** Apply a URL to the topbar button (and any login-page anchor if present) */
  function applyWebsiteUrl(url) {
    const clean = (url && url.trim()) || WEBSITE_URL_DEFAULT;
    const btn = $("topbarWebBtn");
    if (btn) btn.href = clean;
  }

  /** Populate the Settings input from localStorage, then wire the Save button */
  function initWebsiteUrlSetting() {
    const input = $("websiteUrlInput");
    const saveBtn = $("websiteUrlSaveBtn");
    const status = $("websiteUrlStatus");

    if (!input || !saveBtn) return;

    /* Restore current value */
    const stored = localStorage.getItem(WEBSITE_URL_KEY) || WEBSITE_URL_DEFAULT;
    input.value = stored;

    saveBtn.addEventListener("click", function () {
      let val = input.value.trim();
      if (!val) val = WEBSITE_URL_DEFAULT;

      /* Basic URL sanity check */
      if (!/^https?:\/\/.+/.test(val)) {
        if (status) {
          status.style.display = "block";
          status.style.background = "rgba(239,68,68,0.12)";
          status.style.border = "1px solid rgba(239,68,68,0.3)";
          status.style.color = "#f87171";
          status.textContent =
            "Please enter a valid URL starting with https:// or http://";
        }
        return;
      }

      try {
        localStorage.setItem(WEBSITE_URL_KEY, val);
      } catch (_) {}

      applyWebsiteUrl(val);
      input.value = val;

      if (status) {
        status.style.display = "block";
        status.style.background = "rgba(34,197,94,0.1)";
        status.style.border = "1px solid rgba(34,197,94,0.25)";
        status.style.color = "#4ade80";
        status.textContent = "✓ Website URL saved and applied.";
        setTimeout(() => {
          status.style.display = "none";
        }, 3000);
      }

      showToast("Website URL updated!");
    });

    /* Also update on Enter key */
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        saveBtn.click();
      }
    });
  }

  /* Run on load */
  applyWebsiteUrl(localStorage.getItem(WEBSITE_URL_KEY));
  initWebsiteUrlSetting();

  /* ============================================================
     SERVICE TAB SWITCHING  (dashboard embedded panels)
     ============================================================ */
  function initServiceTabs() {
    const tabs = $$(".svc-tab");
    const panels = $$(".svc-panel");
    if (!tabs.length) return;

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const target = tab.dataset.svc;

        // Update tab active states + ARIA
        tabs.forEach((t) => {
          t.classList.toggle("active", t.dataset.svc === target);
          t.setAttribute(
            "aria-selected",
            t.dataset.svc === target ? "true" : "false",
          );
        });

        // Show matching panel, hide others
        panels.forEach((p) => {
          const isTarget = p.id === "svc-panel-" + target;
          p.classList.toggle("active", isTarget);
        });
      });
    });
  }
  initServiceTabs();

  /* Sync tab-count badges from sections.js countId values */
  function syncTabCounts() {
    const map = {
      financial: "fin-client-count",
      research: "research-client-count",
      assets: "asset-client-count",
      bizdev: "bizdev-client-count",
      vehicles: "veh-client-count",
      printing: "print-client-count",
    };
    Object.entries(map).forEach(([svc, srcId]) => {
      const src = $(srcId);
      const badge = $("tab-count-" + svc);
      if (!src || !badge) return;
      // Mirror using a MutationObserver so badge stays in sync after adds/deletes
      badge.textContent = src.textContent;
      new MutationObserver(() => {
        badge.textContent = src.textContent;
      }).observe(src, { childList: true, characterData: true, subtree: true });
    });
  }
  // Defer until sections.js has rendered its initial counts
  setTimeout(syncTabCounts, 50);

  /* ============================================================
     CLIENTS VIEW — real-time master list across all services
     ============================================================ */
  function collectClients() {
    const out = [];
    const db = window.FMSDB;
    const pull = (name, seed) => (db ? db.table(name, seed) : []);
    pull("loans").forEach((l) =>
      out.push({
        client: l.clientName,
        service: "Financial Management",
        detail: "Loan · " + fmt(l.amount || 0) + " @ " + (l.rate || 0) + "%",
        value: l.total || l.amount || 0,
        status: "active",
      }),
    );
    pull("research").forEach((r) =>
      out.push({
        client: r.client,
        service: "Research & Consulting",
        detail: r.project || r.type || "—",
        value: +r.value || 0,
        status: r.status || "ongoing",
      }),
    );
    pull("assets").forEach((a) =>
      out.push({
        client: a.owner,
        service: "Asset Management",
        detail: a.name + " · " + a.type,
        value: +a.value || 0,
        status: a.status || "active",
      }),
    );
    pull("bizdev").forEach((b) =>
      out.push({
        client: b.company,
        service: "Business Development",
        detail: b.contact + " · " + b.stage,
        value: +b.value || 0,
        status: b.stage || "lead",
      }),
    );
    pull("vehicles").forEach((v) =>
      out.push({
        client: v.name,
        service: "Vehicle Hire",
        detail: v.type + " · " + fmtDate(v.pickup),
        value: +v.rate || 0,
        status: v.status || "confirmed",
      }),
    );
    pull("printing").forEach((p) =>
      out.push({
        client: p.name,
        service: "Printing",
        detail: p.type + " × " + (p.qty || 0),
        value: +p.quote || 0,
        status: p.status || "received",
      }),
    );
    return out;
  }

  function renderClientsView() {
    const tbody = $("clients-tbody");
    if (!tbody) return;
    const q = ($("clientsSearch")?.value || "").toLowerCase().trim();
    let list = collectClients();
    if (q)
      list = list.filter((r) => JSON.stringify(r).toLowerCase().includes(q));
    const cnt = $("clientsTotalCount");
    if (cnt) cnt.textContent = list.length;
    if (!list.length) {
      tbody.innerHTML =
        '<tr><td colspan="5" class="empty-state">No client records yet.</td></tr>';
      return;
    }
    tbody.innerHTML = list
      .map(
        (r) => `<tr>
      <td><strong>${r.client || "—"}</strong></td>
      <td>${r.service}</td>
      <td style="max-width:240px;overflow:hidden;text-overflow:ellipsis">${r.detail}</td>
      <td class="amount-pos">${fmt(r.value)}</td>
      <td><span class="status-badge pending">${capitalise(String(r.status || "active"))}</span></td>
    </tr>`,
      )
      .join("");
  }

  const clientsSearch = $("clientsSearch");
  if (clientsSearch) clientsSearch.addEventListener("input", renderClientsView);
  /* Real-time refresh from the database */
  if (window.FMSDB)
    FMSDB.on(() => {
      if (currentView === "clients") renderClientsView();
    });

  /* The financial dashboard is a read-only projection of these same tables.
     A local edit, another browser tab, a backup restore, or a cloud update
     therefore refreshes every dashboard figure immediately. */
  const FINANCIAL_SOURCE_TABLES = new Set([
    "loans",
    "research",
    "assets",
    "bizdev",
    "vehicles",
    "printing",
  ]);
  if (window.FMSDB)
    FMSDB.on((change) => {
      if (
        !change ||
        (change.table !== "*" && !FINANCIAL_SOURCE_TABLES.has(change.table))
      )
        return;
      initDashboardView();
      refreshTransactions(false);
      if (FMS.charts) FMS.charts.initReports();
    });

  /* ============================================================
     UTILITY
     ============================================================ */
  function capitalise(str) {
    return str ? str.charAt(0).toUpperCase() + str.slice(1) : "";
  }

  /* ============================================================
     BOOT
     ============================================================ */
  function boot() {
    initChartCardCollapse();
    initDashboardView();
    loadInventory();
    renderInventory();
    renderStaff(staffList);
  }

  function initChartCardCollapse() {
    $$(".chart-collapse-toggle").forEach((button) => {
      const storageKey = `fms-chart-expanded-${button.dataset.collapseTarget}`;
      let shouldShow = false;
      try {
        shouldShow = localStorage.getItem(storageKey) === "true";
      } catch (_) {
        // Keep chart panels collapsed when browser storage is unavailable.
      }
      setChartCollapseState(button, shouldShow);

      button.addEventListener("click", () => {
        const content = $(button.dataset.collapseTarget);
        if (!content) return;
        shouldShow = content.hidden;
        setChartCollapseState(button, shouldShow);
        try {
          localStorage.setItem(storageKey, String(shouldShow));
        } catch (_) {
          // The current page still works if the preference cannot be saved.
        }
      });
    });
  }

  function setChartCollapseState(button, shouldShow) {
    const content = $(button.dataset.collapseTarget);
    if (!content) return;
    content.hidden = !shouldShow;
    button.setAttribute("aria-expanded", String(shouldShow));
    const title = shouldShow ? "Hide" : "Show";
    const chartName = button.dataset.collapseTarget === "revenueChartContent"
      ? "Revenue Overview chart"
      : "Record Value by Service chart";
    button.setAttribute("aria-label", `${title} ${chartName}`);
    button.title = `${title} chart`;
    const icon = button.querySelector("i");
    if (icon) {
      icon.classList.toggle("fa-chevron-up", shouldShow);
      icon.classList.toggle("fa-chevron-down", !shouldShow);
    }
  }

  // Wait for DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  /* Expose switchView globally for admin-panel.js and other modules */
  window.fmsSwitchView = switchView;
})();
