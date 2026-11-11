# DevDeck — handy commands. Run `make` (or `make help`) to see them all.
# Works on macOS and Linux. On Windows use Git Bash or MSYS2 (`pacman -S make`) — or run the npm/node
# command shown after each target directly (e.g. `npm run desktop:release`).

.DEFAULT_GOAL := help
NPM ?= npm
PORT ?= 8080

.PHONY: help install web cli test check-desktop desktop desktop-dev desktop-mac desktop-mac-universal \
        desktop-win desktop-linux desktop-linux-docker docker-build docker-up docker-down docker-logs docs clean

help: ## Show this list
	@echo "DevDeck — make <target>"
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-24s %s\n", $$1, $$2}'

## ---- website ----
install: ## Install everything the project needs (run once)
	$(NPM) install

web: ## Build the website into dist/  (set SITE_URL=https://… for the sitemap)
	$(NPM) run build

docs: ## Build the website + documentation for GitHub Pages into dist/ (BASE_PATH=/devdeck/)
	BASE_PATH=$${BASE_PATH:-/devdeck/} $(NPM) run build
	BASE_PATH=$${BASE_PATH:-/devdeck/} node scripts/build-docs.mjs dist

cli: ## Show the command-line tools
	$(NPM) run cli -- help

## ---- Docker ----
docker-build: ## Build the website image (devdeck:latest)
	docker compose build devdeck

docker-up: ## Start the website at http://localhost:$(PORT)
	DEVDECK_PORT=$(PORT) docker compose up -d --build devdeck
	@echo "DevDeck is running at http://localhost:$(PORT)"

docker-down: ## Stop the website container
	docker compose down

docker-logs: ## Follow the website container's logs
	docker compose logs -f devdeck

## ---- desktop app (Rust / Tauri) ----
check-desktop: ## Check this computer has what the desktop build needs
	node scripts/build-desktop.mjs --check

desktop-dev: ## Run the desktop app with live reload
	$(NPM) run desktop:dev

desktop: ## Build the desktop app for THIS computer → release/<system>/
	node scripts/build-desktop.mjs

desktop-mac: ## macOS: DevDeck.app + .dmg for this Mac's chip (run on a Mac)
	node scripts/build-desktop.mjs --platform mac

desktop-mac-universal: ## macOS: one app for Apple silicon and Intel Macs (run on a Mac)
	node scripts/build-desktop.mjs --platform mac --universal

desktop-win: ## Windows: .msi + setup .exe (run on Windows)
	node scripts/build-desktop.mjs --platform windows

desktop-linux: ## Linux: .deb + .rpm + .AppImage (run on Linux)
	node scripts/build-desktop.mjs --platform linux

desktop-linux-docker: ## Linux packages built inside Docker, from any computer → release/linux/
	mkdir -p release/linux
	docker compose --profile desktop run --rm --build desktop-linux

test: ## Run the Rust tests of the desktop app
	cd src-tauri && cargo test

clean: ## Remove build output (dist/, release/, Rust build files)
	rm -rf dist release src-tauri/target
