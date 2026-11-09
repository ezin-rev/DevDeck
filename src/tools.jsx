import { useEffect, useMemo, useState } from "react";
import { Copy, Check, Trash2, RefreshCw, ArrowUpDown, Clipboard, Wand2, Undo2, ArrowLeftRight } from "lucide-react";
import yaml from "js-yaml";
import { md5 } from "js-md5";
import { diffWordsWithSpace, diffLines } from "diff";
import { takeHandoff, peekHandoff } from "./handoff.js";

/* ---------- shared bits ---------- */
// Copy text, falling back to the older way where the clipboard API is blocked (e.g. plain http pages).
export async function copyText(value) {
  try { await navigator.clipboard.writeText(value); return true; } catch {}
  try {
    const t = document.createElement("textarea");
    t.value = value; t.setAttribute("readonly", ""); t.style.cssText = "position:fixed;opacity:0;top:0;left:0";
    document.body.appendChild(t); t.select();
    const ok = document.execCommand("copy");
    t.remove();
    return ok;
  } catch { return false; }
}

export function CopyButton({ value }) {
  const [done, setDone] = useState(null);
  return (
    <button
      className="btn ghost"
      disabled={!value}
      aria-live="polite"
      onClick={async () => {
        const ok = await copyText(value);
        setDone(ok ? "ok" : "fail"); setTimeout(() => setDone(null), 1400);
      }}
    >
      {done === "ok" ? <Check size={16} /> : <Copy size={16} />} {done === "ok" ? "Copied" : done === "fail" ? "Select & copy by hand" : "Copy"}
    </button>
  );
}

export function PasteButton({ onPaste }) {
  return (
    <button className="btn ghost" onClick={async () => { try { onPaste(await navigator.clipboard.readText()); } catch {} }}>
      <Clipboard size={16} /> Paste
    </button>
  );
}

export function Panel({ label, value, onChange, readOnly, error, rows = 10, mono = true, extra }) {
  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-label">{label}</span>
        <div className="panel-actions">
          {extra}
          {!readOnly && <PasteButton onPaste={onChange} />}
          {!readOnly && <button className="btn ghost" onClick={() => onChange("")} disabled={!value}><Trash2 size={16} /> Clear</button>}
          <CopyButton value={value} />
        </div>
      </div>
      <textarea
        className={`field ${mono ? "mono" : ""} ${error ? "has-error" : ""}`}
        value={value}
        rows={rows}
        readOnly={readOnly}
        spellCheck={false}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={readOnly ? "" : "Type or paste here…"}
      />
      {error && <p className="error">{error}</p>}
    </div>
  );
}

export function Options({ children }) {
  return <div className="options"><span className="panel-label">Options</span><div className="options-row">{children}</div></div>;
}

export function Segmented({ value, onChange, options, label }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} role="radio" aria-checked={value === v} className={value === v ? "on" : ""} onClick={() => onChange(v)}>{text}</button>
      ))}
    </div>
  );
}

/* ---------- converters ---------- */
function JsonYaml() {
  const [mode, setMode] = useState(() => peekHandoff("mode", "json2yaml"));
  const [indent, setIndent] = useState(2);
  const [input, setInput] = useState(() => takeHandoff('{\n  "name": "DevDeck",\n  "tools": ["json", "yaml"],\n  "friendly": true\n}'));
  const { out, err } = useMemo(() => {
    if (!input.trim()) return { out: "", err: "" };
    try {
      if (mode === "json2yaml") return { out: yaml.dump(JSON.parse(input), { indent }), err: "" };
      return { out: JSON.stringify(yaml.load(input), null, indent), err: "" };
    } catch (e) { return { out: "", err: e.message }; }
  }, [input, mode, indent]);
  return (
    <>
      <Options>
        <Segmented label="Direction" value={mode} onChange={(m) => { setMode(m); if (out) setInput(out); }} options={[["json2yaml", "JSON → YAML"], ["yaml2json", "YAML → JSON"]]} />
        <Segmented label="Indent" value={indent} onChange={setIndent} options={[[2, "2 spaces"], [4, "4 spaces"]]} />
      </Options>
      <div className="split">
        <Panel label={mode === "json2yaml" ? "JSON" : "YAML"} value={input} onChange={setInput} error={err} rows={16} />
        <Panel label={mode === "json2yaml" ? "YAML" : "JSON"} value={out} readOnly rows={16} />
      </div>
    </>
  );
}

