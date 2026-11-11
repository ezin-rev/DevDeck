# Running DevDeck with Docker

DevDeck is a static website, so the container is tiny: it builds the site with Node and serves it with
nginx (as a non-root user, read-only, on port 8080).

## Docker Compose (easiest)

```bash
docker compose up -d --build        # → http://localhost:8080
docker compose logs -f devdeck      # follow the logs
docker compose down                 # stop
```

Or with the Makefile: `make docker-up` (`make docker-up PORT=9000` for another port), `make docker-down`.

Settings can go in a `.env` file next to `docker-compose.yml`:

```bash
DEVDECK_PORT=9000                         # port on your computer
SITE_URL=https://tools.example.com        # your public address: adds sitemap.xml, canonical and share links
```

## Plain Docker

```bash
docker build -t devdeck .
docker run -d --name devdeck -p 8080:8080 --read-only --tmpfs /tmp devdeck
# with your public address baked in:
docker build -t devdeck --build-arg SITE_URL=https://tools.example.com .
```

## What's in the image

| File | Purpose |
|---|---|
| `Dockerfile` | Two stages: `node:22-alpine` builds `dist/`, `nginxinc/nginx-unprivileged:1.27-alpine` serves it |
| `docker/nginx.conf` | Every page has its own folder; unknown addresses (e.g. tools from plugins installed in the app) get the app shell; hashed files are cached for a year; gzip; `/healthz` health check |
| `docker/security-headers.conf` | `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` (camera allowed for the QR reader) |
| `docker-compose.yml` | The website service (read-only, no-new-privileges, health check) and a `desktop` profile for building the Linux app |
| `.dockerignore` | Keeps `node_modules`, build output and local files out of the build |

Behind a reverse proxy (Traefik, Caddy, nginx), point it at port 8080 of the container. Serve DevDeck at
the root of its own (sub)domain, e.g. `tools.example.com`.

## Building the Linux desktop app in Docker

From any computer with Docker:

```bash
make desktop-linux-docker
# or: docker compose --profile desktop run --rm --build desktop-linux
```

The `.deb`, `.rpm` and `.AppImage` appear in `release/linux/`, for your computer's processor
(x86_64 or arm64). See [Desktop app](desktop.html).
