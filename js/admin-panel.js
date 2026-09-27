/* ============================================================
   js/admin-panel.js  —  Admin Panel popup for TJ Consultancy FMS
   ============================================================ */

(function () {
  'use strict';

  /* ── localStorage helpers ── */
  const LS_PHOTO = 'fms_profile_photo';
  const LS_NAME  = 'fms_display_name';
  const LS_ROLE  = 'fms_display_role';
  function lsSet (k, v) { try { localStorage.setItem(k, v); } catch (_) {} }
  function lsGet (k)    { try { return localStorage.getItem(k); } catch (_) { return null; } }
  function lsDel (k)    { try { localStorage.removeItem(k); } catch (_) {} }

  /* ── helpers ── */
  const $ = id => document.getElementById(id);

  function showToast (msg, duration) {
    const t = $('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._apTimer);
    t._apTimer = setTimeout(() => t.classList.remove('show'), duration || 3000);
  }

  /* ── element refs ── */
  const trigger       = $('topbarAdminTrigger');   /* moved to topbar */
  const popup         = $('adminPanelPopup');
  const chevron       = $('adminChevron');

  /* Avatar elements — popup zone */
  const popupInitials = $('adminAvatarInitials');
  const popupImg      = $('adminAvatarImg');
  const editBtn       = $('adminAvatarEditBtn');

  /* Avatar elements — topbar trigger (was sidebar footer) */
  const footInitials  = $('adminAvatarInitialsFoot');
  const footImg       = $('adminAvatarImgFoot');

  /* Profile photo input */
  const photoInput    = $('adminPhotoInput');

  /* Menu items */
  const menuSettings  = $('adminMenuSettings');
  const menuEdit      = $('adminMenuEditProfile');
  const menuLogo      = $('adminMenuUploadLogo');
  const menuBg        = $('adminMenuUploadBg');
  const menuSignOut   = $('adminMenuSignOut');

  /* ── state ── */
  let isOpen = false;

  /* ============================================================
     OPEN / CLOSE
     ============================================================ */
  function openPanel () {
    if (!popup || !trigger) return;
    isOpen = true;
    popup.classList.add('open');
    popup.setAttribute('aria-hidden', 'false');
    trigger.setAttribute('aria-expanded', 'true');
  }

  function closePanel () {
    if (!popup || !trigger) return;
    isOpen = false;
    popup.classList.remove('open');
    popup.setAttribute('aria-hidden', 'true');
    trigger.setAttribute('aria-expanded', 'false');
    /* Also hide edit-profile form if it was open */
    const form = $('adminEditProfileForm');
    if (form) form.classList.remove('visible');
  }

  function togglePanel () {
    isOpen ? closePanel() : openPanel();
  }

  if (trigger) {
    trigger.addEventListener('click', e => {
      e.stopPropagation();
      togglePanel();
    });
    trigger.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        togglePanel();
      }
      if (e.key === 'Escape') closePanel();
    });
  }

  /* Close on outside click */
  document.addEventListener('click', e => {
    if (!isOpen) return;
    if (popup && !popup.contains(e.target) && e.target !== trigger && !trigger.contains(e.target)) {
      closePanel();
    }
  });

  /* Close on Escape anywhere */
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && isOpen) closePanel();
  });

  /* ============================================================
     PROFILE PHOTO UPLOAD
     ============================================================ */

  /* Apply a data-URL to all avatar locations */
  function applyProfilePhoto (dataUrl) {
    /* Popup zone */
    if (popupInitials) popupInitials.style.display = 'none';
    if (popupImg)      { popupImg.src = dataUrl; popupImg.style.display = 'block'; }

    /* Topbar trigger avatar */
    if (footInitials) footInitials.style.display = 'none';
    if (footImg)      { footImg.src = dataUrl; footImg.style.display = 'inline-block'; }

    /* Update the topbar-admin-avatar container */
    const topbarAvatar = $('adminAvatar');
    if (topbarAvatar) {
      topbarAvatar.innerHTML = '';
      const img = document.createElement('img');
      img.src = dataUrl;
      img.alt = 'Profile photo';
      img.style.cssText = 'width:32px;height:32px;border-radius:50%;object-fit:cover;';
      topbarAvatar.appendChild(img);
    }

    /* Also update the sidebar footer avatar if it exists */
    const sidebarFootAvatar = $('sidebarFooterAvatar');
    if (sidebarFootAvatar) {
      sidebarFootAvatar.innerHTML = '';
      const img2 = document.createElement('img');
      img2.src = dataUrl;
      img2.alt = 'Profile photo';
      img2.style.cssText = 'width:34px;height:34px;border-radius:50%;object-fit:cover;';
      sidebarFootAvatar.appendChild(img2);
    }

    /* Persist */
    if (dataUrl) lsSet(LS_PHOTO, dataUrl);
    else         lsDel(LS_PHOTO);
    showToast('Profile photo updated ✓', 2500);
  }

  function handleProfileFile (file) {
    if (!file || !file.type.startsWith('image/')) {
      showToast('Please select a valid image file.', 3000);
      return;
    }
    const reader = new FileReader();
    reader.onload = e => applyProfilePhoto(e.target.result);
    reader.readAsDataURL(file);
  }

  /* Click on camera button → trigger file input */
  if (editBtn) {
    editBtn.addEventListener('click', e => {
      e.stopPropagation();
      if (photoInput) photoInput.click();
    });
  }

  /* Click on "Upload Photo" label text also triggers */
  if (photoInput) {
    photoInput.addEventListener('change', e => {
      const file = e.target.files && e.target.files[0];
      if (file) handleProfileFile(file);
      /* Reset so same file can be re-selected */
      e.target.value = '';
    });
  }

  /* Drag-and-drop on the profile upload zone */
  const uploadZone = $('adminProfileUploadZone');
  if (uploadZone) {
    uploadZone.addEventListener('dragover', e => {
      e.preventDefault();
      uploadZone.style.background = 'rgba(79,195,247,0.10)';
    });
    uploadZone.addEventListener('dragleave', () => {
      uploadZone.style.background = '';
    });
    uploadZone.addEventListener('drop', e => {
      e.preventDefault();
      uploadZone.style.background = '';
      const file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) handleProfileFile(file);
    });
  }

  /* ============================================================
     MENU ITEM ACTIONS
     ============================================================ */

  /* ─── Settings ─── */
  if (menuSettings) {
    menuSettings.addEventListener('click', () => {
      closePanel();
      /* Delegate to app.js switchView */
      const settingsLink = document.querySelector('.nav-link[data-view="settings"]');
      if (settingsLink) {
        settingsLink.click();
      } else {
        /* Fallback: dispatch custom event */
        document.dispatchEvent(new CustomEvent('fms:switchView', { detail: 'settings' }));
      }
    });
  }

  /* ─── Edit Profile ─── */
  if (menuEdit) {
    menuEdit.addEventListener('click', e => {
      e.stopPropagation();
      toggleEditProfileForm();
    });
  }

  function toggleEditProfileForm () {
    let form = $('adminEditProfileForm');

    if (!form) {
      /* Build the form once */
      form = document.createElement('div');
      form.id = 'adminEditProfileForm';
      form.className = 'admin-edit-profile-form';
      form.innerHTML =
        '<input type="text" class="admin-edit-input" id="editProfileName" placeholder="Display name" maxlength="40" />' +
        '<input type="text" class="admin-edit-input" id="editProfileRole" placeholder="Role / title" maxlength="40" />' +
        '<button class="admin-edit-save-btn" id="editProfileSaveBtn">Save</button>';

      /* Insert after divider (after the profile zone) */
      const divider = popup.querySelector('.admin-panel-divider');
      if (divider) {
        divider.parentNode.insertBefore(form, divider.nextSibling);
      } else {
        popup.appendChild(form);
      }

      /* Pre-fill current values */
      const nameEl = $('editProfileName');
      const roleEl = $('editProfileRole');
      const curName = document.querySelector('.admin-profile-name');
      const curRole = document.querySelector('.admin-profile-role');
      if (nameEl && curName) nameEl.value = curName.textContent;
      if (roleEl && curRole) roleEl.value = curRole.textContent;

      /* Save button handler */
      const saveBtn = $('editProfileSaveBtn');
      if (saveBtn) {
        saveBtn.addEventListener('click', saveProfileEdit);
      }
    }

    /* Toggle visibility */
    const visible = form.classList.toggle('visible');

    /* If newly opened, pre-fill and focus name */
    if (visible) {
      const nameEl = $('editProfileName');
      const roleEl = $('editProfileRole');
      const curName = document.querySelector('.admin-profile-name');
      const curRole = document.querySelector('.admin-profile-role');
      if (nameEl && curName) nameEl.value = curName.textContent;
      if (roleEl && curRole) roleEl.value = curRole.textContent;
      if (nameEl) setTimeout(() => nameEl.focus(), 50);
    }
  }

  function saveProfileEdit () {
    const nameVal = ($('editProfileName') || {}).value || '';
    const roleVal = ($('editProfileRole') || {}).value || '';

    /* Update popup profile text */
    const profileName = document.querySelector('.admin-profile-name');
    const profileRole = document.querySelector('.admin-profile-role');
    if (profileName && nameVal.trim()) profileName.textContent = nameVal.trim();
    if (profileRole && roleVal.trim()) profileRole.textContent = roleVal.trim();

    /* Update topbar trigger text */
    const topbarInfo = trigger ? trigger.querySelector('.topbar-admin-info') : null;
    if (topbarInfo) {
      const nameEl = topbarInfo.querySelector('.user-name');
      const roleEl = topbarInfo.querySelector('.user-role');
      if (nameEl && nameVal.trim()) nameEl.textContent = nameVal.trim();
      if (roleEl && roleVal.trim()) roleEl.textContent = roleVal.trim();
    }

    /* Also update sidebar footer info display */
    const footName = document.querySelector('.sidebar-footer-name');
    const footRole = document.querySelector('.sidebar-footer-role');
    if (footName && nameVal.trim()) footName.textContent = nameVal.trim();
    if (footRole && roleVal.trim()) footRole.textContent = roleVal.trim();

    /* Persist name + role */
    if (nameVal.trim()) lsSet(LS_NAME, nameVal.trim());
    if (roleVal.trim()) lsSet(LS_ROLE, roleVal.trim());

    /* Hide form */
    const form = $('adminEditProfileForm');
    if (form) form.classList.remove('visible');

    showToast('Profile updated ✓', 2500);
  }

  /* ─── Upload Logo shortcut ─── */
  if (menuLogo) {
    menuLogo.addEventListener('click', () => {
      closePanel();
      /* Navigate to Settings and trigger logo input */
      const settingsLink = document.querySelector('.nav-link[data-view="settings"]');
      if (settingsLink) settingsLink.click();
      setTimeout(() => {
        const logoInput = $('logoFileInput');
        if (logoInput) {
          logoInput.click();
          showToast('Settings opened — select a logo file', 3000);
        }
      }, 320);
    });
  }

  /* ─── Upload Background shortcut ─── */
  if (menuBg) {
    menuBg.addEventListener('click', () => {
      closePanel();
      /* Navigate to Settings and trigger background input */
      const settingsLink = document.querySelector('.nav-link[data-view="settings"]');
      if (settingsLink) settingsLink.click();
      setTimeout(() => {
        const bgInput = $('bgFileInput');
        if (bgInput) {
          bgInput.click();
          showToast('Settings opened — select a background image', 3000);
        }
      }, 320);
    });
  }

  /* ─── Sign Out ─── */
  if (menuSignOut) {
    menuSignOut.addEventListener('click', () => {
      closePanel();
      showSignOutConfirm();
    });
  }

  function showSignOutConfirm () {
    /* Remove any existing confirm banner */
    const existing = $('signOutConfirmBanner');
    if (existing) { existing.remove(); return; }

    const banner = document.createElement('div');
    banner.id = 'signOutConfirmBanner';
    banner.style.cssText = [
      'position:fixed', 'top:80px', 'left:50%', 'transform:translateX(-50%)',
      'background:#1e293b', 'border:1px solid rgba(248,113,113,0.4)',
      'border-radius:10px', 'padding:16px 24px', 'z-index:9999',
      'display:flex', 'align-items:center', 'gap:14px',
      'box-shadow:0 8px 32px rgba(0,0,0,0.5)',
      'font-family:Inter,sans-serif', 'font-size:14px', 'color:#fff',
      'min-width:280px', 'max-width:90vw'
    ].join(';');

    banner.innerHTML =
      '<i class="fas fa-sign-out-alt" style="color:#f87171;font-size:18px;flex-shrink:0;"></i>' +
      '<span style="flex:1;">Sign out of TJ Consultancy FMS?</span>' +
      '<button id="signOutYesBtn" style="' +
        'background:#f87171;border:none;border-radius:6px;color:#fff;' +
        'padding:6px 14px;font-size:12px;font-weight:600;cursor:pointer;' +
        'transition:background 0.2s;font-family:Inter,sans-serif;"' +
      '>Sign Out</button>' +
      '<button id="signOutNoBtn" style="' +
        'background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);' +
        'border-radius:6px;color:#fff;padding:6px 14px;font-size:12px;' +
        'font-weight:600;cursor:pointer;font-family:Inter,sans-serif;"' +
      '>Cancel</button>';

    document.body.appendChild(banner);

    const yesBtn = $('signOutYesBtn');
    const noBtn  = $('signOutNoBtn');

    if (yesBtn) {
      yesBtn.addEventListener('mouseover', () => { yesBtn.style.background = '#dc2626'; });
      yesBtn.addEventListener('mouseout',  () => { yesBtn.style.background = '#f87171'; });
      yesBtn.addEventListener('click', async () => {
        banner.remove();
        showToast('You have been signed out. Goodbye!', 2000);
        /* Revoke session in DB + clear sessionStorage via AuthAPI */
        try {
          if (window.FMSCloud && typeof window.FMSCloud.signOut === 'function' && window.FMSCloud.isConfigured && window.FMSCloud.isConfigured()) {
            await window.FMSCloud.signOut();
          } else if (window.AuthAPI && typeof window.AuthAPI.logout === 'function') {
            await window.AuthAPI.logout();
          } else {
            sessionStorage.removeItem('fms_auth_token');
            sessionStorage.removeItem('fms_auth_uid');
            sessionStorage.removeItem('fms_auth_sid');
            sessionStorage.removeItem('fms_auth_user');
          }
        } catch (_) {}
        /* Redirect to login page after a brief goodbye toast */
        setTimeout(function () {
          window.location.replace('login.html');
        }, 900);
      });
    }
    if (noBtn) {
      noBtn.addEventListener('click', () => banner.remove());
    }

    /* Auto-dismiss after 8 s */
    setTimeout(() => { if (banner.parentNode) banner.remove(); }, 8000);
  }

  function showSignOutOverlay () {
    const overlay = document.createElement('div');
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'background:rgba(13,27,46,0.97)',
      'z-index:99999', 'display:flex', 'flex-direction:column',
      'align-items:center', 'justify-content:center', 'gap:18px',
      'font-family:Inter,sans-serif', 'color:#fff',
      'animation:fadeInOverlay 0.4s ease'
    ].join(';');

    overlay.innerHTML =
      '<div style="font-size:48px;"><i class="fas fa-shield-alt" style="color:#4fc3f7;"></i></div>' +
      '<div style="font-size:22px;font-weight:700;letter-spacing:-0.5px;">TJ Consultancy FMS</div>' +
      '<div style="font-size:14px;color:rgba(255,255,255,0.6);">You have been signed out.</div>' +
      '<button onclick="this.closest(\'div[style]\').remove();location.reload();" style="' +
        'margin-top:8px;padding:10px 28px;background:#4fc3f7;border:none;' +
        'border-radius:8px;color:#0d1b2e;font-weight:700;font-size:14px;' +
        'cursor:pointer;font-family:Inter,sans-serif;">' +
        'Sign In Again' +
      '</button>';

    /* Add the fade-in keyframe if not already present */
    if (!document.getElementById('apFadeStyle')) {
      const s = document.createElement('style');
      s.id = 'apFadeStyle';
      s.textContent = '@keyframes fadeInOverlay{from{opacity:0}to{opacity:1}}';
      document.head.appendChild(s);
    }

    document.body.appendChild(overlay);
  }

  /* ============================================================
     LISTEN FOR EXTERNAL switchView EVENTS
     (in case app.js is loaded before admin-panel.js)
     ============================================================ */
  document.addEventListener('fms:switchView', e => {
    /* app.js exposes switchView on window for cross-module use */
    if (typeof window.fmsSwitchView === 'function') {
      window.fmsSwitchView(e.detail);
    }
  });

  /* ============================================================
     RESTORE ADMIN PROFILE ON PAGE LOAD
     Reads localStorage and re-applies photo + name + role
     so admin identity survives page reloads.
     Runs after DOMContentLoaded so all elements are present.
     ============================================================ */
  function restoreAdminProfile () {
    /* ── Profile photo ─────────────────────────────────────── */
    const savedPhoto = lsGet(LS_PHOTO);
    if (savedPhoto) {
      /* Populate all avatar locations without re-saving to LS */
      if (popupInitials) popupInitials.style.display = 'none';
      if (popupImg)      { popupImg.src = savedPhoto; popupImg.style.display = 'block'; }
      if (footInitials)  footInitials.style.display  = 'none';
      if (footImg)       { footImg.src = savedPhoto;  footImg.style.display  = 'inline-block'; }

      const topbarAvatar = $('adminAvatar');
      if (topbarAvatar) {
        topbarAvatar.innerHTML = '';
        const img = document.createElement('img');
        img.src = savedPhoto;
        img.alt = 'Profile photo';
        img.style.cssText = 'width:32px;height:32px;border-radius:50%;object-fit:cover;';
        topbarAvatar.appendChild(img);
      }

      const sidebarFootAvatar = $('sidebarFooterAvatar');
      if (sidebarFootAvatar) {
        sidebarFootAvatar.innerHTML = '';
        const img2 = document.createElement('img');
        img2.src = savedPhoto;
        img2.alt = 'Profile photo';
        img2.style.cssText = 'width:34px;height:34px;border-radius:50%;object-fit:cover;';
        sidebarFootAvatar.appendChild(img2);
      }
    }

    /* ── Display name ──────────────────────────────────────── */
    const savedName = lsGet(LS_NAME);
    const savedRole = lsGet(LS_ROLE);

    if (savedName) {
      const profileName = document.querySelector('.admin-profile-name');
      if (profileName) profileName.textContent = savedName;

      const topbarInfo = trigger ? trigger.querySelector('.topbar-admin-info') : null;
      if (topbarInfo) {
        const nameEl = topbarInfo.querySelector('.user-name');
        if (nameEl) nameEl.textContent = savedName;
      }

      const footName = document.querySelector('.sidebar-footer-name');
      if (footName) footName.textContent = savedName;
    }

    /* ── Display role ──────────────────────────────────────── */
    if (savedRole) {
      const profileRole = document.querySelector('.admin-profile-role');
      if (profileRole) profileRole.textContent = savedRole;

      const topbarInfo = trigger ? trigger.querySelector('.topbar-admin-info') : null;
      if (topbarInfo) {
        const roleEl = topbarInfo.querySelector('.user-role');
        if (roleEl) roleEl.textContent = savedRole;
      }

      const footRole = document.querySelector('.sidebar-footer-role');
      if (footRole) footRole.textContent = savedRole;
    }
  }

  /* Fire after DOM is fully ready */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', restoreAdminProfile);
  } else {
    restoreAdminProfile();
  }

})();
