# Deploying TJ Consultancy FMS

Production uses Neon Auth for login and Neon Postgres for shared business
data, staff, workforce records, notifications, and backups.

## Connect Neon to Vercel

### 1. Neon — copy the database URL

1. Open [https://console.neon.tech](https://console.neon.tech).
2. Open project **tj-consultancy-fms**.
3. Confirm database **tj_fms** on branch **main**.
4. Click **Connect**.
5. Choose the **pooled** connection string.
6. Copy `DATABASE_URL`. It looks like:

   `postgresql://USER:PASSWORD@HOST-pooler.../tj_fms?sslmode=require`

The shared schema is already applied (`neon/migrations/20260927_fms_shared.sql`).
Do not paste `DATABASE_URL` into any browser JavaScript file.

### 2. Vercel — add the environment variable

1. Open the existing TJ Consultancy project on [https://vercel.com](https://vercel.com).
2. Go to **Settings → Environment Variables**.
3. Add:

   | Name | Value | Environments |
   |---|---|---|
   | `DATABASE_URL` | Neon pooled connection string | Production, Preview, Development |

   Optional:

   | Name | Value |
   |---|---|
   | `SESSION_HOURS` | `12` |
   | `HR_DEVICE_KEYS` | `[]` |

4. Confirm the project is connected to `softwarevalalib/tjconsultancyinc`.
5. **Deployments → Redeploy** the latest production deployment (or push `main`).
   Changing env vars does not apply until a new deploy finishes.

### 3. Confirm the live site

After deploy, open the Vercel URL (or custom domain) and sign in:

- Email: `admin@tjconsultancyinc.com`
- Password: set in Neon (not stored in this repo)

Then check:

- Dashboard loads after sign-in
- Settings → Database & Backup shows a Neon connection
- A loan or staff edit appears on a second signed-in browser within a few seconds
- Notifications appear on the second device

API routes on the same Vercel origin:

- `/api/auth` — login, logout, password change
- `/api/neon` — profile, sync, settings, backups, workforce
- `/api/biometric-events` — optional HR terminals

## Production checklist

1. Neon schema is applied on `tj_fms`.
2. `DATABASE_URL` is set on Vercel and the project has been redeployed.
3. Administrator can sign in and two devices stay in sync.

The installable app works in current Edge and Chrome on Windows 10 and 11.
Each device uses the same HTTPS Neon API. Local IndexedDB is only an offline
cache. Record changes are polled every 2.5 seconds, and notifications every
5 seconds.

## Local live test

```bash
npm install
cp .env.example .env   # then set DATABASE_URL
npm run dev
npm run test:api
```

Open `http://localhost:4173/login.html` to sign in against the live Neon database.
