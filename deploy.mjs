import { copyFileSync } from "fs";

let pluginDir;
try {
    const local = await import("./deploy.local.mjs");
    pluginDir = local.default;
} catch {
    console.error("Error: deploy.local.mjs not found.");
    console.error("Copy deploy.local.example.mjs to deploy.local.mjs and set your plugin directory path.");
    process.exit(1);
}

for (const file of ["main.js", "manifest.json"]) {
    copyFileSync(file, `${pluginDir}/${file}`);
    console.log(`Copied ${file} → ${pluginDir}`);
}
