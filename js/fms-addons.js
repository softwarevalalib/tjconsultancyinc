/* ============================================================
   js/fms-addons.js — TJ Consultancy FMS
   Additive feature pack (does not touch existing modules):
     1. Contact helper used by invoice and client workflows
     2. Communication Note helper
     3. Print All Clients & Records: styled preview + window.print()
     4. Quick "Add to Invoice" tile on dashboard
     5. Quick "Add to Financial Management Advisory" tile on dashboard
     6. Staff permission access on Add Staff (Loan Officer dept + role)
     7. Loan Officer in every Department dropdown
     8. User-friendly dashboard greeting + Quick-Actions ribbon
     9. Create User shortcut surfaced on login page
    10. Configurable login background with a working default
    11. Admin reset any user password (uses existing FMSResetStaffPassword)
    12. White background: Add New Client Loan modal + Loan Report/Invoice
   ============================================================ */
(function () {
  'use strict';

  /* ─────────── shared helpers ─────────── */
  const $  = id => document.getElementById(id);
  const notesBC = ('BroadcastChannel' in window) ? new BroadcastChannel('fms_comm_notes') : null;
  function lsGet (k, f) { try { const v = localStorage.getItem(k); return v === null ? f : v; } catch (_) { return f; } }
  function lsSet (k, v) { try { localStorage.setItem(k, v); } catch (_) {} }
  function esc (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
  function toast (msg) {
    const t = $('toast'); if (!t) return;
    t.textContent = msg; t.classList.add('show');
    clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 3000);
  }
  const me = () => ({
    name: sessionStorage.getItem('fms_auth_user') || lsGet('fms_display_name', 'User'),
    role: sessionStorage.getItem('fms_auth_role') || 'admin',
    permissions: (function(){ try { return JSON.parse(sessionStorage.getItem('fms_auth_permissions') || '[]'); } catch(_) { return []; } })()
  });

  /* ============================================================
     1.  TEAM CHAT — clickable threads + responsive composer
         + 2. COMMUNICATION NOTE TO CLIENT (same modal)
     ============================================================ */
  const FMSChat = {
    NOTES_KEY: 'fms_comm_notes_v1',
    contactDirectory: {},
    init () {
      FMSChat.injectComposer();
      FMSChat.clickToOpen();
      FMSChat.renderNotesList();
      if (window.FMSDB) {
        FMSDB.on(d => {
          if (['staff', 'loans', 'research', 'assets', 'bizdev', 'vehicles', 'printing', '*'].indexOf(d.table) !== -1) {
            FMSChat.fillContacts();
          }
        });
      }
      // Keep the communication history current in every open FMS tab.
      window.addEventListener('storage', e => {
        if (e.key === FMSChat.NOTES_KEY) FMSChat.renderNotesList();
      });
      if (notesBC) notesBC.onmessage = () => FMSChat.renderNotesList();
      // Patch the existing chat-input markup to be responsive
      const row = document.querySelector('.chat-input-row');
      if (row) row.classList.add('fms-chat-row');
    },

    injectComposer () {
      const card = document.querySelector('#view-chat .chat-card');
      if (!card || $('fmsNoteComposer')) return;
      const block = document.createElement('div');
      block.className = 'fms-note-composer';
      block.id = 'fmsNoteComposer';
      block.innerHTML = `
        <div class="fms-message-center-head">
          <div>
            <span class="fms-message-center-label"><i class="fas fa-comments"></i> Communication centre</span>
            <h3>Start a conversation</h3>
          </div>
          <span class="fms-message-live"><i class="fas fa-circle"></i> Live for all users</span>
        </div>
        <div class="fms-note-panel">
          <div class="fms-contact-grid">
            <div class="fms-note-row">
              <label for="fmsContactName">To</label>
              <input type="text" id="fmsContactName" list="fmsContactNames" maxlength="120" placeholder="Team member, client, or organisation" autocomplete="off" />
              <datalist id="fmsContactNames"></datalist>
            </div>
            <div class="fms-note-row">
              <label for="fmsContactEmail">Email</label>
              <input type="email" id="fmsContactEmail" maxlength="160" placeholder="recipient@example.com" autocomplete="email" />
            </div>
            <div class="fms-note-row">
              <label for="fmsContactPhone">Mobile / WhatsApp number</label>
              <input type="tel" id="fmsContactPhone" maxlength="24" placeholder="e.g. +44 7700 900000" autocomplete="tel" />
            </div>
            <div class="fms-note-row">
              <label for="fmsNoteSubject">Conversation title</label>
              <input type="text" id="fmsNoteSubject" maxlength="120" placeholder="Optional topic" />
            </div>
          </div>
          <div class="fms-note-row">
            <label for="fmsNoteBody">Message</label>
            <textarea id="fmsNoteBody" rows="4" placeholder="Type a clear, friendly message…"></textarea>
          </div>
          <div class="fms-note-actions">
            <button class="btn-secondary" id="fmsNoteClearBtn"><i class="fas fa-times"></i> Clear</button>
            <button class="btn-primary" data-channel="chat"><i class="fas fa-comments"></i> Send to Team</button>
            <button class="btn-primary fms-send-email" data-channel="email"><i class="fas fa-envelope"></i> Email</button>
            <button class="btn-primary fms-send-sms" data-channel="sms"><i class="fas fa-sms"></i> SMS</button>
            <button class="btn-primary fms-send-whatsapp" data-channel="whatsapp"><i class="fab fa-whatsapp"></i> WhatsApp</button>
          </div>
        </div>
        <div class="fms-note-log" id="fmsNoteLog"><strong>Recent communication</strong><ul id="fmsNoteList"></ul></div>`;
      // Insert the composer above the chat messages layer
      const msgs = $('chatMessages');
      if (msgs && msgs.parentNode) msgs.parentNode.insertBefore(block, msgs);
      else card.appendChild(block);

      // Populate known contact details from every available FMS record.
      FMSChat.fillContacts();

      block.querySelectorAll('[data-channel]').forEach(btn => {
        btn.addEventListener('click', () => FMSChat.sendCommunication(btn.dataset.channel));
      });
      $('fmsNoteClearBtn').addEventListener('click', () => {
        $('fmsContactName').value = '';
        $('fmsContactEmail').value = '';
        $('fmsContactPhone').value = '';
        $('fmsNoteSubject').value = '';
        $('fmsNoteBody').value    = '';
      });
      $('fmsContactName').addEventListener('change', FMSChat.fillKnownContactDetails);
      $('fmsContactName').addEventListener('input', FMSChat.fillKnownContactDetails);
      $('fmsNoteBody').addEventListener('keydown', e => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          FMSChat.sendCommunication('chat');
        }
      });
    },

    fillContacts () {
      const list = $('fmsContactNames'); if (!list) return;
      const contacts = {};
      function add (name, email, phone) {
        const cleanName = String(name || '').trim();
        if (!cleanName) return;
        const key = cleanName.toLowerCase();
        const contact = contacts[key] || { name: cleanName, email: '', phone: '' };
        if (email && !contact.email) contact.email = String(email).trim();
        if (phone && !contact.phone) contact.phone = String(phone).trim();
        contacts[key] = contact;
      }
      function pull (table) {
        try {
          const records = (window.FMSDB && FMSDB.table(table, [])) || [];
          records.forEach(record => add(
            record.clientName || record.client || record.owner || record.company || record.name,
            record.email || record.contactEmail,
            record.phone || record.mobile || record.whatsapp || record.whatsappNumber
          ));
        } catch (_) {}
      }
      ['staff', 'loans', 'research', 'assets', 'bizdev', 'vehicles', 'printing'].forEach(pull);
      try {
        const accounts = JSON.parse(lsGet('fms_staff_accounts_v1', '[]'));
        if (Array.isArray(accounts)) accounts.forEach(account => add(account.name, account.email, account.phone));
      } catch (_) {}
      FMSChat.contactDirectory = contacts;
      list.innerHTML = Object.keys(contacts).map(key =>
        '<option value="' + esc(contacts[key].name) + '"></option>'
      ).join('');
    },

    /* Retained for the invoice quick action, which uses the same contact list. */
    fillClients () {
      const select = $('fmsMiniClient');
      if (!select) return;
      FMSChat.fillContacts();
      const contacts = Object.keys(FMSChat.contactDirectory)
        .map(key => FMSChat.contactDirectory[key])
        .sort((a, b) => a.name.localeCompare(b.name));
      select.innerHTML = '<option value="">— Select a client —</option>' +
        contacts.map(contact => '<option value="' + esc(contact.name) + '">' + esc(contact.name) + '</option>').join('');
    },

    fillKnownContactDetails () {
      const name = ($('fmsContactName') || {}).value || '';
      const contact = FMSChat.contactDirectory[String(name).trim().toLowerCase()];
      if (!contact) return;
      const email = $('fmsContactEmail');
      const phone = $('fmsContactPhone');
      if (email && !email.value) email.value = contact.email || '';
      if (phone && !phone.value) phone.value = contact.phone || '';
    },

    communicationFields () {
      return {
        recipient: String(($('fmsContactName') || {}).value || '').trim(),
        email: String(($('fmsContactEmail') || {}).value || '').trim(),
        phone: String(($('fmsContactPhone') || {}).value || '').trim(),
        subject: String(($('fmsNoteSubject') || {}).value || '').trim(),
        body: String(($('fmsNoteBody') || {}).value || '').trim()
      };
    },

    validateCommunication (channel, fields) {
      if (!fields.recipient) { toast('Enter a recipient name.'); return false; }
      if (!fields.body) { toast('Type a message.'); return false; }
      if (channel === 'email' && !/^\S+@\S+\.\S+$/.test(fields.email)) {
        toast('Enter a valid recipient email address.'); return false;
      }
      if (channel === 'sms' || channel === 'whatsapp') {
        const digits = fields.phone.replace(/\D/g, '');
        if (!/^[1-9]\d{7,14}$/.test(digits)) {
          toast('Enter a mobile number with its country code, e.g. +44 7700 900000.'); return false;
        }
      }
      return true;
    },

    communicationText (fields) {
      return (fields.subject ? fields.subject + '\n\n' : '') + fields.body;
    },

    recordCommunication (channel, fields) {
      let list = [];
      try { list = JSON.parse(lsGet(FMSChat.NOTES_KEY, '[]')); } catch (_) {}
      if (!Array.isArray(list)) list = [];
      list.unshift({
        id: 'comm-' + Date.now().toString(36),
        channel, recipient: fields.recipient, email: fields.email,
        phone: fields.phone, subject: fields.subject, body: fields.body,
        by: me().name, at: Date.now()
      });
      lsSet(FMSChat.NOTES_KEY, JSON.stringify(list.slice(0, 100)));
      if (notesBC) { try { notesBC.postMessage({ notes: true, at: Date.now() }); } catch (_) {} }
      FMSChat.renderNotesList();
    },

    postToChat () {
      /* Team Chat has been retired; no conversation data is created. */
      return false;
    },

    openExternalChannel (channel, fields) {
      const text = FMSChat.communicationText(fields);
      if (channel === 'email') {
        window.location.href = 'mailto:' + encodeURIComponent(fields.email) +
          '?subject=' + encodeURIComponent(fields.subject || 'Message from TJ Consultancy') +
          '&body=' + encodeURIComponent(fields.body);
        return;
      }
      const phone = fields.phone.replace(/\D/g, '');
      if (channel === 'sms') {
        window.location.href = 'sms:' + phone + '?body=' + encodeURIComponent(text);
        return;
      }
      const link = document.createElement('a');
      link.href = 'https://wa.me/' + phone + '?text=' + encodeURIComponent(text);
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
    },

    sendCommunication (channel) {
      const fields = FMSChat.communicationFields();
      if (!FMSChat.validateCommunication(channel, fields)) return;
      FMSChat.recordCommunication(channel, fields);
      if (channel === 'chat') FMSChat.postToChat(fields);
      else FMSChat.openExternalChannel(channel, fields);
      const labels = { chat: 'posted to Team Chat', email: 'opened in your email app', sms: 'opened in your SMS app', whatsapp: 'opened in WhatsApp' };
      toast('Message for ' + fields.recipient + ' ' + labels[channel] + '.');
    },

    renderNotesList () {
      const ul = $('fmsNoteList'); if (!ul) return;
      let list = [];
      try { list = JSON.parse(lsGet(FMSChat.NOTES_KEY, '[]')); } catch(_){ list = []; }
      const labels = { chat: 'Team Chat', email: 'Email', sms: 'SMS', whatsapp: 'WhatsApp' };
      ul.innerHTML = list.length
        ? list.slice(0, 12).map(n =>
            `<li><b>${esc(n.recipient || n.client)}</b> <span class="fms-channel-badge">${esc(labels[n.channel] || 'Note')}</span>${n.subject ? ' – ' + esc(n.subject) : ''}<br><span class="fms-note-mini">${esc(n.by)} · ${new Date(n.at).toLocaleString('en-GB')}</span></li>`
          ).join('')
        : '<li class="fms-note-empty">No communication sent yet.</li>';
    },

    clickToOpen () {
      // Delegate clicks on chat messages → open a simple thread popover
      const box = $('chatMessages');
      if (!box) return;
      box.addEventListener('click', e => {
        const msg = e.target.closest('.chat-msg');
        if (!msg) return;
        const txt = msg.querySelector('.chat-msg-text');
        if (!txt) return;
        const w = txt.textContent.trim();
        const note = prompt('Reply in thread to: "' + w.slice(0, 80) + '"…', '');
        if (note && note.trim()) {
          try {
            const chatKey = 'fms_team_chat_v1';
            const cur = JSON.parse(localStorage.getItem(chatKey) || '[]');
            cur.push({ id: 'msg-' + Date.now().toString(36), name: me().name, role: me().role,
                       text: '↪ Reply: ' + note.trim(), ts: Date.now(), threadOf: w.slice(0, 60) });
            localStorage.setItem(chatKey, JSON.stringify(cur.slice(-300)));
            toast('Reply posted to the chat thread.');
          } catch (_) {}
        }
      });
    }
  };

  /* ============================================================
     3.  PRINT ALL CLIENTS & RECORDS
         Renders the master client list into a dedicated print area
         and triggers window.print() under a print stylesheet.
     ============================================================ */
  const FMSClients = {
    printAll () {
      // Build the printable page
      const area = $('printArea'); if (!area) return;
      // Pull rows from the same source the table uses
      const rows = (function () {
        const out = [];
        const db  = window.FMSDB;
        const pull = (name, seed) => db ? db.table(name, seed) : [];
        pull('loans').forEach(l => out.push({
          client: l.clientName, dept: 'Financial Management',
          detail: 'Loan · $' + (+l.amount||0).toLocaleString() + ' @ ' + (l.rate||0) + '%', value: l.amount||0, status: 'active'
        }));
        pull('research').forEach(r => out.push({
          client: r.client, dept: 'Research & Consulting',
          detail: (r.project || r.type || '—'), value: +r.value||0, status: r.status||'ongoing'
        }));
        pull('assets').forEach(a => out.push({
          client: a.owner, dept: 'Asset Management',
          detail: a.name + ' · ' + (a.type||''), value: +a.value||0, status: a.status||'active'
        }));
        pull('bizdev').forEach(b => out.push({
          client: b.company, dept: 'Business Development',
          detail: (b.contact||'') + ' · ' + (b.stage||''), value: +b.value||0, status: b.stage||'lead'
        }));
        pull('vehicles').forEach(v => out.push({
          client: v.name, dept: 'Vehicle Hire',
          detail: v.type||'', value: +v.rate||0, status: v.status||'confirmed'
        }));
        pull('printing').forEach(p => out.push({
          client: p.name, dept: 'Printing',
          detail: p.type||'' + ' × ' + (p.qty||0), value: +p.quote||0, status: p.status||'received'
        }));
        return out;
      })();
      const total = rows.reduce(function (s, r) { return s + (+r.value || 0); }, 0);
      area.style.display = 'block';
      area.innerHTML = `
        <div class="fms-print-page">
          <div class="fms-print-head">
            <div>
              <h1>TJ Consultancy – All Clients &amp; Records</h1>
              <p>Generated: ${new Date().toLocaleString('en-GB')}</p>
            </div>
            <div class="fms-print-totals">
              <span>${rows.length} record${rows.length === 1 ? '' : 's'}</span>
              <strong>$${total.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
            </div>
          </div>
          <table class="fms-print-table">
            <thead><tr>
              <th>#</th><th>Client</th><th>Department</th><th>Details</th>
              <th class="num">Value (USD)</th><th>Status</th>
            </tr></thead>
            <tbody>
              ${rows.map(function (r, i) {
                return '<tr>' +
                  '<td>' + (i + 1) + '</td>' +
                  '<td><b>' + esc(r.client || '—') + '</b></td>' +
                  '<td>' + esc(r.dept) + '</td>' +
                  '<td>' + esc(r.detail || '—') + '</td>' +
                  '<td class="num">$' + (+r.value || 0).toLocaleString('en-US', { minimumFractionDigits: 2 }) + '</td>' +
                  '<td>' + esc(r.status) + '</td>' +
                '</tr>';
              }).join('')}
            </tbody>
          </table>
          <div class="fms-print-foot">TJ Consultancy Finance Management System · All Clients &amp; Records</div>
        </div>`;
      window.print();
      // Clean up after print dialog closes
      setTimeout(function () { area.style.display = 'none'; area.innerHTML = ''; }, 1200);
    }
  };

  /* ============================================================
     4, 5.  DASHBOARD QUICK-ACTIONS / FRIENDLY GREETING
            + Add-to-Invoice + Add-to-Financial-Advisory tiles
     ============================================================ */
  const FMSDashboard = {
    init () {
      FMSDashboard.injectGreeting();
      const quickActions = $('fmsQuickActions');
      if (quickActions) quickActions.remove();
    },

    injectGreeting () {
      const view = $('view-dashboard');
      if (!view) return;
      const u = me();
      const greet = (function () {
        const h = new Date().getHours();
        return h < 12 ? 'Good morning' : (h < 18 ? 'Good afternoon' : 'Good evening');
      })();
      const title = greet + ', ' + (u.name || 'there') + ' — here is your workspace';
      if ($('fmsGreeting')) return;
      const div = document.createElement('section');
      div.id = 'fmsGreeting';
      div.className = 'fms-greeting';
      div.innerHTML = `
        <div class="fms-greet-left">
          <span class="fms-greet-pill">${esc(u.role || 'admin').toUpperCase()}</span>
          <h2>${esc(title)}</h2>
        </div>`;
      view.insertBefore(div, view.firstChild);
    },

    injectQuickActions () {
      /* Quick actions live in Settings, not the Dashboard */
      const settingsView = document.getElementById('view-settings');
      if (!settingsView || $('fmsQuickActions')) return;
      const anchor = settingsView.querySelector('.settings-grid') || settingsView;
      const box = document.createElement('div');
      box.id = 'fmsQuickActions';
      box.className = 'fms-quick-actions';
      box.innerHTML = `
        <h3 style="margin: 0 0 10px; font-size: 1rem; font-weight: 600; display: flex; align-items: center; gap: 8px;">
          <i class="fas fa-bolt" style="color: var(--active-color, #4fc3f7);"></i> Quick Actions
        </h3>
        <div class="fms-qa-tile" data-act="invoice">
          <span class="fms-qa-icon"><i class="fas fa-file-invoice-dollar"></i></span>
          <div><b>Add to Invoice</b><span>Create / open an invoice for any client record.</span></div>
          <i class="fas fa-chevron-right fms-qa-arrow"></i>
        </div>
        <div class="fms-qa-tile" data-act="advisory">
          <span class="fms-qa-icon"><i class="fas fa-hand-holding-usd"></i></span>
          <div><b>Add to Financial Management Advisory</b><span>Open the Advisory loan form pre-filled.</span></div>
          <i class="fas fa-chevron-right fms-qa-arrow"></i>
        </div>
        <div class="fms-qa-tile" data-act="print-all">
          <span class="fms-qa-icon"><i class="fas fa-print"></i></span>
          <div><b>Print All Clients &amp; Records</b><span>Preview + print the master client list.</span></div>
          <i class="fas fa-chevron-right fms-qa-arrow"></i>
        </div>
        <div class="fms-qa-tile" data-act="reset-pw">
          <span class="fms-qa-icon"><i class="fas fa-key"></i></span>
          <div><b>Reset User Password</b><span>Admin only – reset any staff login.</span></div>
          <i class="fas fa-chevron-right fms-qa-arrow"></i>
        </div>`;
      anchor.insertBefore(box, anchor.firstChild);
      box.addEventListener('click', function (e) {
        const tile = e.target.closest('.fms-qa-tile');
        if (!tile) return;
        FMSActions.handle(tile.dataset.act);
      });
    }
  };

  /* ============================================================
     6, 11.  ACTION HANDLERS — Invoice / Advisory / PrintAll / Reset
              (Few tile click → action sub-flow)
     ============================================================ */
  const FMSActions = {
    handle (act) {
      if (act === 'invoice')        FMSActions.addToInvoice();
      else if (act === 'advisory')  FMSActions.addToAdvisory();
      else if (act === 'print-all') FMSClients.printAll();
      else if (act === 'reset-pw')  FMSActions.resetAnyPassword();
    },

    /* Show a tiny modal that lets you pick a client + amount then opens invoice */
    addToInvoice () {
      const html = `
        <div class="fms-mini-overlay" id="fmsMiniOverlay">
          <div class="fms-mini-modal">
            <div class="fms-mini-head"><i class="fas fa-file-invoice-dollar"></i><b>Add to Invoice</b>
              <button class="fms-mini-x" id="fmsMiniX" aria-label="Close">&times;</button></div>
            <div class="fms-mini-body">
              <div class="form-group"><label class="form-label">Client</label>
                <select class="form-input" id="fmsMiniClient"></select></div>
              <div class="form-group"><label class="form-label">Description</label>
                <input class="form-input" id="fmsMiniDesc" placeholder="Consulting fee / Service charge…" /></div>
              <div class="form-row-2">
                <div class="form-group"><label class="form-label">Amount (USD)</label>
                  <input class="form-input" id="fmsMiniAmt" type="number" min="0" step="0.01" placeholder="0.00" /></div>
                <div class="form-group"><label class="form-label">Status</label>
                  <select class="form-input" id="fmsMiniStatus"><option value="pending">Pending</option>
                  <option value="paid">Paid</option><option value="overdue">Overdue</option></select></div>
              </div>
            </div>
            <div class="fms-mini-foot">
              <button class="btn-secondary" id="fmsMiniCancel">Cancel</button>
              <button class="btn-primary"   id="fmsMiniCreate">Create Invoice</button>
            </div>
          </div>
        </div>`;
      FMSActions.openMini(html, function () {
        FMSChat.fillClients();
        const sel = $('fmsMiniClient');
        if (sel && sel.options.length < 2) FMSChat.fillClients.call(FMSChat);
      });
      $('fmsMiniCancel').addEventListener('click', FMSActions.closeMini);
      $('fmsMiniCreate').addEventListener('click', function () {
        const client   = ($('fmsMiniClient')  || {}).value || '';
        const desc     = ($('fmsMiniDesc')    || {}).value || 'Consulting fee';
        const amount   = +($('fmsMiniAmt')    || {}).value || 0;
        const status   = ($('fmsMiniStatus')  || {}).value || 'pending';
        if (!client) { toast('Pick a client.'); return; }
        if (!(amount > 0)) { toast('Enter an amount.'); return; }
        const iv = (window.FMS && FMS.data && FMS.data.invoices) || [];
        const today = new Date(); const due = new Date(); due.setDate(due.getDate() + 30);
        iv.unshift({
          id: 'INV-' + Date.now().toString(36).slice(-6).toUpperCase(),
          client, description: desc, amount, status,
          issueDate: today.toISOString().slice(0,10),
          dueDate:   due.toISOString().slice(0,10)
        });
        try { if (window.FMSDB) FMSDB.set('invoices', iv); } catch(_){}
        FMSActions.closeMini();
        toast('Invoice created. Open Reports → Invoices to view, print, or download.');
      });
    },

    addToAdvisory () {
      // Open the existing Add New Client Loan modal pre-filled with today's date.
      const ids = ['modal-loan-client','modal-loan-date','modal-loan-amount','modal-loan-rate','modal-loan-duration','modal-loan-client','modal-loan-amount','modal-loan-rate','modal-loan-duration'];
      // First switch the dashboard tab & panel to Financial Management > Loan Entry
      const finTab = document.querySelector('.svc-tab[data-svc="financial"]');
      if (finTab) finTab.click();
      const dsTab = document.querySelector('.loan-subtab[data-loan-tab="entry"]');
      if (dsTab) dsTab.click();
      setTimeout(function () {
        const btn = $('addClientSheetBtn');
        if (btn) btn.click();
        else if (typeof window.openAddLoanModal === 'function') window.openAddLoanModal();
        toast('Financial Management Advisory form opened.');
      }, 60);
    },

    resetAnyPassword () {
      if (me().role !== 'admin') {
        toast('Only the admin can reset a user password.');
        return;
      }
      let accounts = [];
      try { accounts = JSON.parse(localStorage.getItem('fms_staff_accounts_v1') || '[]'); } catch(_){}
      if (!accounts.length) { toast('No staff accounts to reset yet.'); return; }
      const html = `
        <div class="fms-mini-overlay" id="fmsMiniOverlay">
          <div class="fms-mini-modal">
            <div class="fms-mini-head"><i class="fas fa-key"></i><b>Reset User Password</b>
              <button class="fms-mini-x" id="fmsMiniX" aria-label="Close">&times;</button></div>
            <div class="fms-mini-body">
              <div class="form-group"><label class="form-label">Staff account</label>
                <select class="form-input" id="fmsResetUser">${accounts.map(a => '<option value="' + esc(a.username) + '">' + esc(a.name) + ' (@' + esc(a.username) + ')</option>').join('')}</select></div>
              <div class="form-group"><label class="form-label">New password</label>
                <input class="form-input" id="fmsResetPw" type="password" placeholder="Minimum 6 characters" autocomplete="new-password" /></div>
            </div>
            <div class="fms-mini-foot">
              <button class="btn-secondary" id="fmsMiniCancel">Cancel</button>
              <button class="btn-primary"   id="fmsMiniSave">Save new password</button>
            </div>
          </div>
        </div>`;
      FMSActions.openMini(html);
      $('fmsMiniCancel').addEventListener('click', FMSActions.closeMini);
      $('fmsMiniSave').addEventListener('click', function () {
        const u = ($('fmsResetUser') || {}).value || '';
        const np = ($('fmsResetPw')    || {}).value || '';
        if (u && np.length >= 6 && window.FMSResetStaffPassword) {
          window.FMSResetStaffPassword(u, np).then(function (ok) {
            FMSActions.closeMini();
            toast(ok ? 'Password updated for ' + u + '.' : 'Could not reset. Account not found.');
          });
        } else {
          toast('Password must be at least 6 characters.');
        }
      });
    },

    openMini (html, after) {
      const existing = $('fmsMiniOverlay');
      if (existing) existing.remove();
      const div = document.createElement('div'); div.innerHTML = html;
      document.body.appendChild(div.firstChild);
      const x = $('fmsMiniX'); if (x) x.addEventListener('click', FMSActions.closeMini);
      const ov = $('fmsMiniOverlay');
      if (ov) ov.addEventListener('click', function (e) { if (e.target === ov) FMSActions.closeMini(); });
      if (typeof after === 'function') after();
    },
    closeMini () { const o = $('fmsMiniOverlay'); if (o) o.remove(); }
  };

  /* ============================================================
     10. CONFIGURABLE LOGIN BACKGROUND + working default
     ============================================================ */
  const FMSLoginBg = {
    KEY: 'fms_login_bg',
    IMAGE_KEY: 'fms_login_bg_image',
    MAX_IMAGE_BYTES: 2 * 1024 * 1024,
    PRESETS: [
      { id: 'default', label: 'TJ Navy (default)',
        css: 'linear-gradient(145deg,#060e1a 0%,#0d1b2e 50%,#0a2340 100%)' },
      { id: 'soft',    label: 'Soft Cloud',
        css: 'linear-gradient(145deg,#e0e7ff 0%,#c7d2fe 55%,#a5b4fc 100%)' },
      { id: 'sky',     label: 'Open Sky',
        css: 'linear-gradient(160deg,#7dd3fc 0%,#38bdf8 50%,#0ea5e9 100%)' },
      { id: 'dusk',    label: 'Warm Dusk',
        css: 'linear-gradient(145deg,#1e1b4b 0%,#312e81 45%,#7c3aed 100%)' }
    ],
    init () {
      const card   = $('loginCard');
      const bgWrap = document.querySelector('.login-bg');
      if (!card || !bgWrap) return;
      if ($('fmsBgPicker')) return;

      const btn = document.createElement('button');
      btn.id = 'fmsBgPicker';
      btn.className = 'fms-bg-picker-btn';
      btn.type = 'button';
      btn.title = 'Change login background';
      btn.innerHTML = '<i class="fas fa-palette"></i>';
      card.appendChild(btn);

      const panel = document.createElement('div');
      panel.id = 'fmsBgPickerPanel';
      panel.className = 'fms-bg-picker-panel';
      panel.innerHTML = `
        <div class="fms-bg-picker-head">
          <b>Login background</b>
          <button class="fms-bg-close" id="fmsBgClose" aria-label="Close">&times;</button>
        </div>
        <p class="fms-bg-picker-help">A default background is always applied. Pick one below — the change takes effect immediately and is remembered on this device.</p>
        <div class="fms-bg-grid">
          ${FMSLoginBg.PRESETS.map(function (p) {
            return '<button type="button" class="fms-bg-swatch" data-id="' + p.id + '" style="background:' + p.css + '">' +
                   '<span>' + esc(p.label) + '</span></button>';
          }).join('')}
        </div>
        <div class="fms-bg-upload">
          <span class="fms-bg-upload-label">Or use your own image</span>
          <label class="fms-bg-upload-button" for="fmsBgImageInput"><i class="fas fa-image"></i> Choose image</label>
          <input id="fmsBgImageInput" type="file" accept="image/*" />
          <p class="fms-bg-upload-help">PNG, JPG, WebP, or GIF · max 2 MB · saved on this device until you replace or reset it.</p>
          <div class="fms-bg-image-preview" id="fmsBgImagePreview" hidden>
            <img id="fmsBgImagePreviewImg" alt="Selected login background preview" />
            <span>Custom image in use</span>
          </div>
        </div>
        <div class="fms-bg-foot">
          <button class="fms-bg-reset" id="fmsBgReset" type="button"><i class="fas fa-undo"></i> Reset to default</button>
        </div>`;
      card.appendChild(panel);

      btn.addEventListener('click', function () {
        panel.classList.toggle('open');
      });
      $('fmsBgClose').addEventListener('click', function () { panel.classList.remove('open'); });
      panel.querySelectorAll('.fms-bg-swatch').forEach(function (sw) {
        sw.addEventListener('click', function () {
          FMSLoginBg.usePreset(sw.dataset.id);
          toast('Login background updated.');
        });
      });
      const imageInput = $('fmsBgImageInput');
      if (imageInput) {
        imageInput.addEventListener('change', function () {
          const file = imageInput.files && imageInput.files[0];
          if (file) FMSLoginBg.useImage(file);
          imageInput.value = '';
        });
      }
      $('fmsBgReset').addEventListener('click', function () {
        FMSLoginBg.reset();
        toast('Default login background restored.');
      });

      // Apply and save a real default on first use. This also repairs a
      // partially saved custom choice (for example, if browser storage was
      // cleared while an old tab was still open).
      const imageUrl = FMSLoginBg.savedImage();
      let stored = lsGet(FMSLoginBg.KEY, 'default');
      const isPreset = FMSLoginBg.PRESETS.some(function (p) { return p.id === stored; });
      if ((stored === 'custom' && !imageUrl) || (stored !== 'custom' && !isPreset)) {
        stored = 'default';
      }
      lsSet(FMSLoginBg.KEY, stored);
      FMSLoginBg.apply(stored, imageUrl);
      FMSLoginBg.updatePreview(stored === 'custom' ? imageUrl : '');
    },
    savedImage () {
      return lsGet(FMSLoginBg.IMAGE_KEY, '');
    },
    updatePreview (imageUrl) {
      const preview = $('fmsBgImagePreview');
      const image = $('fmsBgImagePreviewImg');
      if (image) image.src = imageUrl || '';
      if (preview) preview.hidden = !imageUrl;
    },
    apply (id, imageUrl) {
      const preset = FMSLoginBg.PRESETS.find(function (p) { return p.id === id; }) || FMSLoginBg.PRESETS[0];
      const bgWrap = document.querySelector('.login-bg');
      if (!bgWrap) return;

      if (id === 'custom' && imageUrl) {
        /* Keep a subtle dark layer over a photo so the sign-in card remains
           readable regardless of the image chosen. */
        bgWrap.style.background = 'linear-gradient(rgba(6,14,26,.58),rgba(13,27,46,.72)),url("' + imageUrl + '") center/cover no-repeat fixed';
        bgWrap.dataset.fmsLoginBackground = 'custom';
      } else {
        bgWrap.style.background = preset.css;
        delete bgWrap.dataset.fmsLoginBackground;
      }
      bgWrap.style.backgroundSize = 'cover';
      bgWrap.style.backgroundAttachment = 'fixed';
      // Hide animated orbs behind any selected image or non-default preset.
      const orbs = document.querySelectorAll('.bg-shape');
      orbs.forEach(function (o) { o.style.display = (id === 'default' ? '' : 'none'); });
    },
    usePreset (id) {
      const preset = FMSLoginBg.PRESETS.find(function (p) { return p.id === id; }) || FMSLoginBg.PRESETS[0];
      try { localStorage.removeItem(FMSLoginBg.IMAGE_KEY); } catch (_) {}
      lsSet(FMSLoginBg.KEY, preset.id);
      FMSLoginBg.apply(preset.id, '');
      FMSLoginBg.updatePreview('');
    },
    useImage (file) {
      if (!file || !/^image\//i.test(file.type)) {
        toast('Please choose an image file.');
        return;
      }
      if (file.size > FMSLoginBg.MAX_IMAGE_BYTES) {
        toast('Login background image is too large. Maximum size is 2 MB.');
        return;
      }
      const reader = new FileReader();
      reader.onerror = function () { toast('The selected image could not be read.'); };
      reader.onload = function () {
        const imageUrl = String(reader.result || '');
        if (!imageUrl) {
          toast('The selected image could not be read.');
          return;
        }
        try {
          localStorage.setItem(FMSLoginBg.IMAGE_KEY, imageUrl);
          localStorage.setItem(FMSLoginBg.KEY, 'custom');
        } catch (_) {
          toast('The image was applied, but this browser could not save it permanently. Try a smaller image.');
          FMSLoginBg.apply('custom', imageUrl);
          return;
        }
        FMSLoginBg.apply('custom', imageUrl);
        FMSLoginBg.updatePreview(imageUrl);
        toast('Login background image updated and saved.');
      };
      reader.readAsDataURL(file);
    },
    reset () {
      try { localStorage.removeItem(FMSLoginBg.IMAGE_KEY); } catch (_) {}
      lsSet(FMSLoginBg.KEY, 'default');
      FMSLoginBg.apply('default', '');
      FMSLoginBg.updatePreview('');
    }
  };

  /* ============================================================
     BOOT — initialise on the page that matches
     ============================================================ */
  document.addEventListener('DOMContentLoaded', function () {
    if ($('view-dashboard')) {
      FMSDashboard.init();
    }
    /* Wire "Print" button on All Clients & Records view */
    const printAllBtn = document.getElementById('fmsPrintAllClientsBtn');
    if (printAllBtn) {
      printAllBtn.addEventListener('click', function (e) {
        e.preventDefault();
        document.body.classList.add('printing-clients');
        FMSClients.printAll();
        setTimeout(function () { document.body.classList.remove('printing-clients'); }, 1500);
      });
    }
    if ($('loginCard')) {
      FMSLoginBg.init();
      /* A setting changed in another open FMS tab is reflected immediately. */
      window.addEventListener('storage', function (event) {
        if (event.key !== FMSLoginBg.KEY && event.key !== FMSLoginBg.IMAGE_KEY) return;
        const selected = lsGet(FMSLoginBg.KEY, 'default');
        const imageUrl = FMSLoginBg.savedImage();
        FMSLoginBg.apply(selected, imageUrl);
        FMSLoginBg.updatePreview(imageUrl);
      });
    }
  });
})();
