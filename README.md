# TJ Consultancy – Finance Management System (FMS) Dashboard

## Project Overview
A fully responsive, pixel-perfect Finance Management System dashboard for **TJ Consultancy**, built with vanilla HTML5, CSS3, and JavaScript. Features a fixed navy blue sidebar, animated status indicator, interactive charts, and full CRUD modals for staff and activities. The Financial Management service includes a complete flat-rate loan engine with data sheet, monthly repayment schedules, per-client report modal, and a **Microsoft-style printable Invoice**. The topbar hosts an admin user panel dropdown and a direct link to the TJ Consultancy website. The system is protected by a branded **sign-in page** with SHA-256 credential hashing and sessionStorage token-based auth guards.

---

## ✅ Completed Features

### Layout & Alignment
- **Pixel-perfect alignment** – all grid/flex containers use `minmax(0, 1fr)` to prevent overflow
- **Fixed navy blue sidebar** (`#0d1b2e`) – never moves, always visible on desktop
- **Green pulsing "System Online" indicator** – permanently fixed inside the sidebar header
- **Sticky topbar** – stays at the top of the scroll area
- **100% responsive** at all zoom levels (desktop, tablet, mobile)

### Topbar (Right Side — updated in Request 7)
- **Notifications bell** with unread badge
- **"Our Website" button** — blue gradient link to `https://tjconsultancy.com` (opens in new tab), globe icon + label on desktop, icon-only on mobile
- **Admin User pill trigger** — pill-shaped button showing: TJ avatar circle, "Admin User" name, "Finance Manager" role, down-chevron; replaces the old plain "TJ" circle; **search button removed**
- **Admin Panel dropdown popup** — drops down from topbar trigger (was slide-up from sidebar footer); contains: profile photo upload zone, Edit Profile, Settings, Upload Logo, Upload Background, Sign Out

### Sidebar (Navy Blue – Fixed)
- Brand logo & company name
- Green animated pulse status dot ("System Online") – fixed in sidebar, non-moving
- Navigation: **Dashboard · Reports · Activities · Staff · Settings** (5 links only)
- Collapsed to 68px icon-only mode on desktop toggle
- Mobile: slides in as full drawer with dark overlay + hamburger button
- **Simplified footer info display** — shows TJ avatar + Admin User / Finance Manager (non-clickable; admin actions moved to topbar)

### Dashboard View
- **Services Block** (top of dashboard, above KPIs):
  - Tab interface with 5 services: Financial Management · Asset Management · Business Development · Vehicle Hire · Printing
  - Each tab has a coloured icon chip, label, and live client count badge
  - Active tab highlighted with colour-coded border & background
  - Smooth fade-in animation on panel switch
  - Fully responsive: stacks vertically on tablet; icon-only tabs on mobile
- **Section divider label** ("Financial Metrics & Overview") separates services from financial metrics
- **4 KPI cards** – Total Revenue, Net Profit, Expenses, Active Clients (animated count-up on load)
- **Revenue Overview** line chart (Chart.js v4, with month filter)
- **Expense Breakdown** doughnut chart (Chart.js v4)
- **Recent Transactions** table (last 6 rows with status badges)
- **Quick Stats** sidebar panel

### Financial Management — Loan Engine (Request 6)

The Financial Management service panel is fully replaced with a dedicated loan management system powered by `js/loan-engine.js`:

#### Sub-tab 1: Loan Entry
| Field | Type | Notes |
|---|---|---|
| # (Number) | auto-increment | Set automatically |
| Client Name | text input | Required |
| Loan Start Date | date input | Required; defaults to today |
| Loan Amount (USD) | number input | Required; > 0 |
| Flat Rate (% p.a.) | number input | Required; > 0 |
| Duration (months) | number input | Required; min 1 |
| Interest Amount (USD) | **read-only auto** | = Amount × (Rate/100) × (Duration/12) |
| Total Repayment (USD) | **read-only auto** | = Amount + Interest |
| Monthly Principal (USD) | **read-only auto** | = Amount / Duration |
| Monthly Interest (USD) | **read-only auto** | = Interest / Duration |

- Auto-calculated fields update live as you type (no submit needed)
- **Loan Records** table shows all loans with status badges (Active / Overdue / Settled)
- Each row has a **Report** button and an **Invoice** button to open the per-client modal or invoice
- **Export CSV** for the entry table
- Search/filter by client name

