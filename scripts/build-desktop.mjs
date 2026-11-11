#!/usr/bin/env node
// Build the DevDeck desktop app for this computer and collect the installers in release/<system>/.
//   node scripts/build-desktop.mjs                 build for this computer
//   node scripts/build-desktop.mjs --check         only check that everything needed is installed
//   node scripts/build-desktop.mjs --universal     macOS: one app for Apple silicon and Intel
//   node scripts/build-desktop.mjs --platform mac|windows|linux   (must match this computer)
// Used by the Makefile (make desktop, make desktop-mac …); works the same on macOS, Windows and Linux.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const opt = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const here = { darwin: "mac", win32: "windows", linux: "linux" }[process.platform] || process.platform;
const want = opt("--platform") || here;
const say = (s) => console.log(s);
const fail = (s) => { console.error(`\n✖ ${s}`); process.exit(1); };
const has = (cmd, a = ["--version"]) => { const r = spawnSync(cmd, a, { encoding: "utf8", shell: process.platform === "win32" }); return r.status === 0 ? (r.stdout || r.stderr).trim().split("\n")[0] : null; };
const run = (cmd, a, env = {}) => { say(`\n$ ${cmd} ${a.join(" ")}`); const r = spawnSync(cmd, a, { stdio: "inherit", shell: process.platform === "win32", env: { ...process.env, ...env } }); if (r.status !== 0) fail(`“${cmd} ${a.join(" ")}” failed.`); };

if (want !== here) {
  fail(`A ${want} app has to be built on ${want === "mac" ? "a Mac" : want === "windows" ? "Windows" : "Linux"} (this computer is ${here}).\n` +
    (want === "linux" ? "  From any computer with Docker you can run:  make desktop-linux-docker" : "  Or build it on GitHub Actions — see DESKTOP.md."));
}

// ---- what's needed ----
say(`DevDeck desktop build — ${here}\n`);
const checks = [
  ["Node.js", has("node"), "https://nodejs.org (version 20 or newer)"],
  ["npm packages", existsSync("node_modules/@tauri-apps/cli") ? "installed" : null, "run: npm install"],
  ["Rust (cargo)", has("cargo"), "https://rustup.rs"],
];
if (here === "mac") checks.push(["Xcode Command Line Tools", has("xcode-select", ["-p"]), "run: xcode-select --install"]);
if (here === "linux") {
  checks.push(["WebKitGTK 4.1", has("pkg-config", ["--modversion", "webkit2gtk-4.1"]), "Debian/Ubuntu: sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev  (others: https://tauri.app/start/prerequisites/)"]);
}
if (here === "windows") {
  checks.push(["Microsoft C++ Build Tools", has("where", ["link.exe"]) || (existsSync("C:\\Program Files (x86)\\Microsoft Visual Studio") ? "Visual Studio found" : null), "install “Desktop development with C++” from https://visualstudio.microsoft.com/visual-cpp-build-tools/"]);
}
let missing = 0;
for (const [name, found, fix] of checks) {
  say(`${found ? "✔" : "✖"} ${name.padEnd(28)} ${found || `missing — ${fix}`}`);
  if (!found) missing++;
}
if (missing) fail(`${missing} thing${missing === 1 ? " is" : "s are"} missing (see above). Install ${missing === 1 ? "it" : "them"} and run this again.`);
if (flag("--check")) { say("\nEverything needed is installed."); process.exit(0); }

// ---- build ----
const bundles = { mac: "app,dmg", windows: "msi,nsis", linux: "deb,rpm,appimage" }[here];
const tauriArgs = ["tauri", "build", "--bundles", bundles];
let targetDir = join("src-tauri", "target", "release", "bundle");
if (here === "mac" && flag("--universal")) {
  run("rustup", ["target", "add", "aarch64-apple-darwin", "x86_64-apple-darwin"]);
  tauriArgs.push("--target", "universal-apple-darwin");
  targetDir = join("src-tauri", "target", "universal-apple-darwin", "release", "bundle");
}
// macOS: the .dmg step normally asks Finder (AppleScript) to arrange the installer window, which fails
// from background terminals and over SSH. CI=true makes Tauri skip just that styling step — the .dmg is
// the same otherwise. Use --pretty-dmg to keep it (needs a logged-in desktop session).
const env = here === "linux" ? { APPIMAGE_EXTRACT_AND_RUN: "1" } : here === "mac" && !flag("--pretty-dmg") ? { CI: process.env.CI || "true" } : {};
run("npx", tauriArgs, env);

// ---- collect the installers ----
const out = join("release", here);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const wanted = /\.(dmg|app|msi|exe|deb|rpm|AppImage)$/;
const found = [];
const walk = (dir) => {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (wanted.test(name) && !/^rw\./.test(name)) { cpSync(p, join(out, name), { recursive: true }); found.push(name); }
    else if (statSync(p).isDirectory()) walk(p);
  }
};
walk(targetDir);
if (!found.length) fail(`The build finished but no installers were found in ${targetDir}.`);
say(`\n✔ Done. Your app is in ${out}/:\n${found.map((f) => `   • ${f}`).join("\n")}`);
if (here === "mac") say("\nTo share it without the “unidentified developer” warning, sign and notarize it — see DESKTOP.md.");
