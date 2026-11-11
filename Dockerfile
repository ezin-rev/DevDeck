# syntax=docker/dockerfile:1
# DevDeck website in a container: build with Node, serve the static files with nginx.
#   docker build -t devdeck .                      # or: docker compose up -d --build
#   docker run -p 8080:8080 devdeck                # → http://localhost:8080
# Build options:
#   --build-arg SITE_URL=https://tools.example.com  full address (sitemap, share links, canonical links)

# ---- 1. build the site ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ARG SITE_URL=""
ENV SITE_URL=${SITE_URL}
RUN npm run build

# ---- 2. serve it (small, runs as a non-root user, listens on 8080) ----
FROM nginxinc/nginx-unprivileged:1.27-alpine
LABEL org.opencontainers.image.title="DevDeck" \
      org.opencontainers.image.description="Friendly developer tools that run in your browser" \
      org.opencontainers.image.source="https://github.com/ezin-rev/devdeck" \
      org.opencontainers.image.licenses="MIT"
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
