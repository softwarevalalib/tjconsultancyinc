# Neon setup for TJ Consultancy FMS

Project: `tj-consultancy-fms` (`round-smoke-09210419`)  
Database: `tj_fms`  
Branch: `main`

## Schema

Apply `neon/migrations/20260927_fms_shared.sql` if you create a new branch or
database. Production already has the shared workspace, auth, records, change
feed, notifications, settings, backups, and workforce tables.

## Administrator

The first administrator is `admin@tjconsultancyinc.com` with role `admin` on
workspace `11111111-1111-1111-1111-111111111111`. Additional staff logins are
created from the dashboard Staff Access card. Each new staff member receives a
temporary password once; they sign in with their email.

## Vercel environment

Set `DATABASE_URL` to the pooled connection string for `tj_fms`. Optional:

- `SESSION_HOURS` (default `12`)
- `HR_DEVICE_KEYS` JSON allowlist for `/api/biometric-events`

Never put `DATABASE_URL` in browser JavaScript.
