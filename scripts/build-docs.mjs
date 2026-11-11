#!/usr/bin/env node
// Build the documentation website from Markdown into <outDir>/docs/ (default dist/docs/).
//   node scripts/build-docs.mjs [outDir]
// Sources: docs/*.md plus PLUGINS.md and DESKTOP.md (so each guide is written once).
// Published with the app on GitHub Pages by .github/workflows/pages.yml (see docs/hosting.md).
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { marked } from "marked";

const out = `${process.argv[2] || "dist"}/docs`;
const root = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");
const basePrefix = (process.env.BASE_PATH || "/").replace(/\/+$/, "");
const site = (process.env.SITE_URL || "").replace(/\/+$/, "");

// Pages in sidebar order: [file name, source, sidebar title]
const PAGES = [
  ["index", "docs/index.md", "Overview"],
  ["getting-started", "docs/getting-started.md", "Using DevDeck"],
  ["shortcuts", "docs/shortcuts.md", "Keyboard shortcuts"],
  ["plugins", "PLUGINS.md", "Plugins"],
  ["desktop", "DESKTOP.md", "Desktop app"],
  ["docker", "docs/docker.md", "Docker"],
  ["hosting", "docs/hosting.md", "Hosting & building"],
];
// Links between the Markdown files become links between the pages.
const LINKS = { "PLUGINS.md": "plugins.html", "DESKTOP.md": "desktop.html", "README.md": "index.html", "LICENSE": "https://github.com/ezin-rev/devdeck/blob/main/LICENSE" };
const fixLinks = (html) => html
  .replace(/href="(?:\.\.\/|\.\/)?(?:docs\/)?([\w-]+)\.md(#[^"]*)?"/g, (m, name, hash = "") => `href="${LINKS[`${name}.md`] || `${name}.html`}${hash}"`)
  .replace(/href="LICENSE"/g, `href="${LINKS.LICENSE}"`)
  .replace(/<a href="(https?:\/\/[^"]+)"/g, '<a href="$1" target="_blank" rel="noopener"');

const slug = (s) => s.toLowerCase().replace(/<[^>]+>/g, "").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
marked.use({ gfm: true, renderer: { heading({ tokens, depth }) { const text = this.parser.parseInline(tokens); const id = slug(text); return `<h${depth} id="${id}"><a class="anchor" href="#${id}">#</a>${text}</h${depth}>\n`; } } });

