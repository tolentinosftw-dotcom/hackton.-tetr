const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const output = path.join(root, "public");

const files = [
  "index.html",
  "styles.css",
  "app.js",
  "products.json",
  "1.png",
  "2.png",
  "3.png",
  "4.png",
];

function copyFile(file) {
  const source = path.join(root, file);
  const target = path.join(output, file);

  if (!fs.existsSync(source)) {
    throw new Error(`Missing build file: ${file}`);
  }

  fs.copyFileSync(source, target);
  console.log(`[build] copied ${file}`);
}

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

for (const file of files) copyFile(file);

console.log("[build] public folder ready");
