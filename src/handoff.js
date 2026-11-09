// Pass text from one tool to the next page (e.g. Smart Paste → "Open in tool").
const KEY = "aurora-handoff";

export function sendTo(path, text, extra = {}) {
  try { sessionStorage.setItem(KEY, JSON.stringify({ path, text, ...extra })); } catch {}
}

// Read the waiting text once, only if it was meant for the current page.
export function takeHandoff(fallback, field = "text") {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return fallback;
    const h = JSON.parse(raw);
    const here = window.location.pathname.replace(/\/+$/, "");
    if (!here.endsWith(h.path)) return fallback;
    if (field === "text") sessionStorage.removeItem(KEY);
    return h[field] ?? fallback;
  } catch { return fallback; }
}

// Peek without consuming (for options like "decode" that are read before the text).
export function peekHandoff(field, fallback) {
  try {
    const h = JSON.parse(sessionStorage.getItem(KEY) || "null");
    const here = window.location.pathname.replace(/\/+$/, "");
    return h && here.endsWith(h.path) && h[field] !== undefined ? h[field] : fallback;
  } catch { return fallback; }
}