function NumberBase() {
  const [base, setBase] = useState(10);
  const [value, setValue] = useState(() => takeHandoff("255"));
  const PREFIX = { 16: "0x", 8: "0o", 2: "0b" };
  // Typing 0x…, 0o… or 0b… switches to that base by itself.
  const onType = (v) => {
    setValue(v);
    const m = v.trim().match(/^-?0([xob])/i);
    if (m && !(base === 16 && m[1].toLowerCase() === "b")) setBase({ x: 16, o: 8, b: 2 }[m[1].toLowerCase()]);
  };
  const parsed = useMemo(() => {
    let s = value.trim().replace(/[\s_,]/g, "").toLowerCase();
    if (!s) return null;
    const neg = s.startsWith("-");
    if (neg) s = s.slice(1);
    // Only remove a prefix that belongs to the chosen base (in hex, "0b12" is a real number).
    if (PREFIX[base] && s.startsWith(PREFIX[base])) s = s.slice(2);
    const digits = "0123456789abcdef".slice(0, base);
    if (!s || ![...s].every((c) => digits.includes(c))) return NaN;
    try {
      const body = s;
      let n = 0n;
      for (const c of body) n = n * BigInt(base) + BigInt(digits.indexOf(c));
      return neg ? -n : n;
    } catch { return NaN; }
  }, [value, base]);
  const fmt = (b) => (typeof parsed === "bigint" ? parsed.toString(b).toUpperCase() : "");
  return (
    <>
      <Options>
        <Segmented label="Input base" value={base} onChange={setBase} options={[[16, "Hex"], [10, "Decimal"], [8, "Octal"], [2, "Binary"]]} />
      </Options>
      <div className="panel">
        <span className="panel-label">Input</span>
        <input className={`field mono ${Number.isNaN(parsed) ? "has-error" : ""}`} value={value} onChange={(e) => onType(e.target.value)} />
        {Number.isNaN(parsed) && <p className="error">That isn’t a valid {({ 16: "hexadecimal", 10: "decimal", 8: "octal", 2: "binary" })[base]} number. {base === 2 ? "Use only 0 and 1." : base === 8 ? "Use only digits 0–7." : base === 10 ? "Use only digits 0–9." : "Use digits 0–9 and letters A–F."}</p>}
      </div>
      <div className="result-list">
        {[["Hexadecimal", 16], ["Decimal", 10], ["Octal", 8], ["Binary", 2]].map(([name, b]) => (
          <div className="result" key={b}>
            <span className="panel-label">{name}</span>
            <code>{fmt(b) || "—"}</code>
            <CopyButton value={fmt(b)} />
          </div>
        ))}
      </div>
    </>
  );
}

/* ---------- encoders / decoders ---------- */
function EncodeDecode({ encode, decode, sample }) {
  const [mode, setMode] = useState(() => peekHandoff("mode", "encode"));
  const [input, setInput] = useState(() => takeHandoff(sample));
  const { out, err } = useMemo(() => {
    if (!input) return { out: "", err: "" };
    try { return { out: mode === "encode" ? encode(input) : decode(input), err: "" }; }
    catch (e) { return { out: "", err: e.message || "Couldn’t convert this text." }; }
  }, [input, mode]); // eslint-disable-line
  return (
    <>
      <Options>
        <Segmented label="Mode" value={mode} onChange={setMode} options={[["encode", "Encode"], ["decode", "Decode"]]} />
        <button className="btn" onClick={() => { setMode(mode === "encode" ? "decode" : "encode"); setInput(out); }} disabled={!out}>
          <ArrowUpDown size={16} /> Swap
        </button>
      </Options>
      <Panel label="Input" value={input} onChange={setInput} error={err} rows={8} />
      <Panel label="Output" value={out} readOnly rows={8} />
    </>
  );
}

