/* Wait for asynchronous configuration and server-validated session restoration. */
(function (global) {
  'use strict';
  function redirect() { global.location.replace('login.html'); }
  if (!global.FMSCloud || !global.FMSCloud.ready) {
    redirect();
    return;
  }
  global.FMSCloud.ready.then(function (result) {
    if (!result || !result.authenticated) return redirect();
    document.documentElement.style.visibility = '';
  }).catch(redirect);
})(window);
