// Example DevDeck plugin — copy this folder to start your own (see PLUGINS.md).
import { useMemo, useState } from "react";
import { definePlugin, Panel, Table, CopyButton, takeHandoff } from "../../plugin-sdk.jsx";

/* ---------- Tool 1: a "transform" tool — DevDeck draws the screen for you ---------- */
function slugify(text, { separator, lowercase, maxLength }) {
  let s = text
    .normalize("NFKD").replace(/[̀-ͯ]/g, "") // é → e
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, separator);
  if (lowercase) s = s.toLowerCase();
  if (maxLength > 0 && s.length > maxLength) s = s.slice(0, maxLength).replace(new RegExp(`\\${separator}[^\\${separator}]*$`), "") || s.slice(0, maxLength);
  return s;
}

/* ---------- Tool 2: a "component" tool — your own React screen ---------- */
const INVISIBLE = { 0x200b: "zero-width space", 0x200c: "zero-width non-joiner", 0x200d: "zero-width joiner", 0xfeff: "byte order mark", 0x00a0: "no-break space", 0x2009: "thin space", 0x202f: "narrow no-break space", 0x00ad: "soft hyphen", 0x2028: "line separator", 0x2029: "paragraph separator" };
const kindOf = (ch, cp) => INVISIBLE[cp] ? `Invisible: ${INVISIBLE[cp]}`
  : /\p{Extended_Pictographic}/u.test(ch) ? "Emoji"
  : /\p{L}/u.test(ch) ? (cp > 0x7f ? "Letter (non-English)" : "Letter")
  : /\p{N}/u.test(ch) ? "Number"
  : /\s/.test(ch) ? "Space / line break"
  : /\p{P}/u.test(ch) ? "Punctuation"
  : /\p{S}/u.test(ch) ? "Symbol"
  : /\p{C}/u.test(ch) ? "Control / format" : "Other";

function UnicodeInspector() {
  const [text, setText] = useState(() => takeHandoff("Café ☕ — naïve​ test 👩‍💻"));
  const rows = useMemo(() => [...text].slice(0, 500).map((ch) => {
    const cp = ch.codePointAt(0);
    const hex = cp.toString(16).toUpperCase().padStart(4, "0");
    const utf8 = [...new TextEncoder().encode(ch)].map((b) => b.toString(16).toUpperCase().padStart(2, "0")).join(" ");
    return { ch, cp, hex, utf8, kind: kindOf(ch, cp) };
  }), [text]);
  const hidden = rows.filter((r) => INVISIBLE[r.cp]);
  const escaped = [...text].map((ch) => { const cp = ch.codePointAt(0); return cp < 0x80 && cp >= 0x20 ? ch : `\\u{${cp.toString(16).toUpperCase()}}`; }).join("");
  return (
    <>
      <Panel label="Text" value={text} onChange={setText} rows={4} mono={false} />
      <div className="big-answer">
        {[...text].length} characters · {new TextEncoder().encode(text).length} UTF-8 bytes
        {hidden.length > 0 && <span className="badge warn-badge" style={{ marginLeft: 10 }}>{hidden.length} invisible {hidden.length === 1 ? "character" : "characters"}</span>}
      </div>
      <div className="panel">
        <div className="panel-head"><span className="panel-label">Escaped for JavaScript</span><CopyButton value={escaped} /></div>
        <code className="wrap-cell">{escaped}</code>
      </div>
      <Table
        head={["Char", "Code point", "UTF-8 bytes", "What it is", "HTML"]}
        rows={rows.map((r) => [
          <span key="c" style={{ fontSize: 20 }}>{INVISIBLE[r.cp] ? "␣" : r.ch}</span>,
          <code key="p">U+{r.hex}</code>,
          <code key="u">{r.utf8}</code>,
          r.kind,
          <code key="h">&amp;#x{r.hex};</code>,
        ])}
      />
      {[...text].length > 500 && <p className="muted small">Showing the first 500 characters.</p>}
    </>
  );
}

export default definePlugin({
  id: "text-extras",
  tools: {
    slugify: {
      transform: (text, options) => text.split(/\r?\n/).map((line) => slugify(line, options)).join("\n"),
      sample: "Hello World! Crème brûlée recipes — 10 easy ideas (2026)",
      inputLabel: "Titles (one per line works too)",
      outputLabel: "Slug",
      options: [
        { id: "separator", label: "Separator", type: "select", choices: [["-", "dash -"], ["_", "underscore _"], [".", "dot ."]], default: "-" },
        { id: "lowercase", label: "Lowercase", type: "toggle", default: true },
        { id: "maxLength", label: "Max length (0 = no limit)", type: "number", default: 0, min: 0 },
      ],
    },
    "unicode-inspector": { component: UnicodeInspector },
  },
});