export const htmlEncode = (s) => s.replace(/[&<>"' -￿]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || `&#${c.codePointAt(0)};`));
export const htmlDecode = (s) => { const t = document.createElement("textarea"); t.innerHTML = s; return t.value; };
export const b64encode = (s) => { const bytes = new TextEncoder().encode(s); let bin = ""; bytes.forEach((b) => (bin += String.fromCharCode(b))); return btoa(bin); };
export const b64decode = (s) => {
  const clean = s.trim().replace(/-/g, "+").replace(/_/g, "/").replace(/\s/g, "");
  const bin = atob(clean + "===".slice((clean.length + 3) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

const HtmlTool = () => <EncodeDecode encode={htmlEncode} decode={htmlDecode} sample={'<p class="hello">Tom & Jerry’s "café"</p>'} />;
const UrlTool = () => <EncodeDecode encode={encodeURIComponent} decode={decodeURIComponent} sample="https://example.com/search?q=hello world&lang=en" />;
const Base64Tool = () => <EncodeDecode encode={b64encode} decode={b64decode} sample="Hello, friendly world! 👋" />;

// "in 3 days" / "2 hours ago" for a difference in milliseconds.
export function relTime(diff) {
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const units = [["year", 31536e6], ["month", 2592e6], ["day", 864e5], ["hour", 36e5], ["minute", 6e4], ["second", 1e3]];
  for (const [u, size] of units) if (Math.abs(diff) >= size || u === "second") return rtf.format(Math.round(diff / size), u);
}

function JwtTool() {
  const [token, setToken] = useState(() => takeHandoff("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"));
  const parts = useMemo(() => {
    // Accept a whole "Authorization: Bearer …" line as well as the bare token.
    const clean = token.trim().replace(/^(authorization:\s*)?bearer\s+/i, "");
    const p = clean.split(".");
    if (!clean) return { header: "", payload: "", sig: "", err: "", claims: {} };
    try {
      if (p.length < 2) throw new Error("A JWT has three parts separated by dots.");
      const head = JSON.parse(b64decode(p[0]));
      const claims = JSON.parse(b64decode(p[1]));
      return {
        header: JSON.stringify(head, null, 2),
        payload: JSON.stringify(claims, null, 2),
        sig: p[2] || "",
        alg: head.alg,
        claims: claims && typeof claims === "object" ? claims : {},
        err: "",
      };
    } catch (e) { return { header: "", payload: "", sig: "", err: e.message || "This doesn’t look like a valid token.", claims: {} }; }
  }, [token]);
  const now = Date.now();
  const dates = [["iat", "Issued"], ["nbf", "Usable from"], ["exp", "Expires"]].filter(([k]) => typeof parts.claims[k] === "number");
  const { exp, nbf } = parts.claims;
  const status = typeof exp !== "number" && typeof nbf !== "number" ? null
    : typeof nbf === "number" && nbf * 1000 > now ? ["no-badge", "Not valid yet"]
    : typeof exp === "number" && exp * 1000 < now ? ["no-badge", `Expired ${relTime(exp * 1000 - now)}`]
    : ["ok-badge", typeof exp === "number" ? `Still valid · expires ${relTime(exp * 1000 - now)}` : "Valid"];
  return (
    <>
      <Panel label="Token" value={token} onChange={setToken} error={parts.err} rows={5} />
      {(dates.length > 0 || parts.alg) && (
        <div className="panel">
          <div className="panel-head">
            <span className="panel-label">At a glance</span>
            <div className="panel-actions">
              {parts.alg && <span className="badge">Signed with {parts.alg === "none" ? "nothing (unsigned!)" : parts.alg}</span>}
              {status && <span className={`badge ${status[0]}`}>{status[1]}</span>}
            </div>
          </div>
          {dates.length > 0 && (
            <div className="result-list">
              {dates.map(([k, label]) => {
                const ms = parts.claims[k] * 1000;
                return (
                  <div className="result" key={k}>
                    <span className="panel-label">{label}</span>
                    <code>{new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "long" })} <span className="muted">({relTime(ms - now)})</span></code>
                    <CopyButton value={new Date(ms).toISOString()} />
                  </div>
                );
              })}
            </div>
          )}
          <p className="muted small">The signature isn’t checked here: decoding only shows what the token says, not whether it’s genuine.</p>
        </div>
      )}
      <div className="split">
        <Panel label="Header" value={parts.header} readOnly rows={8} />
        <Panel label="Payload" value={parts.payload} readOnly rows={8} />
      </div>
      <Panel label="Signature" value={parts.sig} readOnly rows={2} />
    </>
  );
}

/* ---------- formatter ---------- */
// Turn the browser's JSON error into "line 3, column 5" plus a hint about the usual mistakes.
export function jsonError(input, e) {
  const msg = e.message || "";
  let line, col;
  const lc = msg.match(/line (\d+) column (\d+)/i);
  const pos = msg.match(/position (\d+)/i);
  if (lc) { line = +lc[1]; col = +lc[2]; }
  else if (pos) { const before = input.slice(0, +pos[1]).split("\n"); line = before.length; col = before.at(-1).length + 1; }
  const hints = [];
  if (/,\s*[}\]]/.test(input)) hints.push("there’s a comma before a closing bracket");
  if (/'[^'"\n]*'\s*[:,}\]]/.test(input)) hints.push("text uses 'single quotes' (JSON needs \"double quotes\")");
  if (/[{,]\s*[A-Za-z_$][\w$]*\s*:/.test(input)) hints.push("a key is missing its quotes");
  if (/^\s*\/\/|\/\*/m.test(input)) hints.push("comments aren’t allowed in JSON");
  if (/\b(True|False|None|undefined|NaN)\b/.test(input)) hints.push("True/False/None should be true/false/null");
  const where = line ? `Problem on line ${line}, column ${col}. ` : "";
  const plain = msg.replace(/^JSON\.parse:\s*/, "").replace(/\s*(in JSON )?at position \d+/, "").replace(/\s*\(line \d+ column \d+\)/, "").replace(/ at line \d+ column \d+ of the JSON data/, "");
  return `${where}${plain}${hints.length ? ` — Maybe ${hints.join("; ")}.` : ""}`;
}

// Best-effort repair of "almost JSON" (JavaScript objects, Python dicts, config files with comments).
export function repairJson(src) {
  let out = "", i = 0, last = "";
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '"' || c === "'") {
      let j = i + 1, s = "";
      while (j < n && src[j] !== c) { if (src[j] === "\\") { s += src[j] + (src[j + 1] ?? ""); j += 2; continue; } s += src[j++]; }
      if (c === "'") s = s.replace(/\\'/g, "'").replace(/(^|[^\\])"/g, '$1\\"');
      out += `"${s}"`; last = '"'; i = j + 1; continue;
    }
    if (c === "/" && src[i + 1] === "/") { while (i < n && src[i] !== "\n") i++; continue; }
    if (c === "/" && src[i + 1] === "*") { const end = src.indexOf("*/", i + 2); i = end < 0 ? n : end + 2; continue; }
    if (c === ",") {
      let j = i + 1; while (j < n && /\s/.test(src[j])) j++;
      if (src[j] === "}" || src[j] === "]") { i++; continue; }
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i; while (j < n && /[\w$]/.test(src[j])) j++;
      const word = src.slice(i, j);
      let k = j; while (k < n && /\s/.test(src[k])) k++;
      if (src[k] === ":" && (last === "{" || last === ",")) out += `"${word}"`;
      else out += { True: "true", False: "false", None: "null", undefined: "null", NaN: "null" }[word] ?? word;
      last = "w"; i = j; continue;
    }
    if (!/\s/.test(c)) last = c;
    out += c; i++;
  }
  return out;
}

function JsonFormatter() {
  const [indent, setIndent] = useState("2");
  const [input, setInput] = useState(() => takeHandoff('{"name":"DevDeck","tools":12,"tags":["friendly","fast"],"nested":{"ok":true}}'));
  const [sort, setSort] = useState(false);
  const { out, err } = useMemo(() => {
    if (!input.trim()) return { out: "", err: "" };
    try {
      let data = JSON.parse(input);
      if (sort) {
        const sortKeys = (v) => Array.isArray(v) ? v.map(sortKeys) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v;
        data = sortKeys(data);
      }
      const sp = indent === "min" ? 0 : indent === "tab" ? "\t" : Number(indent);
      return { out: JSON.stringify(data, null, sp), err: "" };
    } catch (e) { return { out: "", err: jsonError(input, e) }; }
  }, [input, indent, sort]);
  const fixed = useMemo(() => {
    if (!err) return null;
    try { const r = repairJson(input); JSON.parse(r); return r; } catch { return null; }
  }, [input, err]);
  return (
    <>
      <Options>
        <Segmented label="Indentation" value={indent} onChange={setIndent} options={[["2", "2 spaces"], ["4", "4 spaces"], ["tab", "Tab"], ["min", "Minified"]]} />
        <label className="check"><input type="checkbox" checked={sort} onChange={(e) => setSort(e.target.checked)} /> Sort keys</label>
        {fixed && <button className="btn primary" onClick={() => setInput(JSON.stringify(JSON.parse(fixed), null, 2))}><Wand2 size={16} /> Fix common mistakes</button>}
      </Options>
      <div className="split">
        <Panel label="Input" value={input} onChange={setInput} error={err} rows={16} />
        <Panel label="Output" value={out} readOnly rows={16} />
      </div>
    </>
  );
}

/* ---------- generators ---------- */
async function sha(algo, text) {
  if (!crypto.subtle) return "";
  const buf = await crypto.subtle.digest(algo, new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function HashTool() {
  const [input, setInput] = useState(() => takeHandoff("Hello, world"));
  const [upper, setUpper] = useState(false);
  const [hashes, setHashes] = useState({});
  useEffect(() => {
    let live = true;
    Promise.all([sha("SHA-1", input), sha("SHA-256", input), sha("SHA-512", input)]).then(([s1, s256, s512]) => {
      if (live) setHashes({ MD5: md5(input), SHA1: s1, SHA256: s256, SHA512: s512 });
    });
    return () => { live = false; };
  }, [input]);
  return (
    <>
      <Options>
        <label className="check"><input type="checkbox" checked={upper} onChange={(e) => setUpper(e.target.checked)} /> Uppercase</label>
      </Options>
      <Panel label="Text" value={input} onChange={setInput} rows={6} mono={false} />
      <div className="result-list">
        {Object.entries(hashes).map(([k, v]) => {
          const val = upper ? v.toUpperCase() : v;
          return (
            <div className="result" key={k}>
              <span className="panel-label">{k}</span>
              <code>{val}</code>
              <CopyButton value={val} />
            </div>
          );
        })}
      </div>
    </>
  );
}

export const randomBytes = (n) => crypto.getRandomValues(new Uint8Array(n));
const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
export function uuid4() {
  const b = randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = hex(b);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
const NODE = (() => { const n = randomBytes(6); n[0] |= 1; return hex(n); })();
let lastT = 0n, seq = BigInt(Math.floor(Math.random() * 0x3fff));
function uuid1() {
  let t = BigInt(Date.now()) * 10000n + 0x01b21dd213814000n;
  if (t <= lastT) { seq = (seq + 1n) & 0x3fffn; }
  lastT = t;
  const low = (t & 0xffffffffn).toString(16).padStart(8, "0");
  const mid = ((t >> 32n) & 0xffffn).toString(16).padStart(4, "0");
  const hi = (((t >> 48n) & 0x0fffn) | 0x1000n).toString(16).padStart(4, "0");
  const cs = (seq | 0x8000n).toString(16).padStart(4, "0");
  return `${low}-${mid}-${hi}-${cs}-${NODE}`;
}

function UuidTool() {
  const [version, setVersion] = useState(4);
  const [count, setCount] = useState(5);
  const [upper, setUpper] = useState(false);
  const [hyphens, setHyphens] = useState(true);
  const [list, setList] = useState([]);
  const generate = () => setList(Array.from({ length: Math.max(1, Math.min(500, count)) }, () => (version === 4 ? uuid4() : uuid1())));
  useEffect(generate, []); // eslint-disable-line
  const text = list.map((u) => { let s = hyphens ? u : u.replace(/-/g, ""); return upper ? s.toUpperCase() : s; }).join("\n");
  return (
    <>
      <Options>
        <Segmented label="Version" value={version} onChange={setVersion} options={[[4, "Version 4 (random)"], [1, "Version 1 (time)"]]} />
        <label className="check"><input type="checkbox" checked={hyphens} onChange={(e) => setHyphens(e.target.checked)} /> Hyphens</label>
        <label className="check"><input type="checkbox" checked={upper} onChange={(e) => setUpper(e.target.checked)} /> Uppercase</label>
        <label className="check">How many <input className="field small" type="number" min="1" max="500" value={count} onChange={(e) => setCount(Number(e.target.value) || 1)} /></label>
        <button className="btn primary" onClick={generate}><RefreshCw size={16} /> Generate</button>
      </Options>
      <Panel label="UUIDs" value={text} readOnly rows={12} />
    </>
  );
}

/* ---------- text ---------- */
const words = (s) => s.replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(/[^A-Za-z0-9]+/).filter(Boolean);
export const CASES = [
  ["Sentence case", (s) => s.toLowerCase().replace(/(^\s*|[.!?]\s+)([a-z])/g, (m, a, b) => a + b.toUpperCase())],
  ["lower case", (s) => s.toLowerCase()],
  ["UPPER CASE", (s) => s.toUpperCase()],
  ["Title Case", (s) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())],
  ["camelCase", (s) => words(s).map((w, i) => (i ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase())).join("")],
  ["PascalCase", (s) => words(s).map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join("")],
  ["snake_case", (s) => words(s).map((w) => w.toLowerCase()).join("_")],
  ["kebab-case", (s) => words(s).map((w) => w.toLowerCase()).join("-")],
  ["CONSTANT_CASE", (s) => words(s).map((w) => w.toUpperCase()).join("_")],
];

function TextInspector() {
  const [text, setText] = useState(() => takeHandoff("Hello friendly world. This tool counts words and changes case!"));
  const [before, setBefore] = useState(null);
  const stats = [
    ["Characters", [...text].length],
    ["Words", (text.match(/\S+/g) || []).length],
    ["Lines", text ? text.split(/\r?\n/).length : 0],
    ["Sentences", (text.match(/[^.!?]+[.!?]+/g) || []).length],
    ["Bytes", new TextEncoder().encode(text).length],
  ];
  return (
    <>
      <Options>
        {CASES.map(([name, fn]) => <button key={name} className="btn" onClick={() => { const next = fn(text); if (next !== text) { setBefore(text); setText(next); } }}>{name}</button>)}
        <button className="btn" onClick={() => { setText(before); setBefore(null); }} disabled={before === null}><Undo2 size={16} /> Undo</button>
      </Options>
      <div className="stats">
        {stats.map(([k, v]) => <div className="stat" key={k}><strong>{v}</strong><span>{k}</span></div>)}
      </div>
      <Panel label="Text" value={text} onChange={(v) => { setText(v); setBefore(null); }} rows={12} mono={false} />
    </>
  );
}

function TextDiff() {
  const [a, setA] = useState("The quick brown fox\njumps over the lazy dog.");
  const [b, setB] = useState("The quick red fox\njumped over the lazy dog!");
  const [mode, setMode] = useState("words");
  const [ignoreCase, setIgnoreCase] = useState(false);
  const parts = useMemo(() => (mode === "words" ? diffWordsWithSpace(a, b, { ignoreCase }) : diffLines(a, b, { ignoreCase })), [a, b, mode, ignoreCase]);
  // How much changed, counted in words or lines depending on the mode.
  const count = (p) => (mode === "words" ? (p.value.match(/\S+/g) || []).length : p.count ?? p.value.split("\n").filter(Boolean).length);
  const added = parts.filter((p) => p.added).reduce((n, p) => n + count(p), 0);
  const removed = parts.filter((p) => p.removed).reduce((n, p) => n + count(p), 0);
  const unit = mode === "words" ? "word" : "line";
  const plural = (n) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  return (
    <>
      <Options>
        <Segmented label="Compare by" value={mode} onChange={setMode} options={[["words", "Words"], ["lines", "Lines"]]} />
        <label className="check"><input type="checkbox" checked={ignoreCase} onChange={(e) => setIgnoreCase(e.target.checked)} /> Ignore upper/lower case</label>
        <button className="btn" onClick={() => { setA(b); setB(a); }}><ArrowLeftRight size={16} /> Swap</button>
      </Options>
      <div className="split">
        <Panel label="Old text" value={a} onChange={setA} rows={8} mono={false} />
        <Panel label="New text" value={b} onChange={setB} rows={8} mono={false} />
      </div>
      <div className="panel">
        <div className="panel-head">
          <span className="panel-label">Differences</span>
          <div className="panel-actions">
            {added || removed ? <>
              <span className="badge ok-badge">+{plural(added)}</span>
              <span className="badge no-badge">−{plural(removed)}</span>
            </> : <span className="badge">The texts are the same</span>}
          </div>
        </div>
        <pre className="field diff">
          {parts.map((p, i) => <span key={i} className={p.added ? "add" : p.removed ? "del" : ""}>{p.value}</span>)}
        </pre>
      </div>
    </>
  );
}

export const TOOL_VIEWS = {
  "/converters/json-yaml": JsonYaml,
  "/converters/number-base": NumberBase,
  "/encoders-decoders/html": HtmlTool,
  "/encoders-decoders/url": UrlTool,
  "/encoders-decoders/base64": Base64Tool,
  "/encoders-decoders/jwt": JwtTool,
  "/formatters/json": JsonFormatter,
  "/generators/hash": HashTool,
  "/generators/uuid": UuidTool,
  "/text/inspector": TextInspector,
  "/text/diff": TextDiff,
};
