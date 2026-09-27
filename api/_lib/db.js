const { neon } = require("@neondatabase/serverless");

let cached;

function sql() {
  const url = String(process.env.DATABASE_URL || "").trim();
  if (!url) throw new Error("DATABASE_URL is not configured.");
  if (!cached) cached = neon(url);
  return cached;
}

module.exports = { sql };
