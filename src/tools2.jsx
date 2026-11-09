import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Upload, Plus, Trash2, RefreshCw } from "lucide-react";
import { Panel, Options, Segmented, CopyButton } from "./tools.jsx";
import { takeHandoff } from "./handoff.js";

// Big libraries load only when their tool is opened, keeping the first page load small.
const loadQr = () => import("qrcode").then((m) => m.default || m);
export const loadSql = () => import("sql-formatter");
const loadMarkdown = () => Promise.all([import("marked"), import("dompurify")]).then(([m, d]) => ({ marked: m.marked, DOMPurify: d.default || d }));

const Result = ({ label, value }) => (
  <div className="result"><span className="panel-label">{label}</span><code>{value || "—"}</code><CopyButton value={value} /></div>
);

/* ======================================================================
   CSV ↔ JSON
   ====================================================================== */
export function parseCsv(text, delim = ",") {
  const rows = []; let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length > 1 || r[0] !== "");
}

const typed = (v) => (v === "" ? "" : v === "true" ? true : v === "false" ? false : v === "null" ? null : /^-?\d+(\.\d+)?$/.test(v) && v.length < 16 ? Number(v) : v);

export function csvToJson(text, delim = ",", detectTypes = true) {
  const [head, ...rows] = parseCsv(text, delim);
  if (!head) return "[]";
  return JSON.stringify(rows.map((r) => Object.fromEntries(head.map((h, i) => [h, detectTypes ? typed(r[i] ?? "") : r[i] ?? ""]))), null, 2);
}

