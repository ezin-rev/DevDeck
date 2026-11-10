// Pinned (favourite) and recently used tools, saved in the browser and shared across components.
import { useSyncExternalStore } from "react";
import { MOVED } from "./routes.mjs";

const listeners = new Set();
// Saved lists are read with old DevOps addresses updated to where those tools live now.
const read = (key) => { try { return [...new Set(JSON.parse(localStorage.getItem(key) || "[]").map((p) => MOVED[p] || p))]; } catch { return []; } };
const cache = { "aurora-pins": read("aurora-pins"), "aurora-recent": read("aurora-recent"), "aurora-hidden": read("aurora-hidden") };

function write(key, list) {
  cache[key] = list;
  try { localStorage.setItem(key, JSON.stringify(list)); } catch {}
  listeners.forEach((l) => l());
}
const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };

export const usePins = () => useSyncExternalStore(subscribe, () => cache["aurora-pins"]);
export const useRecent = () => useSyncExternalStore(subscribe, () => cache["aurora-recent"]);

export function togglePin(path) {
  const l = cache["aurora-pins"];
  write("aurora-pins", l.includes(path) ? l.filter((p) => p !== path) : [...l, path]);
}
export function markUsed(path) {
  write("aurora-recent", [path, ...cache["aurora-recent"].filter((p) => p !== path)].slice(0, 6));
}
export const clearRecent = () => write("aurora-recent", []);

// Code editor look for code boxes (line numbers, colours, Tab to indent); on unless switched off.
let editorOn = (() => { try { return localStorage.getItem("aurora-code-editor") !== "off"; } catch { return true; } })();
export const useCodeEditor = () => useSyncExternalStore(subscribe, () => editorOn);
export const setCodeEditor = (on) => { editorOn = on; try { localStorage.setItem("aurora-code-editor", on ? "on" : "off"); } catch {} listeners.forEach((l) => l()); };

// VS Code-style shortcuts in code boxes; on unless switched off.
let editorKeysOn = (() => { try { return localStorage.getItem("aurora-editor-keys") !== "off"; } catch { return true; } })();
export const useEditorKeys = () => useSyncExternalStore(subscribe, () => editorKeysOn);
export const setEditorKeys = (on) => { editorKeysOn = on; try { localStorage.setItem("aurora-editor-keys", on ? "on" : "off"); } catch {} listeners.forEach((l) => l()); };

// Tools switched off in Settings → Manage tools (hidden from menus and search; their pages still open).
export const useHidden = () => useSyncExternalStore(subscribe, () => cache["aurora-hidden"]);
export const setHidden = (paths) => write("aurora-hidden", [...new Set(paths)]);
export const toggleHidden = (path) => { const l = cache["aurora-hidden"]; setHidden(l.includes(path) ? l.filter((p) => p !== path) : [...l, path]); };
