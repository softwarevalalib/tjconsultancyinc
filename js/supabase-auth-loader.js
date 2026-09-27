/* Loads the official Supabase browser SDK for sign-in only. */
(function (global) {
  'use strict';
  global.FMS_SUPABASE_AUTH_READY = (async function () {
    let config = global.FMS_SUPABASE_AUTH_CONFIG || {};
    const hosted = /^https?:$/.test(global.location.protocol) && !['localhost', '127.0.0.1', '[::1]'].includes(global.location.hostname);
    if (hosted || !config.url || !config.anonKey) {
      try {
        const response = await fetch('/api/public-config', { cache: 'no-store' });
        if (!response.ok) throw new Error('Shared FMS sign-in is not configured on this deployment.');
        config = await response.json();
        global.FMS_SUPABASE_AUTH_CONFIG = config;
      } catch (error) {
        if (hosted) throw error;
      }
    }
    const url = String(config.url || '').trim().replace(/\/$/, '');
    const anonKey = String(config.anonKey || '').trim();
    if (!/^https:\/\//i.test(url) || !anonKey) return null;
    try {
      const sdk = await import('https://esm.sh/@supabase/supabase-js@2.57.0');
      return sdk.createClient(url, anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      });
    } catch (error) {
      console.error('[FMS Supabase Auth] SDK could not be loaded.', error);
      throw error;
    }
  })();
})(window);