#### Sub-tab 2: Data Sheet
- Full 10-column summary table for all loan records
- Columns: #, Client Name, Date, Loan Amount, Flat Rate, Duration, Interest Amount, Total Repayment, Monthly Principal, Monthly Interest, **Invoice** (action button)
- Auto-calculated columns highlighted in a distinct background
- **Totals footer row** — sums of Loan Amount, Interest, Total Repayment
- Filter by client name; **Export CSV**

#### Sub-tab 3: Monthly Schedule
- Client selector dropdown (all loans listed)
- On client selection:
  - **Client banner** — shows Client Name, Loan Amount, Interest Amount, Total Repayment, Duration, Payments progress
  - **Progress bar** — visual % repaid (gradient blue → green)
  - **Amortisation schedule table** — one row per month:
    | Column | Notes |
    |---|---|
    | Payment # | 1-based |
    | Due Date | Start date + n months |
    | Principal Payment | Loan Amount ÷ Duration (last payment adjusted for rounding) |
    | Interest Payment | Interest Amount ÷ Duration |
    | Total Payment | Principal + Interest |
    | Status | **Paid** (green) / **Pending** (amber) / **Overdue** (red) |
    | Loan Balance | Running balance after payment |
  - **Mark Paid** button on each Pending/Overdue row — updates status instantly across all views
  - **Totals footer row**
  - **Export CSV** / **Print** for the selected client

#### Per-client Report Modal
- Opens from the **Report** button in Loan Entry or Data Sheet
- Shows full client loan summary stats: Loan Amount, Flat Rate, Duration, Interest Amount, Total Repayment, Amount Paid So Far, Paid/Pending/Overdue counts, Completion %
- Full payment schedule table (same structure as Monthly Schedule)
- **Print** button and **Invoice** button (opens the invoice modal for this client)

