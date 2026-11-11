// Plugins installed from inside DevDeck (Settings → Plugins → Install), without rebuilding the site.
// A plugin is one JavaScript module file (see PLUGINS.md, "Single-file plugins"):
//
//   export default (sdk) => ({
//     id: "word-tools", name: "Word Tools", version: "1.0.0", author: "You", description: "…",
//     tools: [
//       { id: "word-count", title: "Word Counter", desc: "…", icon: "text",
//         transform: (input, options) => String(input.split(/\s+/).filter(Boolean).length) },
//       { id: "reading-time", title: "Reading Time", desc: "…", component: () => sdk.h("p", null, "Hi") },
//     ],
//   });
//
// Installed plugins are kept on this device (localStorage) and loaded before the app first draws.
import * as React from "react";
import { registerPluginTools, PLUGINS } from "./data.js";

const KEY = "devdeck-user-plugins";
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const USER_VIEWS = {};          // "/plugins/<tool-id>" → component (merged into the app's views)
export const USER_PLUGIN_ERRORS = [];  // [{ id, message }] for plugins that failed to load

export function listUserPlugins() { try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; } }
const save = (list) => localStorage.setItem(KEY, JSON.stringify(list));

// Run the plugin file's code and check what it describes. Returns { manifest, views } or throws a
// plain-language error. Nothing is saved here.
export async function evaluatePlugin(code) {
  if (!code || !code.trim()) throw new Error("The plugin file is empty.");
  const kit = await import("./plugin-sdk.jsx");
  const sdk = { ...kit, React, h: React.createElement, Fragment: React.Fragment, useState: React.useState, useEffect: React.useEffect, useMemo: React.useMemo, useRef: React.useRef };
  const url = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
  let mod;
  try { mod = await import(/* @vite-ignore */ url); }
  catch (e) { throw new Error(`The plugin code has an error: ${e.message}`); }
  finally { URL.revokeObjectURL(url); }
  let def = mod.default;
  if (typeof def === "function") def = await def(sdk);
  if (!def || typeof def !== "object") throw new Error("The plugin must “export default” an object (or a function that returns one).");
  if (!ID.test(def.id || "")) throw new Error("The plugin needs an id of lower-case letters, digits and dashes, e.g. “word-tools”.");
  if (!def.name) throw new Error("The plugin needs a name.");
  if (!Array.isArray(def.tools) || !def.tools.length) throw new Error("The plugin needs at least one tool in “tools”.");
  for (const t of def.tools) {
    if (!ID.test(t.id || "")) throw new Error(`Each tool needs an id of lower-case letters, digits and dashes (got “${t.id}”).`);
    if (!t.title) throw new Error(`Tool “${t.id}” needs a title.`);
    if (typeof t.transform !== "function" && typeof t.component !== "function") throw new Error(`Tool “${t.id}” needs a transform function or a component.`);
  }
  const manifest = {
    id: def.id, name: String(def.name), version: String(def.version || "1.0.0"), author: def.author ? String(def.author) : "",
    description: def.description ? String(def.description) : "", homepage: def.homepage ? String(def.homepage) : "",
    tools: def.tools.map((t) => ({ id: t.id, title: String(t.title), short: String(t.short || t.title), desc: String(t.desc || ""), icon: t.icon, keywords: t.keywords || "", level: [1, 2, 3].includes(t.level) ? t.level : 2 })),
    user: true,
  };
  const { views } = kit.definePlugin({ id: def.id, tools: Object.fromEntries(def.tools.map((t) => [t.id, t])) });
  return { manifest, views };
}

// Called once before the app draws (main.jsx). Skips anything broken so it can't stop the site.
export async function loadUserPlugins() {
  const list = listUserPlugins();
  for (const entry of list) {
    try {
      if (PLUGINS.some((p) => p.id === entry.id)) throw new Error("A plugin with this id is already part of DevDeck.");
      const { manifest, views } = await evaluatePlugin(entry.code);
      const problem = registerPluginTools({ ...manifest, source: entry.source, url: entry.url, installedAt: entry.installedAt });
      if (problem) throw new Error(problem);
      for (const [toolId, View] of Object.entries(views)) USER_VIEWS[`/plugins/${toolId}`] = View;
    } catch (e) {
      USER_PLUGIN_ERRORS.push({ id: entry.id, name: entry.name || entry.id, message: e.message });
      console.error(`DevDeck: installed plugin “${entry.id}” could not load`, e);
    }
  }
}

// Get a plugin's code from a web address (the server must allow it — GitHub "raw" links do).
export async function fetchPluginCode(url) {
  let res;
  try { res = await fetch(url, { cache: "no-store" }); } catch { throw new Error("Couldn’t download it. Check the address, your connection, and that the site allows downloads from other websites (GitHub “Raw” links work)."); }
  if (!res.ok) throw new Error(`The address answered ${res.status} ${res.statusText}.`);
  return res.text();
}

export function installPlugin({ manifest, code, source, url }) {
  if (PLUGINS.some((p) => p.id === manifest.id && !p.user)) throw new Error(`“${manifest.id}” is already built into DevDeck.`);
  const list = listUserPlugins().filter((p) => p.id !== manifest.id);
  list.push({ id: manifest.id, name: manifest.name, version: manifest.version, code, source, url: url || "", installedAt: new Date().toISOString() });
  save(list);
}
export function uninstallPlugin(id) { save(listUserPlugins().filter((p) => p.id !== id)); }
