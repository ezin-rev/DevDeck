import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Download, ArrowLeftRight, Dices } from "lucide-react";
import { Panel, Options, Segmented, CopyButton, randomBytes } from "./tools.jsx";
import { takeHandoff } from "./handoff.js";
import { Result, download, fmtBytes, FileDrop, Table } from "./shared.jsx";

/* ---------- shared list helpers ---------- */
const SPLITTERS = { newline: /\r?\n/, comma: /,/, semicolon: /;/, tab: /\t/, space: /\s+/, pipe: /\|/ };
const SPLIT_OPTS = [["auto", "Auto"], ["newline", "New line"], ["comma", "Comma"], ["semicolon", "Semicolon"], ["tab", "Tab"], ["space", "Space"], ["pipe", "|"]];
export function splitList(text, how = "auto", trim = true, dropEmpty = true) {
  let re = SPLITTERS[how];
  if (how === "auto") re = /\r?\n/.test(text.trim()) ? /\r?\n/ : text.includes("\t") ? /\t/ : text.includes(",") ? /,/ : text.includes(";") ? /;/ : /\r?\n/;
  let items = text.split(re);
  if (trim) items = items.map((s) => s.trim());
  if (dropEmpty) items = items.filter((s) => s !== "");
  return items;
}

/* ======================================================================
   Text delimiter: turn a list into "a, b, c", ('a','b'), JSON arrays…
   ====================================================================== */
