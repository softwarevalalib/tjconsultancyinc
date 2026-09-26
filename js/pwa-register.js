/* ============================================================
   js/pwa-register.js - TJ Consultancy FMS install experience

   Installs the FMS as a Progressive Web App on supported desktop
   and mobile operating systems. Chromium browsers receive their
   native prompt; Safari, Firefox, and browsers without a prompt
   receive concise, platform-specific installation steps.
   ============================================================ */
(function () {
  "use strict";

  var deferredPrompt = null;
  var installButton = null;
  var installDialog = null;
  var lastFocusedElement = null;

  function isStandalone() {
    return (
      (window.matchMedia &&
        window.matchMedia("(display-mode: standalone)").matches) ||
      window.navigator.standalone === true
    );
  }

  function getPlatform() {
    var ua = (navigator.userAgent || "").toLowerCase();
    var isIPad =
      navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;

    if (/iphone|ipod|ipad/.test(ua) || isIPad) return "ios";
    if (/android/.test(ua)) return "android";
    if (/cros/.test(ua)) return "chromeos";
    if (/windows/.test(ua)) return "windows";
    if (/mac os|macintosh/.test(ua)) return "macos";
    if (/linux/.test(ua)) return "linux";
    return "other";
  }

  function isSafari() {
    var ua = navigator.userAgent || "";
    return (
      /safari/i.test(ua) &&
      !/chrome|chromium|crios|fxios|edg|opr|opera|android/i.test(ua)
    );
  }

  function hasSecureInstallContext() {
    var host = window.location.hostname;
    return (
      window.isSecureContext === true ||
      window.location.protocol === "https:" ||
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "[::1]"
    );
  }

  function getInstallTarget() {
    return (
      document.getElementById("pwaInstallSlot") ||
      document.querySelector(".topbar-right")
    );
  }

  function setButtonStatus(message) {
    if (!installButton) return;
    installButton.setAttribute("data-status", message || "");
  }

  function renderInstallButton() {
    var target = getInstallTarget();
    if (!target || isStandalone()) {
      if (installButton) installButton.hidden = true;
      return;
    }

    installButton = document.getElementById("pwaInstallBtn");
    if (!installButton) {
      installButton = document.createElement("button");
      installButton.type = "button";
      installButton.id = "pwaInstallBtn";
      installButton.className = "pwa-install-btn";
      installButton.setAttribute("aria-haspopup", "dialog");
      installButton.innerHTML =
        '<i class="fas fa-download" aria-hidden="true"></i>' +
        '<span class="pwa-install-label">Install App</span>';
      installButton.title = "Install TJ Consultancy FMS on this device";
      installButton.addEventListener("click", requestInstall);
      target.appendChild(installButton);
    }

    installButton.hidden = false;
    setButtonStatus(
      deferredPrompt
        ? "The app is ready to install."
        : "Open installation options for this device.",
    );
  }

  function getManualInstructions() {
    var platform = getPlatform();

    if (platform === "ios") {
      return {
        title: "Install TJ FMS on iPhone or iPad",
        intro: isSafari()
          ? "Safari can add TJ FMS to your Home Screen as an app."
          : "To install on iPhone or iPad, first open this page in Safari.",
        steps: isSafari()
          ? [
              "Tap the Share button (the square with an upward arrow).",
              "Scroll down and choose Add to Home Screen.",
              "Tap Add to finish. TJ FMS will appear on your Home Screen.",
            ]
          : [
              "Open this page in Safari.",
              "Tap Share, then choose Add to Home Screen.",
              "Tap Add to finish.",
            ],
        note: "The installed app opens full screen and can be used offline after its first successful load.",
      };
    }

    if (platform === "android") {
      return {
        title: "Install TJ FMS on Android",
        intro: "Use your browser menu to add TJ FMS to this device.",
        steps: [
          "Open the browser menu (usually the three dots).",
          "Choose Install app or Add to Home screen.",
          "Confirm the installation when prompted.",
        ],
        note: "In Chrome, Edge, and other compatible browsers, this button will show a native prompt when the app is ready.",
      };
    }

    if (platform === "chromeos") {
      return {
        title: "Install TJ FMS on ChromeOS",
        intro: "Install TJ FMS from the browser menu for a dedicated app window.",
        steps: [
          "Open the browser menu.",
          "Choose Install TJ FMS or Install app.",
          "Confirm to add it to your launcher.",
        ],
        note: "The installed app can be opened from the ChromeOS launcher.",
      };
    }

    var desktopName =
      platform === "windows"
        ? "Windows"
        : platform === "macos"
          ? "macOS"
          : platform === "linux"
            ? "Linux"
            : "your desktop";
    return {
      title: "Install TJ FMS on " + desktopName,
      intro:
        "Chrome, Microsoft Edge, and other compatible desktop browsers can install TJ FMS as its own application.",
      steps: [
        "Open the browser menu or look for the install icon in the address bar.",
        "Choose Install TJ FMS or Install app.",
        "Confirm the installation. You can then open it like any other desktop app.",
      ],
      note: "If your browser does not offer an install option, open this secure site in the latest Chrome or Microsoft Edge.",
    };
  }

  function ensureInstallDialog() {
    if (installDialog) return installDialog;

    installDialog = document.createElement("div");
    installDialog.id = "pwaInstallDialog";
    installDialog.className = "pwa-install-modal";
    installDialog.hidden = true;
    installDialog.innerHTML =
      '<div class="pwa-install-backdrop" data-pwa-close="true"></div>' +
      '<section class="pwa-install-panel" role="dialog" aria-modal="true" aria-labelledby="pwaInstallTitle" aria-describedby="pwaInstallIntro" tabindex="-1">' +
      '<button type="button" class="pwa-install-close" aria-label="Close install instructions" data-pwa-close="true">&times;</button>' +
      '<div class="pwa-install-icon" aria-hidden="true"><i class="fas fa-download"></i></div>' +
      '<h2 id="pwaInstallTitle"></h2>' +
      '<p id="pwaInstallIntro" class="pwa-install-intro"></p>' +
      '<ol class="pwa-install-steps" id="pwaInstallSteps"></ol>' +
      '<p class="pwa-install-note" id="pwaInstallNote"></p>' +
      '<div class="pwa-install-actions">' +
      '<button type="button" class="pwa-install-action pwa-install-action--secondary" data-pwa-close="true">Close</button>' +
      '</div>' +
      "</section>";
    document.body.appendChild(installDialog);

    installDialog.addEventListener("click", function (event) {
      if (event.target && event.target.getAttribute("data-pwa-close") === "true") {
        closeInstallDialog();
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !installDialog.hidden) {
        closeInstallDialog();
      }
    });

    return installDialog;
  }

  function openInstallDialog() {
    var dialog = ensureInstallDialog();
    var instructions = getManualInstructions();
    var title = dialog.querySelector("#pwaInstallTitle");
    var intro = dialog.querySelector("#pwaInstallIntro");
    var steps = dialog.querySelector("#pwaInstallSteps");
    var note = dialog.querySelector("#pwaInstallNote");

    title.textContent = instructions.title;
    intro.textContent = instructions.intro;
    steps.innerHTML = "";
    instructions.steps.forEach(function (step) {
      var item = document.createElement("li");
      item.textContent = step;
      steps.appendChild(item);
    });
    note.textContent =
      instructions.note +
      (hasSecureInstallContext()
        ? ""
        : " Installation requires the app to be served over HTTPS (localhost is supported for development)." );

    lastFocusedElement = document.activeElement;
    dialog.hidden = false;
    if (installButton) installButton.setAttribute("aria-expanded", "true");
    dialog.querySelector(".pwa-install-panel").focus();
  }

  function closeInstallDialog() {
    if (!installDialog) return;
    installDialog.hidden = true;
    if (installButton) installButton.setAttribute("aria-expanded", "false");
    if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
      lastFocusedElement.focus();
    }
  }

  function setInstalledState() {
    if (installButton) {
      installButton.hidden = true;
      installButton.setAttribute("aria-expanded", "false");
    }
    closeInstallDialog();
    if (typeof window.showToast === "function") {
      window.showToast("TJ FMS has been installed on this device.", 3500);
    }
  }

  function requestInstall() {
    if (isStandalone()) {
      setInstalledState();
      return;
    }

    if (!deferredPrompt) {
      openInstallDialog();
      return;
    }

    var prompt = deferredPrompt;
    deferredPrompt = null;
    installButton.disabled = true;

    try {
      prompt.prompt();
      Promise.resolve(prompt.userChoice)
        .then(function (choice) {
          if (choice && choice.outcome === "accepted") {
            setButtonStatus("Installation is being confirmed by your browser.");
          } else {
            setButtonStatus("Installation was dismissed. You can use the browser menu to install later.");
          }
        })
        .catch(function () {
          setButtonStatus("Use the browser menu to install this app.");
        })
        .finally(function () {
          if (installButton) installButton.disabled = false;
        });
    } catch (_) {
      if (installButton) installButton.disabled = false;
      openInstallDialog();
    }
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch(function () {
      /* The online app remains usable if service workers are unavailable. */
    });
  }

  function boot() {
    renderInstallButton();
    registerServiceWorker();

    window.addEventListener("beforeinstallprompt", function (event) {
      event.preventDefault();
      deferredPrompt = event;
      renderInstallButton();
    });

    window.addEventListener("appinstalled", setInstalledState);

    if (window.matchMedia) {
      var displayMode = window.matchMedia("(display-mode: standalone)");
      var onDisplayModeChange = function () {
        if (displayMode.matches) setInstalledState();
      };
      if (typeof displayMode.addEventListener === "function") {
        displayMode.addEventListener("change", onDisplayModeChange);
      } else if (typeof displayMode.addListener === "function") {
        displayMode.addListener(onDisplayModeChange);
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
