/* ============================================================
   js/settings-upload.js
   Logo upload → sidebar brand icon
   Background upload → main-wrapper overlay with opacity + blur
   localStorage persistence:
     fms_logo_url   – DataURL of company logo
     fms_bg_url     – DataURL of background image
     fms_bg_opacity – string "40" (0–90)
     fms_bg_blur    – string "4"  (0–20)
   ============================================================ */
(function () {
  'use strict';

  const MAX_LOGO_MB = 2;
  const MAX_BG_MB   = 5;

  /* ── localStorage helpers ─────────────────────────────────── */
  const LS_LOGO_URL   = 'fms_logo_url';
  const LS_BG_URL     = 'fms_bg_url';
  const LS_BG_OPACITY = 'fms_bg_opacity';
  const LS_BG_BLUR    = 'fms_bg_blur';

  function lsSet (key, val) { try { localStorage.setItem(key, val); } catch (_) {} }
  function lsGet (key)      { try { return localStorage.getItem(key); } catch (_) { return null; } }
  function lsDel (key)      { try { localStorage.removeItem(key); } catch (_) {} }

  /* ── Toast helper ─────────────────────────────────────────── */
  function showToast (msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._utimer);
    t._utimer = setTimeout(() => t.classList.remove('show'), 3000);
  }

  function readFileAsDataURL (file, maxMB, cb) {
    if (file.size > maxMB * 1024 * 1024) {
      showToast(`File too large. Maximum size is ${maxMB} MB.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = e => cb(e.target.result);
    reader.readAsDataURL(file);
  }

  /* ── Inject a full-viewport background overlay element ──── */
  let bgOverlay = document.getElementById('dashBgOverlay');
  if (!bgOverlay) {
    bgOverlay = document.createElement('div');
    bgOverlay.id = 'dashBgOverlay';
    bgOverlay.style.cssText = [
      'position:fixed','inset:0','pointer-events:none',
      'z-index:0','background-size:cover',
      'background-position:center','background-repeat:no-repeat',
      'display:none'
    ].join(';');
    document.body.insertBefore(bgOverlay, document.body.firstChild);
  }

  /* ── Current state ─────────────────────────────────────── */
  let bgDataUrl  = null;
  let bgOpacity  = 40;   // 0–90 %
  let bgBlurPx   = 4;    // 0–20 px

  function applyBackground () {
    if (!bgDataUrl) { bgOverlay.style.display = 'none'; return; }
    bgOverlay.style.display         = 'block';
    bgOverlay.style.backgroundImage = `url(${bgDataUrl})`;
    bgOverlay.style.filter          = `blur(${bgBlurPx}px)`;
    bgOverlay.style.opacity         = (bgOpacity / 100).toFixed(2);
  }

  /* ══════════════════════════════════════════════════════════
     LOGO UPLOAD
  ══════════════════════════════════════════════════════════ */
  const logoDropzone    = document.getElementById('logoDropzone');
  const logoFileInput   = document.getElementById('logoFileInput');
  const logoPreview     = document.getElementById('logoPreview');
  const logoPreviewWrap = document.getElementById('logoPreviewWrap');
  const logoPlaceholder = document.getElementById('logoPlaceholder');
  const logoRemoveBtn   = document.getElementById('logoRemoveBtn');

  /* Sidebar logo elements */
  const sidebarLogo      = document.getElementById('sidebarLogo');
  const brandIconDefault = document.getElementById('brandIconDefault');

  function applyLogo (dataUrl) {
    if (!dataUrl) {
      /* Reset sidebar */
      if (sidebarLogo)      { sidebarLogo.style.display = 'none'; sidebarLogo.src = ''; }
      if (brandIconDefault)   brandIconDefault.style.display = '';
      /* Reset preview panel */
      if (logoPreviewWrap)  logoPreviewWrap.style.display = 'none';
      if (logoPlaceholder)  logoPlaceholder.style.display = '';
      /* Persist: remove */
      lsDel(LS_LOGO_URL);
      return;
    }
    /* Show in sidebar */
    if (sidebarLogo) {
      sidebarLogo.src           = dataUrl;
      sidebarLogo.style.display = 'block';
    }
    if (brandIconDefault) brandIconDefault.style.display = 'none';
    /* Show in settings preview panel */
    if (logoPreview)      logoPreview.src               = dataUrl;
    if (logoPreviewWrap)  logoPreviewWrap.style.display = 'flex';
    if (logoPlaceholder)  logoPlaceholder.style.display = 'none';
    /* Persist */
    lsSet(LS_LOGO_URL, dataUrl);
  }

  function handleLogoFile (file) {
    if (!file || !file.type.startsWith('image/')) {
      showToast('Please upload an image file.'); return;
    }
    readFileAsDataURL(file, MAX_LOGO_MB, dataUrl => {
      applyLogo(dataUrl);
      showToast('Logo updated!');
    });
  }

  if (logoFileInput) {
    logoFileInput.addEventListener('change', () => {
      if (logoFileInput.files[0]) handleLogoFile(logoFileInput.files[0]);
      logoFileInput.value = '';
    });
  }

  /* Drag-over styling */
  [logoDropzone].forEach(zone => {
    if (!zone) return;
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
    zone.addEventListener('dragleave', ()  => zone.classList.remove('dragover'));
    zone.addEventListener('drop', e => {
      e.preventDefault(); zone.classList.remove('dragover');
      const f = e.dataTransfer.files[0];
      if (f) handleLogoFile(f);
    });
  });

  if (logoRemoveBtn) {
    logoRemoveBtn.addEventListener('click', e => {
      e.stopPropagation();
      applyLogo(null);
      showToast('Logo removed.');
    });
  }

  /* ══════════════════════════════════════════════════════════
     BACKGROUND UPLOAD
  ══════════════════════════════════════════════════════════ */
  const bgDropzone    = document.getElementById('bgDropzone');
  const bgFileInput   = document.getElementById('bgFileInput');
  const bgPreview     = document.getElementById('bgPreview');
  const bgPreviewWrap = document.getElementById('bgPreviewWrap');
  const bgPlaceholder = document.getElementById('bgPlaceholder');
  const bgRemoveBtn   = document.getElementById('bgRemoveBtn');
  const bgControls    = document.getElementById('bgControls');

  const opacitySlider = document.getElementById('bgOpacity');
  const blurSlider    = document.getElementById('bgBlur');
  const opacityVal    = document.getElementById('bgOpacityVal');
  const blurVal       = document.getElementById('bgBlurVal');

  function showBgPreview (dataUrl) {
    bgDataUrl = dataUrl;
    if (bgPreview)     bgPreview.src               = dataUrl;
    if (bgPreviewWrap) bgPreviewWrap.style.display = 'flex';
    if (bgPlaceholder) bgPlaceholder.style.display = 'none';
    if (bgControls)    bgControls.style.display    = 'flex';
    applyBackground();
    /* Persist */
    lsSet(LS_BG_URL, dataUrl);
  }

  function clearBg () {
    bgDataUrl = null;
    if (bgPreview)     bgPreview.src               = '';
    if (bgPreviewWrap) bgPreviewWrap.style.display = 'none';
    if (bgPlaceholder) bgPlaceholder.style.display = '';
    if (bgControls)    bgControls.style.display    = 'none';
    applyBackground();
    /* Persist: remove all bg keys */
    lsDel(LS_BG_URL);
    lsDel(LS_BG_OPACITY);
    lsDel(LS_BG_BLUR);
  }

  function handleBgFile (file) {
    if (!file || !file.type.startsWith('image/')) {
      showToast('Please upload an image file.'); return;
    }
    readFileAsDataURL(file, MAX_BG_MB, dataUrl => {
      showBgPreview(dataUrl);
      showToast('Background applied!');
    });
  }

  if (bgFileInput) {
    bgFileInput.addEventListener('change', () => {
      if (bgFileInput.files[0]) handleBgFile(bgFileInput.files[0]);
      bgFileInput.value = '';
    });
  }

  if (bgDropzone) {
    bgDropzone.addEventListener('dragover', e => { e.preventDefault(); bgDropzone.classList.add('dragover'); });
    bgDropzone.addEventListener('dragleave', ()  => bgDropzone.classList.remove('dragover'));
    bgDropzone.addEventListener('drop', e => {
      e.preventDefault(); bgDropzone.classList.remove('dragover');
      const f = e.dataTransfer.files[0];
      if (f) handleBgFile(f);
    });
  }

  if (bgRemoveBtn) {
    bgRemoveBtn.addEventListener('click', e => {
      e.stopPropagation();
      clearBg();
      showToast('Background removed.');
    });
  }

  /* ── Sliders ─────────────────────────────────────────────── */
  if (opacitySlider) {
    opacitySlider.addEventListener('input', () => {
      bgOpacity = parseInt(opacitySlider.value);
      if (opacityVal) opacityVal.textContent = bgOpacity + '%';
      applyBackground();
      /* Persist */
      lsSet(LS_BG_OPACITY, String(bgOpacity));
    });
  }

  if (blurSlider) {
    blurSlider.addEventListener('input', () => {
      bgBlurPx = parseInt(blurSlider.value);
      if (blurVal) blurVal.textContent = bgBlurPx + 'px';
      applyBackground();
      /* Persist */
      lsSet(LS_BG_BLUR, String(bgBlurPx));
    });
  }

  /* ══════════════════════════════════════════════════════════
     RESTORE ON PAGE LOAD
     Reads localStorage and re-applies logo + background
     so branding survives page reloads until admin changes it.
  ══════════════════════════════════════════════════════════ */
  function restoreAllBranding () {
    /* ── Restore logo ─────────────────────────────────────── */
    const savedLogo = lsGet(LS_LOGO_URL);
    if (savedLogo) {
      applyLogo(savedLogo);
    }

    /* ── Restore background ───────────────────────────────── */
    const savedBgUrl = lsGet(LS_BG_URL);
    if (savedBgUrl) {
      /* Restore slider values first so applyBackground() uses them */
      const savedOp = lsGet(LS_BG_OPACITY);
      const savedBl = lsGet(LS_BG_BLUR);

      if (savedOp !== null) {
        bgOpacity = parseInt(savedOp) || 40;
        if (opacitySlider) opacitySlider.value        = bgOpacity;
        if (opacityVal)    opacityVal.textContent     = bgOpacity + '%';
      }
      if (savedBl !== null) {
        bgBlurPx = parseInt(savedBl) || 4;
        if (blurSlider) blurSlider.value              = bgBlurPx;
        if (blurVal)    blurVal.textContent           = bgBlurPx + 'px';
      }

      /* showBgPreview would overwrite LS again — use internal path instead */
      bgDataUrl = savedBgUrl;
      if (bgPreview)     bgPreview.src               = savedBgUrl;
      if (bgPreviewWrap) bgPreviewWrap.style.display = 'flex';
      if (bgPlaceholder) bgPlaceholder.style.display = 'none';
      if (bgControls)    bgControls.style.display    = 'flex';
      applyBackground();
    }
  }

  /* Fire after DOM is fully parsed */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', restoreAllBranding);
  } else {
    restoreAllBranding();
  }

})();

/* ============================================================
   FAVICON UPLOAD — stored permanently, applied site-wide
   ============================================================ */
(function () {
  'use strict';

  const LS_FAVICON = 'fms_favicon_url';
  const DEFAULT_FAVICON = (document.querySelector('link[rel~="icon"]') || {}).href || '';
  const MAX_FAVICON_MB = 2;

  /* This block runs in its own module scope, so it needs its own safe
     storage, notification and FileReader helpers. */
  function lsSet (key, value) { try { localStorage.setItem(key, value); return true; } catch (_) { return false; } }
  function lsGet (key) { try { return localStorage.getItem(key); } catch (_) { return null; } }
  function lsDel (key) { try { localStorage.removeItem(key); } catch (_) {} }
  function showToast (message) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toast._faviconTimer);
    toast._faviconTimer = setTimeout(() => toast.classList.remove('show'), 3000);
  }
  function readFileAsDataURL (file, maxMB, callback) {
    if (file.size > maxMB * 1024 * 1024) {
      showToast('Favicon is too large. Maximum size is ' + maxMB + ' MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = event => callback(event.target.result);
    reader.onerror = () => showToast('The favicon could not be read. Please try another file.');
    reader.readAsDataURL(file);
  }

  function faviconMimeType (url) {
    const value = String(url || '').toLowerCase();
    if (value === 'image/png' || value.indexOf('data:image/png') === 0 || /\.png(?:[?#]|$)/.test(value)) return 'image/png';
    if (value === 'image/jpeg' || value === 'image/jpg' || value.indexOf('data:image/jpeg') === 0 || value.indexOf('data:image/jpg') === 0 || /\.jpe?g(?:[?#]|$)/.test(value)) return 'image/jpeg';
    if (value === 'image/x-icon' || value === 'image/vnd.microsoft.icon' || value.indexOf('data:image/x-icon') === 0 || value.indexOf('data:image/vnd.microsoft.icon') === 0 || /\.ico(?:[?#]|$)/.test(value)) return 'image/x-icon';
    if (value === 'image/svg+xml' || value.indexOf('data:image/svg+xml') === 0 || /\.svg(?:[?#]|$)/.test(value)) return 'image/svg+xml';
    return '';
  }

  function applyFavicon (url) {
    /* Reuse the page icon link, or create one if it was removed. */
    let link = document.getElementById('faviconSvg') || document.getElementById('faviconLink');
    if (!link) {
      link = document.createElement('link');
      link.id = 'faviconLink';
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = url;
    const touchIcon = document.getElementById('appleTouchIcon');
    if (touchIcon) touchIcon.href = url;
    const type = faviconMimeType(url);
    if (type) link.setAttribute('type', type);
    else link.removeAttribute('type');
  }

  function showFavPreview (dataUrl) {
    const wrap = document.getElementById('favPreviewWrap');
    const img  = document.getElementById('favPreview');
    const ph   = document.getElementById('favPlaceholder');
    if (img)  img.src = dataUrl;
    if (wrap) wrap.style.display = 'flex';
    if (ph)   ph.style.display   = 'none';
  }
  function clearFavPreview () {
    const wrap = document.getElementById('favPreviewWrap');
    const ph   = document.getElementById('favPlaceholder');
    if (wrap) wrap.style.display = 'none';
    if (ph)   ph.style.display   = '';
  }

  function handleFavFile (file) {
    const allowedName = /\.(png|jpe?g|ico|svg)$/i.test((file && file.name) || '');
    const allowedType = /^(image\/(png|jpg|jpeg|svg\+xml|x-icon|vnd\.microsoft\.icon))$/i.test((file && file.type) || '');
    if (!file || (!allowedName && !allowedType)) { showToast('Choose a PNG, JPG, ICO, or SVG favicon.'); return; }
    readFileAsDataURL(file, MAX_FAVICON_MB, dataUrl => {
      /* Some operating systems report an empty or non-standard image MIME
         type. Preserve an accepted icon as a browser-readable data URL. */
      const detectedType = faviconMimeType(file.type || file.name);
      if (detectedType) dataUrl = dataUrl.replace(/^data:[^;,]+/i, 'data:' + detectedType);
      applyFavicon(dataUrl);
      showFavPreview(dataUrl);
      if (!lsSet(LS_FAVICON, dataUrl)) {
        showToast('Favicon applied, but this browser could not save it.');
        return;
      }
      showToast('Favicon updated — saved as the permanent default.');
    });
  }

  const favDrop = document.getElementById('faviconDropzone');
  const favInput = document.getElementById('faviconFileInput');
  if (favInput) {
    favInput.addEventListener('change', () => {
      if (favInput.files[0]) handleFavFile(favInput.files[0]);
      favInput.value = '';
    });
  }
  if (favDrop) {
    favDrop.addEventListener('dragover', e => { e.preventDefault(); favDrop.classList.add('dragover'); });
    favDrop.addEventListener('dragleave', () => favDrop.classList.remove('dragover'));
    favDrop.addEventListener('drop', e => {
      e.preventDefault(); favDrop.classList.remove('dragover');
      const f = e.dataTransfer.files[0];
      if (f) handleFavFile(f);
    });
  }
  const favRemoveBtn = document.getElementById('favRemoveBtn');
  if (favRemoveBtn) {
    favRemoveBtn.addEventListener('click', e => {
      e.stopPropagation();
      lsDel(LS_FAVICON);
      applyFavicon(DEFAULT_FAVICON);
      clearFavPreview();
      showToast('Favicon reset to default.');
    });
  }

  /* Restore on load */
  const savedFav = lsGet(LS_FAVICON);
  if (savedFav) { applyFavicon(savedFav); showFavPreview(savedFav); }

  /* Reflect a favicon changed from another open tab immediately. */
  window.addEventListener('storage', event => {
    if (event.key !== LS_FAVICON) return;
    if (event.newValue) {
      applyFavicon(event.newValue);
      showFavPreview(event.newValue);
    } else {
      applyFavicon(DEFAULT_FAVICON);
      clearFavPreview();
    }
  });
})();
