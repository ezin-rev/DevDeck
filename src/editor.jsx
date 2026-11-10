// A light code editor for the tools' code boxes: line numbers, colours for JSON / YAML / XML / SQL,
// and Tab to indent. It is a normal textarea with a coloured copy of the text drawn underneath,
// so typing, undo, selecting and pasting all behave exactly as usual.
import { useMemo, useRef } from "react";
import { useCodeEditor } from "./store.js";

const esc = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

const SQL_WORDS = "select|from|where|and|or|not|insert|into|values|update|set|delete|create|table|alter|drop|index|view|join|left|right|inner|outer|full|cross|on|as|group|by|order|having|limit|offset|union|all|distinct|case|when|then|else|end|in|is|null|like|between|exists|primary|key|foreign|references|default|with|returning|asc|desc|begin|commit|rollback|count|sum|avg|min|max";
const RULES = {
  json: [
    [/"(?:[^"\\\n]|\\.)*"(?=\s*:)/y, "k"], [/"(?:[^"\\\n]|\\.)*"/y, "s"], [/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/y, "n"], [/\b(?:true|false|null)\b/y, "b"], [/[{}[\],:]/y, "p"],
  ],
  yaml: [
    [/(?<=^|\s)#.*/my, "c"], [/^(?:---|\.\.\.)(?=\s|$)/my, "p"], [/(?<=^[ \t]*(?:- +)*)[^\s#:\-][^:\n#]*?(?=:(?:\s|$))/my, "k"], [/(?<=^[ \t]*(?:- +)*)-(?= |$)/my, "p"],
    [/"(?:[^"\\\n]|\\.)*"|'(?:[^'\n]|'')*'/y, "s"], [/(?<=[:\-[,]\s*)-?\d+(?:\.\d+)?(?=\s*(?:$|#|,|]))/my, "n"], [/(?<=[:\-[,]\s*)(?:true|false|null|yes|no|on|off|~)(?=\s*(?:$|#|,|]))/miy, "b"], [/[&*][\w-]+/y, "b"], [/[|>][-+]?(?=\s*$)/my, "p"],
  ],
  xml: [
    [/<!--[\s\S]*?(?:-->|$)/y, "c"], [/<!\[CDATA\[[\s\S]*?(?:\]\]>|$)/y, "s"], [/<\?[\s\S]*?(?:\?>|$)/y, "c"], [/<\/?[\w:.-]+/y, "t"], [/\/?>/y, "t"],
    [/(?<=<[^<>]*\s)[\w:.-]+(?==)/y, "k"], [/(?<=<[^<>]*=)\s*(?:"[^"]*"|'[^']*')/y, "s"], [/&[#\w]+;/y, "b"],
  ],
  sql: [
    [/--.*/y, "c"], [/\/\*[\s\S]*?(?:\*\/|$)/y, "c"], [/'(?:[^']|'')*'/y, "s"], [/"[^"\n]*"|`[^`\n]*`/y, "k"], [new RegExp(`\\b(?:${SQL_WORDS})\\b`, "iy"), "b"], [/\b\d+(?:\.\d+)?\b/y, "n"],
  ],
};

export function detectLang(text) {
  const t = text.trimStart();
  if (!t) return null;
  if (/^[{[]/.test(t)) return "json";
  if (/^</.test(t)) return "xml";
  if (/^(select|insert|update|delete|with|create|alter|drop)\b/i.test(t)) return "sql";
  const first = t.split("\n").find((l) => l.trim() && !l.trim().startsWith("#")) || "";
  if (t.includes("\n") && /^(---|[\w"'./-][^:=\n]*:(\s|$)|- )/.test(first)) return "yaml";
  return null;
}

export function highlight(text, lang) {
  const rules = RULES[lang];
  let out = "", plain = "", i = 0;
  while (i < text.length) {
    let hit = null;
    for (const [re, cls] of rules) {
      re.lastIndex = i;
      const m = re.exec(text);
      if (m && m[0].length) { hit = [m[0], cls]; break; }
    }
    if (hit) { out += esc(plain) + `<span class="hl-${hit[1]}">${esc(hit[0])}</span>`; plain = ""; i += hit[0].length; }
    else plain += text[i++];
  }
  return out + esc(plain);
}

export function CodeArea({ value = "", onChange, readOnly, rows, className = "", placeholder, ...rest }) {
  const on = useCodeEditor();
  const ta = useRef(null), hl = useRef(null), gut = useRef(null), escaped = useRef(false);
  const lineCount = useMemo(() => value.split("\n").length, [value]);
  const wrap = useMemo(() => value.split("\n").some((l) => l.length > 400), [value]); // tokens and Base64: wrap instead of scrolling sideways
  const lang = useMemo(() => (on && value.length < 60000 ? detectLang(value) : null), [value, on]);
  const html = useMemo(() => (lang ? highlight(value, lang) : null), [value, lang]);
  const plainArea = <textarea className={`field mono ${className}`} value={value} rows={rows} readOnly={readOnly} spellCheck={false} placeholder={placeholder} onChange={(e) => onChange?.(e.target.value)} {...rest} />;
  if (!on) return plainArea;

  const sync = () => {
    const t = ta.current; if (!t) return;
    if (hl.current) { hl.current.scrollTop = t.scrollTop; hl.current.scrollLeft = t.scrollLeft; }
    if (gut.current) gut.current.scrollTop = t.scrollTop;
  };
  const onKeyDown = (e) => {
    if (e.key === "Escape") { escaped.current = true; return; }
    if (e.key !== "Tab" || readOnly || escaped.current || e.ctrlKey || e.metaKey || e.altKey) { escaped.current = false; return; }
    e.preventDefault();
    const t = e.currentTarget, { selectionStart: a, selectionEnd: b } = t, v = t.value;
    const insert = (text, from, to, selA, selB) => {
      t.setSelectionRange(from, to);
      // execCommand keeps the browser's undo history; fall back to setting the text directly
      if (!document.execCommand?.("insertText", false, text)) { onChange?.(v.slice(0, from) + text + v.slice(to)); }
      requestAnimationFrame(() => t.setSelectionRange(selA, selB));
    };
    if (a === b && !e.shiftKey) { insert("  ", a, b, a + 2, a + 2); return; }
    const start = v.lastIndexOf("\n", a - 1) + 1;
    const end = b > a && v[b - 1] === "\n" ? b - 1 : (v.indexOf("\n", b) + 1 || v.length + 1) - 1;
    const block = v.slice(start, end).split("\n");
    const changed = e.shiftKey ? block.map((l) => l.replace(/^( {1,2}|\t)/, "")) : block.map((l) => "  " + l);
    const text = changed.join("\n");
    insert(text, start, end, start, start + text.length);
  };
  return (
    <div className={`code-area ${wrap ? "wrap" : ""}`}>
      {!wrap && <pre className="code-gutter" ref={gut} aria-hidden="true">{Array.from({ length: lineCount }, (_, i) => i + 1).join("\n")}{"\n\n"}</pre>}
      <div className="code-stack">
        {html != null && <pre className="field mono code-hl" ref={hl} aria-hidden="true" dangerouslySetInnerHTML={{ __html: html + "\n\n" }} />}
        <textarea
          ref={ta}
          className={`field mono code-input ${html != null ? "has-hl" : ""} ${className}`}
          value={value}
          rows={rows}
          readOnly={readOnly}
          spellCheck={false}
          wrap={wrap ? "soft" : "off"}
          placeholder={placeholder}
          onChange={(e) => onChange?.(e.target.value)}
          onScroll={sync}
          onKeyDown={onKeyDown}
          {...rest}
        />
      </div>
    </div>
  );
}
