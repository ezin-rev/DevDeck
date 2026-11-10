// VS Code-style shortcuts for the code boxes (editor.jsx). Every change goes through
// document.execCommand("insertText"), so the browser's normal Undo / Redo keeps working.
const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
export const MOD = isMac ? "⌘" : "Ctrl";
const ALT = isMac ? "⌥" : "Alt";

// For the shortcut list in Settings.
export const SHORTCUTS = [
  ["Tab / Shift+Tab", "Indent / un-indent (works on several lines)"],
  [`${MOD}+] / ${MOD}+[`, "Indent / un-indent lines"],
  [`${MOD}+/`, "Comment or uncomment lines (// # -- or <!-- -->)"],
  [`${ALT}+↑ / ${ALT}+↓`, "Move lines up / down"],
  [`Shift+${ALT}+↑ / ↓`, "Copy lines up / down"],
  [`${MOD}+Shift+K`, "Delete lines"],
  [`${MOD}+Enter / ${MOD}+Shift+Enter`, "New line below / above"],
  [`${MOD}+L`, "Select the line (again to add the next one)"],
  [`${MOD}+D`, "Select the word, then jump to its next match"],
  [`${MOD}+G`, "Go to line"],
  [`Shift+${ALT}+F`, "Format the whole document (JSON)"],
  ["Enter", "Keeps the indentation (and indents after { [ ( or :)"],
  ["( [ { \" ' `", "Close brackets and quotes automatically; wraps a selection"],
  ["Home", "Jump to the first character of the line (again: to the start)"],
  ["Esc, then Tab", "Leave the box with the keyboard"],
];

const PAIRS = { "(": ")", "[": "]", "{": "}", '"': '"', "'": "'", "`": "`" };
const CLOSERS = new Set([")", "]", "}", '"', "'", "`"]);
const COMMENT = { yaml: ["#"], sql: ["--"], xml: ["<!--", "-->"], json: ["//"] };

function edit(t, from, to, text, selA, selB, onChange) {
  const v = t.value;
  t.setSelectionRange(from, to);
  const ok = text ? document.execCommand("insertText", false, text) : document.execCommand("delete");
  if (!ok) onChange?.(v.slice(0, from) + text + v.slice(to));
  const place = () => t.setSelectionRange(selA, selB ?? selA);
  place();
  requestAnimationFrame(place);
}
const lineStart = (v, i) => v.lastIndexOf("\n", i - 1) + 1;
const lineEnd = (v, i) => { const n = v.indexOf("\n", i); return n < 0 ? v.length : n; };
// Whole lines covered by the selection (a selection ending right after a newline doesn't include the next line).
const block = (v, a, b) => [lineStart(v, a), lineEnd(v, b > a && v[b - 1] === "\n" ? b - 1 : b)];
const indentOf = (line) => line.match(/^[ \t]*/)[0];

