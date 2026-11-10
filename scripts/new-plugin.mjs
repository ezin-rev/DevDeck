#!/usr/bin/env node
// Create a new DevDeck plugin from a template.
// Usage: npm run new-plugin -- my-plugin "My Plugin"
import { mkdirSync, writeFileSync, existsSync } from "node:fs";

const id = (process.argv[2] || "").trim().toLowerCase();
const name = process.argv[3] || id.replace(/(^|-)(\w)/g, (_, s, c) => (s ? " " : "") + c.toUpperCase());
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) {
  console.error('Give the plugin an id made of lower-case letters, digits and dashes, e.g.\n  npm run new-plugin -- word-tools "Word Tools"');
  process.exit(1);
}
const dir = new URL(`../src/plugins/${id}/`, import.meta.url);
if (existsSync(dir)) { console.error(`src/plugins/${id} already exists.`); process.exit(1); }
mkdirSync(dir, { recursive: true });

const toolId = `${id}-reverse`;
writeFileSync(new URL("plugin.json", dir), JSON.stringify({
  id, name, version: "0.1.0", author: "", description: `${name}: describe what your plugin adds.`,
  tools: [{ id: toolId, title: "Reverse Text", short: "Reverse Text", desc: "Write each line backwards", icon: "text", keywords: "reverse backwards mirror", level: 2 }],
}, null, 2) + "\n");

writeFileSync(new URL("index.jsx", dir), `// ${name} — a DevDeck plugin. Guide: PLUGINS.md
import { definePlugin } from "../../plugin-sdk.jsx";

export default definePlugin({
  id: "${id}",
  tools: {
    // A "transform" tool: DevDeck draws the input box, options and output for you.
    "${toolId}": {
      sample: "Hello, plugin!",
      options: [{ id: "perLine", label: "Each line separately", type: "toggle", default: true }],
      transform(input, { perLine }) {
        const flip = (s) => [...s].reverse().join("");
        return perLine ? input.split("\\n").map(flip).join("\\n") : flip(input);
      },
    },
  },
});
`);
console.log(`Created src/plugins/${id}/ (plugin.json + index.jsx).\nRun "npm run build" and open /plugins/${toolId}. Edit the files to make it your own — see PLUGINS.md.`);
