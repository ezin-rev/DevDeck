// Copy the built index.html to every route so each page works as a static file, and give each page
// what search engines and link previews need: its own title, description, share tags, structured data
// (JSON-LD) and readable content (heading, description and links) until the app takes over.
// Also writes robots.txt and, when the site address is known, sitemap.xml.
// Usage: node routes.mjs [outDir] [routesModule]
//   outDir defaults to dist; routesModule defaults to src/routes.mjs.
//   Set SITE_URL (or "homepage" in package.json), e.g. SITE_URL=https://devdeck.example npm run build,
//   so share previews, canonical links and the sitemap get full addresses.
import { mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const out = process.argv[2] || "dist";
const mod = process.argv[3]
  ? pathToFileURL(resolve(process.argv[3])).href
  : new URL("../src/routes.mjs", import.meta.url).href;
const { ROUTES: CORE_ROUTES, MOVED = {} } = await import(mod);

let pkg = {};
try { pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")); } catch {}
const site = (process.env.SITE_URL || pkg.homepage || "").replace(/\/+$/, "");

// Tool and group names for page titles (skipped quietly if the list can't be loaded).
let tools = [], groups = [];
try { ({ ALL_TOOLS: tools, GROUPS: groups } = await import(new URL("../src/data.js", import.meta.url).href)); } catch {}
tools = [...tools]; groups = [...groups];

// Plugins: Node can't use Vite's file reading, so read src/plugins/*/plugin.json here.
const pluginDir = new URL("../src/plugins/", import.meta.url);
const plugins = existsSync(pluginDir)
  ? readdirSync(pluginDir, { withFileTypes: true }).filter((d) => d.isDirectory())
    .map((d) => { try { return JSON.parse(readFileSync(new URL(`${d.name}/plugin.json`, pluginDir), "utf8")); } catch { return null; } })
    .filter((m) => m && m.id && Array.isArray(m.tools))
  : [];
if (plugins.length && !groups.some((g) => g.id === "plugins")) {
  const g = { id: "plugins", title: "Plugins", tools: plugins.flatMap((m) => m.tools.map((t) => ({ ...t, short: t.short || t.title }))) };
  groups.push(g);
  tools.push(...g.tools.map((t) => ({ ...t, group: g, path: `/plugins/${t.id}` })));
}
const ROUTES = [...new Set([...CORE_ROUTES, ...groups.filter((g) => g.id === "plugins").flatMap((g) => [`/${g.id}`, ...g.tools.map((t) => `/${g.id}/${t.id}`)])])];

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const base = readFileSync(`${out}/index.html`, "utf8");
const abs = (p) => (site ? `${site}${p}` : p);
const link = (p, text) => `<a href="${esc(p)}">${esc(text)}</a>`;

function pageFor(route) {
  const path = MOVED[route] || route;
  const tool = tools.find((t) => t.path === path);
  const group = groups.find((g) => `/${g.id}` === path);
  const moved = !!MOVED[route];
  if (tool) {
    const siblings = tool.group.tools.filter((t) => t.id !== tool.id);
    return {
      path, moved, title: `${tool.title} – DevDeck`, desc: `${tool.desc}. Free, in your browser — nothing is uploaded.`,
      body: `<nav>${link("/", "All tools")} › ${link(`/${tool.group.id}`, tool.group.title)}</nav><h1>${esc(tool.title)}</h1><p>${esc(tool.desc)}. Free and private: it runs in your browser.</p>`
        + (siblings.length ? `<h2>More ${esc(tool.group.title.toLowerCase())}</h2><ul>${siblings.map((t) => `<li>${link(`/${tool.group.id}/${t.id}`, t.title)} — ${esc(t.desc)}</li>`).join("")}</ul>` : ""),
      ld: [
        { "@context": "https://schema.org", "@type": "SoftwareApplication", name: tool.title, description: tool.desc, applicationCategory: "DeveloperApplication", operatingSystem: "Any (web browser)", isAccessibleForFree: true, offers: { "@type": "Offer", price: "0", priceCurrency: "USD" }, ...(site ? { url: abs(path) } : {}) },
        { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [["All tools", "/"], [tool.group.title, `/${tool.group.id}`], [tool.title, path]].map(([name, p], i) => ({ "@type": "ListItem", position: i + 1, name, ...(site ? { item: abs(p) } : {}) })) },
      ],
    };
  }
  if (group) return {
    path, moved, title: `${group.title} – DevDeck`, desc: `${group.tools.length} free ${group.title.toLowerCase()} tools: ${group.tools.map((t) => t.short).join(", ")}.`,
    body: `<nav>${link("/", "All tools")}</nav><h1>${esc(group.title)}</h1><ul>${group.tools.map((t) => `<li>${link(`/${group.id}/${t.id}`, t.title)} — ${esc(t.desc)}</li>`).join("")}</ul>`,
    ld: [{ "@context": "https://schema.org", "@type": "ItemList", name: group.title, itemListElement: group.tools.map((t, i) => ({ "@type": "ListItem", position: i + 1, name: t.title, ...(site ? { url: abs(`/${group.id}/${t.id}`) } : {}) })) }],
  };
  if (path === "/settings") return { path, moved, title: "Settings – DevDeck", desc: "Choose DevDeck’s theme, layout, code editor, plugins and which tools to show.", noindex: true };
  if (path === "/") return {
    path, moved,
    body: `<h1>DevDeck — every little dev tool, in one friendly place</h1><p>${tools.length} free developer tools that run in your browser: convert, encode, format, validate and generate.</p>`
      + groups.map((g) => `<h2>${link(`/${g.id}`, g.title)}</h2><ul>${g.tools.map((t) => `<li>${link(`/${g.id}/${t.id}`, t.title)} — ${esc(t.desc)}</li>`).join("")}</ul>`).join(""),
    ld: [
      { "@context": "https://schema.org", "@type": "WebSite", name: "DevDeck", description: "Friendly developer tools that run in your browser.", ...(site ? { url: abs("/") } : {}) },
      { "@context": "https://schema.org", "@type": "SoftwareApplication", name: "DevDeck", applicationCategory: "DeveloperApplication", operatingSystem: "Any (web browser), macOS, Windows, Linux", isAccessibleForFree: true, offers: { "@type": "Offer", price: "0", priceCurrency: "USD" }, license: "https://opensource.org/licenses/MIT", author: { "@type": "Person", name: "ezin-rev", url: "https://github.com/ezin-rev" } },
    ],
  };
  return { path, moved, noindex: true };
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
  // old addresses that redirect, settings and unknown pages shouldn't show up in search results
  if (p.moved || p.noindex) set("name", "robots", "noindex, follow");
  const head = [];
  if (site) {
    set("property", "og:image", `${site}/og-image.jpg`);
    set("name", "twitter:image", `${site}/og-image.jpg`);
    const url = abs(p.path === "/" ? "/" : p.path);
    head.push(`<meta property="og:url" content="${esc(url)}" />`, `<link rel="canonical" href="${esc(url)}" />`);
  }
  for (const ld of p.ld || []) head.push(`<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>`);
  if (head.length) html = html.replace("</head>", `    ${head.join("\n    ")}\n  </head>`);
  // readable content for crawlers and no-JS visitors; the app replaces it as soon as it starts
  if (p.body && !p.moved) html = html.replace('<div id="root"></div>', `<div id="root"><div class="seo-fallback">${p.body}</div></div>`);
  return html;
}

writeFileSync(`${out}/index.html`, render("/"));
for (const r of ROUTES) {
  mkdirSync(`${out}${r}`, { recursive: true });
  writeFileSync(`${out}${r}/index.html`, render(r));
}
writeFileSync(`${out}/404.html`, render("/__not-found__"));

// robots.txt (+ sitemap.xml when the site address is known — sitemaps need full addresses)
const indexable = ["/", ...ROUTES.filter((r) => !MOVED[r] && r !== "/settings" && r !== "/aurora")];
if (site) {
  const today = new Date().toISOString().slice(0, 10);
  writeFileSync(`${out}/sitemap.xml`, `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${indexable.map((r) => `  <url><loc>${esc(abs(r === "/" ? "/" : r))}</loc><lastmod>${today}</lastmod><priority>${r === "/" ? "1.0" : r.split("/").length === 2 ? "0.8" : "0.6"}</priority></url>`).join("\n")}\n</urlset>\n`);
}
writeFileSync(`${out}/robots.txt`, `User-agent: *\nAllow: /\nDisallow: /settings\n${site ? `\nSitemap: ${site}/sitemap.xml\n` : ""}`);

console.log(`Wrote ${ROUTES.length} route pages in ${out}${plugins.length ? ` (${plugins.length} plugin${plugins.length === 1 ? "" : "s"})` : ""}${site ? ` · sitemap and share links use ${site}` : " · set SITE_URL for a sitemap"}`);
