# DevDeck

By **ezin-rev** — source: https://github.com/ezin-rev/devdeck (credited in the site footer and on the
Settings page, About panel). Licensed under the **MIT License** (see `LICENSE`).

| | |
|---|---|
| Website | `npm install && npm run build` → static files in `dist/` (set `SITE_URL=https://your-site` for the sitemap and full share links; `BASE_PATH=/sub/` for a sub-folder) |
| Docker | `docker compose up -d --build` → http://localhost:8080 (or `make docker-up`) — see **docs/docker.md** |
| Desktop app (Rust/Tauri) | `make desktop` (or `npm run desktop:release`) builds installers for this computer into `release/` — see **DESKTOP.md** |
| Docs | Published with the app on **GitHub Pages** at `https://ezin-rev.github.io/devdeck/docs/` (`.github/workflows/pages.yml`; `make docs` locally) |
| Plugins | Install in the app (Settings → Plugins → Install), or `npm run new-plugin -- my-plugin` — see **PLUGINS.md** |
| Everything else | `make` lists every command · `npm run cli -- help` for the command-line tools |

**Help (F1).** Press **F1** or **?** anywhere (or Help in the footer) for
"How to use DevDeck": getting around, Smart Paste, working with a tool, keyboard shortcuts, customizing,
plugins and privacy — starting with tips for the tool you're on. Links to the full docs. (`src/help.jsx`)

**Dynamic numbers and tabs.** The home page's "N free tools" is counted live (built-in tools + plugins,
minus switched-off ones), and the build writes the same count into the home page's search description.
A group's tab (and side-menu entry) only shows while at least one of its tools is switched on.

**Plugins.** Two kinds. *Installable plugins* are one `.js` file that anyone adds in **Settings → Plugins →
Install** — from a web address, a file or pasted code — with a preview and a warning before installing,
**Update** for web-address plugins and **Uninstall**; they're kept on the device (`src/user-plugins.js`,
loaded before the app first draws) and the example `public/plugin-examples/word-tools.js` installs with one
click ("Try the example plugin"). *Built-in plugins* are folders in `src/plugins/<id>/` with `plugin.json`
and `index.jsx` (`definePlugin(...)` from `src/plugin-sdk.jsx`); the example `text-extras` adds **Slugify**
and **Unicode Inspector**. Either kind of tool is a "transform" (text in → text out; DevDeck draws the
screen) or its own React component. Plugin tools get the Plugins tab, search, pages at `/plugins/<tool-id>`,
tool-set levels and an on/off switch. A failing plugin is skipped without breaking the site. Guide: `PLUGINS.md`.

**Docker.** `Dockerfile` (Node builds, `nginx-unprivileged` serves on 8080 as non-root, read-only),
`docker/nginx.conf` (page folders, app-shell fallback, long caching for hashed files, gzip, security headers,
`/healthz`), `docker-compose.yml` (website service + a `desktop` profile that builds the Linux app),
`.dockerignore`. Not run here (no Docker on this machine); the compose file passes DevDeck's own Compose Validator.

**Makefile & desktop builds.** `make help` lists everything: `web`, `docs`, `docker-up/down/logs`,
`check-desktop`, `desktop-dev`, `desktop` (this computer), `desktop-mac`, `desktop-mac-universal`, `desktop-win`,
`desktop-linux`, `desktop-linux-docker` (Linux packages from any computer), `test`, `clean`. The desktop
targets use `scripts/build-desktop.mjs` (checks prerequisites, builds, collects installers into
`release/<system>/`), which also runs without make (`npm run desktop:release`). Pushing a `v*` tag builds all
three systems on GitHub (`.github/workflows/desktop.yml`).

**Docs on GitHub Pages.** `docs/*.md` + `PLUGINS.md` + `DESKTOP.md` → `dist/docs/*.html` via
`scripts/build-docs.mjs` (uses `marked`). `.github/workflows/pages.yml` publishes the app at
`/<repo>/` and the docs at `/<repo>/docs/` on every push to `main` (turn on Settings → Pages → Source:
GitHub Actions). The app's base path is configurable (`BASE_PATH`), and the router, service worker,
manifest, share tags and SEO links all follow it.

**Custom theme.** Settings → Theme → *Custom* (or "Customize this theme") lets visitors set the nine base
colours separately for light and dark mode, plus roundness, border strength, category-colour strength,
glow & gradients and the font, with live readability (contrast) checks. Themes can be copied and pasted
as text to share. Stored with the other preferences; applied before the first paint (index.html script).

