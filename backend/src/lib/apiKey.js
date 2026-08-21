const crypto = require("crypto");

/**
 * Generates a long, random, unpredictable API key suitable for tenant auth.
 * Uses cryptographically secure random bytes, hex-encoded.
 */
function generateApiKey(prefix = "tk_live") {
  const random = crypto.randomBytes(24).toString("hex");
  return `${prefix}_${random}`;
}

module.exports = { generateApiKey };
