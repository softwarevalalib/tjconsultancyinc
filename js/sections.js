/* ============================================================
   js/sections.js
   Research & Consulting · Asset Mgmt · Business Dev · Vehicle
   Hire · Printing
   Every section now persists its records in the FMS database
   (FMSDB → IndexedDB + localStorage), so client records stay in
   the system permanently and sync across tabs in real time.
   ============================================================ */
(function () {
  "use strict";

  /* ── helpers ─────────────────────────────────────────── */
  const $ = (id) => document.getElementById(id);

  function canDeleteRecords() {
    return !!(
      window.FMSDB &&
      typeof FMSDB.canDelete === "function" &&
      FMSDB.canDelete()
    );
  }

  function showToast(msg) {
    const t = $("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(t._stimer);
    t._stimer = setTimeout(() => t.classList.remove("show"), 3000);
  }

  function fmtMoney(n) {
    n = parseFloat(n) || 0;
    return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0 });
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  function uid() {
    return window.FMSDB
      ? FMSDB.uid("rec-")
      : Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  /* These service workspaces start empty by request. The one-time reset clears
     old demonstration records from both the live local database and all open
     FMS tabs, without removing any forms, buttons, headings, or table layout. */
  const EMPTY_SERVICE_TABLES = [
    "research",
    "assets",
    "bizdev",
    "vehicles",
    "printing",
  ];
  const EMPTY_SERVICE_PANELS = [
    "svc-panel-research",
    "svc-panel-assets",
    "svc-panel-bizdev",
    "svc-panel-vehicles",
    "svc-panel-printing",
  ];

  /* These services are intentionally placeholders. Their navigation labels
     remain in the original tab positions, while their forms, fields, search
     controls, and record spreadsheets are removed from the rendered app. */
  function emptyServicePanels() {
    EMPTY_SERVICE_PANELS.forEach((panelId) => {
      const panel = $(panelId);
      if (!panel) return;
      panel.replaceChildren();
      panel.setAttribute("aria-label", "Empty service workspace");
    });
  }
  emptyServicePanels();

  /* v2 intentionally repeats the requested cleanup for installations that
     still hold the old sample rows after the earlier empty-workspace release. */
  const EMPTY_SERVICE_RESET_KEY = "fms_empty_service_workspaces_v2";
  function cloudIsConfigured() {
    return !!(
      window.FMSCloud &&
      typeof window.FMSCloud.hasConfiguration === "function" &&
      window.FMSCloud.hasConfiguration()
    );
  }
  function clearServiceWorkspaces() {
    if (!window.FMSDB) return false;
    let cleared = true;
    EMPTY_SERVICE_TABLES.forEach((table) => {
      /* set() also removes the old rows from the local mirror and, once the
         shared workspace is ready, sends those removals to Supabase. */
      if (FMSDB.set(table, []) === false) cleared = false;
    });
    return cleared;
  }
  function markServiceWorkspacesEmpty() {
    try {
      localStorage.setItem(EMPTY_SERVICE_RESET_KEY, "1");
    } catch (_) {}
  }
  function resetServiceWorkspacesOnce() {
    if (!window.FMSDB) return;
    let resetDone = false;
    try {
      resetDone = localStorage.getItem(EMPTY_SERVICE_RESET_KEY) === "1";
    } catch (_) {}
    if (resetDone) return;

    const hasCloud = cloudIsConfigured();
    const clearAndMark = () => {
      if (clearServiceWorkspaces()) markServiceWorkspacesEmpty();
    };

    /* Clear immediately for the local/offline experience. */
    clearServiceWorkspaces();

    if (!hasCloud) {
      clearAndMark();
      return;
    }

    /* In a shared workspace, Supabase first restores the remote copy. Clear
       once more after that restoration so prior sample rows are removed from
       every authorised device, not just this browser's local cache. */
    const clearAfterCloudRestore = (event) => {
      if (!event.detail || !event.detail.initialized) return;
      document.removeEventListener(
        "fms:supabase-status",
        clearAfterCloudRestore,
      );
      clearAndMark();
    };
    document.addEventListener("fms:supabase-status", clearAfterCloudRestore);

    /* Keep the local IndexedDB mirror empty while the shared connection is
    being established. The reset marker is deliberately not written until
       the connected pass above has completed. */
    FMSDB.ready.then(() => {
      let resetComplete = false;
      try {
        resetComplete = localStorage.getItem(EMPTY_SERVICE_RESET_KEY) === "1";
      } catch (_) {}
      if (!resetComplete) clearServiceWorkspaces();
    });
  }
  resetServiceWorkspacesOnce();

  /* Status badge reuse */
  function statusBadge(s) {
    const map = {
      active: "paid",
      pending: "pending",
      inactive: "cancelled",
      confirmed: "paid",
      cancelled: "cancelled",
      ongoing: "paid",
      completed: "paid",
      "under review": "pending",
      disposed: "overdue",
      received: "pending",
      "in production": "active",
      ready: "paid",
      delivered: "paid",
      lead: "active",
      draft: "pending",
    };
    const cls = map[String(s).toLowerCase()] || "pending";
    return `<span class="status-badge ${cls}">${cap(s)}</span>`;
  }

  function cap(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
  }

  /* Stage badge for BizDev pipeline */
  function stageBadge(s) {
    const key = "stage-" + s.replace(/\s+/g, "-");
    return `<span class="stage-badge ${key}">${s}</span>`;
  }

  /* ── Generic section builder (DB-persisted) ──────────── */
  /*
   * config = {
   *   dbKey:   FMSDB table name  (persistence + real-time)
   *   formId, tbodyId, searchId, countId,
   *   fields: fn() => object row | null,
   *   cols:   fn(row) => array of cell HTML strings,
   *   seed:   initial rows (first run only)
   * }
   */
  function buildSection(config) {
    /* The five placeholder service panels have no data-entry UI or records. */
    if (EMPTY_SERVICE_TABLES.includes(config.dbKey)) return;

    /* Load persisted rows (or seed on first run). Live reference. */
    let rows = window.FMSDB
      ? FMSDB.table(
          config.dbKey,
          (config.seed || []).map((r) => ({ ...r, _id: uid() })),
        )
      : (config.seed || []).map((r) => ({ ...r, _id: uid() }));

    function persist() {
      if (window.FMSDB) FMSDB.set(config.dbKey, rows);
    }

    function updateCount() {
      const el = $(config.countId);
      if (el) el.textContent = rows.length;
    }

    function render(filter) {
      const tbody = $(config.tbodyId);
      if (!tbody) return;
      const q = (filter || "").toLowerCase().trim();
      const vis = q
        ? rows.filter((r) => JSON.stringify(r).toLowerCase().includes(q))
        : rows;

      if (vis.length === 0) {
        tbody.innerHTML = `<tr><td colspan="20" class="empty-state">No records yet. Use the form to add one.</td></tr>`;
        return;
      }

      tbody.innerHTML = vis
        .map((r) => {
          const cols = config.cols(r);
          return `<tr>
          ${cols.map((c) => `<td>${c}</td>`).join("")}
          <td>${canDeleteRecords() ? `<button class="btn-row-delete" data-del="${r._id}" title="Delete record"><i class="fas fa-trash"></i></button>` : ""}</td>
        </tr>`;
        })
        .join("");

      tbody.querySelectorAll("[data-del]").forEach((btn) => {
        btn.addEventListener("click", () => {
          if (!canDeleteRecords()) {
            showToast("Sign in to delete records.");
            return;
          }
          if (
            !confirm("Delete this record? This action removes it immediately.")
          )
            return;
          if (
            window.FMSDB &&
            !FMSDB.deleteRecord(config.dbKey, btn.dataset.del)
          ) {
            rows = FMSDB.table(config.dbKey, []);
            render($(config.searchId)?.value);
            showToast("The record could not be deleted.");
            return;
          }
          if (window.FMSDB) rows = FMSDB.table(config.dbKey, []);
          else rows = rows.filter((r) => r._id !== btn.dataset.del);
          updateCount();
          render($(config.searchId)?.value);
          showToast("Record deleted from the system and all live summaries.");
        });
      });
    }

    /* Form submit */
    const form = $(config.formId);
    if (form) {
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const vals = config.fields(form);
        if (!vals) return;
        const newRow = { ...vals, _id: uid(), createdAt: Date.now() };
        rows.unshift(newRow);
        persist(); /* client record stays in the system */
        updateCount();
        form.reset();
        render($(config.searchId)?.value);
        showToast("Record added successfully!");
      });
    }

    /* Search */
    const searchEl = $(config.searchId);
    if (searchEl) {
      searchEl.addEventListener("input", () => render(searchEl.value));
    }

    /* Real-time: another tab / the backup restore changed this table */
    if (window.FMSDB) {
      FMSDB.on((d) => {
        if (d.table === config.dbKey || d.table === "*") {
          rows = FMSDB.table(config.dbKey);
          updateCount();
          render(searchEl ? searchEl.value : "");
        }
      });
    }

    /* Initial render */
    updateCount();
    render();
  }

  /* ══════════════════════════════════════════════════════
     0. FINANCIAL MANAGEMENT
     — Handled by js/loan-engine.js (DB-persisted via FMSDB).
  ══════════════════════════════════════════════════════ */

  /* ══════════════════════════════════════════════════════
     1. RESEARCH & CONSULTING
  ══════════════════════════════════════════════════════ */
  buildSection({
    dbKey: "research",
    formId: "researchForm",
    tbodyId: "research-tbody",
    searchId: "research-search",
    countId: "research-client-count",
    seed: [],
    fields: () => {
      const client = $("res-client")?.value.trim();
      const project = $("res-project")?.value.trim();
      const type = $("res-type")?.value;
      if (!client) {
        showToast("Client name is required.");
        return null;
      }
      if (!project) {
        showToast("Project title is required.");
        return null;
      }
      if (!type) {
        showToast("Please select a service type.");
        return null;
      }
      return {
        client,
        project,
        type,
        value: $("res-value")?.value || "0",
        date: $("res-date")?.value || "",
        status: $("res-status")?.value || "ongoing",
        notes: $("res-notes")?.value.trim() || "",
      };
    },
    cols: (r) => [
      `<strong>${r.client}</strong><br><span style="font-size:11px;color:#8a94a6">${r.type}</span>`,
      r.project,
      fmtMoney(r.value),
      fmtDate(r.date),
      statusBadge(r.status),
    ],
  });

  /* ══════════════════════════════════════════════════════
     2. ASSET MANAGEMENT
  ══════════════════════════════════════════════════════ */
  buildSection({
    dbKey: "assets",
    formId: "assetForm",
    tbodyId: "asset-tbody",
    searchId: "asset-search",
    countId: "asset-client-count",
    seed: [],
    fields: () => {
      const owner = $("asset-owner")?.value.trim();
      const name = $("asset-name")?.value.trim();
      const type = $("asset-type")?.value;
      if (!owner) {
        showToast("Owner name is required.");
        return null;
      }
      if (!name) {
        showToast("Asset name is required.");
        return null;
      }
      if (!type) {
        showToast("Please select asset type.");
        return null;
      }
      return {
        owner,
        name,
        type,
        value: $("asset-value")?.value || "0",
        date: $("asset-date")?.value || "",
        location: $("asset-location")?.value.trim() || "—",
        desc: $("asset-desc")?.value.trim() || "",
        status: $("asset-status")?.value || "active",
      };
    },
    cols: (r) => [
      `<strong>${r.owner}</strong>`,
      r.name,
      r.type,
      fmtMoney(r.value),
      statusBadge(r.status),
    ],
  });

  /* ══════════════════════════════════════════════════════
     3. BUSINESS DEVELOPMENT
  ══════════════════════════════════════════════════════ */
  buildSection({
    dbKey: "bizdev",
    formId: "bizdevForm",
    tbodyId: "biz-tbody",
    searchId: "biz-search",
    countId: "bizdev-client-count",
    seed: [],
    fields: () => {
      const company = $("biz-company")?.value.trim();
      const contact = $("biz-contact")?.value.trim();
      const email = $("biz-email")?.value.trim();
      if (!company) {
        showToast("Company name is required.");
        return null;
      }
      if (!contact) {
        showToast("Contact name is required.");
        return null;
      }
      if (!email) {
        showToast("Email is required.");
        return null;
      }
      return {
        company,
        contact,
        email,
        phone: $("biz-phone")?.value.trim() || "—",
        industry: $("biz-industry")?.value || "—",
        value: $("biz-value")?.value || "0",
        stage: $("biz-stage")?.value || "Lead",
        close: $("biz-close")?.value || "",
        notes: $("biz-notes")?.value.trim() || "",
      };
    },
    cols: (r) => [
      `<strong>${r.company}</strong><br><span style="font-size:11px;color:#8a94a6">${r.industry}</span>`,
      `${r.contact}<br><span style="font-size:11px;color:#8a94a6">${r.email}</span>`,
      stageBadge(r.stage),
      fmtMoney(r.value),
    ],
  });

  /* ══════════════════════════════════════════════════════
     4. VEHICLE HIRE
  ══════════════════════════════════════════════════════ */
  buildSection({
    dbKey: "vehicles",
    formId: "vehicleForm",
    tbodyId: "veh-tbody",
    searchId: "veh-search",
    countId: "veh-client-count",
    seed: [],
    fields: () => {
      const name = $("veh-name")?.value.trim();
      const email = $("veh-email")?.value.trim();
      const type = $("veh-type")?.value;
      const pickup = $("veh-pickup")?.value;
      if (!name) {
        showToast("Client name is required.");
        return null;
      }
      if (!email) {
        showToast("Email is required.");
        return null;
      }
      if (!type) {
        showToast("Please select a vehicle.");
        return null;
      }
      if (!pickup) {
        showToast("Pickup date is required.");
        return null;
      }
      return {
        name,
        email,
        phone: $("veh-phone")?.value.trim() || "—",
        type,
        pickup,
        ret: $("veh-return")?.value || "",
        location: $("veh-location")?.value.trim() || "—",
        rate: $("veh-rate")?.value || "0",
        notes: $("veh-notes")?.value.trim() || "",
        status: $("veh-status")?.value || "confirmed",
      };
    },
    cols: (r) => [
      `<strong>${r.name}</strong><br><span style="font-size:11px;color:#8a94a6">${r.email}</span>`,
      r.type,
      fmtDate(r.pickup),
      r.ret ? fmtDate(r.ret) : "—",
      fmtMoney(r.rate) + "/day",
      statusBadge(r.status),
    ],
  });

  /* ══════════════════════════════════════════════════════
     5. PRINTING SERVICES
  ══════════════════════════════════════════════════════ */
  buildSection({
    dbKey: "printing",
    formId: "printingForm",
    tbodyId: "prnt-tbody",
    searchId: "prnt-search",
    countId: "print-client-count",
    seed: [],
    fields: () => {
      const name = $("prnt-name")?.value.trim();
      const email = $("prnt-email")?.value.trim();
      const type = $("prnt-type")?.value;
      if (!name) {
        showToast("Client name is required.");
        return null;
      }
      if (!email) {
        showToast("Email is required.");
        return null;
      }
      if (!type) {
        showToast("Please select print type.");
        return null;
      }
      return {
        name,
        email,
        phone: $("prnt-phone")?.value.trim() || "—",
        type,
        qty: $("prnt-qty")?.value || "1",
        paper: $("prnt-paper")?.value || "Standard 80gsm",
        deadline: $("prnt-deadline")?.value || "",
        quote: $("prnt-quote")?.value || "0",
        notes: $("prnt-notes")?.value.trim() || "",
        status: $("prnt-status")?.value || "received",
      };
    },
    cols: (r) => [
      `<strong>${r.name}</strong><br><span style="font-size:11px;color:#8a94a6">${r.email}</span>`,
      r.type,
      (+r.qty).toLocaleString(),
      fmtMoney(r.quote),
      fmtDate(r.deadline),
      statusBadge(r.status),
    ],
  });
})();
