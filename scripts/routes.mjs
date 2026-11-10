// Copy the built index.html to every route so each page works as a static file,
// giving each page its own title, description and link-preview (share thumbnail) tags.
// Usage: node routes.mjs [outDir] [routesModule]
//   outDir defaults to dist; routesModule defaults to src/routes.mjs.
//   Set SITE_URL (or "homepage" in package.json), e.g. SITE_URL=https://devdeck.example npm run build,
//   so share previews get full addresses — Facebook, LINE and some others need them.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const out = process.argv[2] || "dist";
const mod = process.argv[3]
  ? pathToFileURL(resolve(process.argv[3])).href
  : new URL("../src/routes.mjs", import.meta.url).href;
const { ROUTES, MOVED = {} } = await import(mod);

let pkg = {};
try { pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")); } catch {}
const site = (process.env.SITE_URL || pkg.homepage || "").replace(/\/+$/, "");

// Tool and group names for page titles (skipped quietly if the list can't be loaded).
let tools = [], groups = [];
try { ({ ALL_TOOLS: tools, GROUPS: groups } = await import(new URL("../src/data.js", import.meta.url).href)); } catch {}

const esc = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const base = readFileSync(`${out}/index.html`, "utf8");

function pageFor(route) {
  const path = MOVED[route] || route;
  const tool = tools.find((t) => t.path === path);
  const group = groups.find((g) => `/${g.id}` === path);
  if (tool) return { path, title: `${tool.title} – DevDeck`, desc: `${tool.desc}. Free, in your browser — nothing is uploaded.` };
  if (group) return { path, title: `${group.title} – DevDeck`, desc: `${group.tools.length} free ${group.title.toLowerCase()} tools: ${group.tools.map((t) => t.short).join(", ")}.` };
  if (path === "/settings") return { path, title: "Settings – DevDeck", desc: "Choose DevDeck’s theme, layout, code editor and which tools to show." };
  return { path };
}

function render(route) {
  const p = pageFor(route);
  let html = base;
  const set = (attr, name, value) => { html = html.replace(new RegExp(`(<meta ${attr}="${name}" content=")[^"]*(")`), `$1${esc(value)}$2`); };
  if (p.title) {
    html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(p.title)}</title>`);
    set("property", "og:title", p.title); set("name", "twitter:title", p.title);
  }
  if (p.desc) { set("name", "description", p.desc); set("property", "og:description", p.desc); set("name", "twitter:description", p.desc); }
  if (site) {
    set("property", "og:image", `${site}/og-image.jpg`);
    set("name", "twitter:image", `${site}/og-image.jpg`);
    const url = `${site}${p.path === "/" ? "/" : p.path}`;
    html = html.replace("</head>", `    <meta property="og:url" content="${esc(url)}" />\n    <link rel="canonical" href="${esc(url)}" />\n  </head>`);
  }
  return html;
}

writeFileSync(`${out}/index.html`, render("/"));
for (const r of ROUTES) {
  mkdirSync(`${out}${r}`, { recursive: true });
  writeFileSync(`${out}${r}/index.html`, render(r));
}
writeFileSync(`${out}/404.html`, base);
console.log(`Wrote ${ROUTES.length} route pages in ${out}${site ? ` (share links use ${site})` : ""}`);
