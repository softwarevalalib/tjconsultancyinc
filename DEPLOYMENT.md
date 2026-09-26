# Deploying TJ Consultancy FMS

For Staff Salary, Attendance, Leave Management and biometric event ingestion,
also follow [WORKFORCE.md](WORKFORCE.md) and apply the additional HR migration.

The production deployment is a static site backed by Supabase Auth, Postgres,
and Realtime. Do not deploy production data using the local-login fallback.

## Production checklist

1. In Supabase SQL Editor, run
   [`../supabase/migrations/20260923_fms_realtime.sql`](../supabase/migrations/20260923_fms_realtime.sql).
2. Create the workspace, administrator, and staff profiles as described in
   [`../supabase/SETUP.md`](../supabase/SETUP.md). Disable public sign-ups.
3. Put the project's **URL** and **publishable/anon key** in
   [`js/supabase-config.js`](js/supabase-config.js). Never expose a
   `service_role` key.
4. In Supabase Auth, add the production URL and `https://YOUR-DOMAIN/login.html`
   to the redirect allow-list.
5. Deploy the contents of this `app` folder to any HTTPS static host. For
   Vercel, choose **Other**, use no build command, and set this `app` folder as
   the project root/output directory.
6. Complete the two-browser deletion check in the setup guide before inviting
   users. A deletion must disappear immediately in the second browser and
   must not return after an old backup is restored.

## Installable app

The application is a Progressive Web App. Once it is deployed over HTTPS,
users can select **Install App** from the sign-in page or dashboard. Chrome,
Edge, and compatible browsers display their native installation prompt;
iPhone/iPad and other browsers receive the correct browser-menu steps.

The installed application is supported on Windows, macOS, Linux, ChromeOS,
Android, iOS, and iPadOS where the device browser supports PWA installation.
`localhost` also supports this flow for development; opening the files directly
from disk does not.

## Live notifications

The dashboard notification bell receives all FMS record activity in real time.
For production cross-device delivery, rerun the supplied Supabase migration so
the protected `fms_notifications` table is created and included in the Realtime
publication. Without Supabase configuration, notifications still persist and
update immediately across open tabs in the same browser.

The supplied browser configuration is intentionally blank, so production
credentials are not committed to source control. The publishable key is safe
for a browser; database access is protected by the migration's Row Level
Security policies.
