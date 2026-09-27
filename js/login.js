/* Neon Auth sign-in for the TJ Consultancy FMS. */
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
    if (!email) { if (usernameHint) usernameHint.textContent = 'Email or username is required.'; if (usernameField) usernameField.classList.add('invalid'); invalid = true; }
    if (!pass) { if (passwordHint) passwordHint.textContent = 'Password is required.'; if (passwordField) passwordField.classList.add('invalid'); invalid = true; }
    if (invalid) return;
    if (!window.FMSCloud || !window.FMSCloud.hasConfiguration || !window.FMSCloud.hasConfiguration()) {
      error('Neon sign-in is not available in this browser context. Open the deployed HTTPS site.');
      return;
    }
    loading(true);
    try {
      const result = await window.FMSCloud.signIn(email, pass);
      if (!result || !result.success) throw new Error(result && result.error || 'Email, username, or password is incorrect.');
      if (buttonText) buttonText.innerHTML = '<i class="fas fa-check"></i> Signed in';
      setTimeout(() => window.location.replace('index.html'), 250);
    } catch (cause) {
      error(cause && cause.message || 'Neon could not sign you in. Try again.');
      if (password) { password.value = ''; password.focus(); }
      loading(false);
    }
  });

  window.addEventListener('DOMContentLoaded', () => { if (username) username.focus(); });
})();
