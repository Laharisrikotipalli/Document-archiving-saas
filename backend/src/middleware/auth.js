const { pool } = require("../db");

/**
 * Extracts the X-API-Key header, looks up the tenant, and attaches it to
 * req.tenant. Returns 401 Unauthorized if the key is missing or invalid.
 */
async function requireApiKey(req, res, next) {
  const apiKey = req.header("X-API-Key");

  if (!apiKey) {
    return res.status(401).json({ error: "Missing X-API-Key header" });
  }

  try {
    const result = await pool.query(
      "SELECT id, name, api_key, created_at FROM tenants WHERE api_key = $1",
      [apiKey]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid API key" });
    }

    req.tenant = result.rows[0];
    return next();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Auth middleware error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

module.exports = { requireApiKey };
