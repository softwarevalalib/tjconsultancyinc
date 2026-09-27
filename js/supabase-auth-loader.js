/* Loads the official Supabase browser SDK for sign-in only. */
(function (global) {
  'use strict';
  const config = global.FMS_SUPABASE_AUTH_CONFIG || {};
  const url = String(config.url || '').trim().replace(/\/$/, '');
  const anonKey = String(config.anonKey || '').trim();

  global.FMS_SUPABASE_AUTH_READY = (async function () {
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
