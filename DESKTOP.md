# DevDeck desktop app (Rust + Tauri)

The desktop app wraps the same DevDeck web app in a small native window, using
[Tauri 2](https://tauri.app) (Rust). It works offline, opens outside links in your normal browser,
and is a few MB instead of the 100+ MB of an Electron app. It builds for **macOS, Windows and Linux**.

```
src-tauri/
  Cargo.toml              ← the Rust project (name, version, libraries)
  tauri.conf.json         ← window size and title, app id, icons, how to build the web part
  capabilities/default.json  ← what the window is allowed to do (basics + opening links)
  src/main.rs             ← starts the app
  src/lib.rs              ← the app: plugins and Rust commands the web app can call
  icons/                  ← app icons for every platform (made from public/icon.svg)
src/desktop.js            ← the web side: notices it's in the app, opens links in the browser, calls Rust
```

## 1. One-time setup

1. **Rust** — install from https://rustup.rs (`rustc --version` should work).
2. **System tools**
   - macOS: Xcode Command Line Tools — `xcode-select --install`
   - Windows: "Microsoft C++ Build Tools" (Desktop development with C++) and WebView2 (already on Windows 10/11)
   - Linux (Debian/Ubuntu): `sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev`
3. In this folder: `npm install`

## 2. Run it while developing

```bash
npm run desktop:dev
```

This starts the web part with live reload (`npm run dev:web`, at http://localhost:5173) and opens it in
the desktop window. Changes to `src/` show up immediately; changes to `src-tauri/` restart the app.

## 3. Build the installable app

The easiest way is the **Makefile** (or the same command through npm, handy on Windows):

```bash
make check-desktop          # is everything needed installed? (tells you what to install if not)
make desktop                # build for THIS computer → release/<system>/
# same thing without make:  npm run desktop:release
```

| On | Command | What you get in `release/` |
|---|---|---|
| macOS | `make desktop-mac` | `mac/DevDeck.app` and `mac/DevDeck_1.0.0_<chip>.dmg` |
| macOS | `make desktop-mac-universal` | one app + `.dmg` for Apple silicon **and** Intel Macs |
| Windows | `make desktop-win` (Git Bash/MSYS2) or `npm run desktop:release` | `windows/DevDeck_1.0.0_x64_en-US.msi` and `windows/DevDeck_1.0.0_x64-setup.exe` |
| Linux | `make desktop-linux` | `linux/DevDeck_1.0.0_<arch>.deb`, `.rpm` and `.AppImage` |
| any (with Docker) | `make desktop-linux-docker` | the Linux packages, built inside a container |

Each system's app has to be built on that system — except Linux, which `make desktop-linux-docker` can
build from any computer with Docker. To get **all three** at once, push a version tag and let GitHub
build them (`.github/workflows/desktop.yml`):

```bash
git tag v1.0.0 && git push --tags     # → a draft release with the macOS, Windows and Linux installers
```

`npm run desktop:build` (plain `tauri build`) still works too; it leaves the results in
`src-tauri/target/release/bundle/`.

On macOS the `.dmg` is made without the Finder window styling by default, because that step needs a
logged-in desktop session and fails from background terminals or SSH. Add `--pretty-dmg` to keep it:
`node scripts/build-desktop.mjs --pretty-dmg`.

To share the macOS app without the "unidentified developer" warning, sign and notarize it with an
Apple Developer account; on Windows, sign the installer with a code-signing certificate. See
https://tauri.app/distribute/.

## 4. Changing things

- **Window size, title, minimum size:** `src-tauri/tauri.conf.json` → `app.windows`.
- **App name, id, version:** `productName`, `identifier`, `version` in `tauri.conf.json` (keep
  `version` in step with `package.json` and `Cargo.toml`).
- **Icon:** replace `public/icon.svg` (or any 1024×1024 PNG) and run
  `npx tauri icon path/to/icon.png -o src-tauri/icons`.

## 5. Calling Rust from the web app

`src-tauri/src/lib.rs` has two example commands, `app_info` (shown in Settings → About) and
`sha256_text`. To add your own:

```rust
// src-tauri/src/lib.rs
#[tauri::command]
fn word_count(text: String) -> usize {
    text.split_whitespace().count()
}
// …and list it: .invoke_handler(tauri::generate_handler![app_info, sha256_text, word_count])
```

```js
// anywhere in src/ (a tool, or a plugin — see PLUGINS.md)
import { isDesktop, invoke } from "../desktop.js";
if (isDesktop) {
  const n = await invoke("word_count", { text: "hello desktop world" }); // → 3
}
```

Commands can read and write files, run native code at full speed and use any Rust library — things
a web page can't do. Keep the website working too: check `isDesktop` before calling `invoke`.

To let the app use more of the system (files, notifications, shell…), add the matching
[Tauri plugin](https://tauri.app/plugin/) and its permission in `src-tauri/capabilities/default.json`.

## 6. How it fits together

- The app shows the built website from `dist/` (so `npm run build` must work first).
- `src/desktop.js` marks the page as running in the app (`<html data-desktop>`), opens outside links in
  the web browser, and skips the website-only offline cache.
- "Pop out" windows are hidden in the app; everything else works the same as on the website.
- Tools in the Network & APIs group still follow web rules (the server must allow the request).

## Tests

```bash
cd src-tauri && cargo test     # checks the Rust side (e.g. the SHA-256 example)
```
