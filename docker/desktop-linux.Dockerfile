# Build the DevDeck Linux desktop app (.deb, .rpm, .AppImage) in a container, from any computer.
#   make desktop-linux-docker        (or: docker compose --profile desktop run --rm desktop-linux)
# The packages appear in ./release/linux. They match the computer's processor (x86_64 or arm64).
FROM rust:1-bookworm

# Tauri's Linux needs (https://tauri.app/start/prerequisites/#linux) + Node.js for the web part
RUN apt-get update && apt-get install -y --no-install-recommends \
      libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev \
      libayatana-appindicator3-dev librsvg2-dev patchelf rpm xdg-utils ca-certificates \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .

# AppImage tools need FUSE, which containers don't have; this makes them unpack themselves instead.
ENV APPIMAGE_EXTRACT_AND_RUN=1 NO_STRIP=true
CMD ["sh", "-c", "npx tauri build --bundles deb,rpm,appimage && mkdir -p /out && cp -v src-tauri/target/release/bundle/deb/*.deb src-tauri/target/release/bundle/rpm/*.rpm src-tauri/target/release/bundle/appimage/*.AppImage /out/"]
