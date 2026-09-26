# Workforce management

The sidebar includes **Staff Salary**, **Attendance**, and **Leave Management**.
All three are administrator-only. Employee identities come from the existing Staff
directory. Production HR records are stored separately from shared finance records;
they are not included in browser finance backups or the workspace notification feed.

## Included workflows

- Monthly salary profiles, allowance and overtime rates; payroll drafts, approval,
  external payment references, printable payslips and CSV exports. Paid payroll is
  locked. Marking paid does not initiate a bank transfer or post an expense to finance.
- Manual and CSV attendance; paired working hours, breaks, lateness, extra hours and
  missing-punch exceptions. Event history is immutable. Overnight punches are flagged
  for review rather than automatically paired or used to calculate pay.
- Annual, sick, unpaid and other leave; approval, rejection, cancellation; weekday
  counting; overlap prevention; annual balance with pending requests reserved.
- Terminal registry, per-terminal employee mapping, enable/disable and last received
  event. No events is not an online/offline heartbeat. Biometric templates stay on
  the terminal/vendor system. Enrollment and employee provisioning are not implemented.
- Cloud record versions prevent stale overwrites; unique indexes prevent duplicate
  payroll and mappings. The server validates leave and payroll and records immutable
  before/after audit entries in `fms_hr_audit`, readable by administrators.

Starting defaults: United States / USD, America/Los_Angeles, 09:00 shift, 8-hour
target, 10-minute grace and 20 annual weekdays. These are editable examples, **not
statutory entitlements or a US tax engine**. Holidays, accrual, carry-forward,
jurisdiction-specific taxes, statutory overtime, multi-shift schedules and employee
self-service are not implemented. Review deductions and overtime explicitly.

## Cloud deployment

1. Complete DEPLOYMENT.md and ensure Staff records have synchronized to Supabase.
2. Apply `../supabase/migrations/20260926_workforce.sql` after the original migration.
3. Deploy all app assets, including the three `workforce-*.js`/`workforce.js` files
   and `css/workforce.css`. The service worker version is bumped.
4. Sign in as an administrator. Verify the workforce badge says **Live**. HR cloud
   writes are disabled while disconnected. No browser queue silently accepts them.
5. Open a second administrator browser; verify payroll, leave and punches refresh.
   Sign in as staff and verify HR table reads/writes are denied by RLS.

Without Supabase the module is a local demonstration. It saves in
`fms_workforce_demo_v1` in this browser and updates other tabs. Browser demo data
is not automatically uploaded when cloud configuration is added. Demo storage is
not an appropriate security boundary for real payroll data on shared computers.

## Biometric connection

### Prepare now, connect later

Open **Attendance → Device setup assistant** to see configuration progress.
Register terminals and map employees in the panel below it. For each terminal,
download its setup JSON and connection-test HTTP file from the assistant. These
files give the installer the endpoint, device identity, timezone, mappings and
setup steps without exporting credentials. Local preparation IDs must be replaced
by newly registered cloud IDs after cloud setup; local data is not auto-migrated.

After deployment and private token provisioning, an installer can send
`{"type":"connection-test"}` to the event endpoint with the device Bearer token.
HTTP 200 with `connected: true` confirms authentication and an enabled terminal
record. It records no attendance. It does not test a physical terminal or vendor
protocol; finish by checking a real punch from the device.

### Connect the hardware

Reference hardware: **Hikvision DS-K1T343 series**, using a vendor-supported ISAPI
adapter. This is a suggested starting point, not a tested/certified hardware claim.
Confirm the exact model, region and firmware supports event export before purchase.
The normalized API can receive events from other brands through an appropriate
adapter. It does not directly implement Hikvision ISAPI, ZKTeco ADMS, USB protocols
or proprietary SDKs. A static browser cannot directly communicate with every terminal.

1. Register a terminal under Attendance, then copy its generated device ID.
2. Map each terminal employee ID to an existing FMS staff record.
3. On a trusted machine generate a random token of at least 32 bytes. Store the token
   only in the vendor adapter. Compute its SHA-256 hexadecimal digest.
4. Set the Supabase Edge Function secret `HR_DEVICE_KEYS` to a JSON array:

   ```json
   [{"deviceId":"COPIED-DEVICE-ID","workspaceId":"WORKSPACE-UUID","tokenSha256":"64-CHARACTER-SHA256-HEX"}]
   ```

   Every token must be unique and assigned to exactly one workspace/terminal. The
   function derives both from this server-side allowlist; the request cannot choose
   a workspace. Rotate by replacing that entry. Disabling a terminal stops ingestion.
   Never put the token or a service-role key in app JavaScript or localStorage.
5. From the project directory deploy `supabase functions deploy biometric-events`.
   The supplied config disables user JWT checking **only for this function**; it
   authenticates each POST using the device token. Standard Supabase server secrets
   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are needed by the function.
6. Configure a vendor adapter on a trusted LAN gateway or vendor integration service
   to translate supported terminal events and POST to:

   ```http
   POST https://YOUR-PROJECT.supabase.co/functions/v1/biometric-events
   Authorization: Bearer DEVICE-TOKEN
   Content-Type: application/json

   {"eventId":"terminal-event-12345","deviceUserId":"42","at":"2026-09-26T09:00:00-07:00","direction":"in"}
   ```

   `eventId` must remain stable across retries. Timestamps must include a timezone.
   One event per request, at most 16 KB. Direction is `in` or `out`; adapters must
   not guess direction from an arbitrary access-granted event. The API does not
   accept fingerprint images, face data, template data or arbitrary raw payloads.
7. Accept 200/201 as acknowledgment. Persist an adapter outbox and retry network/5xx
   errors with backoff. On 401/403 fix credentials/device status; on 422 fix employee
   mappings/status and retry. A 409 requires checking event identity before retrying.
   A replay with the same ID and content is acknowledged without a second punch.

Supabase Realtime updates the screens after the event is stored. Actual end-to-end
latency depends on the adapter, terminal and network. An SDK that only polls is not
instantaneous. This repository includes the receiver, not a vendor-specific adapter.

## Validation before rollout

- Submit an authorized sample event twice; verify one punch. Try a wrong token,
  disabled device, unmapped user, future timestamp and reused ID with changed data.
- Verify staff cannot query HR records/audit and one workspace cannot read another.
- Race two leave requests/approvals and two payroll creations. Verify overlap,
  entitlement, version and uniqueness checks reject conflicting writes.
- Review actual terminal timezone, daylight-saving behavior and event direction.
- Reconcile payroll totals and your applicable employment/payroll rules before use.

Local automated checks: `node --test tests/workforce.test.cjs` from the repository
root. Cloud migrations and physical terminal operation require deployment testing.

References: [Supabase Realtime](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes),
[function secrets](https://supabase.com/docs/guides/functions/secrets),
[Hikvision integration documentation](https://tpp.hikvision.com/download/).
