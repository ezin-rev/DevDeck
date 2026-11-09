// Pinned (favourite) and recently used tools, saved in the browser and shared across components.
import { useSyncExternalStore } from "react";

const listeners = new Set();
const read = (key) => { try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch { return []; } };
const cache = { "aurora-pins": read("aurora-pins"), "aurora-recent": read("aurora-recent") };

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