const CSS = `
:root{--bg:#fff;--fg:#1d2330;--muted:#5d6577;--line:#e3e6ec;--card:#f6f7f9;--accent:#b38600;--code:#f1f3f6}
@media (prefers-color-scheme:dark){:root{--bg:#0b0c0f;--fg:#e6e8ee;--muted:#9aa2b2;--line:#252a33;--card:#14171c;--accent:#ffd400;--code:#171a20}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.65 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:var(--accent)}header{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:14px;padding:12px 24px;border-bottom:1px solid var(--line);background:color-mix(in srgb,var(--bg) 90%,transparent);backdrop-filter:blur(10px)}
header .brand{display:flex;align-items:center;gap:10px;font-weight:800;color:var(--fg);text-decoration:none}header .brand img{width:28px;height:28px;border-radius:8px}
header .spacer{flex:1}header .btn{padding:6px 14px;border:1px solid var(--line);border-radius:999px;color:var(--fg);text-decoration:none;font-weight:600;font-size:14px}
.wrap{display:grid;grid-template-columns:230px minmax(0,1fr);gap:40px;max-width:1150px;margin:0 auto;padding:28px 24px 80px}
nav.side{position:sticky;top:76px;align-self:start;display:flex;flex-direction:column;gap:2px}
nav.side a{padding:7px 12px;border-radius:10px;color:var(--muted);text-decoration:none;font-weight:600;font-size:15px}nav.side a:hover{background:var(--card);color:var(--fg)}
nav.side a.on{background:var(--card);color:var(--fg);box-shadow:inset 3px 0 0 var(--accent)}
main{min-width:0}main h1{font-size:34px;line-height:1.2;margin:0 0 18px}main h2{margin-top:36px;padding-top:8px;border-top:1px solid var(--line)}
h1,h2,h3{position:relative}.anchor{position:absolute;left:-1em;opacity:0;text-decoration:none}h1:hover .anchor,h2:hover .anchor,h3:hover .anchor{opacity:.6}
code{font:.88em/1.5 ui-monospace,Menlo,Consolas,monospace;background:var(--code);padding:.15em .4em;border-radius:6px}
pre{background:var(--code);border:1px solid var(--line);border-radius:12px;padding:14px 16px;overflow:auto}pre code{background:none;padding:0;font-size:.86em}
table{border-collapse:collapse;width:100%;display:block;overflow-x:auto;margin:12px 0}th,td{border:1px solid var(--line);padding:8px 12px;text-align:left;vertical-align:top}th{background:var(--card)}
blockquote{margin:0;padding:4px 16px;border-left:4px solid var(--accent);background:var(--card);border-radius:0 10px 10px 0}
footer{max-width:1150px;margin:0 auto;padding:20px 24px 40px;border-top:1px solid var(--line);color:var(--muted);font-size:14px}
@media (max-width:820px){.wrap{grid-template-columns:1fr;gap:16px}nav.side{position:static;flex-direction:row;overflow-x:auto;padding-bottom:6px}nav.side a{white-space:nowrap}header{padding:10px 16px}.wrap{padding:16px}main h1{font-size:28px}}
`;

function page(name, title, html, desc) {
  const nav = PAGES.map(([n, , t]) => `<a href="${n}.html"${n === name ? ' class="on" aria-current="page"' : ""}>${t}</a>`).join("");
  const canonical = site ? `<link rel="canonical" href="${site}/docs/${name}.html">` : "";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} – DevDeck docs</title><meta name="description" content="${desc.replace(/"/g, "&quot;")}">${canonical}
<link rel="icon" href="${basePrefix}/icon.svg" type="image/svg+xml"><meta property="og:title" content="${title} – DevDeck docs"><meta property="og:image" content="${site || basePrefix}/og-image.jpg">
<style>${CSS}</style></head><body>
<header><a class="brand" href="index.html"><img src="${basePrefix}/icon.svg" alt="">DevDeck docs</a><span class="spacer"></span>
<a class="btn" href="${basePrefix}/">Open DevDeck</a><a class="btn" href="https://github.com/ezin-rev/devdeck" target="_blank" rel="noopener">GitHub</a></header>
<div class="wrap"><nav class="side" aria-label="Documentation">${nav}</nav><main>${html}</main></div>
<footer>DevDeck by ezin-rev · MIT License · <a href="https://github.com/ezin-rev/devdeck/edit/main/${PAGES.find(([n]) => n === name)[1]}" target="_blank" rel="noopener">Edit this page</a></footer>
</body></html>`;
}

mkdirSync(out, { recursive: true });
for (const [name, src, sideTitle] of PAGES) {
  const md = read(src);
  const title = (md.match(/^#\s+(.+)$/m) || [, sideTitle])[1].replace(/[`*]/g, "");
  const desc = (md.split("\n").find((l) => l.trim() && !l.startsWith("#") && !l.startsWith("|") && !l.startsWith("```")) || title).replace(/[*`[\]]|\(.*?\)/g, "").trim().slice(0, 160);
  writeFileSync(`${out}/${name}.html`, page(name, title, fixLinks(marked.parse(md)), desc));
}
// Plain-file copies people may want to download from the docs
if (existsSync(new URL("public/plugin-examples/word-tools.js", root))) copyFileSync(new URL("public/plugin-examples/word-tools.js", root), `${out}/word-tools.plugin.js`);
console.log(`Wrote ${PAGES.length} documentation pages in ${out}`);
