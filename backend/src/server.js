const express = require("express");
const { pool } = require("./db");
const documentsRouter = require("./routes/documents");

const app = express();
app.use(express.json());

// Health check is intentionally unauthenticated so Docker/orchestrators can probe it.
app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    return res.status(200).json({ status: "ok" });
  } catch (err) {
    return res.status(503).json({ status: "unhealthy" });
  }
});

app.use("/documents", documentsRouter);

// Fallback 404
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Central error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

const PORT = process.env.API_PORT || 3000;
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Archive API listening on port ${PORT}`);
});
