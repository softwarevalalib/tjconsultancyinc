/* Public Neon Auth endpoint only. Never place DATABASE_URL or any server key
   in this browser configuration. An empty url uses the same Vercel origin. */
(function (global) {
  "use strict";

  global.FMS_NEON_AUTH_CONFIG = { url: "" };
})(window);
