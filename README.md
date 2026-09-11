# TJ Consultancy Inc. — Financial Management Dashboard

> A full-featured, browser-based financial management, staff administration, and **license management** system. Built with vanilla HTML/CSS/JavaScript and backed by the RESTful Table API.

---

## 🚀 Quick Start

**Demo Login Credentials:**
| Role | Username | Password |
|------|----------|----------|
| Super Admin | superadmin | admin123 |
| Manager | manager@tdjconsultancy.com | manager123 |
| Loan Officer | officer@tdjconsultancy.com | officer123 |
| Accountant | accountant@tdjconsultancy.com | account123 |
| Viewer | viewer@tdjconsultancy.com | viewer123 |

---

## 🔑 License Management System

The Super Admin can issue, manage and revoke software licenses for any business that wants to use TDJ Consultancy Inc.'s platform.

### Plans Available

| Plan          | Price   | Duration | Features                                               |
| ------------- | ------- | -------- | ------------------------------------------------------ |
| **Monthly**   | $29.99  | 30 days  | Dashboard, Clients, Reports, Activities, Email Support |
| **Quarterly** | $79.99  | 90 days  | + Staff Management, Priority Support (save 11%)        |
| **Yearly**    | $279.99 | 365 days | + Settings, Dedicated Support, Free Updates (save 22%) |

### How It Works

1. **Super Admin** opens **Licenses** from the sidebar or Admin Panel
2. Clicks **"Issue New License"** or selects a plan card
3. Fills in: Business Name, Email, Phone, Plan, Issue Date, Notes
4. System generates a unique key: `TDJ-XXXX-XXXX-XXXX`
5. Super Admin shares the key with the business owner
6. Business owner enters the key in the **License Gate** screen to activate
7. Super Admin can: **Renew**, **Suspend/Activate**, **Delete**, or **Export CSV**

### License Key Format

```
TDJ-ABCD-EFGH-IJKL   (prefix + 3 × 4 alphanumeric segments)
```

---

## ✅ Completed Features

### 🔑 License Management (NEW)

- **3 plan types**: Monthly ($29.99), Quarterly ($79.99), Yearly ($279.99)
- **Auto key generation** in `TDJ-XXXX-XXXX-XXXX` format
- **Issue License modal** — business info, plan, date, notes, expiry preview
- **License table** — search, filter by status, paginated, sortable
- **Renew modal** — change plan, see new expiry from today
- **Suspend / Activate** toggle per license
- **View Detail modal** — full info, copy key to clipboard
- **Export to CSV** — all license data
- **Stats dashboard** — Total, Active, Expired, Expiring Soon, Revenue
- **License Gate screen** — business users can verify their key
- **Auto expiry detection** — Active licenses past expiry auto-shown as Expired

### 🏦 Dashboard

- **8 live metric cards** — total loan portfolio, total collected, outstanding balance, total interest, bonded principal, bonded interest, active clients, avg. flat rate
- All metric cards are **clickable** and highlighted with dynamic colors
- **Interactive loan portfolio chart** — switchable between Bar, Line, and Donut views (Chart.js)
- **Status breakdown pie chart** with animated legend (Active / Completed / Overdue / Pending)
- **Loan Portfolio by Client table** — filterable by All / Corporation / Individual, with clickable "View Summary" buttons
- **Recent Activities section** — shows client name, action, status, performed by, and a "View Account" button linking to client detail

### 👥 Clients Page

- **Client cards grid** — each card shows: client name, type, status badge, loan amount, rate/month, monthly payment total, remaining balance, **monthly principal/interest breakdown pill**, repayment progress bar
- **Add / Edit / Delete** clients via modal form
- **9-field registration form** with 3 logical sections (Client Information, Loan Parameters, Calculated Summary)
- **Auto-calculated fields** (live preview while typing):
  - Interest amount = `loan × (flat_rate/100) × duration_months`
  - Total repayment = `loan + interest`
  - Monthly principal = `loan / duration_months`
  - Monthly interest = `interest / duration_months`
  - Remaining balance, bonded principal, bonded interest
- Flat rate interpreted as **per-month** (not annual)
- Input fields enhanced with `$` prefix and `%/mo` / `mo` suffix indicators
- Search and filter clients by name/type/status
- Full client detail modal with **11 financial metric tiles** (clickable) including monthly principal & monthly interest

### 📊 Reports Page

- Summary statistics (total portfolio, collected, outstanding, interest, completed loans, total clients)
- **Monthly Collections chart** (bar + line combo)
- Full loan register table with all clients and loan metrics
- **CSV export** functionality

### 📋 Activities Page

- Full activities log table
- Add new activities via modal (linked to clients)
- Search/filter activities
- "View Account" button on each row

### 👔 Staff Management

- **Staff cards** showing name, role badge, email, last login, active status dot, and permission tags
- **Add / Edit / Delete** staff members
- **Permission Assignment** — Super Admin can assign/revoke any of 6 feature permissions per staff member:
  - Dashboard, Clients, Reports, Activities, Staff Management, Settings
- Permissions are enforced at runtime (locked navigation items)
- Online staff list in Admin Panel

### ⚙️ Settings Page

Four tabbed panels:

1. **Company** — name, tagline, email, phone, address
2. **Branding** — logo upload (preview), login background upload, primary/accent color pickers
3. **Security** — change password, session & 2FA toggles
4. **Notifications** — toggle notification preferences

### 👤 Super Admin Panel (Right Sidebar)

- Profile photo upload (with camera icon overlay)
- Admin name, role, email display
- Quick stats: last login date, total clients
- Quick action buttons: Settings, Edit Profile, Upload Logo, Login Background, Logout
- Online staff list
- "Powered by Software Vala Liberia" footer