**Code editor shortcuts.** Code boxes understand VS Code-style shortcuts (on by default, switch in
Settings → Code boxes, where the full list is shown): Tab/Shift+Tab and Ctrl/⌘+] [ indent, Ctrl/⌘+/
comment (// # -- or <!-- --> by language), Alt+↑/↓ move lines, Shift+Alt+↑/↓ copy lines,
Ctrl/⌘+Shift+K delete lines, Ctrl/⌘+Enter new line below/above, Ctrl/⌘+L select line, Ctrl/⌘+D select
word / next match, Ctrl/⌘+G go to line, Shift+Alt+F format JSON, smart Enter indent, auto-closing
brackets and quotes, smart Home. All edits keep the browser's Undo. Code in `src/keymap.js`.

**SEO.** Every page gets its own title and description, Open Graph / Twitter cards, JSON-LD structured
data (SoftwareApplication + breadcrumbs on tools, ItemList on groups, WebSite on home), readable
content for crawlers inside `#root` (heading, description and links; replaced when the app starts),
`robots.txt`, and — when `SITE_URL` is set — `sitemap.xml`, canonical links and `og:url`. Old
`/devops/…` addresses, Settings and the 404 page are marked `noindex`. All done in `scripts/routes.mjs`.

Friendly developer tools that run entirely in the browser: a top tab bar, a big welcome
search, and a quick-search palette (Ctrl/⌘ + K or "/"). Old `/aurora/…` links (the design's
first address) still work and open the same page at the top level.

Layout: the home page starts with the search, Smart Paste and a **Browse by category** grid that
jumps to each group; tool cards are compact and the same height (descriptions stop after two
lines). The tab bar is one row of rounded tabs, each with its group's icon and a short name (Convert,
Encode / Decode, Format, Generate, Validate, Calculate, Text, JSON & XML, Network, Files & Images,
Reference), with the current group highlighted — no drop-down arrows. When the row is wider than the
screen it scrolls sideways with a soft fade showing there's more, and the current group is scrolled
into view. In the slim layout (Compact) the tabs are smaller and text-only. There are no
"New" badges or design-name labels any more. Internal names (saved-settings keys starting with
`aurora-`, the theme id `aurora`) are unchanged so visitors keep their settings.

The top bar has the search, a Layout menu and Settings (no separate theme button). The Settings page
lets visitors pick:
- **Theme**: High Contrast (default), Calm Slate, Warm Paper, Sage Forest, Harbor Blue, Dusk Rose,
  Ink & Paper, or Neon Glow (purple and cyan with a soft moving glow); each in light, dark or system mode.
- **Layout presets** (one click, also in the top-bar Layout menu): Modern web (default), **Compact**
  (clean and dense: slim top bar, text-only tabs, compact lists, small tool headers without big icons or
  descriptions, full width, no welcome banner or background glow), Desktop app (side menu, full width),
  Dev workspace (slim icon bar, compact list), App launcher (big tiles) and Focus (search only).
  When the welcome banner is off, the home page has no second search box — the top-bar search is used.
  The **desktop app** starts with the Desktop app layout (side menu, full width); the website starts with
  Modern web (`DEFAULT_PRESET` in `src/prefs.jsx`, mirrored in the `index.html` start-up script).
- **Top bar** is fixed to the top of the window (`position: fixed`, not sticky), so it never moves —
  also not with the elastic bounce of Mac trackpads or the desktop app, which is switched off
  (`overscroll-behavior: none`). The page keeps a gap of the bar's height (`--topbar-h`, measured by the
  app, with per-layout estimates for the first moment); the side menu and jump links use it too. Help is
  F1/? and the footer link (no top-bar button).
- **Side menu** (Desktop app layout): every category starts **open**; each folds with its arrow and shows
  its tool count; **Expand all / Collapse all** at the top; choices are remembered (`aurora-side-open-v2`),
  and opening a tool opens its category.
- **Fine-tuning**: navigation (top tabs, side menu, icon bar, search only); cards, tiles or
  compact list; tool boxes side by side or stacked; roomy or compact spacing; normal or large
  text; welcome banner on/off; centered or full width; top bar & headers full or slim. Side menu and
  icon bar switch to top tabs on narrow screens.