#### Invoice Feature (Microsoft-style — `js/invoice.js`)
- Opens as a full-screen modal overlay with a clean toolbar
- **Invoice document** contains:
  - **Header band** — dark blue gradient with company logo (from Settings), institution name, address, and large "INVOICE" title
  - **Invoice number** — auto-generated sequential number (e.g. INV-00001), persisted in localStorage
  - **Meta row** — Invoice Date, Loan Start Date, Reference (Loan #), Status badge
  - **Bill-To / Issued-By** — client name and institution name + location
  - **Line items table** — two rows: Principal Loan Amount and Interest Charge
  - **Totals section** — Subtotal, Interest, **TOTAL PAYMENT DUE** (bold grand total)
  - **Three summary boxes** — Principal Amount · Interest Amount · Total Payment (colour-coded with icons)
  - **Payment Terms** — monthly instalment amount and duration note
  - **Two signature blocks** — President / Authorised Signatory + Client signature line with date
  - **Footer band** — institution name, location, invoice number
- **Print Invoice** button — opens a dedicated print window with clean `@media print` styles; no dashboard chrome appears in print output
- **Invoice** button accessible from:
  1. Loan Entry table → each row
  2. Data Sheet table → each row
  3. Per-client Report Modal → toolbar button
  4. Auto-triggered after new client registration (report modal opens first; Invoice button visible)

### Settings — Institution Details Card
- New card in Settings view: **Institution Details** (used in Invoices)
- Fields:
  - **Institution Name** — displayed in invoice header, bill-from, and footer
  - **Location / Address** — shown under company name
  - **President / Authorised Signatory** — displayed in the signature block
- All values saved to `localStorage` and loaded back on page refresh
- Changes take effect immediately on the next invoice opened
- Closes on × button, backdrop click, or Escape key

#### Loan Status Logic
| Status | Condition |
|---|---|
| **Paid** (green) | Payment manually marked as paid via "Mark Paid" button |
| **Pending** (amber) | Due date is in the future AND not marked paid |
| **Overdue** (red) | Due date is in the past AND not marked paid |
| **Settled** (entry table) | All payments are Paid |

#### Seed Data (5 loans pre-loaded)
| Client | Date | Amount | Rate | Duration |
|---|---|---|---|---|
| Apex Ltd | 2023-06-01 | $50,000 | 12% | 24 mo |
| Zenith Corp | 2023-09-15 | $30,000 | 10% | 12 mo |
| BrightPath Ltd | 2024-01-01 | $75,000 | 15% | 36 mo |
| Summit Group | 2024-04-01 | $20,000 | 8% | 18 mo |
| Horizon Finance | 2024-07-01 | $100,000 | 11% | 48 mo |

---

### Other Services (Asset Mgmt, Business Dev, Vehicle Hire, Printing)
- Each uses the generic `buildSection()` factory (`js/sections.js`) — form submit, live search, delete rows, count badges
- 3 seed records per service
- Tab count badges auto-sync with list counts via MutationObserver

### Reports View
- Monthly bar chart with date range filter
- Full transactions table with search + pagination (8 per page)
- **Invoices section** – 12 sample invoices with search/status filter
  - Checkbox multi-select
  - **Download Invoice** button – CSV export via Blob API (active only when rows selected)
  - **Print Invoice** button – formatted print layout via `#printArea` + `window.print()` + `@media print` CSS

### Activities View
- Kanban-style board: To Do · In Progress · Done
- Add/move tasks via modal
- Activity log timeline

### Staff View
- Staff cards grid with roles and avatars
- Add/edit/delete staff modal

### Admin Panel (Topbar Dropdown — updated in Request 7)
- **Trigger** — pill button in topbar right (TJ avatar + Admin User + Finance Manager + chevron)
- **Profile Photo Upload Zone** — 52px avatar with camera overlay; drag-and-drop or click
- **Edit Profile form** — inline form to update display name and role/title (syncs topbar + sidebar footer)
- **Settings / Upload Logo / Upload Background** shortcuts
- **Sign Out** — confirmation banner → clears `fms_auth_token` from sessionStorage → redirects to `login.html`
- `window.fmsSwitchView` exposed globally for cross-module navigation

### Sign-In Page (`login.html` — Requests 8–12)
- **TJ Consultancy branding** — animated building logo, brand name, "Finance Management System" subtitle
- **Welcome Back** heading + helper message
- **Username field** — with user icon, presence validation
- **Password field** — with lock icon, show/hide eye toggle button, presence validation
- **Sign In button** — blue gradient, hover shine effect, loading spinner during auth
- **Backend auth** — delegates to `AuthAPI.login()` which calls the D1 Table REST API; uses PBKDF2-SHA-256 (310,000 iterations) server-side password verification
- **sessionStorage auth token** — 256-bit cryptographically random token written on success; session record created in `fms_sessions` DB table
- **Auth guard on `index.html`** — inline `<script>` at top of `<head>` redirects to `login.html` if token missing; plus async deep-verify via `AuthAPI.enforceAuth()` after page load
- **First-run helper** — error banner links to `setup.html` if API is unreachable on first deploy
- **Footer** — "Powered by **Software Vala Liberia**"
- **Animated background** — 3 floating radial gradient blobs, glassmorphism card with backdrop-filter blur
- **Console diagnostic** — `window.fmsAuthDiag()` checks AuthAPI availability and API reachability
- **"Visit our website" pill link** (`#loginWebsiteLink`) — reads `fms_website_url` from localStorage; defaults to `https://tjconsultancy.com`

#### Default Credentials (admin / admin123)
| Field | Value | SHA-256 Hash |
|---|---|---|
| Username | `admin` | `8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918` |
| Password | `admin123` | `240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a` |

#### Credential Version Gate (`CRED_VERSION = 'v2_admin123'` — Request 12)
Added to `js/login.js` **on every page load**, before any hash comparison:
1. If `localStorage.getItem('fms_cred_version') !== 'v2_admin123'`, **unconditionally** removes `fms_cred_uh` and `fms_cred_ph`, then writes `fms_cred_version = 'v2_admin123'`.
2. Belt-and-suspenders secondary check clears both keys if either cached hash diverges from the new defaults (even if the version already matches).
3. **Guarantees** any browser that ever cached credentials from a different password (`TJConsult@2024`, or a console-set value) is silently reset — the baked-in `admin`/`admin123` defaults take immediate effect without any manual intervention.

login.js console output:
```
[FMS Login] Credential cache reset → version v2_admin123   (first visit after any version change)
```
After reset, subsequent loads are silent (version already matches, no stale hashes present).

### Secure Backend System (`js/auth-api.js` + D1 Tables — Request 9)

#### Architecture
The FMS now uses a **real database-backed authentication system** built on Cloudflare D1 (SQLite via the Table REST API). All authentication and session management happens server-side via `js/auth-api.js`, which is exposed as `window.AuthAPI`.

#### Database Tables

| Table | Purpose | Key Fields |
|---|---|---|
| `fms_users` | User accounts | username_hash, password_hash, salt, role, is_active, failed_attempts, locked_until |
| `fms_sessions` | Active sessions | user_id, token_hash, expires_at, is_revoked, ip_address |
| `fms_audit_log` | Immutable event log | action, user_id, severity, ip_address, details |
| `fms_security_settings` | Configurable policies | setting_key, setting_value, default_value, data_type, category |

#### Security Features

| Feature | Implementation |
|---|---|
| **Password hashing** | PBKDF2-SHA-256, 310,000 iterations (OWASP recommended minimum), per-user random 16-byte salt |
| **Username hashing** | SHA-256 digest — plaintext username never stored in DB |
| **Session tokens** | 256-bit cryptographically random (`crypto.getRandomValues(32 bytes)`) — only SHA-256 hash stored in DB |
| **Token verification** | `GET tables/fms_sessions` — checks hash match + expiry + revocation status |
| **Rate limiting** | Per-browser counter in `localStorage`; window/max configurable via `fms_security_settings` |
| **Account lockout** | Locks after N failed attempts; duration configurable; auto-resets on success |
| **Constant-time compare** | `safeCompare()` XOR loop prevents timing attacks on hex digest comparison |
| **Single-session policy** | `allow_multiple_sessions=false` revokes prior sessions on new login |
| **Audit logging** | Every auth event (login, logout, lockout, password change, settings change) written to `fms_audit_log` |
| **Session expiry** | Configurable via `session_duration_hours` (default 8 h) |
| **Graceful offline** | Network failure during token verify fails open (short grace period) to prevent lockouts during blips |

#### Security Settings (configurable from Settings view)

| Key | Default | Type | Description |
|---|---|---|---|
| `max_login_attempts` | 5 | integer | Consecutive failures before lockout |
| `lockout_duration_minutes` | 30 | integer | Minutes account stays locked |
| `session_duration_hours` | 8 | integer | Hours before session expires |
| `rate_limit_window_seconds` | 60 | integer | Time window for IP rate limiting |
| `rate_limit_max_requests` | 10 | integer | Max attempts per IP in window |
| `min_password_length` | 8 | integer | Minimum characters required |
| `require_uppercase` | true | boolean | Password must have A–Z |
| `require_number` | true | boolean | Password must have 0–9 |
| `require_special_char` | true | boolean | Password must have !@#$ etc. |
| `audit_log_retention_days` | 90 | integer | Days before old entries pruned |
| `allow_multiple_sessions` | false | boolean | False = new login revokes old sessions |
| `ip_allowlist_enabled` | false | boolean | Only listed IPs may log in |
| `ip_allowlist` | [] | json | Array of allowed IPs / CIDR |
| `enforce_https` | true | boolean | Reject non-HTTPS origin logins |

#### `window.AuthAPI` Public Interface

```javascript
AuthAPI.login(username, password)        → Promise<{success, token?, user?, error?}>
AuthAPI.logout()                         → Promise<{success}>
AuthAPI.verifyToken(rawToken)            → Promise<{valid, user?, reason?}>
AuthAPI.enforceAuth(redirectUrl?)        → Promise<boolean>  // guard helper
AuthAPI.isSessionPresent()               → boolean           // quick sync check
AuthAPI.getCurrentSession()              → {token, userId, sessionId, userName}
AuthAPI.changePassword(current, newPw)   → Promise<{success, error?}>
AuthAPI.getSecuritySettings()            → Promise<setting[]>
AuthAPI.updateSecuritySetting(key, val)  → Promise<result>
AuthAPI.getAuditLog(limit?, page?)       → Promise<{data, total, ...}>
AuthAPI.listUsers(limit?)                → Promise<user[]>
AuthAPI.toggleUserActive(userId, bool)   → Promise<result>
AuthAPI.unlockUser(userId)               → Promise<result>
```

#### Setup Wizard (`setup.html`)
A one-time browser-based setup page:
- **Step 1** — Creates the initial admin user: enters credentials, PBKDF2-hashes them in-browser, POSTs to `tables/fms_users`
- **Step 2** — Seeds all 14 security policy settings to `fms_security_settings` (PUT if exists, POST if new)
- **Step 3** — Reads back both tables to verify data was written correctly
- ⚠️ **Restrict or delete after use** — setup.html creates admin accounts with no auth gate

#### First-Run Procedure (after Hosted Deploy)
1. Navigate to `https://your-domain/setup.html`
2. Complete all 3 steps (default credentials: `admin` / `admin123`)
3. Click "Go to Login" → sign in with `admin` / `admin123`
4. **Change the default password immediately** via Settings → Change Password
5. Optionally delete or block `setup.html` via access rules

#### Settings View — New Panels
- **Change Password** card — current + new + confirm password; enforces live policy (min length, uppercase, number, special char)
- **Security Policy Settings** card — live read/write of all 14 `fms_security_settings` rows; grouped by category; shows default value; highlights changed values in amber
- **Audit Log** card — paginated table of all `fms_audit_log` events; colour-coded by action and severity; auto-refreshable

### Settings View
- General settings, notifications, security cards
- **Branding & Appearance** card:
  - Logo upload → replaces sidebar icon (FileReader API)
  - Background upload → full-page overlay with opacity & blur sliders

---

## 📁 File Structure

```
login.html              — Sign-in page (auth gate; entry point for all users)
setup.html              — One-time backend setup wizard (create admin, seed settings)
index.html              — Single-page app shell (all views; protected by auth guard)
css/
  login.css             — Sign-in page styles: glassmorphism card, animated blobs,
                          field states, show-password toggle, responsive layout
  style.css             — Full dashboard stylesheet + security panel styles
js/
  auth-api.js           — ★ Secure backend auth layer (AuthAPI):
                            login(), logout(), verifyToken(), enforceAuth(),
                            changePassword(), getSecuritySettings(),
                            updateSecuritySetting(), getAuditLog(),
                            listUsers(), toggleUserActive(), unlockUser()
                            PBKDF2-SHA-256, session tokens, audit logging,
                            rate limiting, account lockout, single-session policy
  login.js              — Sign-in form logic: delegates to AuthAPI.login();
                          field validation, loading state, error banner, shake animation;
                          CRED_VERSION gate ('v2_admin123') guarantees unconditional cache
                          reset on every page load; local SHA-256 fallback for admin/admin123;
                          fmsAuthDiag() console diagnostic
  security-settings.js  — Settings view: Security Policy panel (live DB read/write),
                          Audit Log panel (paginated table), Change Password card
  seed-admin.js         — Browser console utility: seedAdmin('user','pass') for
                          programmatic admin seeding (dev/recovery use only)
  app.js                — Main logic: nav, KPIs, charts, transactions,
                          activities, staff, invoices, service tab switching
  data.js               — All seed data (KPIs, transactions, activities,
                          staff, revenue monthly, expense breakdown, invoices)
  charts.js             — Chart.js init (revenue line, expense donut, report bar)
  sections.js           — Generic buildSection() factory for 4 services
                          (Asset Mgmt, Business Dev, Vehicle Hire, Printing)
  loan-engine.js        — Complete loan engine for Financial Management
  settings-upload.js    — Logo & background FileReader upload + overlay sliders
  admin-panel.js        — Admin popup: profile photo, Edit Profile, Sign Out
                          (Sign Out now calls AuthAPI.logout() to revoke DB session)
README.md
```

---

## 🔗 Navigation / URI Map

| View key | Triggered by |
|---|---|
| `dashboard` | Sidebar "Dashboard" link (default / boot) |
| `reports` | Sidebar "Reports" link |
| `activities` | Sidebar "Activities" link |
| `staff` | Sidebar "Staff" link |
| `settings` | Sidebar "Settings" link |

Service tabs and loan sub-tabs are **embedded within the dashboard view** — no separate URL segments.

---

## 🛠 Key Technical Patterns

- **SPA view switching** – `.view.active` CSS class toggle; `views` registry maps keys → titles
- **CSS Custom Properties** – `--sidebar-w`, `--sidebar-w-coll`, `--topbar-h`, `--active-color`, `--shadow`, etc.
- **Chart.js v4** – `FMS.charts` namespace; lazy-init on view switch
- **Generic section factory** – `buildSection(config)` in `sections.js` with `formId`, `tbodyId`, `searchId`, `countId`, `fields()`, `cols()`, `seed[]`
- **Loan engine** – `js/loan-engine.js` IIFE; `loanStore[]` in-memory; `calcLoan()` flat-rate formulas; `buildSchedule()` per-month rows; status derived from `dueDate` vs today + `paidPayments` Set; renders to DOM; CSV via Blob API
- **Flat-rate formulas**:
  - `interest = principal × (rate/100) × (duration/12)`
  - `total = principal + interest`
  - `monthlyPrincipal = principal / duration`
  - `monthlyInterest = interest / duration`
  - `balance[n] = principal − n × monthlyPrincipal`
- **Tab count sync** – `MutationObserver` on `countId` elements → mirrors to `tab-count-{svc}` badges
- **Admin panel popup** – `position:absolute; top:calc(100%+8px)` below topbar trigger; CSS slide-down via `transform` + `opacity`
- **Auth gate** – inline `<script>` in `<head>` of `index.html` reads `sessionStorage.getItem('fms_auth_token')`; if absent calls `window.location.replace('login.html')` before any CSS loads
- **SHA-256 auth** – `SubtleCrypto.digest('SHA-256')` hashes username + password; constant-time-like `safeCompare()` compares against stored hashes; no credentials in DOM or console
- **Credential management** — `CRED_VERSION = 'v2_admin123'` gate in `login.js` unconditionally clears `fms_cred_uh`/`fms_cred_ph` from localStorage when version key mismatches; runs on every page load; followed by a secondary stale-hash check; guarantees `admin`/`admin123` defaults are always active
- **Cross-module navigation** – `window.fmsSwitchView` global exposed from `app.js`
- **Inline script safety** – all JS in external files; auth guard uses only `sessionStorage.getItem` (no credential data)

---

## 📐 Responsive Breakpoints

| Breakpoint | Behaviour |
|---|---|
| > 1100px | Full desktop: service panels side-by-side, 4-col KPIs |
| ≤ 1100px | Service panel inner stacks vertically; KPIs 2-col |
| ≤ 900px | Mobile sidebar drawer; hamburger button; loan calc-row 2-col |
| ≤ 700px | Service tab labels hidden (icons + badges only); loan sub-tab icons only |
| ≤ 600px | Single column, `form-row-2` stacks |
| ≤ 480px | `form-row-3` stacks; tabs fill full width; loan calc-row 1-col |

---

## ❌ Not Yet Implemented

- Data persistence (backend / API) – all data is in-memory seed data; resets on page reload
- Loan status persistence between sessions (no localStorage yet)
- Backend / server-side authentication (current implementation is client-side only; suitable for internal use; a determined user can inspect the hashed credentials in localStorage)
- Real-time notifications
- PDF export (current export is CSV only)
- Drag-and-drop Kanban task reordering
- Dark mode toggle

---

## 💡 Recommended Next Steps

1. Persist `loanStore` to `localStorage` or the Genspark Table API so loan records survive page reload
2. Connect all service sections to a REST API for persistent CRUD storage
3. Upgrade auth to a server-side session (e.g. Cloudflare Workers / D1) for true security
4. Add "Forgot password" flow and multi-user role management
3. Add PDF generation (e.g. jsPDF) for formatted loan amortisation reports and invoices
4. Implement drag-and-drop in the Kanban board (e.g. SortableJS)
5. Add chart data export (PNG download from Chart.js canvas)
6. Add authentication (login page + session management)


---

## 🚀 Upgrade Pack (September 2026)

- **Persistent client records** — every section (Financial Management, Research & Consulting, Asset Management, Business Development, Vehicle Hire, Printing) now writes to the built-in **FMS database** (`js/db.js`: IndexedDB + localStorage mirror). Records stay forever — reloads, sign-outs and redeploys included.
- **Database & Backup** — Settings → Database & Backup: live record counts, daily + auto snapshots, manual snapshot, **Download Full Backup (JSON)** and **Import Backup** (use it to move all data to your live domain).
- **Permanent branding** — uploaded **Logo, Background and Favicon** are stored permanently and applied on every page (dashboard + sign-in) and every deploy. Favicon upload lives in Settings → Branding.
- **Staff spreadsheet** — the Staff dashboard is now an **Excel-style editable sheet**: click any cell to edit (auto-saves). The **Username + Password** columns create a real working staff login instantly.
- **Reports statements** — Reports dashboard now shows **Income Statement, Balance Sheet, Cash Flow and P&L**, computed live from real records, with print support.
- **Research & Consulting** — new service tab placed directly before Financial Management.
- **Clients view** — new sidebar page listing every client record across all services, in real time.
- **Real-time sync** — open the dashboard in two tabs: changes appear instantly via BroadcastChannel/storage events.

The local fallback starts with `admin@tjconsultancyinc.com` / `admin@2026`.
After sign-in, the administrator can replace that password in Settings. The
replacement requires the current password plus at least eight characters with
an uppercase letter, number, and special character. For production, configure
Supabase Auth as described in `../supabase/SETUP.md` rather than using the
browser-local fallback.