### 🔐 Auth System

- Login page with styled card, dark gradient background
- Email + password authentication against staff table
- Password show/hide toggle
- Role-based navigation (locked nav items per permissions)
- Session persistence via localStorage
- Logout button in Admin Panel

### 🎨 UI/UX

- Collapsible sidebar (full ↔ icon-only)
- Responsive layout (desktop & mobile)
- Toast notifications (success / error / warning / info)
- Modal overlays for all CRUD forms
- Notification bell with dropdown
- "Powered by Software Vala Liberia" label in sidebar footer and login card

---

## 📁 Project Structure

```
index.html              — Main SPA shell (login + full app)
css/
  style.css             — Complete stylesheet (vars, login, sidebar, dashboard, modals, responsive)
js/
  app.js                — Core: auth, routing, navigation, settings, admin panel
  dashboard.js          — Dashboard metrics, portfolio table, recent activities, reports
  clients.js            — Client CRUD, search, card rendering, auto-calculation
  staff.js              — Staff CRUD, permission modal, role badges
  charts.js             — Chart.js: portfolio bar/line/donut, status pie, monthly collections
```

---

## 🗄️ Data Models

### `clients`

| Field             | Type   | Description                                      |
| ----------------- | ------ | ------------------------------------------------ |
| client_name       | text   | Full name or corporation name                    |
| client_type       | text   | Individual / Corporation                         |
| loan_amount       | number | Loan principal (USD)                             |
| flat_rate         | number | Monthly flat rate (%) — **per month**            |
| duration_months   | number | Loan term in months                              |
| interest_amount   | number | Calculated interest = loan × rate/100 × duration |
| total_payment     | number | Total repayment = loan + interest                |
| monthly_principal | number | Monthly principal = loan / duration              |
| monthly_interest  | number | Monthly interest = interest / duration           |
| bonded_principal  | number | Secured principal portion (loan / 2)             |
| bonded_interest   | number | Secured interest portion (interest / 2)          |
| amount_paid       | number | Payments received to date                        |
| remaining_balance | number | Outstanding balance                              |
| loan_date         | text   | Origination date (ISO string)                    |
| status            | text   | Active / Completed / Overdue / Pending           |

### `staff`

| Field       | Type     | Description                                                |
| ----------- | -------- | ---------------------------------------------------------- |
| name        | text     | Full name                                                  |
| email       | text     | Login email                                                |
| password    | text     | Login password                                             |
| role        | text     | Super Admin / Manager / Loan Officer / Accountant / Viewer |
| permissions | array    | Feature keys the staff member can access                   |
| active      | bool     | Account enabled flag                                       |
| last_login  | datetime | Last successful login                                      |

### `activities`

| Field        | Type | Description                               |
| ------------ | ---- | ----------------------------------------- |
| client_name  | text | Client associated                         |
| client_id    | text | Reference to client record                |
| action       | text | Action description                        |
| status       | text | Approved / Pending / Rejected / Completed |
| performed_by | text | Staff member name                         |

### `settings`

Key/value store for company name, branding, and preferences.

---

## 🔗 API Endpoints Used

| Method | Endpoint                      | Purpose                            |
| ------ | ----------------------------- | ---------------------------------- |
| GET    | `tables/clients?limit=100`    | Load all clients                   |
| POST   | `tables/clients`              | Create new client                  |
| PUT    | `tables/clients/:id`          | Update client                      |
| DELETE | `tables/clients/:id`          | Delete client                      |
| GET    | `tables/staff?limit=100`      | Load staff (for auth + management) |
| POST   | `tables/staff`                | Create staff member                |
| PUT    | `tables/staff/:id`            | Update staff member                |
| PATCH  | `tables/staff/:id`            | Update permissions                 |
| DELETE | `tables/staff/:id`            | Remove staff member                |
| GET    | `tables/activities?limit=100` | Load activities                    |
| POST   | `tables/activities`           | Log new activity                   |

---

## 🔮 Recommended Next Steps

1. **Server-side auth** — Replace plain-text passwords with hashed credentials (bcrypt)
2. **Payment schedule** — Add amortization schedule table per client (monthly installment breakdown)
3. **Record payment** — "Record Payment" button on client cards to log partial payments and update `amount_paid`
4. **File attachments** — Allow document uploads (contracts, IDs) per client
5. **Email notifications** — Send alerts for overdue loans, payment receipts
6. **Audit log** — Track every change with timestamps and who made it
7. **Multi-branch support** — Assign clients and staff to branches/regions
8. **Print/PDF reports** — Generate printable statements per client or month
9. **Dark mode** — Add CSS variable-based dark theme toggle
10. **Mobile app** — Convert to PWA with offline support

---

## 🏷️ Developer Credits

**Powered by Software Vala Liberia**

---

## 🚀 NestJS Backend

The project now includes a local NestJS backend in `backend/`. It uses SQLite through TypeORM and exposes the existing `tables/...` API used by the SPA. Nest also serves the root frontend, so the app and API run on the same origin.

### Run locally

```bash
cd backend
copy .env.example .env
npm install
npm run seed
npm run start:dev
```

Open `http://localhost:3000`. The health check is available at `http://localhost:3000/health`.

The database is stored at `backend/data/fms.sqlite` by default. The schema is defined in `backend/src/database/entities.ts`, and the compatibility API is implemented in `backend/src/tables/`.

For production, set `NODE_ENV=production` and use reviewed TypeORM migrations instead of development-time schema synchronization. Passwords are currently retained in the legacy frontend-compatible format; server-side authentication with password hashing should be added before deployment.
