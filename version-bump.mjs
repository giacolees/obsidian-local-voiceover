import fs from "node:fs";
import path from "node:path";

const rootDir = import.meta.dirname;
const packagePath = path.join(rootDir, "package.json");
const manifestPath = path.join(rootDir, "manifest.json");
const versionsPath = path.join(rootDir, "versions.json");

const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const versions = JSON.parse(fs.readFileSync(versionsPath, "utf8"));

manifest.version = pkg.version;
versions[pkg.version] = manifest.minAppVersion;

fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, "\t")}\n`);
fs.writeFileSync(versionsPath, `${JSON.stringify(versions, null, "\t")}\n`);
