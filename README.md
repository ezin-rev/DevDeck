# DevDeck

**73 developer tools in one friendly web app** (75 with the bundled example plugin). Format,
convert, encode, generate, validate and inspect — everything runs in your browser. No sign-up,
no uploads, works offline.

**[Website](https://devdeck.revcraft.dev/)** · **[Docs](https://devdeck.revcraft.dev/docs/)** · MIT License

## Demo

![DevDeck in action: browse the tools, open the JSON Formatter and format JSON](docs/media/devdeck-demo.gif)

*A 15-second tour of DevDeck.*

## Tools

| Group | What's inside |
|---|---|
| **Converters** | JSON ↔ YAML / TOML / CSV, Base64, URL, timestamps, colours, .env, curl → code |
| **Formatters** | JSON, SQL, XML, YAML, Markdown, NGINX |
| **Encoders / Decoders** | Base64, URL, HTML entities, JWT, GZIP |
| **Generators** | UUID / ULID, passwords, QR codes, SSH / RSA keys, certificates, fake data |
| **Validators & Inspectors** | JSON Schema, XML / XSD, Docker Compose, Kubernetes, certificates |
| **Calculators** | CIDR, chmod, sizes & durations, uptime / SLA |
| **Text** | compare, inspect, sort, dedupe, delimiters |
| **JSON, YAML & XML** | JSONPath, schemas, code generation |
| **Network & APIs** | HTTP requests, WebSocket, DNS, ports, gRPC helpers |
| **Files & Images** | image conversion, PNG compression, colour-blind simulation |
| **Reference** | HTTP status codes, keyboard events |

## Highlights

- **Smart Paste** — paste a token, JSON, date, Base64, certificate… DevDeck recognises it and opens
  the right tool with your text filled in.
- **Tool Chain** — combine decode, format, sort, hash, extract links and more into a live recipe.
- **Quick search** — **Ctrl/⌘ + K** or **/**, with pinned and recent tools.
- **Make it yours** — 8 themes plus a custom theme editor, 6 layout presets, tool sets and
  VS Code-style code-box shortcuts.
- **Extensible** — install one-file plugins from Settings or write your own; a Rust / Tauri
  desktop app is included.

## Run it

```bash
npm install
npm run build      # static site in dist/
```

- **Dev server:** `npm run dev:web`
- **Docker:** `docker compose up -d --build` → http://localhost:8080 — see [docs/docker.md](docs/docker.md)
- **Desktop app:** `make desktop` (or `npm run desktop:release`) → installers in `release/` — see [DESKTOP.md](DESKTOP.md)
- **CLI:** `npm run cli -- help` · **All commands:** `make help`

## Learn more

- [Using DevDeck](docs/getting-started.md) — finding tools, Smart Paste, themes, layouts
- [Keyboard shortcuts](docs/shortcuts.md) — VS Code-style editing in code boxes
- [Plugins](PLUGINS.md) — install plugins or write your own
- [Desktop app](DESKTOP.md) — macOS, Windows and Linux builds
- [Hosting & building](docs/hosting.md) — GitHub Pages, your own server, build options

## Privacy

Every tool runs in your browser; nothing you type is uploaded. The only exceptions are the
**Network & APIs** tools, which contact the address you enter. After the first visit DevDeck works
offline and can be installed as an app.

## License

[MIT](LICENSE) © ezin-rev · [github.com/ezin-rev/DevDeck](https://github.com/ezin-rev/DevDeck)