/* Returns true when the key was handled. ctx = { lang, readOnly, onChange } */
export function handleKey(e, ctx) {
  const t = e.currentTarget, v = t.value, a = t.selectionStart, b = t.selectionEnd;
  const mod = isMac ? e.metaKey : e.ctrlKey;
  const ro = ctx.readOnly, change = ctx.onChange;
  const k = e.key;
  const done = () => { e.preventDefault(); return true; };

  // ---- selection and navigation (also in read-only boxes) ----
  if (mod && !e.shiftKey && !e.altKey && k.toLowerCase() === "l") {
    const [s, en] = block(v, a, b);
    const reach = a === s && b > a && (v[b - 1] === "\n" || b === v.length) ? Math.min(v.length, lineEnd(v, b) + 1) : Math.min(v.length, en + 1);
    t.setSelectionRange(s, reach); return done();
  }
  if (mod && !e.shiftKey && !e.altKey && k.toLowerCase() === "d") {
    if (a === b) {
      let s = a, en = a;
      while (s > 0 && /\w/.test(v[s - 1])) s--;
      while (en < v.length && /\w/.test(v[en])) en++;
      if (s < en) t.setSelectionRange(s, en);
    } else {
      const word = v.slice(a, b);
      let i = v.indexOf(word, b);
      if (i < 0) i = v.indexOf(word);
      if (i >= 0) { t.setSelectionRange(i, i + word.length); t.blur(); t.focus(); }
    }
    return done();
  }
  if (mod && !e.shiftKey && !e.altKey && k.toLowerCase() === "g") {
    const n = parseInt(window.prompt(`Go to line (1–${v.split("\n").length})`) || "", 10);
    if (n > 0) { let i = 0; for (let l = 1; l < n && i >= 0; l++) { const nx = v.indexOf("\n", i); if (nx < 0) break; i = nx + 1; } t.focus(); t.setSelectionRange(i, i); t.blur(); t.focus(); }
    return done();
  }
  if (k === "Home" && !mod && !e.altKey) {
    const s = lineStart(v, b), first = s + indentOf(v.slice(s, lineEnd(v, s))).length;
    const to = b === first ? s : first;
    if (e.shiftKey) t.setSelectionRange(Math.min(a, to), Math.max(a, to), to < a ? "backward" : "forward"); else t.setSelectionRange(to, to);
    return done();
  }
  if (ro) return false;

  // ---- editing ----
  if ((k === "Tab" && !mod && !e.altKey) || (mod && !e.altKey && (k === "]" || k === "["))) {
    const out = k === "[" || (k === "Tab" && e.shiftKey);
    if (k === "Tab" && a === b && !out) { edit(t, a, b, "  ", a + 2, a + 2, change); return done(); }
    const [s, en] = block(v, a, b);
    const lines = v.slice(s, en).split("\n");
    const changed = out ? lines.map((l) => l.replace(/^( {1,2}|\t)/, "")) : lines.map((l) => "  " + l);
    const text = changed.join("\n");
    const first = changed[0].length - lines[0].length;
    edit(t, s, en, text, a === b ? Math.max(s, a + first) : s, a === b ? Math.max(s, a + first) : s + text.length, change);
    return done();
  }
  if (mod && !e.shiftKey && !e.altKey && k === "/") {
    const [open, close] = COMMENT[ctx.lang] || ["//"];
    const [s, en] = block(v, a, b);
    const lines = v.slice(s, en).split("\n");
    const filled = lines.filter((l) => l.trim());
    const pad = Math.min(...filled.map((l) => indentOf(l).length), Infinity);
    const isOn = filled.length && filled.every((l) => l.trimStart().startsWith(open) && (!close || l.trimEnd().endsWith(close)));
    const changed = lines.map((l) => {
      if (!l.trim()) return l;
      if (isOn) { let x = l.replace(new RegExp(`^(\\s*)${open.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} ?`), "$1"); if (close) x = x.replace(new RegExp(` ?${close.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`), ""); return x; }
      return `${l.slice(0, pad)}${open} ${l.slice(pad)}${close ? ` ${close}` : ""}`;
    });
    const text = changed.join("\n");
    edit(t, s, en, text, a === b ? Math.max(s, a + (changed[0].length - lines[0].length)) : s, a === b ? Math.max(s, a + (changed[0].length - lines[0].length)) : s + text.length, change);
    return done();
  }
  if (e.altKey && !mod && (k === "ArrowUp" || k === "ArrowDown")) {
    const [s, en] = block(v, a, b);
    const chunk = v.slice(s, en);
    if (e.shiftKey) { // copy lines
      if (k === "ArrowDown") edit(t, en, en, `\n${chunk}`, a + chunk.length + 1, b + chunk.length + 1, change);
      else edit(t, s, s, `${chunk}\n`, a, b, change);
      return done();
    }
    if (k === "ArrowUp") {
      if (s === 0) return done();
      const ps = lineStart(v, s - 1), prev = v.slice(ps, s - 1);
      edit(t, ps, en, `${chunk}\n${prev}`, a - prev.length - 1, b - prev.length - 1, change);
    } else {
      if (en >= v.length) return done();
      const ne = lineEnd(v, en + 1), next = v.slice(en + 1, ne);
      edit(t, s, ne, `${next}\n${chunk}`, a + next.length + 1, b + next.length + 1, change);
    }
    return done();
  }
  if (mod && e.shiftKey && !e.altKey && k.toLowerCase() === "k") {
    const [s, en] = block(v, a, b);
    if (en < v.length) edit(t, s, en + 1, "", s, s, change);
    else edit(t, Math.max(0, s - 1), en, "", Math.max(0, lineStart(v, Math.max(0, s - 1))), undefined, change);
    return done();
  }
  if (mod && k === "Enter") {
    const s = lineStart(v, a), en = lineEnd(v, b), ind = indentOf(v.slice(s, en));
    if (e.shiftKey) edit(t, s, s, `${ind}\n`, s + ind.length, s + ind.length, change);
    else edit(t, en, en, `\n${ind}`, en + 1 + ind.length, en + 1 + ind.length, change);
    return done();
  }
  if (e.shiftKey && e.altKey && !mod && (k.toLowerCase() === "f" || e.code === "KeyF")) {
    if (ctx.lang === "json") { try { const out = JSON.stringify(JSON.parse(v), null, 2); edit(t, 0, v.length, out, 0, 0, change); } catch { /* not valid JSON yet */ } }
    return done();
  }
  if (k === "Enter" && !mod && !e.altKey && !e.shiftKey) {
    const s = lineStart(v, a), before = v.slice(s, a), ind = indentOf(before);
    const prevCh = v.slice(0, a).trimEnd().slice(-1), nextCh = v[b];
    const opens = "{[(".includes(prevCh) && prevCh !== "";
    const extra = opens || (ctx.lang === "yaml" && /:\s*$/.test(before)) ? "  " : "";
    if (opens && PAIRS[prevCh] === nextCh) edit(t, a, b, `\n${ind}${extra}\n${ind}`, a + 1 + ind.length + extra.length, undefined, change);
    else edit(t, a, b, `\n${ind}${extra}`, a + 1 + ind.length + extra.length, undefined, change);
    return done();
  }
  if (!mod && !e.altKey && k.length === 1) {
    if (CLOSERS.has(k) && a === b && v[a] === k && !(PAIRS[k] === k && v[a - 1] === "\\")) { t.setSelectionRange(a + 1, a + 1); return done(); }
    if (PAIRS[k]) {
      if (a !== b) { const sel = v.slice(a, b); edit(t, a, b, `${k}${sel}${PAIRS[k]}`, a + 1, b + 1, change); return done(); }
      const next = v[a] ?? "", prev = v[a - 1] ?? "";
      const quote = PAIRS[k] === k;
      if (/^$|[\s)\]},;:]/.test(next) && !(quote && /[\w\\]/.test(prev))) { edit(t, a, b, `${k}${PAIRS[k]}`, a + 1, a + 1, change); return done(); }
    }
  }
  if (k === "Backspace" && !mod && !e.altKey && a === b && a > 0 && PAIRS[v[a - 1]] === v[a]) { edit(t, a - 1, a + 1, "", a - 1, a - 1, change); return done(); }
  return false;
}
