# DevDeck

By **ezin-rev** — source: https://github.com/ezin-rev/devdeck (credited in the site footer and on the
Settings page, About panel).

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
- **Fine-tuning**: navigation (top tabs, side menu, icon bar, search only); cards, tiles or
  compact list; tool boxes side by side or stacked; roomy or compact spacing; normal or large
  text; welcome banner on/off; centered or full width; top bar & headers full or slim. Side menu and
  icon bar switch to top tabs on narrow screens.

**Tool sets** (Settings → Manage tools): one click switches between **Essentials** (27 everyday tools:
formatting and converting data, encoding, hashes, IDs, passwords, text and images), **Standard** (54:
adds common developer tools such as SQL/XML, JSON queries and schemas, cron, .env, curl, HTTP and DNS)
and **Complete** (all 73, including certificates and keys, Docker/Kubernetes checks, gRPC, WebSocket and
XSD). Single tools can still be switched on or off afterwards ("Custom"). Levels are set in `src/data.js`
(`ESSENTIALS`, `SPECIALIST`; everything else is Standard).

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
