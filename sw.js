/* ============================================================
   sw.js — TJ Consultancy FMS Service Worker (cross-platform)
   ============================================================
   Makes the system work identically on EVERY operating system:

     • Windows / macOS / Linux  → install as a desktop app
     • Android / iOS / ChromeOS → install to the home screen
     • Full OFFLINE support — after the first visit every page,
       script, style and icon loads from the local cache, so the
       dashboard, sign-in, chat, reports, invoices and backups all
       work with no internet connection.
     • Safe offline fallback for CDN assets (Font Awesome icons,
       Google Fonts) — missing resources never break the page.
     • Stale-while-revalidate: cached copy is shown instantly,
       then refreshed silently in the background.
   ============================================================ */
(function () {
  'use strict';

  /* Bump whenever an app-shell asset changes so installed apps receive it. */
  var CACHE = 'tj-fms-v21-payslip-logo';

  /* App shell — everything the system needs to run 100% offline */
  var SHELL = [
    './',
    './index.html',
    './login.html',
    './manifest.json',
    './WORKFORCE.md',
    './css/style.css',
    './css/login.css',
    './css/fms-addons.css',
    './css/pwa-install.css',
    './css/notifications.css',
    './css/workforce.css',
    './js/workforce-core.js',
    './js/workforce-store.js',
    './js/workforce.js',
    './js/data.js',
    './js/db.js',
    './js/supabase-config.js',
    './js/supabase-client.js',
    './js/app.js',
    './js/live-financials.js',
    './js/charts.js',
    './js/sections.js',
    './js/loan-engine.js',
    './js/invoice.js',
    './js/reports-statements.js',
    './js/admin-panel.js',
    './js/settings-upload.js',
    './js/security-settings.js',
    './js/staff-sheet.js',
    './js/team-chat.js',
    './js/db-admin.js',
    './js/auth-api.js',
    './js/login.js',
    './js/seed-admin.js',
    './js/enhancements.js',
    './js/fms-addons.js',
    './js/pwa-register.js',
    './js/notifications.js',
    './js/compat.js',
    './icons/icon-192.png',
    './icons/icon-512.png'
  ];

  /* ── Install: pre-cache the whole app ─────────────────────── */
  self.addEventListener('install', function (event) {
    event.waitUntil(
      caches.open(CACHE).then(function (cache) {
        /* add individually so one failure (e.g. a CDN file) never
           blocks the whole install */
        return Promise.all(SHELL.map(function (url) {
          return cache.add(new Request(url, { cache: 'reload' })).catch(function () {});
        }));
      }).then(function () { return self.skipWaiting(); })
    );
  });

  /* ── Activate: drop old caches, take control immediately ──── */
  self.addEventListener('activate', function (event) {
    event.waitUntil(
      caches.keys().then(function (keys) {
        return Promise.all(keys.map(function (k) {
          if (k !== CACHE) return caches.delete(k);
        }));
      }).then(function () { return self.clients.claim(); })
    );
  });

  /* ── Fetch: serve from cache, then update in background ───── */
  self.addEventListener('fetch', function (event) {
    var req = event.request;
    if (req.method !== 'GET') return;

    /* Network-first for navigation (login.html / index.html), so a
       user on any OS always gets the newest shell when online,
       with the cache as the offline fallback. */
    if (req.mode === 'navigate') {
      event.respondWith(
        fetch(req).then(function (res) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
          return res;
        }).catch(function () {
          return caches.match(req).then(function (cached) {
            return cached || caches.match('./index.html');
          });
        })
      );
      return;
    }

    /* Same-origin & CDN assets: cache-first, then network + cache */
    event.respondWith(
      caches.match(req).then(function (cached) {
        var network = fetch(req).then(function (res) {
          if (res && res.status === 200 && (res.type === 'basic' || res.type === 'cors')) {
            var copy = res.clone();
            caches.open(CACHE).then(function (c) { c.put(req, copy); });
          }
          return res;
        }).catch(function () {
          /* offline & not cached → graceful empty response, never an error */
          if (cached) return cached;
          return new Response('', {
            status: 200,
            statusText: 'OK',
            headers: { 'Content-Type': req.destination === 'style' ? 'text/css' : 'text/plain' }
          });
        });
        return cached || network;
      })
    );
  });
})();
