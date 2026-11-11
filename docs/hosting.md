# Hosting & building

## Build the website

```bash
npm install
npm run build            # → dist/  (static files, one folder per page)
```

| Setting | Example | What it does |
|---|---|---|
| `SITE_URL` | `https://tools.example.com` | Full public address: adds `sitemap.xml`, canonical links, `og:url`, absolute share images |
| `BASE_PATH` | `/` | Set only when the site lives in a sub-folder, e.g. `/devdeck/` |

```bash
SITE_URL=https://tools.example.com npm run build
BASE_PATH=/devdeck/ SITE_URL=https://you.github.io/devdeck npm run build
```

`dist/` can go on any static host (GitHub Pages, Netlify, Cloudflare Pages, S3, nginx, Apache…). Every page
has its own `index.html`; `404.html` is the app shell, so addresses the build doesn't know (tools from
plugins installed in the app) still open.

## GitHub Pages (website + these docs)

The workflow `.github/workflows/pages.yml` builds DevDeck and this documentation and publishes both on
every push to `main`:

- the app at `https://<owner>.github.io/`
- the docs at `https://<owner>.github.io/docs/`

To switch it on: on GitHub open **Settings → Pages → Build and deployment → Source: GitHub Actions**, then
push to `main` (or run the workflow from the **Actions** tab). Locally, `make docs` builds the same thing
into `dist/`.

The docs pages are made from Markdown — `docs/*.md`, `PLUGINS.md` and `DESKTOP.md` — by
`scripts/build-docs.mjs`. Edit those files and push.

## Docker

See [Docker](docker.html).

## Desktop app

See [Desktop app](desktop.html). The workflow `.github/workflows/desktop.yml` builds the macOS, Windows and
Linux installers on GitHub when you push a version tag (`git tag v1.0.0 && git push --tags`) and attaches
them to a draft release.

## The Makefile

Run `make` to list every command. The main ones:

| Command | What it does |
|---|---|
| `make install` | Install what the project needs (once) |
| `make web` | Build the website |
| `make docs` | Build the website + docs for GitHub Pages |
| `make docker-up` / `make docker-down` | Start / stop DevDeck in Docker |
| `make check-desktop` | Check the computer has what the desktop build needs |
| `make desktop-dev` | Run the desktop app with live reload |
| `make desktop` | Build the desktop app for this computer → `release/<system>/` |
| `make desktop-mac` / `make desktop-mac-universal` | macOS `.app` + `.dmg` (this chip / Apple silicon + Intel) |
| `make desktop-win` | Windows `.msi` + setup `.exe` (on Windows) |
| `make desktop-linux` | Linux `.deb` + `.rpm` + `.AppImage` (on Linux) |
| `make desktop-linux-docker` | Linux packages from any computer, via Docker |
| `make test` | Rust tests |
| `make clean` | Remove build output |

On Windows, use Git Bash or MSYS2 for `make`, or run the node commands directly, e.g.
`npm run desktop:release` (same as `make desktop`).

## Command line

`npm run cli -- help` lists the command-line tools (JSON, YAML, TOML, Base64, URL, hashes, UUID/ULID,
passwords, JWT, certificates, gzip).