const PRESETS = {
  sql: { join: ", ", quote: "'", wrap: "()", label: "SQL IN (…)" },
  json: { join: ", ", quote: '"', wrap: "[]", label: "JSON / JS array" },
  csv: { join: ",", quote: "", wrap: "", label: "Comma-separated" },
  lines: { join: "\\n", quote: "", wrap: "", label: "One per line" },
  md: { join: "\\n", quote: "", wrap: "", prefix: "- ", label: "Markdown list" },
  pipe: { join: " | ", quote: "", wrap: "", label: "a | b | c" },
};
export function DelimiterTool() {
  const [input, setInput] = useState(() => takeHandoff("apple\nbanana\ncherry\nbanana\n  dates  "));
  const [splitBy, setSplitBy] = useState("auto");
  const [o, setO] = useState({ join: ", ", quote: "'", wrap: "()", prefix: "", suffix: "", trim: true, dropEmpty: true, unique: false, sort: "none", escape: true });
  const set = (k) => (e) => setO((p) => ({ ...p, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const out = useMemo(() => {
    let items = splitList(input, splitBy, o.trim, o.dropEmpty);
    if (o.unique) items = [...new Set(items)];
    if (o.sort === "az") items = [...items].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    if (o.sort === "za") items = [...items].sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    const q = o.quote;
    const esc = (s) => (!o.escape || !q ? s : q === "'" ? s.replace(/'/g, "''") : s.replace(/\\/g, "\\\\").replace(new RegExp(q, "g"), "\\" + q));
    const joined = items.map((s) => `${o.prefix}${q}${esc(s)}${q}${o.suffix}`).join(o.join.replace(/\\n/g, "\n").replace(/\\t/g, "\t"));
    return { text: o.wrap ? `${o.wrap[0]}${joined}${o.wrap[1] || ""}` : joined, count: items.length };
  }, [input, splitBy, o]);
  return (
    <>
      <Options>
        <span className="muted small">Quick formats:</span>
        {Object.entries(PRESETS).map(([k, p]) => <button key={k} className="chip" onClick={() => setO((x) => ({ ...x, prefix: "", suffix: "", ...p }))}>{p.label}</button>)}
      </Options>
      <div className="panel">
        <div className="form-grid four">
          <label className="form-field"><span>Split the input by</span><select className="field" value={splitBy} onChange={(e) => setSplitBy(e.target.value)}>{SPLIT_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label className="form-field"><span>Join with (\n = new line)</span><input className="field mono" value={o.join} onChange={set("join")} /></label>
          <label className="form-field"><span>Quote each item</span><select className="field" value={o.quote} onChange={set("quote")}><option value="">No quotes</option><option value="'">'single'</option><option value={'"'}>"double"</option><option value="`">`backtick`</option></select></label>
          <label className="form-field"><span>Wrap everything in</span><select className="field" value={o.wrap} onChange={set("wrap")}><option value="">Nothing</option><option value="()">( )</option><option value="[]">[ ]</option><option value="{}">{"{ }"}</option></select></label>
          <label className="form-field"><span>Before each item</span><input className="field mono" value={o.prefix} onChange={set("prefix")} /></label>
          <label className="form-field"><span>After each item</span><input className="field mono" value={o.suffix} onChange={set("suffix")} /></label>
          <label className="form-field"><span>Order</span><select className="field" value={o.sort} onChange={set("sort")}><option value="none">Keep order</option><option value="az">A → Z</option><option value="za">Z → A</option></select></label>
        </div>
        <div className="options-row">
          <label className="check"><input type="checkbox" checked={o.trim} onChange={set("trim")} /> Trim spaces</label>
          <label className="check"><input type="checkbox" checked={o.dropEmpty} onChange={set("dropEmpty")} /> Skip empty items</label>
          <label className="check"><input type="checkbox" checked={o.unique} onChange={set("unique")} /> Remove duplicates</label>
          <label className="check"><input type="checkbox" checked={o.escape} onChange={set("escape")} /> Escape quotes inside items</label>
        </div>
      </div>
      <div className="split">
        <Panel label="List" value={input} onChange={setInput} rows={12} />
        <Panel label={`Result (${out.count} items)`} value={out.text} readOnly rows={12} />
      </div>
    </>
  );
}

/* ======================================================================
   List comparer
   ====================================================================== */
export function ListCompareTool() {
  const [a, setA] = useState("alice\nbob\ncarol\ndave");
  const [b, setB] = useState("bob\ncarol\nerin\nAlice");
  const [ignoreCase, setIgnoreCase] = useState(true);
  const [splitBy, setSplitBy] = useState("auto");
  const [view, setView] = useState("onlyA");
  const r = useMemo(() => {
    const la = [...new Set(splitList(a, splitBy))], lb = [...new Set(splitList(b, splitBy))];
    const key = (s) => (ignoreCase ? s.toLowerCase() : s);
    const ka = new Set(la.map(key)), kb = new Set(lb.map(key));
    const onlyA = la.filter((x) => !kb.has(key(x))), onlyB = lb.filter((x) => !ka.has(key(x))), both = la.filter((x) => kb.has(key(x)));
    const seen = new Set(); const all = [...la, ...lb].filter((x) => !seen.has(key(x)) && seen.add(key(x)));
    return { onlyA, onlyB, both, all, na: la.length, nb: lb.length };
  }, [a, b, ignoreCase, splitBy]);
  const views = [["onlyA", `Only in A (${r.onlyA.length})`], ["onlyB", `Only in B (${r.onlyB.length})`], ["both", `In both (${r.both.length})`], ["all", `Everything (${r.all.length})`]];
  return (
    <>
      <Options>
        <label className="check">Split by <select className="field small-select" value={splitBy} onChange={(e) => setSplitBy(e.target.value)}>{SPLIT_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label className="check"><input type="checkbox" checked={ignoreCase} onChange={(e) => setIgnoreCase(e.target.checked)} /> Ignore upper/lower case</label>
        <button className="btn" onClick={() => { setA(b); setB(a); }}><ArrowLeftRight size={16} /> Swap</button>
      </Options>
      <div className="split">
        <Panel label={`List A (${r.na} different items)`} value={a} onChange={setA} rows={10} />
        <Panel label={`List B (${r.nb} different items)`} value={b} onChange={setB} rows={10} />
      </div>
      <div className="stats">
        {views.map(([k, l]) => <button key={k} className={`stat as-stat ${view === k ? "on" : ""}`} onClick={() => setView(k)}><strong>{r[k].length}</strong><span>{l.replace(/ \(\d+\)$/, "")}</span></button>)}
      </div>
      <Panel label={views.find(([k]) => k === view)[1]} value={r[view].join("\n")} readOnly rows={10} />
    </>
  );
}

/* ======================================================================
   Duplicate detector
   ====================================================================== */
export function DuplicateTool() {
  const [input, setInput] = useState(() => takeHandoff("ORD-1001\nORD-1002\nord-1001\nORD-1003\nORD-1002\nORD-1002\n\nORD-1004"));
  const [ignoreCase, setIgnoreCase] = useState(false);
  const [trim, setTrim] = useState(true);
  const [splitBy, setSplitBy] = useState("auto");
  const r = useMemo(() => {
    const items = splitList(input, splitBy, trim, true);
    const groups = new Map();
    items.forEach((x, i) => { const k = ignoreCase ? x.toLowerCase() : x; if (!groups.has(k)) groups.set(k, { value: x, count: 0, lines: [] }); const g = groups.get(k); g.count++; g.lines.push(i + 1); });
    const list = [...groups.values()];
    return { items, dupes: list.filter((g) => g.count > 1).sort((x, y) => y.count - x.count), unique: list.map((g) => g.value), once: list.filter((g) => g.count === 1).map((g) => g.value) };
  }, [input, ignoreCase, trim, splitBy]);
  const extra = r.dupes.reduce((n, g) => n + g.count - 1, 0);
  return (
    <>
      <Options>
        <label className="check">Split by <select className="field small-select" value={splitBy} onChange={(e) => setSplitBy(e.target.value)}>{SPLIT_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label className="check"><input type="checkbox" checked={ignoreCase} onChange={(e) => setIgnoreCase(e.target.checked)} /> Ignore upper/lower case</label>
        <label className="check"><input type="checkbox" checked={trim} onChange={(e) => setTrim(e.target.checked)} /> Ignore spaces at the ends</label>
      </Options>
      <Panel label="Items (one per line)" value={input} onChange={setInput} rows={10} />
      <div className="stats">
        <div className="stat"><strong>{r.items.length}</strong><span>Items</span></div>
        <div className="stat"><strong>{r.unique.length}</strong><span>Different</span></div>
        <div className="stat"><strong>{r.dupes.length}</strong><span>Repeated values</span></div>
        <div className="stat"><strong>{extra}</strong><span>Extra copies</span></div>
      </div>
      <div className="panel">
        <span className="panel-label">Repeated values</span>
        <Table head={["Value", "Times", "On lines / positions"]} rows={r.dupes.map((g) => [<code key="v">{g.value}</code>, g.count, g.lines.join(", ")])} empty="No duplicates — every item is different." />
      </div>
      <div className="split">
        <Panel label="Without duplicates (first copy kept)" value={r.unique.join("\n")} readOnly rows={8} />
        <Panel label="Values that appear only once" value={r.once.join("\n")} readOnly rows={8} />
      </div>
    </>
  );
}

/* ======================================================================
   Randomizer (uses the browser's secure random numbers)
   ====================================================================== */
export function randInt(n) { // 0 … n-1 without bias
  if (n <= 1) return 0;
  const max = Math.floor(0x100000000 / n) * n;
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf); while (buf[0] >= max);
  return buf[0] % n;
}
const randFloat = () => { const b = new Uint32Array(2); crypto.getRandomValues(b); return (b[0] * 2 ** 21 + (b[1] >>> 11)) / 2 ** 53; };
export function shuffle(list) { const a = [...list]; for (let i = a.length - 1; i > 0; i--) { const j = randInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }

export function RandomizerTool() {
  const [mode, setMode] = useState("numbers");
  const [n, setN] = useState({ min: 1, max: 100, count: 5, decimals: 0, unique: true, sort: false });
  const [list, setList] = useState("Alex\nSam\nRiley\nJordan\nTaylor\nMorgan");
  const [pick, setPick] = useState(1);
  const [groups, setGroups] = useState(2);
  const [dice, setDice] = useState("2d6");
  const [out, setOut] = useState("");
  const [note, setNote] = useState("");
  const setNum = (k) => (e) => setN((p) => ({ ...p, [k]: e.target.type === "checkbox" ? e.target.checked : Number(e.target.value) }));
  const run = () => {
    setNote("");
    if (mode === "numbers") {
      const lo = Math.min(n.min, n.max), hi = Math.max(n.min, n.max), f = 10 ** Math.max(0, Math.min(6, n.decimals));
      const span = Math.round((hi - lo) * f) + 1;
      const count = Math.max(1, Math.min(10000, n.count));
      if (n.unique && count > span) { setNote(`Only ${span} different numbers fit between ${lo} and ${hi}.`); return; }
      const seen = new Set(), res = [];
      while (res.length < count) { const v = (Math.round(lo * f) + randInt(span)) / f; if (n.unique && seen.has(v)) continue; seen.add(v); res.push(v); }
      if (n.sort) res.sort((a, b) => a - b);
      setOut(res.map((v) => v.toFixed(Math.max(0, n.decimals))).join("\n"));
    } else if (mode === "pick" || mode === "shuffle" || mode === "teams") {
      const items = splitList(list);
      if (!items.length) { setNote("Add some items to the list first."); return; }
      const mixed = shuffle(items);
      if (mode === "pick") setOut(mixed.slice(0, Math.max(1, Math.min(items.length, pick))).join("\n"));
      else if (mode === "shuffle") setOut(mixed.join("\n"));
      else { const g = Math.max(2, Math.min(items.length, groups)); const t = Array.from({ length: g }, () => []); mixed.forEach((x, i) => t[i % g].push(x)); setOut(t.map((m, i) => `Group ${i + 1}: ${m.join(", ")}`).join("\n")); }
    } else if (mode === "dice") {
      const m = dice.trim().toLowerCase().match(/^(\d*)d(\d+)\s*([+-]\s*\d+)?$/);
      if (!m) { setNote("Write dice like 2d6, d20 or 3d8+2."); return; }
      const count = Math.min(100, +(m[1] || 1)), sides = Math.max(2, +m[2]), mod = m[3] ? +m[3].replace(/\s/g, "") : 0;
      const rolls = Array.from({ length: count }, () => 1 + randInt(sides));
      setOut(`${rolls.join(" + ")}${mod ? ` ${mod > 0 ? "+" : "−"} ${Math.abs(mod)}` : ""} = ${rolls.reduce((s, x) => s + x, 0) + mod}`);
    } else if (mode === "coin") setOut(randInt(2) ? "Heads" : "Tails");
    else if (mode === "yesno") setOut(randInt(2) ? "Yes" : "No");
    else if (mode === "percent") setOut(`${(randFloat() * 100).toFixed(2)}%`);
  };
  useEffect(run, [mode]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <Options>
        <Segmented label="What to randomize" value={mode} onChange={setMode} options={[["numbers", "Numbers"], ["pick", "Pick from a list"], ["shuffle", "Shuffle a list"], ["teams", "Split into groups"], ["dice", "Dice"], ["coin", "Coin flip"], ["yesno", "Yes / No"]]} />
      </Options>
      <div className="panel">
        {mode === "numbers" && (
          <div className="form-grid four">
            <label className="form-field"><span>From</span><input className="field" type="number" value={n.min} onChange={setNum("min")} /></label>
            <label className="form-field"><span>To</span><input className="field" type="number" value={n.max} onChange={setNum("max")} /></label>
            <label className="form-field"><span>How many</span><input className="field" type="number" min="1" max="10000" value={n.count} onChange={setNum("count")} /></label>
            <label className="form-field"><span>Decimal places</span><input className="field" type="number" min="0" max="6" value={n.decimals} onChange={setNum("decimals")} /></label>
          </div>
        )}
        {mode === "numbers" && <div className="options-row"><label className="check"><input type="checkbox" checked={n.unique} onChange={setNum("unique")} /> No repeats</label><label className="check"><input type="checkbox" checked={n.sort} onChange={setNum("sort")} /> Sort</label></div>}
        {["pick", "shuffle", "teams"].includes(mode) && <>
          <textarea className="field" rows={6} value={list} onChange={(e) => setList(e.target.value)} placeholder="One item per line" />
          {mode === "pick" && <label className="check">How many to pick <input className="field small" type="number" min="1" value={pick} onChange={(e) => setPick(Number(e.target.value) || 1)} /></label>}
          {mode === "teams" && <label className="check">Number of groups <input className="field small" type="number" min="2" value={groups} onChange={(e) => setGroups(Number(e.target.value) || 2)} /></label>}
        </>}
        {mode === "dice" && <label className="check">Dice <input className="field mono small wide-small" value={dice} onChange={(e) => setDice(e.target.value)} /> <span className="muted small">e.g. 2d6, d20, 3d8+2</span></label>}
        <div className="options-row"><button className="btn primary" onClick={run}><Dices size={16} /> {out ? "Again" : "Go"}</button>{note && <span className="error">{note}</span>}</div>
      </div>
      {out && (out.includes("\n") ? <Panel label="Result" value={out} readOnly rows={Math.min(14, out.split("\n").length + 1)} /> : <div className="big-answer random-answer">{out} <CopyButton value={out} /></div>)}
    </>
  );
}

/* ======================================================================
   ULID generator and decoder
   ====================================================================== */
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
let lastUlid = { t: -1, rand: null };
export function ulid(monotonic = false, now = Date.now()) {
  let rand;
  if (monotonic && now === lastUlid.t && lastUlid.rand) {
    rand = lastUlid.rand.slice();
    for (let i = 15; i >= 0; i--) { if (rand[i] < 31) { rand[i]++; break; } rand[i] = 0; }
  } else rand = Array.from(randomBytes(16), (b) => b & 31);
  lastUlid = { t: now, rand };
  let t = now, time = "";
  for (let i = 0; i < 10; i++) { time = CROCKFORD[t % 32] + time; t = Math.floor(t / 32); }
  return time + rand.map((x) => CROCKFORD[x]).join("");
}
export function decodeUlid(s) {
  const u = s.trim().toUpperCase().replace(/[IL]/g, "1").replace(/O/g, "0");
  if (!/^[0-9A-HJKMNP-TV-Z]{26}$/.test(u)) throw new Error("A ULID is 26 letters and digits (Crockford Base32, no I, L, O or U).");
  if (u[0] > "7") throw new Error("This ULID is too big — the first character must be 0–7.");
  let t = 0;
  for (const c of u.slice(0, 10)) t = t * 32 + CROCKFORD.indexOf(c);
  let n = 0n;
  for (const c of u) n = n * 32n + BigInt(CROCKFORD.indexOf(c));
  const hex = n.toString(16).padStart(32, "0");
  return { time: new Date(t), uuid: `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`, random: u.slice(10) };
}

export function UlidTool() {
  const [count, setCount] = useState(5);
  const [mono, setMono] = useState(true);
  const [lower, setLower] = useState(false);
  const [list, setList] = useState([]);
  const [check, setCheck] = useState("");
  const gen = () => { const now = Date.now(); setList(Array.from({ length: Math.max(1, Math.min(1000, count)) }, () => ulid(mono, now))); };
  useEffect(gen, []); // eslint-disable-line react-hooks/exhaustive-deps
  const text = list.map((u) => (lower ? u.toLowerCase() : u)).join("\n");
  const dec = useMemo(() => { const s = check.trim() || list[0]; if (!s) return null; try { return decodeUlid(s); } catch (e) { return { err: e.message }; } }, [check, list]);
  return (
    <>
      <Options>
        <label className="check">How many <input className="field small" type="number" min="1" max="1000" value={count} onChange={(e) => setCount(Number(e.target.value) || 1)} /></label>
        <label className="check" title="IDs made in the same millisecond still sort in the order they were made"><input type="checkbox" checked={mono} onChange={(e) => setMono(e.target.checked)} /> Keep in order (monotonic)</label>
        <label className="check"><input type="checkbox" checked={lower} onChange={(e) => setLower(e.target.checked)} /> Lowercase</label>
        <button className="btn primary" onClick={gen}><RefreshCw size={16} /> Generate</button>
      </Options>
      <Panel label="ULIDs" value={text} readOnly rows={10} />
      <div className="panel">
        <span className="panel-label">Read a ULID</span>
        <input className={`field mono ${dec?.err ? "has-error" : ""}`} value={check} onChange={(e) => setCheck(e.target.value)} placeholder={list[0] || "01ARZ3NDEKTSV4RRFFQ69G5FAV"} aria-label="ULID to read" />
        {dec?.err && <p className="error">{dec.err}</p>}
        {dec && !dec.err && <div className="result-list">
          <Result label="Created" value={`${dec.time.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" })} (${dec.time.toISOString()})`} />
          <Result label="Unix ms" value={String(dec.time.getTime())} />
          <Result label="Random part" value={dec.random} />
          <Result label="As a UUID" value={dec.uuid} />
        </div>}
      </div>
      <p className="muted small">ULIDs are like UUIDs that sort by time: the first 10 characters are the moment it was made, the last 16 are random.</p>
    </>
  );
}

/* ======================================================================
   GZIP compressor / decompressor (browser's built-in CompressionStream)
   ====================================================================== */
const pipe = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
export const gzip = (bytes, format = "gzip") => pipe(bytes, new CompressionStream(format));
export const sniffFormat = (b) => (b[0] === 0x1f && b[1] === 0x8b ? "gzip" : (b[0] & 0x0f) === 8 && ((b[0] << 8) | b[1]) % 31 === 0 ? "deflate" : "deflate-raw");
export const gunzip = (bytes, format) => pipe(bytes, new DecompressionStream(format || sniffFormat(bytes)));
const toB64 = (b) => { let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };
const fromText = (t) => {
  const s = t.trim();
  if (/^([0-9a-f]{2}\s*)+$/i.test(s) && s.replace(/\s/g, "").length % 2 === 0 && /^1f\s*8b|^78/i.test(s)) return Uint8Array.from(s.replace(/\s/g, "").match(/../g), (h) => parseInt(h, 16));
  const c = s.replace(/\s/g, "").replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(c + "===".slice((c.length + 3) % 4)), (ch) => ch.charCodeAt(0));
};
const FORMAT_OPTS = [["gzip", "GZIP"], ["deflate", "Deflate (zlib)"], ["deflate-raw", "Raw deflate"]];

export function GzipTool() {
  const [mode, setMode] = useState("compress");
  const [format, setFormat] = useState("gzip");
  const [enc, setEnc] = useState("base64");
  const [input, setInput] = useState(() => takeHandoff('{"message":"Hello, hello, hello! Repeated text shrinks really well when it is compressed with gzip.","items":[1,2,3,1,2,3,1,2,3]}'));
  const [res, setRes] = useState({ out: "", err: "", info: "" });
  const [fileMsg, setFileMsg] = useState("");
  const supported = typeof CompressionStream !== "undefined";
  useEffect(() => {
    let live = true;
    (async () => {
      if (!input.trim() || !supported) return setRes({ out: "", err: "", info: "" });
      try {
        if (mode === "compress") {
          const src = new TextEncoder().encode(input);
          const out = await gzip(src, format);
          const text = enc === "hex" ? [...out].map((b) => b.toString(16).padStart(2, "0")).join("") : toB64(out);
          if (live) setRes({ out: text, err: "", info: `${fmtBytes(src.length)} → ${fmtBytes(out.length)} compressed (${Math.round((out.length / src.length) * 100)}% of the original; ${fmtBytes(text.length)} as ${enc === "hex" ? "hex" : "Base64"} text)` });
        } else {
          const bytes = fromText(input);
          const fmt = sniffFormat(bytes);
          const out = await gunzip(bytes, fmt);
          const text = new TextDecoder("utf-8", { fatal: false }).decode(out);
          if (live) setRes({ out: text, err: "", info: `Found ${FORMAT_OPTS.find(([f]) => f === fmt)[1]} data: ${fmtBytes(bytes.length)} → ${fmtBytes(out.length)}` });
        }
      } catch (e) { if (live) setRes({ out: "", err: mode === "compress" ? e.message : "Couldn’t decompress this. Paste Base64 or hex of gzip/deflate data.", info: "" }); }
    })();
    return () => { live = false; };
  }, [input, mode, format, enc, supported]);

  const onFile = async ([file]) => {
    setFileMsg("Working…");
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (mode === "compress") {
        const out = await gzip(bytes, format);
        download(`${file.name}${format === "gzip" ? ".gz" : ".zz"}`, new Blob([out], { type: "application/gzip" }));
        setFileMsg(`${file.name}: ${fmtBytes(bytes.length)} → ${fmtBytes(out.length)}. Downloaded.`);
      } else {
        const out = await gunzip(bytes);
        download(file.name.replace(/\.(gz|gzip|zz|z)$/i, "") || "decompressed", new Blob([out]));
        setFileMsg(`${file.name}: ${fmtBytes(bytes.length)} → ${fmtBytes(out.length)}. Downloaded.`);
      }
    } catch { setFileMsg("Couldn’t read that file as gzip/deflate data."); }
  };
  if (!supported) return <p className="error">This browser doesn’t have built-in compression. Try a recent Chrome, Edge, Firefox or Safari.</p>;
  return (
    <>
      <Options>
        <Segmented label="Mode" value={mode} onChange={(m) => { if (res.out && !res.err) setInput(res.out); setMode(m); }} options={[["compress", "Compress"], ["decompress", "Decompress"]]} />
        {mode === "compress" && <Segmented label="Format" value={format} onChange={setFormat} options={FORMAT_OPTS} />}
        {mode === "compress" && <Segmented label="Output as" value={enc} onChange={setEnc} options={[["base64", "Base64"], ["hex", "Hex"]]} />}
      </Options>
      <div className="split">
        <Panel label={mode === "compress" ? "Text" : "Compressed data (Base64 or hex)"} value={input} onChange={setInput} error={res.err} rows={12} />
        <Panel label={mode === "compress" ? "Compressed" : "Text"} value={res.out} readOnly rows={12} />
      </div>
      {res.info && <p className="muted small">{res.info}</p>}
      <FileDrop onFiles={onFile} title={mode === "compress" ? "Or drop any file to compress it into a .gz download" : "Or drop a .gz file to unpack it"} />
      {fileMsg && <p className="muted small">{fileMsg}</p>}
    </>
  );
}

/* ======================================================================
   File splitter (and joiner)
   ====================================================================== */
export function FileSplitTool() {
  const [mode, setMode] = useState("text");
  const [text, setText] = useState(() => takeHandoff(Array.from({ length: 25 }, (_, i) => `line ${i + 1},value ${(i * 37) % 100}`).join("\n")));
  const [by, setBy] = useState("lines");
  const [size, setSize] = useState(10);
  const [header, setHeader] = useState(false);
  const [delim, setDelim] = useState("---");
  const [file, setFile] = useState(null);
  const [chunkMb, setChunkMb] = useState(10);
  const [parts, setParts] = useState(0);
  const [msg, setMsg] = useState("");

  const pieces = useMemo(() => {
    if (mode !== "text" || !text) return [];
    if (by === "delimiter") return delim ? text.split(delim).map((s) => s.replace(/^\r?\n|\r?\n$/g, "")).filter((s) => s.trim()) : [text];
    if (by === "chars") { const n = Math.max(1, size); const out = []; for (let i = 0; i < text.length; i += n) out.push(text.slice(i, i + n)); return out; }
    let lines = text.split(/\r?\n/);
    const head = header ? lines[0] : null;
    if (header) lines = lines.slice(1);
    const per = by === "parts" ? Math.ceil(lines.length / Math.max(1, size)) : Math.max(1, size);
    const out = [];
    for (let i = 0; i < lines.length; i += per) out.push((head != null ? [head, ...lines.slice(i, i + per)] : lines.slice(i, i + per)).join("\n"));
    return out;
  }, [mode, text, by, size, header, delim]);

  const splitFile = async () => {
    if (!file) return;
    const chunk = parts ? Math.ceil(file.size / parts) : Math.max(1, chunkMb) * 1048576;
    const count = Math.ceil(file.size / chunk);
    if (count > 200) { setMsg(`That would make ${count} pieces — choose bigger pieces (at most 200).`); return; }
    for (let i = 0; i < count; i++) {
      download(`${file.name}.part${String(i + 1).padStart(3, "0")}`, file.slice(i * chunk, (i + 1) * chunk));
      await new Promise((r) => setTimeout(r, 250)); // browsers block many downloads at once
    }
    setMsg(`Split into ${count} pieces of up to ${fmtBytes(chunk)}. Join them again with the “Join pieces” tab, or: cat ${file.name}.part* > ${file.name}`);
  };
  const joinFiles = async (files) => {
    const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    const name = sorted[0].name.replace(/\.part\d+$/i, "").replace(/\.\d{3}$/, "");
    download(name, new Blob(sorted));
    setMsg(`Joined ${sorted.length} pieces (${sorted.map((f) => f.name).join(", ")}) into ${name} — ${fmtBytes(sorted.reduce((n, f) => n + f.size, 0))}.`);
  };

  return (
    <>
      <Options>
        <Segmented label="What to split" value={mode} onChange={(m) => { setMode(m); setMsg(""); }} options={[["text", "Split text"], ["file", "Split a file"], ["join", "Join pieces"]]} />
      </Options>
      {mode === "text" && <>
        <div className="options-row">
          <Segmented label="Split by" value={by} onChange={setBy} options={[["lines", "Lines per piece"], ["parts", "Number of pieces"], ["chars", "Characters per piece"], ["delimiter", "A separator"]]} />
          {by === "delimiter" ? <input className="field mono small wide-small" value={delim} onChange={(e) => setDelim(e.target.value)} aria-label="Separator" />
            : <input className="field small" type="number" min="1" value={size} onChange={(e) => setSize(Number(e.target.value) || 1)} aria-label="Size" />}
          {(by === "lines" || by === "parts") && <label className="check"><input type="checkbox" checked={header} onChange={(e) => setHeader(e.target.checked)} /> Repeat the first line (CSV header) in every piece</label>}
        </div>
        <Panel label="Text" value={text} onChange={setText} rows={10} />
        <div className="options-row"><span className="panel-label">{pieces.length} pieces</span>{pieces.length > 1 && <button className="btn" onClick={async () => { for (let i = 0; i < pieces.length; i++) { download(`piece-${String(i + 1).padStart(3, "0")}.txt`, pieces[i]); await new Promise((r) => setTimeout(r, 250)); } }}><Download size={16} /> Download all</button>}</div>
        <div className="piece-list">
          {pieces.slice(0, 50).map((p, i) => (
            <div className="result" key={i}><span className="panel-label">Piece {i + 1}</span><code>{p.length > 140 ? p.slice(0, 140) + "…" : p}</code><span className="panel-actions"><CopyButton value={p} /><button className="btn ghost" onClick={() => download(`piece-${String(i + 1).padStart(3, "0")}.txt`, p)}><Download size={16} /></button></span></div>
          ))}
          {pieces.length > 50 && <p className="muted small">…and {pieces.length - 50} more (use Download all).</p>}
        </div>
      </>}
      {mode === "file" && <>
        <FileDrop onFiles={([f]) => { setFile(f); setMsg(""); }} title={file ? `${file.name} — ${fmtBytes(file.size)}` : "Drop the file to split, or click to choose it"} />
        <div className="options-row">
          <label className="check">Piece size (MB) <input className="field small" type="number" min="1" value={chunkMb} onChange={(e) => { setChunkMb(Number(e.target.value) || 1); setParts(0); }} /></label>
          <span className="muted small">or</span>
          <label className="check">Number of pieces <input className="field small" type="number" min="0" value={parts} onChange={(e) => setParts(Number(e.target.value) || 0)} /></label>
          <button className="btn primary" disabled={!file} onClick={splitFile}><Download size={16} /> Split and download</button>
        </div>
      </>}
      {mode === "join" && <FileDrop multiple onFiles={joinFiles} title="Drop all the pieces (.part001, .part002 …) together" hint="They’re joined in name order and downloaded as one file" />}
      {msg && <p className="muted small">{msg}</p>}
    </>
  );
}

/* ======================================================================
   RESX translator: translate .NET resource files side by side
   ====================================================================== */
const SAMPLE_RESX = `<?xml version="1.0" encoding="utf-8"?>
<root>
  <resheader name="resmimetype"><value>text/microsoft-resx</value></resheader>
  <resheader name="version"><value>2.0</value></resheader>
  <data name="Welcome" xml:space="preserve"><value>Welcome back, {0}!</value><comment>Shown on the home page</comment></data>
  <data name="Save" xml:space="preserve"><value>Save</value></data>
  <data name="Cancel" xml:space="preserve"><value>Cancel</value></data>
  <data name="ItemsInCart" xml:space="preserve"><value>You have {0} items in your cart.</value></data>
  <data name="ErrorRequired" xml:space="preserve"><value>This field is required.</value><comment>Form validation</comment></data>
</root>`;

export function parseResx(text) {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror")[0]) throw new Error("This isn’t valid .resx (XML) text.");
  return [...doc.getElementsByTagName("data")]
    .filter((d) => !d.getAttribute("type") && !d.getAttribute("mimetype"))
    .map((d) => ({ key: d.getAttribute("name"), value: d.getElementsByTagName("value")[0]?.textContent ?? "", comment: d.getElementsByTagName("comment")[0]?.textContent ?? "" }));
}
export function buildResx(sourceText, translations, keepOriginal) {
  const doc = new DOMParser().parseFromString(sourceText, "application/xml");
  for (const d of doc.getElementsByTagName("data")) {
    const t = translations[d.getAttribute("name")];
    const v = d.getElementsByTagName("value")[0];
    if (!v || d.getAttribute("type") || d.getAttribute("mimetype")) continue;
    if (t) v.textContent = t; else if (!keepOriginal) v.textContent = "";
  }
  const xml = new XMLSerializer().serializeToString(doc);
  return xml.startsWith("<?xml") ? xml : `<?xml version="1.0" encoding="utf-8"?>\n${xml}`;
}
const placeholders = (s) => (s.match(/\{\d+(:[^}]*)?\}|%\d*\$?[sdif]|\{\{?\w+\}?\}/g) || []).sort().join(" ");
const csvCell = (s) => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
function readCsvRows(text) {
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

export function ResxTool() {
  const [source, setSource] = useState(() => takeHandoff(SAMPLE_RESX));
  const [lang, setLang] = useState("th");
  const [tr, setTr] = useState({});
  const [keep, setKeep] = useState(true);
  const [bulk, setBulk] = useState("");
  const [msg, setMsg] = useState("");
  const parsed = useMemo(() => { try { return { rows: parseResx(source) }; } catch (e) { return { rows: [], err: e.message }; } }, [source]);
  const rows = parsed.rows;
  const done = rows.filter((r) => tr[r.key]?.trim()).length;
  const setOne = (k, v) => setTr((p) => ({ ...p, [k]: v }));
  const loadTranslated = async ([f]) => { try { const list = parseResx(await f.text()); setTr(Object.fromEntries(list.filter((x) => x.value).map((x) => [x.key, x.value]))); setMsg(`Loaded ${list.length} existing translations from ${f.name}.`); } catch (e) { setMsg(e.message); } };
  const importCsv = async ([f]) => {
    const r = readCsvRows(await f.text());
    const head = r[0]?.map((h) => h.toLowerCase()) || [];
    const ki = head.indexOf("key"), ti = head.indexOf("translation");
    if (ki < 0 || ti < 0) { setMsg("The CSV needs “key” and “translation” columns (as exported here)."); return; }
    setTr((p) => ({ ...p, ...Object.fromEntries(r.slice(1).filter((x) => x[ki]).map((x) => [x[ki], x[ti] || ""])) }));
    setMsg(`Imported translations from ${f.name}.`);
  };
  const applyBulk = () => {
    const lines = bulk.split(/\r?\n/);
    if (lines.length < rows.length) { setMsg(`Pasted ${lines.length} lines, but there are ${rows.length} texts — paste one translated line per text, in the same order.`); return; }
    setTr((p) => ({ ...p, ...Object.fromEntries(rows.map((r, i) => [r.key, lines[i].replace(/\\n/g, "\n")])) }));
    setMsg(`Filled ${rows.length} translations.`); setBulk("");
  };
  const sourceLines = rows.map((r) => r.value.replace(/\r?\n/g, "\\n")).join("\n");
  const baseName = "Resources";
  return (
    <>
      <div className="split">
        <div className="panel">
          <span className="panel-label">Original .resx</span>
          <FileDrop onFiles={async ([f]) => setSource(await f.text())} accept=".resx,.xml" title="Drop the original .resx file, or paste it below" />
          <textarea className={`field mono ${parsed.err ? "has-error" : ""}`} rows={6} value={source} onChange={(e) => setSource(e.target.value)} spellCheck={false} />
          {parsed.err && <p className="error">{parsed.err}</p>}
        </div>
        <div className="panel">
          <span className="panel-label">Translation</span>
          <label className="check">Language code <input className="field small" value={lang} onChange={(e) => setLang(e.target.value.trim())} placeholder="th, fr, de-CH…" /></label>
          <FileDrop onFiles={loadTranslated} accept=".resx,.xml" title="Optional: drop an existing translated .resx to continue it" />
          <div className="options-row">
            <FileDrop onFiles={importCsv} accept=".csv,text/csv" title="Import a CSV from a translator" hint="Columns: key, source, translation" />
          </div>
        </div>
      </div>
      <div className="options-row">
        <span className="badge">{done} of {rows.length} translated</span>
        <label className="check"><input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} /> Keep the original text where there’s no translation</label>
        <button className="btn primary" disabled={!rows.length} onClick={() => download(`${baseName}.${lang || "xx"}.resx`, buildResx(source, tr, keep), "application/xml")}><Download size={16} /> Download {baseName}.{lang || "xx"}.resx</button>
        <button className="btn" disabled={!rows.length} onClick={() => download(`${baseName}.${lang || "xx"}.csv`, ["key,source,translation,comment", ...rows.map((r) => [r.key, r.value, tr[r.key] || "", r.comment].map(csvCell).join(","))].join("\n"), "text/csv")}><Download size={16} /> CSV for a translator</button>
      </div>
      {msg && <p className="muted small">{msg}</p>}
      <div className="table-wrap resx-table">
        <table className="data-table">
          <thead><tr><th>Key</th><th>Original</th><th>Translation</th><th>Note</th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const t = tr[r.key] || "";
              const bad = t && placeholders(t) !== placeholders(r.value);
              return (
                <tr key={r.key}>
                  <td><code>{r.key}</code></td>
                  <td className="wrap-cell">{r.value}</td>
                  <td><textarea className={`field resx-input ${bad ? "has-error" : ""}`} rows={Math.max(1, Math.ceil(r.value.length / 40))} value={t} onChange={(e) => setOne(r.key, e.target.value)} aria-label={`Translation of ${r.key}`} />{bad && <span className="error">Keep the placeholders: {placeholders(r.value) || "none"}</span>}</td>
                  <td className="wrap-cell muted small">{r.comment}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="panel">
        <span className="panel-label">Translate many at once</span>
        <p className="muted small">Copy all original texts (one per line), translate them with any tool you trust, then paste the translated lines back in the same order.</p>
        <div className="options-row">
          <CopyButton value={sourceLines} />
          <a className="btn" href={`https://translate.google.com/?sl=auto&tl=${encodeURIComponent(lang.split("-")[0] || "en")}&op=translate&text=${encodeURIComponent(sourceLines.slice(0, 4500))}`} target="_blank" rel="noreferrer noopener" title="Opens Google Translate in a new tab — this sends the texts to Google">Open in Google Translate ↗</a>
          <span className="muted small">(opening an online translator sends the texts there)</span>
        </div>
        <textarea className="field" rows={5} value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder="Paste the translated lines here…" />
        <button className="btn" disabled={!bulk.trim()} onClick={applyBulk}>Fill in translations</button>
      </div>
    </>
  );
}

export const MORE_TOOL_VIEWS = {
  "/text/delimiter": DelimiterTool,
  "/text/list-compare": ListCompareTool,
  "/text/duplicates": DuplicateTool,
  "/text/resx": ResxTool,
  "/generators/randomizer": RandomizerTool,
  "/generators/ulid": UlidTool,
  "/encoders-decoders/gzip": GzipTool,
  "/files/split": FileSplitTool,
};
