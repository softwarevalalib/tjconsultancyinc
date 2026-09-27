# Deploying TJ Consultancy FMS

Production uses Supabase Auth for login and Supabase Postgres for shared business
data, staff, workforce records, notifications, and backups. Follow
[`../../supabase/SETUP.md`](../../supabase/SETUP.md) to connect the existing Supabase users,
map their Supabase workspace profiles, migrate local backups, and configure Supabase.

## Production checklist

1. Run all three Supabase migrations and create the administrator workspace/profile.
2. Configure `SUPABASE_DB_URL`, `SUPABASE_URL`, and `SUPABASE_ANON_KEY` in Vercel.
   Put the Supabase project URL and anon key in `js/supabase-auth-config.js`.
3. Deploy from the repository root. `vercel.json` publishes the `app`
   directory and the `/api/supabase` serverless function.
4. Import full backups from PCs with unique records, then check the two-device
   sync, account permissions, and cloud backup flow.

The installable app works in current Edge and Chrome on Windows 10 and 11. Each
device uses the same HTTPS Supabase API and Supabase Auth project; local IndexedDB is
only an offline cache. Record changes are polled every 2.5 seconds, and
notifications every 5 seconds.
