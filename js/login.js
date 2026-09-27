/* Supabase Auth sign-in for the TJ Consultancy FMS. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const form = $('loginForm');
  const username = $('loginUsername');
  const password = $('loginPassword');
  const submit = $('loginSubmitBtn');
  const buttonText = $('loginBtnText');
  const spinner = $('loginBtnSpinner');
  const errorBanner = $('loginError');
  const errorText = $('loginErrorText');
  const usernameHint = $('usernameHint');
  const passwordHint = $('passwordHint');
  const usernameField = $('fieldUsername');
  const passwordField = $('fieldPassword');
  const showPassword = $('showPwBtn');
  const showPasswordIcon = $('showPwIcon');

  function error(message) {
    if (errorText) errorText.textContent = message;
    if (errorBanner) errorBanner.style.display = 'flex';
  }
  function loading(active) {
    if (submit) submit.disabled = active;
    if (buttonText) buttonText.style.display = active ? 'none' : 'flex';
    if (spinner) spinner.style.display = active ? 'flex' : 'none';
  }
  function clearField(field, hint) {
    if (field) field.classList.remove('invalid', 'valid');
    if (hint) hint.textContent = '';
  }

  async function localLogin(email, pass) {
    const normalizedEmail = email.trim().toLowerCase();
    const savedEmail = (localStorage.getItem('fms_local_admin_email') || 'admin@tjconsultancyinc.com').trim().toLowerCase();
    let expectedHash = localStorage.getItem('fms_cred_ph');
    if (!expectedHash) {
      const bytes = new TextEncoder().encode(pass);
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      expectedHash = Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
      localStorage.setItem('fms_local_admin_email', savedEmail);
      localStorage.setItem('fms_cred_ph', expectedHash);
      localStorage.setItem('fms_local_admin_name', 'Administrator');
    }
    const bytes = new TextEncoder().encode(pass);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const actualHash = Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
    if (normalizedEmail !== savedEmail || actualHash !== expectedHash) return { success: false, error: 'Invalid email or password for this browser’s local account.' };
    const userId = 'local-admin-' + normalizedEmail;
    sessionStorage.setItem('fms_auth_token', 'local:' + crypto.randomUUID());
    sessionStorage.setItem('fms_auth_uid', userId);
    sessionStorage.setItem('fms_auth_user', localStorage.getItem('fms_local_admin_name') || 'Administrator');
    sessionStorage.setItem('fms_auth_role', 'admin');
    sessionStorage.setItem('fms_auth_permissions', JSON.stringify(['dashboard', 'reports', 'staff', 'settings']));
    localStorage.setItem('fms_display_name', localStorage.getItem('fms_local_admin_name') || 'Administrator');
    localStorage.setItem('fms_display_role', 'Finance Manager');
    return { success: true, local: true };
  }

  try {
    if (localStorage.getItem('fms_logo_url')) {
      const logo = $('loginLogoImg');
      const icon = $('loginLogoIcon');
      if (logo) { logo.src = localStorage.getItem('fms_logo_url'); logo.style.display = 'block'; }
      if (icon) icon.style.display = 'none';
    }
    const link = $('loginWebsiteLink');
    if (link) link.href = localStorage.getItem('fms_website_url') || 'https://tjconsultancy.com';
  } catch (_) {}

  if (showPassword) showPassword.addEventListener('click', function () {
    const reveal = password.type === 'password';
    password.type = reveal ? 'text' : 'password';
    if (showPasswordIcon) showPasswordIcon.className = reveal ? 'fas fa-eye-slash' : 'fas fa-eye';
    showPassword.setAttribute('aria-label', reveal ? 'Hide password' : 'Show password');
  });

  if (username) username.addEventListener('input', () => clearField(usernameField, usernameHint));
  if (password) password.addEventListener('input', () => {
    clearField(passwordField, passwordHint);
    if (errorBanner) errorBanner.style.display = 'none';
  });

  if (window.FMSCloud && window.FMSCloud.ready) {
    window.FMSCloud.ready.then(result => {
      if (result && result.authenticated) window.location.replace('index.html');
    }).catch(() => {});
  }

  if (form) form.addEventListener('submit', async event => {
    event.preventDefault();
    if (errorBanner) errorBanner.style.display = 'none';
    clearField(usernameField, usernameHint);
    clearField(passwordField, passwordHint);
    const email = (username && username.value || '').trim();
    const pass = password && password.value || '';
    let invalid = false;
    if (!email) { if (usernameHint) usernameHint.textContent = 'Email is required.'; if (usernameField) usernameField.classList.add('invalid'); invalid = true; }
    if (!pass) { if (passwordHint) passwordHint.textContent = 'Password is required.'; if (passwordField) passwordField.classList.add('invalid'); invalid = true; }
    if (invalid) return;
    loading(true);
    try {
      const authState = window.FMSCloud && window.FMSCloud.ready ? await window.FMSCloud.ready : null;
      if (authState && authState.error && !window.FMSCloud.hasConfiguration()) throw authState.error;
      const cloudConfigured = window.FMSCloud && window.FMSCloud.hasConfiguration && window.FMSCloud.hasConfiguration();
      const hosted = /^https?:$/.test(window.location.protocol) && !['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
      if (hosted && !cloudConfigured) throw new Error('Shared FMS sign-in is not configured. Ask the administrator to connect this domain to the shared database.');
      const result = cloudConfigured
        ? await window.FMSCloud.signIn(email, pass)
        : await localLogin(email, pass);
      if (!result || !result.success) throw new Error(result && result.error || 'Email or password is incorrect.');
      if (buttonText) buttonText.innerHTML = result.local
        ? '<i class="fas fa-check"></i> Signed in locally'
        : '<i class="fas fa-check"></i> Signed in';
      setTimeout(() => window.location.replace('index.html'), 250);
    } catch (cause) {
      error(cause && cause.message || 'Supabase could not sign you in. Try again.');
      if (password) { password.value = ''; password.focus(); }
      loading(false);
    }
  });

  window.addEventListener('DOMContentLoaded', () => { if (username) username.focus(); });
})();
