/* ============================================================
   js/notifications.js - TJ Consultancy FMS live notifications

   Keeps a durable notification feed, synchronises open browser tabs
   instantly, and uses the optional Supabase notification stream for
   real-time delivery to other authorised devices.
   ============================================================ */
(function () {
  "use strict";

  var FEED_KEY = "fms_notifications_feed_v1";
  var READ_KEY_PREFIX = "fms_notification_reads_v1_";
  var PREF_KEY = "fms_notification_preferences_v1";
  var MAX_NOTIFICATIONS = 100;
  var localChannel =
    "BroadcastChannel" in window
      ? new BroadcastChannel("fms_system_notifications")
      : null;
  var lastTableNotice = Object.create(null);
  var notificationButton;
  var notificationPanel;
  var notificationBadge;
  var notificationList;
  var notificationStatus;

  var DEFAULT_PREFERENCES = {
    browser: true,
    invoice: true,
    budget: false,
    weekly: true,
    staff: false,
  };

  var TABLE_LABELS = {
    loans: "Loan records",
    inventory: "Inventory",
    staff: "Staff records",
    research: "Research and consulting records",
    assets: "Asset records",
    bizdev: "Business development records",
    vehicles: "Vehicle hire records",
    printing: "Printing records",
  };

  function safeGet(key, fallback) {
    try {
      var value = localStorage.getItem(key);
      return value === null ? fallback : value;
    } catch (_) {
      return fallback;
    }
  }

  function safeSet(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (_) {
      return false;
    }
  }

  function currentUserKey() {
    try {
      return (
        sessionStorage.getItem("fms_auth_uid") ||
        sessionStorage.getItem("fms_auth_user") ||
        "local-user"
      )
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "_");
    } catch (_) {
      return "local-user";
    }
  }

  function readFeed() {
    try {
      var value = JSON.parse(safeGet(FEED_KEY, "[]"));
      return Array.isArray(value) ? value : [];
    } catch (_) {
      return [];
    }
  }

  function writeFeed(feed) {
    safeSet(FEED_KEY, JSON.stringify(feed.slice(0, MAX_NOTIFICATIONS)));
  }

  function readReadIds() {
    try {
      var value = JSON.parse(
        safeGet(READ_KEY_PREFIX + currentUserKey(), "[]"),
      );
      return new Set(Array.isArray(value) ? value.map(String) : []);
    } catch (_) {
      return new Set();
    }
  }

  function writeReadIds(ids) {
    safeSet(
      READ_KEY_PREFIX + currentUserKey(),
      JSON.stringify(Array.from(ids).slice(-MAX_NOTIFICATIONS)),
    );
  }

  function getPreferences() {
    try {
      var saved = JSON.parse(safeGet(PREF_KEY, "{}"));
      return Object.assign({}, DEFAULT_PREFERENCES, saved || {});
    } catch (_) {
      return Object.assign({}, DEFAULT_PREFERENCES);
    }
  }

  function savePreferences(preferences) {
    safeSet(PREF_KEY, JSON.stringify(preferences));
  }

  function makeId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return (
      "notice-" +
      Date.now().toString(36) +
      "-" +
      Math.random().toString(36).slice(2, 10)
    );
  }

  function cleanText(value, fallback) {
    var text = String(value || "").trim();
    return text || fallback;
  }

  function normalise(notification) {
    notification = notification || {};
    return {
      id: String(notification.client_event_id || notification.id || makeId()),
      type: cleanText(notification.type, "system"),
      title: cleanText(notification.title, "System update"),
      message: cleanText(notification.message, "A system event needs your attention."),
      createdAt: notification.created_at || notification.createdAt || new Date().toISOString(),
      metadata:
        notification.metadata && typeof notification.metadata === "object"
          ? notification.metadata
          : {},
    };
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, function (character) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[character];
    });
  }

  function relativeTime(value) {
    var timestamp = new Date(value).getTime();
    var seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
    if (seconds < 10) return "Just now";
    if (seconds < 60) return seconds + "s ago";
    var minutes = Math.round(seconds / 60);
    if (minutes < 60) return minutes + "m ago";
    var hours = Math.round(minutes / 60);
    if (hours < 24) return hours + "h ago";
    var days = Math.round(hours / 24);
    return days + "d ago";
  }

  function iconForType(type) {
    if (type === "staff") return "fa-users";
    if (type === "finance" || type === "invoice") return "fa-coins";
    if (type === "warning") return "fa-triangle-exclamation";
    return "fa-bell";
  }

  function preferenceAllowsToast(notification) {
    var preferences = getPreferences();
    if (notification.type === "invoice") return preferences.invoice !== false;
    if (notification.type === "staff") return preferences.staff === true;
    if (notification.type === "warning") return preferences.budget === true;
    return true;
  }

  function showToast(message) {
    var toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toast._notificationTimer);
    toast._notificationTimer = setTimeout(function () {
      toast.classList.remove("show");
    }, 3500);
  }

  function showBrowserAlert(notification) {
    var preferences = getPreferences();
    if (
      !preferences.browser ||
      !preferenceAllowsToast(notification) ||
      document.visibilityState === "visible" ||
      !("Notification" in window) ||
      Notification.permission !== "granted"
    ) {
      return;
    }

    try {
      new Notification(notification.title, {
        body: notification.message,
        icon: "icons/icon-192.png",
        tag: "tj-fms-" + notification.id,
      });
    } catch (_) {}
  }

  function unreadCount() {
    var readIds = readReadIds();
    return readFeed().filter(function (notification) {
      return !readIds.has(String(notification.id));
    }).length;
  }

  function updateBadge() {
    if (!notificationBadge) return;
    var count = unreadCount();
    notificationBadge.hidden = count === 0;
    notificationBadge.textContent = count > 99 ? "99+" : String(count);
    notificationBadge.setAttribute(
      "aria-label",
      count + " unread notification" + (count === 1 ? "" : "s"),
    );
    if (notificationButton) {
      notificationButton.setAttribute(
        "aria-label",
        count
          ? "Open notifications, " + count + " unread"
          : "Open notifications",
      );
    }
  }

  function render() {
    if (!notificationList) return;
    var feed = readFeed();
    var readIds = readReadIds();
    updateBadge();

    if (!feed.length) {
      notificationList.innerHTML =
        '<div class="notification-empty">' +
        '<i class="fas fa-bell-slash" aria-hidden="true"></i>' +
        "<strong>No notifications yet</strong>" +
        "<span>New system activity will appear here in real time.</span>" +
        "</div>";
      return;
    }

    notificationList.innerHTML = feed
      .map(function (notification) {
        var isUnread = !readIds.has(String(notification.id));
        var type = escapeHtml(notification.type);
        return (
          '<button class="notification-item' +
          (isUnread ? " is-unread" : "") +
          '" type="button" data-notification-id="' +
          escapeHtml(notification.id) +
          '">' +
          '<span class="notification-item-icon type-' +
          type +
          '" aria-hidden="true"><i class="fas ' +
          iconForType(notification.type) +
          '"></i></span>' +
          "<span>" +
          '<span class="notification-item-title">' +
          escapeHtml(notification.title) +
          "</span>" +
          '<span class="notification-item-message">' +
          escapeHtml(notification.message) +
          "</span>" +
          '<span class="notification-item-meta">' +
          escapeHtml(relativeTime(notification.createdAt)) +
          "</span>" +
          "</span>" +
          "</button>"
        );
      })
      .join("");
  }

  function setLiveStatus(message, state) {
    if (!notificationStatus) return;
    notificationStatus.textContent = message;
    notificationStatus.classList.toggle("is-live", state === "live");
    notificationStatus.classList.toggle("has-warning", state === "warning");
  }

  function markRead(id) {
    var readIds = readReadIds();
    readIds.add(String(id));
    writeReadIds(readIds);
    render();
  }

  function markAllRead() {
    var readIds = readReadIds();
    readFeed().forEach(function (notification) {
      readIds.add(String(notification.id));
    });
    writeReadIds(readIds);
    render();
  }

  function navigateToNotification(notification) {
    var metadata = notification && notification.metadata && typeof notification.metadata === "object"
      ? notification.metadata
      : {};
    var table = String(metadata.table || "").toLowerCase();
    var service = String(metadata.service || "").toLowerCase();
    var view = String(metadata.view || "").toLowerCase();
    var views = ["dashboard", "reports", "clients", "inventory", "staff", "salary", "attendance", "leave", "settings"];
    var services = ["financial", "research", "assets", "bizdev", "vehicles", "printing"];
    var serviceByTable = {
      research: "research",
      assets: "assets",
      bizdev: "bizdev",
      vehicles: "vehicles",
      printing: "printing",
    };
    var targetView = "dashboard";
    var targetService = "";
    var loanId = metadata.loanId || metadata.loan_id ||
      (table === "loans" ? metadata.recordId || metadata.record_id : "");

    if (view && views.indexOf(view) !== -1) {
      targetView = view;
    } else if (table === "inventory") {
      targetView = "inventory";
    } else if (table === "staff") {
      targetView = "staff";
    } else if (table === "loans" || notification?.type === "finance") {
      targetService = "financial";
    } else if (service && services.indexOf(service) !== -1) {
      targetService = service;
    } else if (serviceByTable[table]) {
      targetService = serviceByTable[table];
    } else if (notification?.type === "invoice" || notification?.type === "warning") {
      targetView = "reports";
    } else if (notification?.type === "staff") {
      targetView = "staff";
    }

    if (typeof window.fmsSwitchView === "function") {
      window.fmsSwitchView(targetView);
    }
    if (targetService) {
      var serviceTab = document.querySelector('.svc-tab[data-svc="' + targetService + '"]');
      if (serviceTab) serviceTab.click();
    }
    if (targetService === "financial") {
      var entryTab = document.querySelector('.loan-subtab[data-loan-tab="entry"]');
      if (entryTab) entryTab.click();
      if (loanId && window.LoanEngine && typeof window.LoanEngine.openNotificationTarget === "function") {
        window.LoanEngine.openNotificationTarget(loanId);
      }
    }
  }

  function addNotification(input, options) {
    options = options || {};
    var notification = normalise(input);
    var feed = readFeed();
    if (feed.some(function (item) { return String(item.id) === notification.id; })) {
      return notification;
    }

    feed.unshift(notification);
    feed.sort(function (a, b) {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    writeFeed(feed);
    render();

    if (!options.silent && preferenceAllowsToast(notification)) {
      showToast(notification.title + ": " + notification.message);
      showBrowserAlert(notification);
    }

    if (!options.fromBroadcast && localChannel) {
      try {
        localChannel.postMessage({ type: "notification", notification: notification });
      } catch (_) {}
    }

    if (!options.fromCloud && options.publish !== false) {
      publishToCloud(notification);
    }
    return notification;
  }

  function publishToCloud(notification) {
    if (!window.FMSCloud || typeof window.FMSCloud.publishNotification !== "function") {
      return;
    }
    window.FMSCloud.publishNotification({
      client_event_id: notification.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      metadata: notification.metadata,
    }).catch(function () {
      /* The local feed remains available while a device is offline. */
      setLiveStatus("Saved locally; live delivery will resume when connected.", "warning");
    });
  }

  function tableNotification(change) {
    if (!change || change.remote || !change.table || change.table === "*") return;
    var table = String(change.table);
    var label = TABLE_LABELS[table];
    if (!label) return;

    var now = Date.now();
    if (lastTableNotice[table] && now - lastTableNotice[table] < 1500) return;
    lastTableNotice[table] = now;

    addNotification({
      type: table === "staff" ? "staff" : table === "loans" ? "finance" : "system",
      title: label + " updated",
      message: "A signed-in user updated " + label.toLowerCase() + ".",
      metadata: { table: table },
    });
  }

  function loadCloudHistory() {
    if (
      !window.FMSCloud ||
      typeof window.FMSCloud.listNotifications !== "function" ||
      (typeof window.FMSCloud.isConfigured === "function" &&
        !window.FMSCloud.isConfigured())
    ) {
      setLiveStatus("Live across open tabs on this device", "live");
      return;
    }

    window.FMSCloud
      .listNotifications(100)
      .then(function (notifications) {
        (notifications || []).forEach(function (notification) {
          addNotification(notification, {
            fromCloud: true,
            publish: false,
            silent: true,
          });
        });
        setLiveStatus("Live workspace updates connected", "live");
      })
      .catch(function () {
        setLiveStatus("Live tab updates active; cloud notifications unavailable", "warning");
      });
  }

  function bindPreferences() {
    var controls = [
      ["notificationBrowserAlerts", "browser"],
      ["notificationInvoiceAlerts", "invoice"],
      ["notificationBudgetAlerts", "budget"],
      ["notificationWeeklyAlerts", "weekly"],
      ["notificationStaffAlerts", "staff"],
    ];
    var preferences = getPreferences();

    controls.forEach(function (pair) {
      var control = document.getElementById(pair[0]);
      if (!control) return;
      control.checked = preferences[pair[1]] === true;
      control.addEventListener("change", function () {
        preferences[pair[1]] = control.checked;
        savePreferences(preferences);

        if (
          pair[1] === "browser" &&
          control.checked &&
          "Notification" in window &&
          Notification.permission === "default"
        ) {
          Notification.requestPermission().then(function (permission) {
            if (permission !== "granted") {
              preferences.browser = false;
              control.checked = false;
              savePreferences(preferences);
              showToast("Browser alerts were not enabled by this browser.");
            }
          });
        }
      });
    });
  }

  function bindUI() {
    notificationButton = document.getElementById("notificationButton");
    notificationPanel = document.getElementById("notificationPanel");
    notificationBadge = document.getElementById("notificationBadge");
    notificationList = document.getElementById("notificationList");
    notificationStatus = document.getElementById("notificationLiveStatus");
    var markAll = document.getElementById("notificationMarkRead");

    if (!notificationButton || !notificationPanel || !notificationList) return;

    notificationButton.addEventListener("click", function () {
      var willOpen = notificationPanel.hidden;
      notificationPanel.hidden = !willOpen;
      notificationButton.setAttribute("aria-expanded", String(willOpen));
      if (willOpen) render();
    });

    notificationList.addEventListener("click", function (event) {
      var item = event.target.closest("[data-notification-id]");
      if (!item) return;
      var notificationId = item.getAttribute("data-notification-id");
      var notification = readFeed().find(function (record) {
        return String(record.id) === String(notificationId);
      });
      markRead(notificationId);
      notificationPanel.hidden = true;
      notificationButton.setAttribute("aria-expanded", "false");
      navigateToNotification(notification);
    });

    if (markAll) markAll.addEventListener("click", markAllRead);

    document.addEventListener("click", function (event) {
      var center = document.getElementById("notificationCenter");
      if (center && !center.contains(event.target) && !notificationPanel.hidden) {
        notificationPanel.hidden = true;
        notificationButton.setAttribute("aria-expanded", "false");
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !notificationPanel.hidden) {
        notificationPanel.hidden = true;
        notificationButton.setAttribute("aria-expanded", "false");
        notificationButton.focus();
      }
    });

    bindPreferences();
    render();
  }

  function bindRealtime() {
    if (window.FMSDB && typeof window.FMSDB.on === "function") {
      window.FMSDB.on(tableNotification);
    }

    document.addEventListener("fms:notification", function (event) {
      addNotification((event.detail || {}).notification || event.detail, {
        fromCloud: true,
        publish: false,
      });
    });

    document.addEventListener("fms:supabase-status", function (event) {
      var detail = event.detail || {};
      if (detail.error) {
        setLiveStatus("Live sync needs attention", "warning");
      } else if (detail.notificationsRealtime === "SUBSCRIBED") {
        setLiveStatus("Live workspace notifications connected", "live");
      } else if (detail.notificationsRealtime) {
        setLiveStatus("Connecting live workspace notifications...", "warning");
      } else if (detail.realtime === "SUBSCRIBED" || detail.initialized) {
        setLiveStatus("Live workspace updates connected", "live");
      }
    });

    if (localChannel) {
      localChannel.onmessage = function (event) {
        if (event.data && event.data.type === "notification") {
          addNotification(event.data.notification, {
            fromBroadcast: true,
            publish: false,
          });
        }
      };
    }

    window.addEventListener("storage", function (event) {
      if (event.key === FEED_KEY || event.key.indexOf(READ_KEY_PREFIX) === 0) {
        render();
      }
    });

    if (window.FMSCloud && window.FMSCloud.ready) {
      window.FMSCloud.ready.then(function (result) {
        if (result && result.authenticated) loadCloudHistory();
        else setLiveStatus("Live across open tabs on this device", "live");
      });
    } else {
      setLiveStatus("Live across open tabs on this device", "live");
    }
  }

  function boot() {
    bindUI();
    bindRealtime();
  }

  window.FMSNotifications = {
    notify: function (notification) {
      return addNotification(notification || {});
    },
    markAllRead: markAllRead,
    getAll: readFeed,
    unreadCount: unreadCount,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
