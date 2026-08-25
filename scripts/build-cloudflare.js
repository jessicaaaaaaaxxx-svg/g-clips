const fs = require("fs");
const path = require("path");

const rootDir = path.join(__dirname, "..");
const distDir = path.join(rootDir, "dist");

const entries = [
  "index.html",
  "script.js",
  "styles.css",
  "i18n.js",
  "admin",
  "dashboard",
  "shared",
];

fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(distDir, { recursive: true });

for (const entry of entries) {
  const source = path.join(rootDir, entry);
  const target = path.join(distDir, entry);

  if (!fs.existsSync(source)) {
    continue;
  }

  fs.cpSync(source, target, { recursive: true });
}
