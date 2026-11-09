# DevDeck (Aurora design)

Friendly developer tools that run entirely in the browser: a top tab bar, a big welcome
search, and a quick-search palette (Ctrl/⌘ + K or "/"). This design (first built as
"Aurora") is now the whole site; the earlier classic sidebar version was removed.
Old `/aurora/…` links still work and open the same page at the top level.

Two menus in the top bar (also on the Settings page) let visitors pick:
- **Theme**: High Contrast (default), Calm Slate, Warm Paper, Sage Forest, Harbor Blue, Dusk Rose,
  Ink & Paper, or the original Aurora Neon; each in light, dark or system mode.
- **Layout presets** (one click): Modern web (default), Desktop app (side menu, full width),
  Dev workspace (slim icon bar, compact list), App launcher (big tiles), Easy reading
  (large text, stacked boxes) and Focus (search only).
- **Fine-tuning**: navigation (top tabs, side menu, icon bar, search only); cards, tiles or
  compact list; tool boxes side by side or stacked; roomy or compact spacing; normal or large
  text; welcome banner on/off; centered or full width. Side menu and icon bar switch to top
  tabs on narrow screens.

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

More developer tools (in `src/tools2.jsx`): CSV <> JSON (with table preview), Cron Schedule
Explainer (plain words + next runs), File Permission (chmod) Calculator, QR Code Generator
(PNG/SVG download), URL Parser & Builder, Image <> Base64, String Escaper, SQL Formatter,
XML Formatter, Markdown Preview, Lorem Ipsum and Fake Data generators, and a new Reference
group with HTTP Status Codes and a Keyboard Event Inspector. Smart Paste also recognises
SQL, XML, cron schedules, CSV tables, images, chmod numbers and status codes, and Tool Chain
gained CSV/JSON, SQL/XML formatting and escaping steps.

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
