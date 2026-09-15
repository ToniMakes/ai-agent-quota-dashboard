const fs = require("node:fs");
const path = require("node:path");

const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
const tag = process.env.GITHUB_REF_NAME ?? process.argv[2];
const expectedTag = `v${packageJson.version}`;

if (!tag || tag !== expectedTag) {
  console.error(`Release tag ${tag ?? "<missing>"} does not match package version ${expectedTag}.`);
  process.exit(1);
}

console.log(`Release version verified: ${tag}`);
