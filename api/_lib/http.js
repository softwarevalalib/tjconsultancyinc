const crypto = require("crypto");

function setCors(req, res) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
}

function send(res, status, body) {
  if (!res.headersSent) {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
  }
  res.end(JSON.stringify(body || {}));
}

function query(req) {
  try {
    const url = new URL(req.url, "http://localhost");
    const out = {};
    url.searchParams.forEach((value, key) => {
      out[key] = value;
    });
    return Object.assign({}, req.query || {}, out);
  } catch (_) {
    return req.query || {};
  }
}

function readBody(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    return Promise.resolve(req.body);
  }
  if (typeof req.body === "string") {
    try {
      return Promise.resolve(req.body ? JSON.parse(req.body) : {});
    } catch (_) {
      return Promise.resolve({});
    }
  }
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 8 * 1024 * 1024) {
        resolve({});
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (_) {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

function bearer(req) {
  const header = String(req.headers.authorization || req.headers.Authorization || "");
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function randomToken(bytes) {
  return crypto.randomBytes(bytes || 32).toString("hex");
}

function randomPassword() {
  return "TjFms-" + crypto.randomBytes(6).toString("hex");
}

function safeTable(name) {
  const value = String(name || "").slice(0, 64);
  return /^[a-zA-Z][a-zA-Z0-9_]*$/.test(value) ? value : "";
}

function recordId(row, fallback) {
  if (row && row._id != null && row._id !== "") return String(row._id);
  if (row && row.id != null && row.id !== "") return String(row.id);
  return fallback ? String(fallback) : "";
}

function clone(value) {
  return JSON.parse(JSON.stringify(value == null ? null : value));
}

module.exports = {
  setCors,
  send,
  query,
  readBody,
  bearer,
  sha256,
  randomToken,
  randomPassword,
  safeTable,
  recordId,
  clone,
};