export function jsonToCsv(text, delim = ",") {
  let data = JSON.parse(text);
  if (!Array.isArray(data)) data = [data];
  const cols = [...new Set(data.flatMap((o) => (o && typeof o === "object" ? Object.keys(o) : ["value"])))];
  const cell = (v) => {
    const s = v === undefined || v === null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    return /["\n\r]/.test(s) || s.includes(delim) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.map(cell).join(delim), ...data.map((o) => cols.map((c) => cell(o && typeof o === "object" ? o[c] : o)).join(delim))].join("\n");
}

export function CsvJsonTool() {
  const [mode, setMode] = useState("csv2json");
  const [delim, setDelim] = useState(",");
  const [types, setTypes] = useState(true);
  const [input, setInput] = useState(() => takeHandoff("name,age,city,member\nAlex,31,Bangkok,true\n\"Lee, Sam\",27,London,false\nMia,45,\"New York\",true"));
  const { out, err } = useMemo(() => {
    if (!input.trim()) return { out: "", err: "" };
    try { return { out: mode === "csv2json" ? csvToJson(input, delim, types) : jsonToCsv(input, delim), err: "" }; }
    catch (e) { return { out: "", err: e.message }; }
  }, [input, mode, delim, types]);
  const rows = mode === "csv2json" && !err ? parseCsv(input, delim).slice(0, 51) : [];
  return (
    <>
      <Options>
        <Segmented label="Direction" value={mode} onChange={(m) => { setMode(m); if (out) setInput(out); }} options={[["csv2json", "CSV → JSON"], ["json2csv", "JSON → CSV"]]} />
        <Segmented label="Separator" value={delim} onChange={setDelim} options={[[",", "Comma ,"], [";", "Semicolon ;"], ["\t", "Tab"]]} />
        {mode === "csv2json" && <label className="check"><input type="checkbox" checked={types} onChange={(e) => setTypes(e.target.checked)} /> Turn numbers and true/false into real values</label>}
      </Options>
      <div className="split">
        <Panel label={mode === "csv2json" ? "CSV" : "JSON"} value={input} onChange={setInput} error={err} rows={14} />
        <Panel label={mode === "csv2json" ? "JSON" : "CSV"} value={out} readOnly rows={14} />
      </div>
      {rows.length > 1 && (
        <div className="panel">
          <span className="panel-label">Table preview ({rows.length - 1} rows{rows.length > 50 ? ", first 50 shown" : ""})</span>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr>{rows[0].map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
              <tbody>{rows.slice(1).map((r, i) => <tr key={i}>{rows[0].map((_, j) => <td key={j}>{r[j]}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

/* ======================================================================
   Cron explainer
   ====================================================================== */
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MACROS = { "@yearly": "0 0 1 1 *", "@annually": "0 0 1 1 *", "@monthly": "0 0 1 * *", "@weekly": "0 0 * * 0", "@daily": "0 0 * * *", "@midnight": "0 0 * * *", "@hourly": "0 * * * *" };
const FIELDS = [["minute", 0, 59], ["hour", 0, 23], ["day of month", 1, 31], ["month", 1, 12], ["day of week", 0, 7]];

function parseField(src, [name, min, max], idx) {
  const names = idx === 3 ? MONTHS.map((m) => m.slice(0, 3).toUpperCase()) : idx === 4 ? DAYS.map((d) => d.slice(0, 3).toUpperCase()) : null;
  const num = (t) => {
    const up = t.toUpperCase();
    if (names && names.includes(up)) return names.indexOf(up) + (idx === 3 ? 1 : 0);
    if (!/^\d+$/.test(t)) throw new Error(`“${t}” isn’t valid in the ${name} field`);
    const n = Number(t);
    if (n < min || n > max) throw new Error(`${n} is out of range for ${name} (${min}–${max})`);
    return n;
  };
  const set = new Set();
  for (const part of src.split(",")) {
    const [range, stepS] = part.split("/");
    const step = stepS ? Number(stepS) : 1;
    if (!step || step < 1) throw new Error(`Bad step “/${stepS}” in ${name}`);
    let [a, b] = range === "*" ? [min, max] : range.includes("-") ? range.split("-").map(num) : [num(range), stepS ? max : num(range)];
    for (let v = a; v <= b; v += step) set.add(idx === 4 && v === 7 ? 0 : v);
  }
  return { set, any: src === "*", src };
}

export function parseCron(expr) {
  const e = MACROS[expr.trim().toLowerCase()] || expr.trim();
  const parts = e.split(/\s+/);
  if (parts.length !== 5) throw new Error("A cron schedule needs 5 parts: minute hour day month weekday");
  return parts.map((p, i) => parseField(p, FIELDS[i], i));
}

const list = (arr) => (arr.length <= 1 ? arr.join("") : `${arr.slice(0, -1).join(", ")} and ${arr[arr.length - 1]}`);
const pad = (n) => String(n).padStart(2, "0");
function describeField(f, i) {
  const vals = [...f.set].sort((a, b) => a - b);
  const step = f.src.match(/^\*\/(\d+)$/);
  const label = (v) => (i === 3 ? MONTHS[v - 1] : i === 4 ? DAYS[v] : v);
  if (step) return `every ${step[1]} ${["minutes", "hours", "days", "months", "days"][i]}`;
  if (/^\d+-\d+$/.test(f.src) || /^[A-Za-z]+-[A-Za-z]+$/.test(f.src)) return `${label(vals[0])} through ${label(vals[vals.length - 1])}`;
  return list(vals.map(label));
}

export function describeCron(fields) {
  const [mi, h, dom, mo, dow] = fields;
  let time;
  if (mi.set.size === 1 && h.set.size === 1) time = `At ${pad([...h.set][0])}:${pad([...mi.set][0])}`;
  else if (mi.set.size === 1 && h.any) time = `At minute ${[...mi.set][0]} of every hour`;
  else if (mi.any && h.any) time = "Every minute";
  else {
    const m = mi.any ? "Every minute" : /^\*\//.test(mi.src) ? `Every ${mi.src.slice(2)} minutes` : `At minute ${describeField(mi, 0)}`;
    const hh = h.any ? "" : /^\*\//.test(h.src) ? `, every ${h.src.slice(2)} hours` : mi.set.size === 1 && h.set.size > 1 && !/-/.test(h.src) ? ` past hour ${describeField(h, 1)}` : `, between ${pad(Math.min(...h.set))}:00 and ${pad(Math.max(...h.set))}:59`;
    time = m + hh;
  }
  const days = [];
  if (!dom.any) days.push(`on day ${describeField(dom, 2)} of the month`);
  if (!dow.any) days.push(`${days.length ? "or " : ""}on ${describeField(dow, 4)}`);
  const month = mo.any ? "" : ` in ${describeField(mo, 3)}`;
  return `${time}${days.length ? " " + days.join(" ") : ""}${month}.`;
}

export function nextRuns(fields, count = 6, from = new Date()) {
  const [mi, h, dom, mo, dow] = fields;
  const out = [];
  const d = new Date(from); d.setSeconds(0, 0); d.setMinutes(d.getMinutes() + 1);
  for (let i = 0; i < 600000 && out.length < count; i++) {
    const dayOk = dom.any && dow.any ? true : dom.any ? dow.set.has(d.getDay()) : dow.any ? dom.set.has(d.getDate()) : dom.set.has(d.getDate()) || dow.set.has(d.getDay());
    if (mo.set.has(d.getMonth() + 1) && dayOk && h.set.has(d.getHours()) && mi.set.has(d.getMinutes())) out.push(new Date(d));
    d.setMinutes(d.getMinutes() + 1);
  }
  return out;
}

const CRON_EXAMPLES = [["Every 5 minutes", "*/5 * * * *"], ["Weekdays 9:00", "0 9 * * 1-5"], ["Every hour", "@hourly"], ["1st of month", "0 0 1 * *"], ["Sunday 3:30", "30 3 * * SUN"], ["Office hours", "*/15 9-17 * * MON-FRI"]];

export function CronTool() {
  const [expr, setExpr] = useState(() => takeHandoff("*/15 9-17 * * MON-FRI"));
  const r = useMemo(() => { try { const f = parseCron(expr); return { f, text: describeCron(f), runs: nextRuns(f) }; } catch (e) { return { err: e.message }; } }, [expr]);
  return (
    <>
      <div className="panel">
        <span className="panel-label">Cron schedule</span>
        <input className={`field mono cron-input ${r.err ? "has-error" : ""}`} value={expr} onChange={(e) => setExpr(e.target.value)} spellCheck={false} />
        <div className="cron-legend mono"><span>minute</span><span>hour</span><span>day</span><span>month</span><span>weekday</span></div>
        {r.err && <p className="error">{r.err}</p>}
        <div className="options-row"><span className="muted small">Examples:</span>{CRON_EXAMPLES.map(([n, v]) => <button key={n} className="chip" onClick={() => setExpr(v)}>{n}</button>)}</div>
      </div>
      {!r.err && (
        <>
          <div className="big-answer">{r.text}</div>
          <div className="panel">
            <span className="panel-label">Next runs (your time zone)</span>
            <ol className="run-list">{r.runs.map((d) => <li key={+d}>{d.toLocaleString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</li>)}</ol>
            {!r.runs.length && <p className="muted">This schedule never runs within the next year.</p>}
          </div>
        </>
      )}
    </>
  );
}

/* ======================================================================
   chmod calculator
   ====================================================================== */
const WHO = [["Owner", "u"], ["Group", "g"], ["Everyone else", "o"]];
const PERMS = [["Read", 4, "r"], ["Write", 2, "w"], ["Run", 1, "x"]];

export function ChmodTool() {
  const [mode, setMode] = useState(() => { const t = takeHandoff("755"); return /^[0-7]{3}$/.test(t) ? t : "755"; });
  const digits = mode.split("").map(Number);
  const flip = (w, bit) => setMode(digits.map((d, i) => (i === w ? d ^ bit : d)).join(""));
  const symbolic = digits.map((d) => PERMS.map(([, b, c]) => (d & b ? c : "-")).join("")).join("");
  const [text, setText] = useState("");
  const fromText = (v) => {
    setText(v);
    const t = v.trim();
    if (/^[0-7]{3}$/.test(t)) setMode(t);
    else if (/^[r-][w-][x-][r-][w-][x-][r-][w-][x-]$/.test(t)) setMode([0, 3, 6].map((o) => PERMS.reduce((s, [, b], j) => s + (t[o + j] !== "-" ? b : 0), 0)).join(""));
  };
  const plain = WHO.map(([who], i) => `${who}: ${PERMS.filter(([, b]) => digits[i] & b).map(([n]) => n.toLowerCase()).join(", ") || "nothing"}`).join(" · ");
  return (
    <>
      <div className="panel">
        <span className="panel-label">Type a number or letters (e.g. 644 or rw-r--r--)</span>
        <input className="field mono" value={text} onChange={(e) => fromText(e.target.value)} placeholder={mode} />
      </div>
      <div className="perm-grid">
        <span />
        {PERMS.map(([n]) => <span key={n} className="panel-label">{n}</span>)}
        {WHO.map(([who], w) => (
          <div key={who} className="perm-row">
            <strong>{who}</strong>
            {PERMS.map(([n, b]) => (
              <label key={n} className="perm-cell">
                <input type="checkbox" checked={!!(digits[w] & b)} onChange={() => flip(w, b)} aria-label={`${who} ${n}`} />
              </label>
            ))}
          </div>
        ))}
      </div>
      <div className="big-answer mono">{mode} <span className="muted">·</span> {symbolic}</div>
      <p className="muted">{plain}</p>
      <div className="result-list">
        <Result label="Number" value={mode} />
        <Result label="Letters" value={symbolic} />
        <Result label="Command" value={`chmod ${mode} filename`} />
      </div>
    </>
  );
}

/* ======================================================================
   QR code
   ====================================================================== */
export function QrTool() {
  const [text, setText] = useState(() => takeHandoff("https://example.com"));
  const [level, setLevel] = useState("M");
  const [size, setSize] = useState(320);
  const [dark, setDark] = useState("#000000");
  const [light, setLight] = useState("#ffffff");
  const [url, setUrl] = useState("");
  const [svg, setSvg] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!text) { setUrl(""); setSvg(""); return; }
    let live = true;
    const opts = { errorCorrectionLevel: level, margin: 2, width: size, color: { dark, light } };
    loadQr().then((QRCode) => {
      QRCode.toDataURL(text, opts).then((u) => { if (live) { setUrl(u); setErr(""); } }).catch((e) => live && setErr(e.message));
      QRCode.toString(text, { ...opts, type: "svg" }).then((s) => live && setSvg(s)).catch(() => {});
    });
    return () => { live = false; };
  }, [text, level, size, dark, light]);
  const wifi = () => setText("WIFI:T:WPA;S:MyNetwork;P:my-password;;");
  return (
    <>
      <Options>
        <Segmented label="Error correction" value={level} onChange={setLevel} options={[["L", "Low"], ["M", "Medium"], ["Q", "High"], ["H", "Highest"]]} />
        <label className="check">Colours <input type="color" value={dark} onChange={(e) => setDark(e.target.value)} aria-label="Dots colour" /><input type="color" value={light} onChange={(e) => setLight(e.target.value)} aria-label="Background colour" /></label>
        <button className="btn" onClick={wifi}>Wi-Fi login example</button>
      </Options>
      <div className="split">
        <div className="panel">
          <Panel label="Text or link" value={text} onChange={setText} rows={6} mono={false} error={err} />
          <label className="range-row"><span>Size: <strong>{size}px</strong></span><input type="range" min="128" max="1024" step="32" value={size} onChange={(e) => setSize(Number(e.target.value))} /></label>
        </div>
        <div className="panel qr-out">
          <span className="panel-label">QR code</span>
          {url ? <img src={url} alt="QR code preview" /> : <p className="muted">Type something to make a QR code.</p>}
          <div className="options-row">
            <a className={`btn primary ${url ? "" : "disabled"}`} href={url || undefined} download="qr-code.png"><Download size={16} /> PNG</a>
            <a className={`btn ${svg ? "" : "disabled"}`} href={svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : undefined} download="qr-code.svg"><Download size={16} /> SVG</a>
          </div>
        </div>
      </div>
    </>
  );
}

/* ======================================================================
   URL parser / builder
   ====================================================================== */
export function UrlParserTool() {
  const [raw, setRaw] = useState(() => takeHandoff("https://user@shop.example.com:8080/products/shoes?color=red&size=42&q=running%20shoes#reviews"));
  const parsed = useMemo(() => { try { return new URL(raw.trim()); } catch { return null; } }, [raw]);
  const params = parsed ? [...parsed.searchParams] : [];
  const update = (fn) => { const u = new URL(parsed); fn(u); setRaw(u.toString()); };
  const setParam = (i, k, v) => update((u) => { const p = [...u.searchParams]; p[i] = [k, v]; u.search = new URLSearchParams(p).toString(); });
  return (
    <>
      <Panel label="Web address" value={raw} onChange={setRaw} rows={3} error={raw.trim() && !parsed ? "That doesn’t look like a full web address. It should start with https:// or similar." : ""} />
      {parsed && (
        <>
          <div className="result-list">
            <Result label="Protocol" value={parsed.protocol.replace(":", "")} />
            <Result label="Host" value={parsed.hostname} />
            {parsed.port && <Result label="Port" value={parsed.port} />}
            {parsed.username && <Result label="User" value={parsed.username} />}
            <Result label="Path" value={decodeURIComponent(parsed.pathname)} />
            {parsed.hash && <Result label="Anchor" value={parsed.hash.slice(1)} />}
            <Result label="Origin" value={parsed.origin} />
          </div>
          <div className="panel">
            <span className="panel-label">Query parameters — edit them and the address updates</span>
            {params.map(([k, v], i) => (
              <div className="param-row" key={i}>
                <input className="field mono" value={k} onChange={(e) => setParam(i, e.target.value, v)} aria-label="Name" />
                <span className="muted">=</span>
                <input className="field mono" value={v} onChange={(e) => setParam(i, k, e.target.value)} aria-label="Value" />
                <button className="btn ghost" title="Remove" onClick={() => update((u) => { const p = [...u.searchParams]; p.splice(i, 1); u.search = new URLSearchParams(p).toString(); })}><Trash2 size={15} /><span className="sr-only">Remove</span></button>
              </div>
            ))}
            <button className="btn" onClick={() => update((u) => u.searchParams.append("key", "value"))}><Plus size={15} /> Add parameter</button>
          </div>
        </>
      )}
    </>
  );
}

/* ======================================================================
   Image ↔ Base64
   ====================================================================== */
const kb = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(2)} MB` : `${(n / 1024).toFixed(1)} KB`);

export function ImageBase64Tool() {
  const [data, setData] = useState(() => takeHandoff(""));
  const [name, setName] = useState("");
  const [size, setSize] = useState(0);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef(null);
  const load = (file) => {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => { setData(r.result); setName(file.name); setSize(file.size); };
    r.readAsDataURL(file);
  };
  const valid = /^data:image\/[\w.+-]+;base64,/.test(data.trim());
  return (
    <>
      <div
        className={`dropzone ${drag ? "over" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); load(e.dataTransfer.files[0]); }}
        onClick={() => fileRef.current?.click()}
        role="button" tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileRef.current?.click(); }}
      >
        <Upload size={26} />
        <strong>Drop an image here, or click to choose one</strong>
        <span className="muted small">PNG, JPG, GIF, SVG, WebP — it never leaves your device</span>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => load(e.target.files[0])} />
      </div>
      <Panel label="Base64 data (or paste a data:image/… address to preview it)" value={data} onChange={(v) => { setData(v); setName(""); setSize(0); }} rows={6}
        error={data.trim() && !valid ? "This should start with data:image/…;base64," : ""} />
      {valid && (
        <div className="split">
          <div className="panel img-preview">
            <span className="panel-label">Preview{name ? ` — ${name}, ${kb(size)}` : ""} · Base64 is {kb(data.length)}</span>
            <img src={data} alt="Preview of the decoded image" />
          </div>
          <div className="result-list">
            <Result label="HTML" value={`<img src="${data.slice(0, 60)}…" />`} />
            <div className="result"><span className="panel-label">CSS</span><code>{`background-image: url("${data.slice(0, 40)}…");`}</code><CopyButton value={`background-image: url("${data}");`} /></div>
            <div className="result"><span className="panel-label">Base64 only</span><code>{data.split(",")[1].slice(0, 50)}…</code><CopyButton value={data.split(",")[1]} /></div>
            <a className="btn primary" href={data} download={name || "image"}><Download size={16} /> Download image</a>
          </div>
        </div>
      )}
    </>
  );
}

/* ======================================================================
   String escaper
   ====================================================================== */
export const ESCAPES = [
  ["JSON string", (s) => JSON.stringify(s).slice(1, -1)],
  ["JavaScript string", (s) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t")],
  ["Regex (match literally)", (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")],
  ["SQL string", (s) => s.replace(/'/g, "''")],
  ["Shell (single quotes)", (s) => `'${s.replace(/'/g, `'\\''`)}'`],
  ["CSV field", (s) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)],
  ["XML / HTML text", (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;")],
];

export function EscapeTool() {
  const [mode, setMode] = useState("escape");
  const [text, setText] = useState(() => takeHandoff('He said "hi" & left.\nPath: C:\\temp\\file.txt'));
  let un = "", unErr = "";
  if (mode === "unescape") { try { un = JSON.parse(`"${text.replace(/\n/g, "\\n")}"`); } catch { unErr = "This isn’t a valid escaped JSON/JavaScript string."; } }
  return (
    <>
      <Options>
        <Segmented label="Mode" value={mode} onChange={setMode} options={[["escape", "Escape"], ["unescape", "Unescape (JSON / JS)"]]} />
      </Options>
      <Panel label="Text" value={text} onChange={setText} rows={5} />
      {mode === "escape"
        ? <div className="result-list">{ESCAPES.map(([n, f]) => <Result key={n} label={n} value={f(text)} />)}</div>
        : <Panel label="Unescaped" value={un} readOnly rows={5} error={unErr} />}
    </>
  );
}

/* ======================================================================
   SQL formatter
   ====================================================================== */
const DIALECTS = [["sql", "Standard"], ["postgresql", "PostgreSQL"], ["mysql", "MySQL"], ["sqlite", "SQLite"], ["tsql", "SQL Server"], ["bigquery", "BigQuery"]];

export function SqlTool() {
  const [input, setInput] = useState(() => takeHandoff("select u.id, u.name, count(o.id) as orders from users u left join orders o on o.user_id = u.id where u.active = true and o.created_at > '2025-01-01' group by u.id, u.name having count(o.id) > 3 order by orders desc limit 10;"));
  const [dialect, setDialect] = useState("sql");
  const [kw, setKw] = useState("upper");
  const [indent, setIndent] = useState(2);
  const [{ out, err }, setResult] = useState({ out: "", err: "" });
  useEffect(() => {
    if (!input.trim()) { setResult({ out: "", err: "" }); return; }
    let live = true;
    loadSql().then(({ format }) => {
      if (!live) return;
      try { setResult({ out: format(input, { language: dialect, keywordCase: kw, tabWidth: indent }), err: "" }); }
      catch (e) { setResult({ out: "", err: e.message.split("\n")[0] }); }
    });
    return () => { live = false; };
  }, [input, dialect, kw, indent]);
  return (
    <>
      <Options>
        <label className="check">Database
          <select className="field small wide" value={dialect} onChange={(e) => setDialect(e.target.value)}>{DIALECTS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select>
        </label>
        <Segmented label="Keywords" value={kw} onChange={setKw} options={[["upper", "UPPER"], ["lower", "lower"], ["preserve", "Keep"]]} />
        <Segmented label="Indent" value={indent} onChange={setIndent} options={[[2, "2 spaces"], [4, "4 spaces"]]} />
      </Options>
      <div className="split">
        <Panel label="SQL" value={input} onChange={setInput} error={err} rows={16} />
        <Panel label="Formatted" value={out} readOnly rows={16} />
      </div>
    </>
  );
}

/* ======================================================================
   XML formatter
   ====================================================================== */
export function formatXml(src, indent = "  ") {
  const doc = new DOMParser().parseFromString(src, "application/xml");
  const bad = doc.querySelector("parsererror");
  if (bad) throw new Error((bad.textContent || "Invalid XML").split("\n").filter(Boolean)[0]);
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const attr = (el) => [...el.attributes].map((a) => ` ${a.name}="${esc(a.value).replace(/"/g, "&quot;")}"`).join("");
  const walk = (node, depth) => {
    const pad = indent.repeat(depth);
    if (node.nodeType === 3) { const t = node.nodeValue.trim(); return t ? pad + esc(t) : ""; }
    if (node.nodeType === 4) return `${pad}<![CDATA[${node.nodeValue}]]>`;
    if (node.nodeType === 8) return `${pad}<!--${node.nodeValue}-->`;
    if (node.nodeType === 7) return `${pad}<?${node.target} ${node.data}?>`;
    if (node.nodeType !== 1) return "";
    const kids = [...node.childNodes].filter((n) => !(n.nodeType === 3 && !n.nodeValue.trim()));
    if (!kids.length) return `${pad}<${node.nodeName}${attr(node)}/>`;
    if (kids.length === 1 && kids[0].nodeType === 3) return `${pad}<${node.nodeName}${attr(node)}>${esc(kids[0].nodeValue.trim())}</${node.nodeName}>`;
    return [`${pad}<${node.nodeName}${attr(node)}>`, ...kids.map((k) => walk(k, depth + 1)).filter(Boolean), `${pad}</${node.nodeName}>`].join("\n");
  };
  const decl = src.trim().match(/^<\?xml[^>]*\?>/);
  const body = [...doc.childNodes].map((n) => walk(n, 0)).filter(Boolean).join("\n");
  return (decl ? decl[0] + "\n" : "") + body;
}

export function XmlTool() {
  const [input, setInput] = useState(() => takeHandoff('<?xml version="1.0"?><catalog><book id="b1" lang="en"><title>Friendly Tools</title><price currency="USD">19.99</price><tags><tag>dev</tag><tag>everyone</tag></tags></book><!-- more soon --></catalog>'));
  const [indent, setIndent] = useState("  ");
  const { out, err } = useMemo(() => {
    if (!input.trim()) return { out: "", err: "" };
    try {
      const pretty = formatXml(input, indent === "min" ? "" : indent);
      return { out: indent === "min" ? pretty.replace(/\n/g, "") : pretty, err: "" };
    } catch (e) { return { out: "", err: e.message }; }
  }, [input, indent]);
  return (
    <>
      <Options>
        <Segmented label="Indentation" value={indent} onChange={setIndent} options={[["  ", "2 spaces"], ["    ", "4 spaces"], ["\t", "Tab"], ["min", "Minified"]]} />
      </Options>
      <div className="split">
        <Panel label="XML" value={input} onChange={setInput} error={err} rows={16} />
        <Panel label="Formatted" value={out} readOnly rows={16} />
      </div>
    </>
  );
}

/* ======================================================================
   Markdown preview
   ====================================================================== */
export function MarkdownTool() {
  const [md, setMd] = useState(() => takeHandoff("# Hello 👋\n\nThis is **Markdown** — a simple way to format text.\n\n- Lists are easy\n- So are [links](https://example.com)\n\n> Quotes look nice too.\n\n```js\nconsole.log(\"code blocks work\");\n```\n\n| Tool | Good for |\n|------|----------|\n| Smart Paste | Everything |\n"));
  const [html, setHtml] = useState("");
  useEffect(() => {
    let live = true;
    loadMarkdown().then(({ marked, DOMPurify }) => { if (live) setHtml(DOMPurify.sanitize(marked.parse(md, { gfm: true, breaks: false }))); });
    return () => { live = false; };
  }, [md]);
  return (
    <div className="split md-split">
      <Panel label="Markdown" value={md} onChange={setMd} rows={22} />
      <div className="panel">
        <div className="panel-head"><span className="panel-label">Preview</span><div className="panel-actions"><CopyButton value={html} /></div></div>
        <div className="md-preview" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  );
}

/* ======================================================================
   Lorem ipsum
   ====================================================================== */
const LOREM = "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum".split(" ");
const rnd = (n) => Math.floor(Math.random() * n);
const sentence = () => { const w = Array.from({ length: 8 + rnd(9) }, () => LOREM[rnd(LOREM.length)]); w[0] = w[0][0].toUpperCase() + w[0].slice(1); return w.join(" ") + "."; };
const paragraph = () => Array.from({ length: 3 + rnd(4) }, sentence).join(" ");

export function LoremTool() {
  const [unit, setUnit] = useState("paragraphs");
  const [count, setCount] = useState(3);
  const [classic, setClassic] = useState(true);
  const [html, setHtml] = useState(false);
  const [seed, setSeed] = useState(0);
  const text = useMemo(() => {
    let parts = unit === "paragraphs" ? Array.from({ length: count }, paragraph) : unit === "sentences" ? [Array.from({ length: count }, sentence).join(" ")] : [Array.from({ length: count }, () => LOREM[rnd(LOREM.length)]).join(" ")];
    if (classic) parts[0] = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. " + parts[0].replace(/^\w/, (c) => c.toLowerCase()).replace(/^lorem ipsum /i, "");
    return html ? parts.map((p) => `<p>${p}</p>`).join("\n") : parts.join("\n\n");
  }, [unit, count, classic, html, seed]); // eslint-disable-line
  return (
    <>
      <Options>
        <Segmented label="Unit" value={unit} onChange={setUnit} options={[["paragraphs", "Paragraphs"], ["sentences", "Sentences"], ["words", "Words"]]} />
        <label className="check">How many <input className="field small" type="number" min="1" max="200" value={count} onChange={(e) => setCount(Math.max(1, Math.min(200, Number(e.target.value) || 1)))} /></label>
        <label className="check"><input type="checkbox" checked={classic} onChange={(e) => setClassic(e.target.checked)} /> Start with “Lorem ipsum…”</label>
        <label className="check"><input type="checkbox" checked={html} onChange={(e) => setHtml(e.target.checked)} /> Wrap in &lt;p&gt; tags</label>
        <button className="btn primary" onClick={() => setSeed((s) => s + 1)}><RefreshCw size={16} /> New text</button>
      </Options>
      <Panel label={`${text.split(/\s+/).length} words`} value={text} readOnly rows={14} mono={false} />
    </>
  );
}

/* ======================================================================
   Mock data generator
   ====================================================================== */
const FIRST = ["Alex", "Sam", "Mia", "Noah", "Lina", "Omar", "Yuki", "Ivy", "Leo", "Zara", "Kai", "Nina", "Ravi", "Emma", "Tom", "Aiko", "Sofia", "Ben", "Maya", "Finn"];
const LAST = ["Smith", "Garcia", "Chen", "Patel", "Kim", "Silva", "Müller", "Rossi", "Tanaka", "Nguyen", "Brown", "Jones", "Khan", "Lopez", "Novak", "Haddad"];
const CITIES = [["Bangkok", "Thailand"], ["London", "United Kingdom"], ["Tokyo", "Japan"], ["Berlin", "Germany"], ["Toronto", "Canada"], ["Sydney", "Australia"], ["São Paulo", "Brazil"], ["Nairobi", "Kenya"], ["Seoul", "South Korea"], ["Madrid", "Spain"]];
const COMPANIES = ["Acme", "Globex", "Initech", "Umbrella", "Hooli", "Stark", "Wayne", "Soylent", "Tyrell", "Cyberdyne"];
const pickOne = (a) => a[rnd(a.length)];
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : "00000000-0000-4000-8000-" + String(rnd(1e12)).padStart(12, "0"));

const MOCK_FIELDS = {
  id: ["ID (UUID)", () => uuid()],
  name: ["Full name", (r) => `${r.first} ${r.last}`],
  email: ["Email", (r) => `${r.first}.${r.last}${rnd(99)}@example.com`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")],
  phone: ["Phone", () => `+1-555-${String(rnd(1000)).padStart(3, "0")}-${String(rnd(10000)).padStart(4, "0")}`],
  city: ["City", (r) => r.place[0]],
  country: ["Country", (r) => r.place[1]],
  company: ["Company", () => `${pickOne(COMPANIES)} ${pickOne(["Inc.", "Ltd.", "Labs", "Group", "Co."])}`],
  age: ["Age", () => 18 + rnd(60)],
  active: ["Yes/No", () => Math.random() > 0.3],
  joined: ["Date", () => new Date(Date.now() - rnd(3 * 365 * 86400000)).toISOString().slice(0, 10)],
  price: ["Price", () => Number((rnd(50000) / 100 + 1).toFixed(2))],
};

export function MockDataTool() {
  const [fields, setFields] = useState(["id", "name", "email", "city", "active"]);
  const [count, setCount] = useState(5);
  const [fmt, setFmt] = useState("json");
  const [seed, setSeed] = useState(0);
  const rows = useMemo(() => Array.from({ length: count }, () => {
    const ctx = { first: pickOne(FIRST), last: pickOne(LAST), place: pickOne(CITIES) };
    return Object.fromEntries(fields.map((f) => [f, MOCK_FIELDS[f][1](ctx)]));
  }), [fields, count, seed]); // eslint-disable-line
  const out = fmt === "json" ? JSON.stringify(rows, null, 2) : fmt === "csv" ? jsonToCsv(JSON.stringify(rows)) : rows.map((r) => `INSERT INTO people (${fields.join(", ")}) VALUES (${fields.map((f) => (typeof r[f] === "string" ? `'${r[f].replace(/'/g, "''")}'` : r[f])).join(", ")});`).join("\n");
  const toggle = (f) => setFields((fs) => (fs.includes(f) ? fs.filter((x) => x !== f) : [...fs, f]));
  return (
    <>
      <div className="panel">
        <span className="panel-label">Fields</span>
        <div className="options-row">{Object.entries(MOCK_FIELDS).map(([k, [n]]) => <label key={k} className="check"><input type="checkbox" checked={fields.includes(k)} onChange={() => toggle(k)} /> {n}</label>)}</div>
      </div>
      <Options>
        <Segmented label="Format" value={fmt} onChange={setFmt} options={[["json", "JSON"], ["csv", "CSV"], ["sql", "SQL inserts"]]} />
        <label className="check">Rows <input className="field small" type="number" min="1" max="500" value={count} onChange={(e) => setCount(Math.max(1, Math.min(500, Number(e.target.value) || 1)))} /></label>
        <button className="btn primary" onClick={() => setSeed((s) => s + 1)}><RefreshCw size={16} /> New data</button>
      </Options>
      <Panel label={`${count} fake ${count === 1 ? "person" : "people"} — safe for testing, not real`} value={fields.length ? out : ""} readOnly rows={16} />
    </>
  );
}

/* ======================================================================
   HTTP status codes
   ====================================================================== */
const HTTP = [
  [100, "Continue", "Keep sending — the server got the first part."], [101, "Switching Protocols", "Changing to another protocol, like WebSocket."],
  [200, "OK", "It worked."], [201, "Created", "It worked and something new was made."], [202, "Accepted", "Got it; it will be done later."], [204, "No Content", "It worked; nothing to send back."], [206, "Partial Content", "Here is part of the file (used for downloads and video)."],
  [301, "Moved Permanently", "This address moved for good; update your links."], [302, "Found", "Temporarily somewhere else."], [304, "Not Modified", "Use the copy you already have."], [307, "Temporary Redirect", "Go elsewhere for now, same method."], [308, "Permanent Redirect", "Moved for good, same method."],
  [400, "Bad Request", "The request was malformed."], [401, "Unauthorized", "You need to log in."], [403, "Forbidden", "Logged in, but not allowed."], [404, "Not Found", "Nothing here."], [405, "Method Not Allowed", "Wrong kind of request (e.g. POST instead of GET)."], [408, "Request Timeout", "The request took too long."], [409, "Conflict", "Clashes with the current state (e.g. a duplicate)."], [410, "Gone", "Removed on purpose and won’t come back."], [413, "Content Too Large", "The upload is too big."], [415, "Unsupported Media Type", "The server can’t read that file type."], [418, "I’m a teapot", "A joke code — the server refuses to brew coffee."], [422, "Unprocessable Content", "Understood, but the data isn’t valid."], [429, "Too Many Requests", "Slow down; you hit a rate limit."],
  [500, "Internal Server Error", "Something broke on the server."], [501, "Not Implemented", "The server can’t do that yet."], [502, "Bad Gateway", "A server in the middle got a bad answer."], [503, "Service Unavailable", "Down or overloaded; try again later."], [504, "Gateway Timeout", "A server in the middle waited too long."],
];
const CLASSES = { 1: ["Info", "blue"], 2: ["Success", "green"], 3: ["Redirect", "violet"], 4: ["Your side", "amber"], 5: ["Server side", "rose"] };

export function HttpStatusTool() {
  const [q, setQ] = useState(() => takeHandoff(""));
  const s = q.trim().toLowerCase();
  const rows = HTTP.filter(([c, n, d]) => !s || String(c).startsWith(s) || `${n} ${d}`.toLowerCase().includes(s));
  return (
    <>
      <div className="panel">
        <span className="panel-label">Search by number or words</span>
        <input className="field" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. 404, timeout, login" />
      </div>
      <div className="status-list">
        {rows.map(([c, n, d]) => {
          const [cls, tone] = CLASSES[String(c)[0]];
          return (
            <div key={c} className={`status-row tone-${tone}`}>
              <span className="status-code">{c}</span>
              <div><strong>{n}</strong><p>{d}</p></div>
              <span className="status-class">{cls}</span>
            </div>
          );
        })}
        {!rows.length && <p className="muted">No status codes match.</p>}
      </div>
    </>
  );
}

/* ======================================================================
   Keyboard event inspector
   ====================================================================== */
export function KeycodeTool() {
  const [ev, setEv] = useState(null);
  const [log, setLog] = useState([]);
  useEffect(() => {
    const onKey = (e) => {
      if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
      if (!["F5", "F12"].includes(e.key) && !(e.metaKey || e.ctrlKey)) e.preventDefault();
      const info = { key: e.key, code: e.code, keyCode: e.keyCode, location: ["standard", "left", "right", "numpad"][e.location], mods: ["ctrlKey", "shiftKey", "altKey", "metaKey"].filter((m) => e[m]).map((m) => m.replace("Key", "")), repeat: e.repeat };
      setEv(info);
      setLog((l) => [info, ...l].slice(0, 8));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const shown = ev ? (ev.key === " " ? "Space" : ev.key) : "";
  return (
    <>
      <div className={`key-stage ${ev ? "" : "waiting"}`} tabIndex={0}>
        {ev ? <><kbd className="key-big">{shown}</kbd><span className="muted">keyCode {ev.keyCode}</span></> : <span>Press any key…</span>}
      </div>
      {ev && (
        <div className="result-list">
          <Result label="event.key" value={JSON.stringify(ev.key)} />
          <Result label="event.code" value={ev.code} />
          <Result label="keyCode (old)" value={String(ev.keyCode)} />
          <Result label="Location" value={ev.location} />
          <Result label="Modifiers" value={ev.mods.join(" + ") || "none"} />
        </div>
      )}
      {log.length > 1 && (
        <div className="panel">
          <span className="panel-label">Recent keys</span>
          <div className="options-row">{log.map((l, i) => <kbd key={i}>{[...l.mods, l.key === " " ? "Space" : l.key].join(" + ")}</kbd>)}</div>
        </div>
      )}
    </>
  );
}

export const MORE_VIEWS = {
  "/converters/csv-json": CsvJsonTool,
  "/converters/cron": CronTool,
  "/converters/chmod": ChmodTool,
  "/encoders-decoders/qr": QrTool,
  "/encoders-decoders/url-parser": UrlParserTool,
  "/encoders-decoders/image-base64": ImageBase64Tool,
  "/encoders-decoders/escape": EscapeTool,
  "/formatters/sql": SqlTool,
  "/formatters/xml": XmlTool,
  "/formatters/markdown": MarkdownTool,
  "/generators/lorem": LoremTool,
  "/generators/mock-data": MockDataTool,
  "/reference/http-status": HttpStatusTool,
  "/reference/keyboard": KeycodeTool,
};
