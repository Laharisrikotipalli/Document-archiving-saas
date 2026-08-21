const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { pool } = require("../db");
const { requireApiKey } = require("../middleware/auth");
const { getUploadUrl, getDownloadUrl } = require("../lib/storage");

const router = express.Router();

// All routes in this file require a valid tenant API key.
router.use(requireApiKey);

/**
 * POST /documents/upload-url
 * Generates a pre-signed URL for uploading a file, namespaced under the
 * authenticated tenant's ID so tenants can never collide or overwrite
 * each other's objects.
 */
router.post("/upload-url", async (req, res) => {
  const { filename } = req.body || {};

  if (!filename || typeof filename !== "string") {
    return res.status(400).json({ error: "'filename' is required" });
  }

  try {
    const safeName = filename.replace(/[^\w.\-]/g, "_");
    const storageKey = `tenant_${req.tenant.id}/${uuidv4()}-${safeName}`;

    const uploadUrl = await getUploadUrl(storageKey);

    return res.status(200).json({
      upload_url: uploadUrl,
      storage_key: storageKey,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Error generating upload URL:", err);
    return res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

/**
 * POST /documents/confirm
 * Confirms a file has been uploaded to storage and creates the metadata
 * record. Verifies the storage_key actually belongs to this tenant before
 * trusting it, preventing a tenant from registering another tenant's object.
 */
router.post("/confirm", async (req, res) => {
  const { storage_key: storageKey, filename, size } = req.body || {};

  if (!storageKey || !filename) {
    return res.status(400).json({ error: "'storage_key' and 'filename' are required" });
  }

  const expectedPrefix = `tenant_${req.tenant.id}/`;
  if (!storageKey.startsWith(expectedPrefix)) {
    return res.status(403).json({ error: "storage_key does not belong to this tenant" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO documents (tenant_id, original_filename, storage_key, file_size)
       VALUES ($1, $2, $3, $4)
       RETURNING id, original_filename AS filename, file_size AS size, created_at`,
      [req.tenant.id, filename, storageKey, Number(size) || 0]
    );

    return res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      // unique_violation on storage_key
      return res.status(409).json({ error: "Document already confirmed" });
    }
    // eslint-disable-next-line no-console
    console.error("Error confirming upload:", err);
    return res.status(500).json({ error: "Failed to confirm upload" });
  }
});

/**
 * GET /documents
 * Lists all documents belonging to the authenticated tenant only.
 */
router.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, original_filename AS filename, file_size AS size, created_at
       FROM documents
       WHERE tenant_id = $1
       ORDER BY created_at DESC`,
      [req.tenant.id]
    );

    return res.status(200).json({ documents: result.rows });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Error listing documents:", err);
    return res.status(500).json({ error: "Failed to list documents" });
  }
});

/**
 * GET /documents/:id/download-url
 * Generates a pre-signed download URL, but only if the document belongs
 * to the authenticated tenant. Returns 404 (not 401/403) if the document
 * belongs to a different tenant, to avoid leaking existence of other
 * tenants' data.
 */
router.get("/:id/download-url", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `SELECT storage_key FROM documents WHERE id = $1 AND tenant_id = $2`,
      [id, req.tenant.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Document not found" });
    }

    const downloadUrl = await getDownloadUrl(result.rows[0].storage_key);

    return res.status(200).json({ download_url: downloadUrl });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Error generating download URL:", err);
    return res.status(500).json({ error: "Failed to generate download URL" });
  }
});

module.exports = router;
