/* ============================================================
   js/compat.js — TJ Consultancy FMS
   Cross-platform / cross-browser compatibility layer.
   ============================================================
   Ensures the app behaves identically on:
     • Desktop  — Windows, macOS, Linux (Chrome, Edge, Firefox, Safari)
     • Mobile   — Android, iOS / iPadOS (Chrome, Safari)
     • Others   — ChromeOS, and older / embedded browsers

   Key guarantee: on hosts opened from file:// or any context where
   crypto.subtle is unavailable, the SHA-256 login still works via a
   pure-JavaScript fallback — sign-in never breaks on any OS.
   ============================================================ */
(function (global) {
  'use strict';

  /* ── 1. Pure-JS SHA-256 fallback ──────────────────────────── */
  function sha256Sync (ascii) {
    function rr (v, a) { return (v >>> a) | (v << (32 - a)); }
    var maxWord = Math.pow(2, 32), result = '';
    var words = [], bitLen = ascii.length * 8;
    var hash  = sha256Sync.h = sha256Sync.h || [];
    var k     = sha256Sync.k = sha256Sync.k || [];
    var primeCounter = k.length;
    var isComposite = {};
    for (var candidate = 2; primeCounter < 64; candidate++) {
      if (!isComposite[candidate]) {
        for (var i = 0; i < 313; i += candidate) isComposite[i] = candidate;
        hash[primeCounter] = (Math.pow(candidate, 0.5) * maxWord) | 0;
        k[primeCounter++]  = (Math.pow(candidate, 1 / 3) * maxWord) | 0;
      }
    }
    ascii += '\x80';
    while (ascii.length % 64 - 56) ascii += '\x00';
    for (var j = 0; j < ascii.length; j++) {
      var c = ascii.charCodeAt(j);
      if (c >> 8) return null;
      words[j >> 2] |= c << ((3 - j) % 4) * 8;
    }
    words[words.length] = (bitLen / maxWord) | 0;
    words[words.length] = bitLen;
    for (var x = 0; x < words.length;) {
      var w = words.slice(x, x += 16);
      var oldHash = hash.slice(0);
      for (var t = 0; t < 64; t++) {
        var w15 = w[t - 15], w2 = w[t - 2];
        var a = hash[0], e = hash[4];
        var temp1 = hash[7]
          + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25))
          + ((e & hash[5]) ^ ((~e) & hash[6]))
          + k[t]
          + (w[t] = (t < 16) ? w[t] : (
              w[t - 16]
              + (rr(w15, 7) ^ rr(w15, 18) ^ (w15 >>> 3))
              + w[t - 7]
              + (rr(w2, 17) ^ rr(w2, 19) ^ (w2 >>> 10))
            ) | 0);
        var temp2 = (rr(a, 2) ^ rr(a, 13) ^ rr(a, 22))
          + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
        hash = [(temp1 + temp2) | 0].concat(hash);
        hash[4] = (hash[4] + temp1) | 0;
      }
      for (var u = 0; u < 8; u++) hash[u] = (hash[u] + oldHash[u]) | 0;
    }
    for (var h = 0; h < 8; h++) {
      for (var y = 3; y + 1; y--) {
        var b = (hash[h] >> (y * 8)) & 255;
        result += ((b < 16) ? '0' : '') + b.toString(16);
      }
    }
    return result;
  }

  /* ── 2. Unified SHA-256 — WebCrypto when present, JS otherwise ── */
  function sha256 (str) {
    if (global.crypto && crypto.subtle && global.isSecureContext !== false) {
      try {
        return crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)).then(function (buf) {
          return Array.prototype.map.call(new Uint8Array(buf), function (b) {
            return b.toString(16).padStart(2, '0');
          }).join('');
        }).catch(function () { return Promise.resolve(sha256Sync(unescape(encodeURIComponent(str)))); });
      } catch (_) { /* fall through to sync */ }
    }
    return Promise.resolve(sha256Sync(unescape(encodeURIComponent(str))));
  }

  global.FMSSha256 = sha256;

  /* ── 3. Tiny polyfills so every OS renders the same ───────── */
  if (!String.prototype.padStart) {
    String.prototype.padStart = function (len, pad) {
      var s = String(this);
      while (s.length < len) s = (pad || ' ') + s;
      return s;
    };
  }
  if (!Array.prototype.includes) {
    Array.prototype.includes = function (v) { return this.indexOf(v) !== -1; };
  }
  if (!Array.prototype.find) {
    Array.prototype.find = function (fn) {
      for (var i = 0; i < this.length; i++) if (fn(this[i], i, this)) return this[i];
      return undefined;
    };
  }
  if (!Array.from) {
    Array.from = function (a) { return Array.prototype.slice.call(a); };
  }
  if (typeof global.TextEncoder === 'undefined') {
    global.TextEncoder = function () {
      this.encode = function (s) {
        var u = unescape(encodeURIComponent(s)), arr = new Uint8Array(u.length);
        for (var i = 0; i < u.length; i++) arr[i] = u.charCodeAt(i);
        return arr;
      };
    };
  }

  /* BroadcastChannel no-op polyfill (older browsers) */
  if (typeof global.BroadcastChannel === 'undefined') {
    global.BroadcastChannel = function () {
      this.postMessage = function () {};
      this.close = function () {};
      this.onmessage = null;
    };
  }

  /* ─ Shared auth guard (single source of truth) ────────────── */
  global.FMSCheckAuth = function () {
    var SESSION_KEY = 'fms_auth_token';
    try {
      return !!sessionStorage.getItem(SESSION_KEY);
    } catch (_) {
      return false;
    }
  };
  global.FMSRedirectToLogin = function () {
    /* Replace history entry so Back button doesn't bypass login */
    window.location.replace('login.html');
  };

  /* classList.toggle second-arg for very old engines */
  (function () {
    try {
      if (!document.createElement('div').classList) return;
      var d = document.createElement('div');
      d.classList.toggle('x', true);
      if (!d.classList.contains('x')) { /* force flag unsupported — acceptable */ }
    } catch (_) {}
  })();
})(typeof window !== 'undefined' ? window : this);
