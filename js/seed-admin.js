/**
 * seed-admin.js
 * Run once in browser console OR as part of a hosted deploy setup to seed
 * the initial admin user into fms_users table with PBKDF2-derived password.
 *
 * Usage (browser console on the deployed site):
 *   await seedAdmin('admin', 'TJConsult@2024', 'Admin User', 'Finance Manager')
 *
 * This file is NOT loaded by index.html in production.
 */

(function(global) {
  'use strict';

  /**
   * Derive a PBKDF2-SHA-256 key from a password + salt.
   * @param {string} password  - plaintext password
   * @param {string} saltHex   - 32-char hex salt (16 bytes)
   * @param {number} iterations - PBKDF2 iteration count (default 310000)
   * @returns {Promise<string>} hex-encoded 32-byte derived key
   */
  async function pbkdf2Derive(password, saltHex, iterations = 310000) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      enc.encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    );
    const saltBytes = hexToBytes(saltHex);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations },
      keyMaterial,
      256
    );
    return bytesToHex(new Uint8Array(bits));
  }

  /** SHA-256 of a string → hex */
  async function sha256(str) {
    const data = new TextEncoder().encode(str);
    const buf = await crypto.subtle.digest('SHA-256', data);
    return bytesToHex(new Uint8Array(buf));
  }

  /** Generate n random bytes as hex */
  function randomHex(n = 16) {
    const arr = new Uint8Array(n);
    crypto.getRandomValues(arr);
    return bytesToHex(arr);
  }

  function bytesToHex(bytes) {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
    }
    return bytes;
  }

  /**
   * Seed an admin user into the fms_users table via the REST API.
   * Call from browser console on the deployed domain.
   */
  global.seedAdmin = async function(username, password, displayName, displayRole) {
    displayName  = displayName  || 'Admin User';
    displayRole  = displayRole  || 'Finance Manager';

    const salt         = randomHex(16);        // 16 random bytes
    const usernameHash = await sha256(username.toLowerCase().trim());
    const passwordHash = await pbkdf2Derive(password, salt);
    const id           = randomHex(16);        // 16-byte UUID substitute
    const now          = new Date().toISOString();

    const payload = {
      id,
      username_hash: usernameHash,
      password_hash: passwordHash,
      salt,
      display_name:  displayName,
      display_role:  displayRole,
      role:          'admin',
      is_active:     true,
      failed_attempts: 0,
      locked_until:  null,
      last_login:    null,
      password_changed_at: now,
      created_by:    'system'
    };

    console.log('[seedAdmin] Derived payload (no plaintext):', {
      id: payload.id,
      username_hash: payload.username_hash,
      salt: payload.salt,
      display_name: payload.display_name,
      role: payload.role
    });

    const res = await fetch('tables/fms_users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[seedAdmin] Failed to create user:', res.status, err);
      return null;
    }

    const created = await res.json();
    console.log('[seedAdmin] ✅ Admin user created successfully. Record:', created);
    return created;
  };

  console.log('[seed-admin] Ready. Call: seedAdmin("admin", "TJConsult@2024")');

})(window);