**Tool sets** (Settings → Manage tools): one click switches between **Essentials** (27 everyday tools:
formatting and converting data, encoding, hashes, IDs, passwords, text and images), **Standard** (54:
adds common developer tools such as SQL/XML, JSON queries and schemas, cron, .env, curl, HTTP and DNS)
and **Complete** (all 73, including certificates and keys, Docker/Kubernetes checks, gRPC, WebSocket and
XSD). These counts are the 73 built-in tools; plugin tools join the set their `level` names (with the
example plugin: 28 / 56 / 75). Single tools can still be switched on or off afterwards ("Custom"). Levels
are set in `src/data.js` (`ESSENTIALS`, `SPECIALIST`; everything else is Standard).

Extra features beyond DevToys (in `src/power.jsx`):
- **Smart Paste**: paste anything — it detects JWTs, JSON, YAML, timestamps, dates, UUIDs,
  colours, hashes, links, URL-encoded text, HTML entities, Base64 and numbers, shows the
  answer, and opens the right tool with the text filled in. Pasting anywhere on the home
  page (outside a text box) jumps straight to it.
- **Tool Chain**: link 27 steps (decode, format, change case, sort, hash, pull out links…)
  into a recipe with live output after every step; ready-made recipes included.
- **Pinned and recently used tools** on the home page and in quick search.
- New tools: Date & Timestamp, Color Converter (with contrast check and shades),
  Password Generator (passwords or passphrases, strength meter) and Regex Tester.

Phones and tablets (`src/mobile.css`): works on iPhone, iPad and Android — add it to the home screen for a
full-screen app (PNG icons in `public/`, notch/home-bar safe areas). Text boxes stay at 16px on touch
screens so iOS doesn't zoom in, buttons and checkboxes are finger-sized, keyboard hints and pop-out windows
are hidden on touch, tall code boxes are capped on phones, the quick search opens as a top sheet, the tab
bar keeps the current group in view, and menus close on a tap outside or when the tab bar is swiped.

Share previews: links show a thumbnail card (`public/og-image.jpg`, 1200×630) with the page's own title
and description — each tool and group page gets its own at build time (`scripts/routes.mjs`). Facebook,
LINE and a few others only show the picture when it has a full address, so build with your site address:
`SITE_URL=https://your-site.example npm run build` (or set `"homepage"` in package.json). That also adds
`og:url` and a canonical link to every page.

Groups are named by what the tools do (no "DevOps" group any more): Converters (now also .env,
docker run → Compose, curl → Code), Generators (also SSH keys, certificates, Kubernetes manifests),
Validators & Inspectors (certificates, compose, Kubernetes, kubeconfig, Docker images), Calculators
(CIDR, sizes & durations, uptime/SLA, version ranges) and JSON, YAML & XML (also the YAML/Helm values
diff). Old `/devops/…` links, pins and recent tools are sent on to the new addresses (`MOVED` in
`src/routes.mjs`), and searching "devops" still finds these tools.

More developer tools (in `src/tools2.jsx`): CSV <> JSON (with table preview), Cron Schedule
Explainer (plain words + next runs), File Permission (chmod) Calculator, QR Code Generator
(PNG/SVG download), URL Parser & Builder, Image <> Base64, String Escaper, SQL Formatter,
XML Formatter, Markdown Preview, Lorem Ipsum and Fake Data generators, and a new Reference
group with HTTP Status Codes and a Keyboard Event Inspector. Smart Paste also recognises
SQL, XML, cron schedules, CSV tables, images, chmod numbers and status codes, and Tool Chain
gained CSV/JSON, SQL/XML formatting and escaping steps.

Big tool round (73 tools in total):
- **JSON & XML** group (`src/data-tools.jsx`): JSONPath Tester, YAML to JSONPath (also dot notation and
  helm `--set`), JSON Schema generator & validator, JSON to C# / PHP (array or class) / TypeScript / Go /
  Python / Java, XML/XSD Validator (well-formedness plus a practical XSD subset: order, occurrences,
  attributes, built-in types, enumerations, patterns, lengths, extensions) and XSD Generator.
- **Network & APIs** group (`src/net.jsx`): HTTP Request Builder (headers, body, login, timing, curl and
  fetch output, import from curl), WebSocket Client, DNS Lookup (DNS-over-HTTPS via Cloudflare or Google,
  plus SPF/DMARC check), Port Checker (best-effort web check from the browser, real commands, port list)
  and gRPC Helper (grpcurl command builder + raw protobuf decoder). These tools contact the address
  entered; browsers can't open raw TCP or HTTP/2 gRPC, hence the helpers.
