const fs = require("node:fs");
const crypto = require("node:crypto");
const path = require("node:path");

const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
const installerPath = path.join(__dirname, "..", "release", `AI Agent Quota Dashboard-${packageJson.version}-win-x64.exe`);

if (!fs.existsSync(installerPath)) {
  console.error(`Installer not found: ${installerPath}`);
  process.exit(1);
}

const hash = crypto.createHash("sha256").update(fs.readFileSync(installerPath)).digest("hex").toUpperCase();
const checksumPath = `${installerPath}.sha256`;
fs.writeFileSync(checksumPath, `${hash}  ${path.basename(installerPath)}\n`);
console.log(`${hash}  ${path.basename(installerPath)}`);
