// Copy the built index.html to every route so each page works as a static file.
// Usage: node routes.mjs [outDir] [routesModule]
//   outDir defaults to dist; routesModule defaults to src/routes.mjs.
import { mkdirSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const out = process.argv[2] || "dist";
const mod = process.argv[3]
  ? pathToFileURL(resolve(process.argv[3])).href
  : new URL("../src/routes.mjs", import.meta.url).href;
const { ROUTES } = await import(mod);

for (const r of ROUTES) {
  const dir = `${out}${r}`;
  mkdirSync(dir, { recursive: true });
  copyFileSync(`${out}/index.html`, `${dir}/index.html`);
}
copyFileSync(`${out}/index.html`, `${out}/404.html`);
console.log(`Wrote ${ROUTES.length} route pages in ${out}`);
