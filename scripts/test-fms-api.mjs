#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(root, ".env");
if (fs.existsSync(envFile)) {
  fs.readFileSync(envFile, "utf8").split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const index = trimmed.indexOf("=");
    if (index < 1) return;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  });
}

const BASE = process.env.FMS_TEST_URL || "http://localhost:4173";
const EMAIL = process.env.FMS_TEST_EMAIL || "admin@tjconsultancyinc.com";
const PASSWORD = process.env.FMS_TEST_PASSWORD || "";

if (!PASSWORD) {
  console.error("Set FMS_TEST_PASSWORD before running tests.");
  process.exit(1);
}

async function request(path, { method = "GET", token, body, query } = {}) {
  const url = new URL(BASE + path);
  Object.entries(query || {}).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url, {
    method,
    headers: {
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((result.error || response.statusText) + " (" + path + ")");
  return result;
}

async function main() {
  const checks = [];
  function pass(name, detail) {
    checks.push({ name, ok: true, detail });
    console.log("PASS  " + name + (detail ? " — " + detail : ""));
  }

  const login = await request("/api/auth", {
    method: "POST",
    query: { action: "login" },
    body: { email: EMAIL, password: PASSWORD },
  });
  const token = login.session && login.session.access_token;
  if (!token) throw new Error("Login did not return an access token.");
  pass("auth login", login.session.user.email);

  const bad = await fetch(BASE + "/api/auth?action=login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: "wrong-password" }),
  });
  if (bad.status !== 401) throw new Error("Wrong password should return 401.");
  pass("auth rejects bad password");

  const profile = await request("/api/neon", { query: { action: "profile" }, token });
  if (!profile.profile || profile.profile.role !== "admin") throw new Error("Admin profile missing.");
  pass("profile", profile.profile.display_name + " / " + profile.profile.workspace_id);

  let bootstrap = await request("/api/neon", { query: { action: "bootstrap" }, token });
  if (!bootstrap.initialized) {
    await request("/api/neon", {
      method: "POST",
      query: { action: "initialize" },
      token,
      body: { tables: { loans: [{ _id: "loan-test-1", client: "API Test Client", amount: 1000 }] }, deleted: [] },
    });
    bootstrap = await request("/api/neon", { query: { action: "bootstrap" }, token });
  }
  pass("bootstrap", bootstrap.initialized ? "initialized" : "pending");

  const recordId = "loan-rt-" + Date.now();
  await request("/api/neon", {
    method: "POST",
    query: { action: "sync" },
    token,
    body: { changed: [{ table_name: "loans", record_id: recordId, payload: { _id: recordId, client: "Realtime Loan", amount: 2500 } }], removed: [] },
  });
  const changes = await request("/api/neon", { query: { action: "changes", after: "0" }, token });
  const found = (changes.changes || []).some((row) => row.record_id === recordId && !row.is_deleted);
  if (!found) throw new Error("Synced loan did not appear in the change feed.");
  pass("realtime change feed", "cursor " + changes.cursor);

  await request("/api/neon", {
    method: "PUT",
    query: { action: "settings" },
    token,
    body: { settings: { fms_institution_name: "TJ Consultancy Inc", fms_website_url: "https://tjconsultancy.com" }, replace: true },
  });
  const settings = await request("/api/neon", { query: { action: "settings" }, token });
  if (settings.settings.fms_institution_name !== "TJ Consultancy Inc") throw new Error("Settings were not saved.");
  pass("shared settings");

  const company = await request("/api/neon", {
    method: "POST",
    query: { action: "company-name" },
    token,
    body: { name: "TJ Consultancy Inc" },
  });
  pass("company name", company.name);

  const note = await request("/api/neon", {
    method: "POST",
    query: { action: "notifications" },
    token,
    body: { notification: { title: "API test", message: "Realtime notification check" } },
  });
  const notes = await request("/api/neon", { query: { action: "notifications", limit: "10" }, token });
  if (!(notes.notifications || []).some((row) => row.id === note.notification.id)) throw new Error("Notification was not listed.");
  pass("notifications");

  const staffStamp = Date.now();
  const staffEmail = "staff.api." + staffStamp + "@tjconsultancyinc.com";
  const staffUsername = "staff.api." + staffStamp;
  const staffPassword = "StaffTest!123";
  const created = await request("/api/neon", {
    method: "POST",
    query: { action: "staff-profiles" },
    token,
    body: {
      profile: {
        display_name: "API Staff",
        email: staffEmail,
        username: staffUsername,
        password: staffPassword,
        permissions: ["dashboard", "reports", "loans"],
      },
    },
  });
  if (!created.profile || created.profile.username !== staffUsername) throw new Error("Staff create should store the username.");
  if ((created.profile.permissions || []).includes("loans")) throw new Error("Unknown permissions should be ignored.");
  const staffLogin = await request("/api/auth", {
    method: "POST",
    query: { action: "login" },
    body: { email: staffEmail, password: staffPassword },
  });
  pass("staff login", staffEmail);

  const usernameLogin = await request("/api/auth", {
    method: "POST",
    query: { action: "login" },
    body: { email: staffUsername, password: staffPassword },
  });
  if (!usernameLogin.session || !usernameLogin.session.access_token) throw new Error("Username login failed.");
  pass("staff username login", staffUsername);

  const staffToken = staffLogin.session.access_token;
  const staffProfile = await request("/api/neon", { query: { action: "profile" }, token: staffToken });
  if (staffProfile.profile.role !== "staff") throw new Error("Staff role was not assigned.");
  if (!Array.isArray(staffProfile.profile.permissions) || !staffProfile.profile.permissions.includes("dashboard")) {
    throw new Error("Staff permissions were not assigned.");
  }
  pass("staff profile role", staffProfile.profile.role + " / " + staffProfile.profile.permissions.join(","));

  await request("/api/neon", {
    method: "POST",
    query: { action: "staff-profile" },
    token,
    body: { user_id: created.profile.user_id, profile: { disabled: true } },
  });
  const disabled = await fetch(BASE + "/api/auth?action=login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: staffUsername, password: staffPassword }),
  });
  if (disabled.status !== 403) throw new Error("Disabled staff should not sign in.");
  pass("disabled staff cannot sign in");

  await request("/api/neon", {
    method: "DELETE",
    query: { action: "staff-profile" },
    token,
    body: { user_id: created.profile.user_id },
  });
  pass("staff login removed");

  const workforce = await request("/api/neon", {
    method: "POST",
    query: { action: "workforce" },
    token,
    body: { record: { _id: "wf-" + Date.now(), kind: "salary", payload: { name: "Test salary", amount: 100 } }, expectedVersion: 0 },
  });
  if (!workforce.record || !workforce.record.version) throw new Error("Workforce save failed.");
  pass("workforce save", "v" + workforce.record.version);

  const backup = await request("/api/neon", {
    method: "POST",
    query: { action: "backups" },
    token,
    body: { label: "api-test", localStorage: { fms_institution_name: "TJ Consultancy Inc" } },
  });
  if (!backup.backup || !backup.backup.id) throw new Error("Backup was not created.");
  pass("cloud backup", backup.backup.id);

  console.log("\n" + checks.length + " checks passed against " + BASE);
}

main().catch((error) => {
  console.error("FAIL  " + error.message);
  process.exit(1);
});
