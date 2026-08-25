require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");

const app = express();

const allowedOrigin = process.env.ALLOWED_ORIGIN || "*";
app.use(
  cors({
    origin: allowedOrigin === "*" ? true : allowedOrigin.split(",").map((s) => s.trim()),
  })
);
app.use(express.json());

// ---------------------------------------------------------------------------
// API routes
// ---------------------------------------------------------------------------
app.get("/api/health", (req, res) => {
  res.json({ ok: true, configured: Boolean(require("./supabaseAdmin")) });
});

app.use("/api/videos", require("./routes/videos"));
app.use("/api/accounts", require("./routes/accounts"));
app.use("/api/earnings", require("./routes/earnings"));
app.use("/api/withdrawals", require("./routes/withdrawals"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api/ai", require("./routes/ai"));

// ---------------------------------------------------------------------------
// Static site: marketing pages, creator dashboard, admin backend, shared assets
// ---------------------------------------------------------------------------
const rootDir = path.join(__dirname, "..");
app.use(express.static(rootDir));

// 404 handler for unmatched API routes (keep JSON, don't fall through to static/index.html)
app.use("/api", (req, res) => {
  res.status(404).json({ error: "Not found." });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`G Clips server listening on port ${PORT}`);
});