- **Files & Images** group (`src/media.jsx`, `src/more-tools.jsx`): Image Converter (PNG/JPEG/WebP/AVIF/BMP,
  resize, rotate, flip), PNG Compressor (median-cut palette + own indexed-PNG writer), Color Blind
  Simulator (Machado 2009 matrices, image or palette) and File Splitter & Joiner.
- **DevOps** additions (`src/ops.jsx`, `src/keys.jsx`): Docker Compose Validator, Kubernetes YAML Validator,
  Helm Values Diff, Kubeconfig Inspector (cert expiry, copy without secrets, single-context export),
  Docker Image Inspector (name breakdown + `docker inspect` reader; registries block browser lookups),
  SSH Key Generator (Ed25519/ECDSA/RSA in OpenSSH format, verified with ssh-keygen).
- **Other additions**: TOML Converter, QR Code Reader (picture, pasted screenshot or camera; jsQR),
  GZIP compressor, NGINX Config Formatter, ULID Generator, RSA Key Generator, Randomizer, List Comparer,
  Duplicate Detector, Text Delimiter, RESX Translator (side-by-side, CSV round trip, bulk paste; no
  built-in machine translation — an optional link opens Google Translate). JWT now signs and verifies
  (HS/RS/PS/ES), Hash does files, CRC32 and checksum comparison, Text Analyzer gained utilities.
- **Site features**: Pop out (each tool in its own small window, as many as you like) and Keep on top
  (Document Picture-in-Picture, Chrome/Edge); Settings → Manage tools to switch tools on/off; a light code
  editor in every code box (`src/editor.jsx`: line numbers, JSON/YAML/XML/SQL colours, Tab indent; can be
  switched off in Settings); Smart Paste recognises SSH keys, ULIDs, TOML, kubeconfig, Kubernetes,
  compose and nginx files.
- **CLI** (`scripts/devdeck-cli.mjs`): `npm run cli -- help` — json, yaml2json/json2yaml, toml2json/json2toml,
  base64, url, hash, uuid, ulid, password, jwt, cert, gzip/gunzip; reads a file or piped input.
- New libraries: `smol-toml`, `jsqr`, `jsonpath-plus`.

Certificates (in `src/certs.jsx`, logic in `src/certs-core.js`, DevOps group):
- **SSL/TLS Certificate Decoder**: paste or open a PEM/CRT/CER/DER certificate, a whole chain or a
  CSR. Shows who it's for (SAN names), issuer, valid-from/until with days left (expired / expiring
  soon badges), key type and size, signature algorithm, serial, SHA-256/SHA-1 fingerprints, key
  usage, CA flag, OCSP/CRL links and all extensions; warns about missing SANs, SHA-1 and weak keys.
  Chains are checked link by link (names and real signature checks in the browser). "Does my private
  key match?" compares a private key to the certificate. Download any certificate as PEM or DER, and
  copy the openssl command that fetches a website's certificate.
- **Certificate & CSR Generator**: make a self-signed certificate, a signing request (CSR) or your
  own CA with ECDSA P-256 or RSA 2048/4096 keys, entirely in the browser (Web Crypto, needs https
  or localhost), with the equivalent openssl command.
- Smart Paste recognises certificates, CSRs and private keys.

Polish (latest round):
- **Smarter search** (home page and quick search): words match in any order ("format json"),
  word endings are forgiven ("formatting", "passwords") and nicknames work ("epoch", "k8s",
  "beautify", "guid"); best matches come first. Nicknames live in `SEARCH_WORDS` in `src/data.js`.
  When nothing matches, one click hands the text to Smart Paste. Arrow keys keep the highlighted
  result in view.
- **JWT Decoder** shows the algorithm, issued/usable-from/expiry dates in plain words and a
  "still valid / expired" badge, and accepts a whole `Bearer …` line.
- **JSON Formatter** errors say the line and column plus a likely cause, and a "Fix common
  mistakes" button repairs trailing commas, single quotes, unquoted keys, comments and
  Python-style True/False/None.
- **Number Base**: typing 0x / 0o / 0b switches base; a hex value starting with "0b" is no longer cut.
- **Text Comparer**: added/removed counts, Swap, and "ignore upper/lower case". **Text Inspector**: Undo after a case change.
- **Copy** buttons also work where the browser blocks the clipboard API, and say so if copying fails.

Choices are saved in the browser. Themes live in `src/prefs.jsx` (list) and `src/styles.css` (colours).

Build: `npm install && npm run build` in this folder. The output in `dist/` is static files,
with each page at its own path.
