import { useEffect, useMemo, useState } from "react";
import { ArrowUp, ArrowDown, Trash2, Plus, RefreshCw, ExternalLink } from "lucide-react";
import yaml from "js-yaml";
import { md5 } from "js-md5";
import {
  Panel, Options, Segmented, CopyButton, PasteButton,
  htmlEncode, htmlDecode, b64encode, b64decode, randomBytes, CASES,
} from "./tools.jsx";
import { takeHandoff, sendTo } from "./handoff.js";
import { navigate } from "./router.jsx";
import { parseCsv, csvToJson, jsonToCsv, parseCron, describeCron, formatXml, ESCAPES, loadSql } from "./tools2.jsx";
import { parseCidr, dockerRunToCompose, parseCurl, parseDotenv } from "./devops.jsx";
import { certPreview } from "./certs.jsx";
import { parse as tomlParse } from "smol-toml";

// The SQL formatter is large, so it loads in the background; until then SQL previews show the query as typed.
let sqlLib = null;
const warmSql = () => loadSql().then((m) => { sqlLib = m; return m; });

/* ======================================================================
   Smart Paste: guess what the text is and show the useful answer
   ====================================================================== */
const isPrintable = (s) => s.length > 0 && [...s].filter((c) => /[\p{L}\p{N}\p{P}\p{S}\s]/u.test(c)).length / [...s].length > 0.92;
const fmtDate = (d) => d.toLocaleString(undefined, { dateStyle: "full", timeStyle: "long" });
const tryJson = (s) => { try { return JSON.parse(s); } catch { return undefined; } };

export function detect(raw) {
  const text = raw.trim();
  if (!text) return [];
  const out = [];
  const add = (f) => out.push(f);

  // Certificates and signing requests (PEM)
  if (/-----BEGIN (CERTIFICATE|CERTIFICATE REQUEST|NEW CERTIFICATE REQUEST)-----/.test(text)) {
    try {
      const isCsr = /BEGIN (NEW )?CERTIFICATE REQUEST/.test(text) && !/BEGIN CERTIFICATE-----/.test(text);
      add({ type: isCsr ? "Certificate signing request" : "SSL/TLS certificate", tool: "/validators/cert-decoder", toolName: "Certificate Decoder", text, preview: certPreview(text) });
    } catch {}
  }
  if (/-----BEGIN ([A-Z]+ )?PRIVATE KEY-----/.test(text)) add({ type: "Private key", tool: "/validators/cert-decoder", toolName: "Certificate Decoder", preview: "A private key — keep it secret. Open the Certificate Decoder to check it matches a certificate." });
  // JWT
  if (/^[\w-]+\.[\w-]+\.[\w-]*$/.test(text)) {
    try {
      const [h, p] = text.split(".");
      const header = JSON.parse(b64decode(h));
      const payload = JSON.parse(b64decode(p));
      const times = ["iat", "nbf", "exp"].filter((k) => typeof payload[k] === "number")
        .map((k) => `${k}: ${fmtDate(new Date(payload[k] * 1000))}${k === "exp" ? (payload.exp * 1000 < Date.now() ? "  (expired)" : "  (still valid)") : ""}`);
      add({ type: "JWT token", tool: "/encoders-decoders/jwt", toolName: "JWT Decoder", text,
        preview: `Algorithm: ${header.alg || "?"}\n\n${JSON.stringify(payload, null, 2)}${times.length ? "\n\n" + times.join("\n") : ""}` });
    } catch {}
  }
  // JSON
  const json = /^[[{]/.test(text) ? tryJson(text) : undefined;
  if (json !== undefined) {
    add({ type: "JSON", tool: "/formatters/json", toolName: "JSON Formatter", text, preview: JSON.stringify(json, null, 2) });
    add({ type: "JSON → YAML", tool: "/converters/json-yaml", toolName: "Json <> Yaml", text, mode: "json2yaml", preview: yaml.dump(json) });
  }
  // YAML (several "key: value" lines, not JSON)
  if (json === undefined && /^[\w"' -]+:\s/m.test(text) && text.includes("\n")) {
    try {
      const y = yaml.load(text);
      if (y && typeof y === "object") add({ type: "YAML", tool: "/converters/json-yaml", toolName: "Json <> Yaml", text, mode: "yaml2json", preview: JSON.stringify(y, null, 2) });
    } catch {}
  }
  // Timestamps
  if (/^\d{9,13}$/.test(text)) {
    const n = Number(text);
    const ms = text.length >= 12 ? n : n * 1000;
    add({ type: `Unix timestamp (${text.length >= 12 ? "milliseconds" : "seconds"})`, tool: "/converters/timestamp", toolName: "Date & Time", text,
      preview: `${fmtDate(new Date(ms))}\nUTC: ${new Date(ms).toISOString()}` });
  } else if (/^\d{4}-\d{2}-\d{2}([T ][\d:.]+)?(Z|[+-]\d{2}:?\d{2})?$/.test(text) && !isNaN(Date.parse(text))) {
    const d = new Date(text);
    add({ type: "Date", tool: "/converters/timestamp", toolName: "Date & Time", text, preview: `${fmtDate(d)}\nUnix seconds: ${Math.floor(d / 1000)}` });
  }
  // UUID
  const uuid = text.match(/^[0-9a-f]{8}-[0-9a-f]{4}-([0-9a-f])[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  if (uuid) add({ type: "UUID", tool: "/generators/uuid", toolName: "UUID Generator", preview: `A version ${uuid[1]} UUID${uuid[1] === "4" ? " (random)" : uuid[1] === "1" ? " (time-based)" : ""}.` });
  // Colour
  const color = parseColor(text);
  if (color) add({ type: "Colour", tool: "/converters/color", toolName: "Color Converter", text, swatch: toHex(color), preview: `${toHex(color)}\n${toRgb(color)}\n${toHsl(color)}` });
  // Hash-looking hex
  const hashLen = { 32: "MD5", 40: "SHA-1", 64: "SHA-256", 128: "SHA-512" }[text.length];
  if (hashLen && /^[0-9a-f]+$/i.test(text)) add({ type: "Hash", tool: "/generators/hash", toolName: "Hash Generator", preview: `Looks like a ${hashLen} hash. Hashes can’t be turned back into text, but you can make one to compare.` });
  // URL
  if (/^https?:\/\/\S+$/i.test(text)) {
    try {
      const u = new URL(text);
      const params = [...u.searchParams].map(([k, v]) => `  ${k} = ${v}`).join("\n");
      add({ type: "Web address", tool: "/encoders-decoders/url", toolName: "URL Encoder / Decoder", text, mode: "decode",
        preview: `Site: ${u.host}\nPath: ${decodeURIComponent(u.pathname)}${params ? "\nParameters:\n" + params : ""}${u.hash ? "\nAnchor: " + u.hash : ""}` });
    } catch {}
  } else if (/%[0-9a-f]{2}/i.test(text)) {
    try { add({ type: "URL-encoded text", tool: "/encoders-decoders/url", toolName: "URL Encoder / Decoder", text, mode: "decode", preview: decodeURIComponent(text.replace(/\+/g, " ")) }); } catch {}
  }
  // HTML entities
  if (/&(#\d+|#x[0-9a-f]+|[a-z]+);/i.test(text)) add({ type: "HTML entities", tool: "/encoders-decoders/html", toolName: "HTML Encoder / Decoder", text, mode: "decode", preview: htmlDecode(text) });
  // Base64
  if (!uuid && !hashLen && text.length >= 8 && /^[A-Za-z0-9+/_-]+={0,2}$/.test(text) && !/^\d+$/.test(text)) {
    try {
      const dec = b64decode(text);
      if (isPrintable(dec)) {
        const inner = tryJson(dec);
        add({ type: "Base64", tool: "/encoders-decoders/base64", toolName: "Base 64 Encoder / Decoder", text, mode: "decode", preview: inner !== undefined ? JSON.stringify(inner, null, 2) : dec });
      }
    } catch {}
  }
  // Numbers in other bases
  const num = text.match(/^(0x[0-9a-f]+|0b[01]+|0o[0-7]+|\d{1,8})$/i);
  if (num) {
    try {
      const n = BigInt(text);
      add({ type: "Number", tool: "/converters/number-base", toolName: "Number Base", text: n.toString(),
        preview: `Decimal: ${n}\nHex: ${n.toString(16).toUpperCase()}\nBinary: ${n.toString(2)}\nOctal: ${n.toString(8)}` });
    } catch {}
  }
  // DevOps: IP ranges, docker run, curl, .env files, version ranges
  if (/^\d+\.\d+\.\d+\.\d+(\/\d{1,2})?$/.test(text)) {
    try { const c = parseCidr(text); add({ type: text.includes("/") ? "IP range (CIDR)" : "IP address", tool: "/calculators/cidr", toolName: "CIDR Calculator", text, preview: `${c.kind}\nRange: ${c.usable.toLocaleString()} usable addresses` }); } catch {}
  }
  if (/^(sudo\s+)?(docker|podman)\s+(container\s+)?run\s/.test(text)) {
    try { add({ type: "docker run command", tool: "/converters/docker-compose", toolName: "docker run → Compose", text, preview: dockerRunToCompose(text).yaml }); } catch {}
  }
  if (/^curl\s/.test(text)) {
    try { const r = parseCurl(text); add({ type: "curl command", tool: "/converters/curl", toolName: "curl to Code", text, preview: `${r.method} ${r.url}${r.headers.length ? "\n" + r.headers.map(([k, v]) => `${k}: ${v}`).join("\n") : ""}` }); } catch {}
  }
  if (text.includes("\n") && json === undefined) {
    const env = parseDotenv(text);
    if (env.vars.length >= 2 && !env.problems.some((p) => p.startsWith("Line"))) add({ type: `.env file (${env.vars.length} variables)`, tool: "/converters/env", toolName: ".env Converter", text, preview: JSON.stringify(Object.fromEntries(env.vars.map((v) => [v.key, v.value])), null, 2) });
  }
  if (/^(\^|~|>=|<=|>|<)\s*v?\d+(\.\d+){0,2}/.test(text)) add({ type: "Version range", tool: "/calculators/semver", toolName: "Version Range Checker", text, preview: "Check which versions this range allows." });
  // Image data address
  if (/^data:image\/[\w.+-]+;base64,/.test(text)) add({ type: "Image (Base64)", tool: "/encoders-decoders/image-base64", toolName: "Image <> Base64", text, preview: `An image of about ${Math.round(text.length * 0.75 / 1024)} KB, stored as text. Open it to see the picture.` });
  // SQL query
  if (/^(select|insert|update|delete|create|alter|drop|with)\s/i.test(text)) {
    let preview = text;
    try { if (sqlLib) preview = sqlLib.format(text); } catch {}
    add({ type: "SQL query", tool: "/formatters/sql", toolName: "SQL Formatter", text, preview });
  }
  // XML
  if (/^<(\?xml|[A-Za-z][\w:.-]*[\s>/])/.test(text) && typeof DOMParser !== "undefined") {
    try { add({ type: "XML", tool: "/formatters/xml", toolName: "XML Formatter", text, preview: formatXml(text) }); } catch {}
  }
  // Cron schedule
  if (/^(@\w+|([\d*/,A-Za-z-]+\s+){4}[\d*/,A-Za-z-]+)$/.test(text) && !/^[a-z]+(\s+[a-z]+){4}$/i.test(text)) {
    try { add({ type: "Cron schedule", tool: "/converters/cron", toolName: "Cron Explainer", text, preview: describeCron(parseCron(text)) }); } catch {}
  }
  // File permissions and HTTP status codes (three digits)
  if (/^[0-7]{3}$/.test(text)) add({ type: "File permission", tool: "/converters/chmod", toolName: "chmod Calculator", text, preview: `chmod ${text}` });
  if (/^[1-5]\d\d$/.test(text)) add({ type: "Maybe an HTTP status", tool: "/reference/http-status", toolName: "HTTP Status Codes", text, preview: `Look up what status ${text} means.` });
  // CSV (several lines with the same number of commas)
  if (text.includes("\n") && text.includes(",") && json === undefined) {
    const rows = parseCsv(text);
    if (rows.length > 1 && rows[0].length > 1 && rows.every((r) => r.length === rows[0].length)) {
      add({ type: `CSV table (${rows.length - 1} rows)`, tool: "/converters/csv-json", toolName: "CSV <> JSON", text, preview: csvToJson(rows.slice(0, 4).map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\n")) + (rows.length > 4 ? "\n…" : "") });
    }
  }
  // SSH public keys, ULIDs, TOML, Kubernetes and compose files, nginx configs
  if (/^(ssh-(ed25519|rsa|dss)|ecdsa-sha2-nistp\d+|sk-\S+)\s+AAAA[\w+/=]+/.test(text)) add({ type: "SSH public key", tool: "/generators/ssh-key", toolName: "SSH Key Generator", text, preview: `${text.split(/\s+/)[0]} key${text.split(/\s+/)[2] ? ` for ${text.split(/\s+/).slice(2).join(" ")}` : ""}. Open it to see its fingerprint.` });
  if (/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/i.test(text) && !/^\d+$/.test(text)) add({ type: "ULID", tool: "/generators/ulid", toolName: "ULID Generator", preview: "A sortable ID with its creation time inside — open the ULID tool to read it." });
  if (/^\s*\[[\w.-]+\]\s*$/m.test(text) && /^\s*[\w.-]+\s*=\s*\S/m.test(text) && json === undefined) {
    try { add({ type: "TOML", tool: "/converters/toml", toolName: "TOML Converter", text, mode: "toml2json", preview: JSON.stringify(tomlParse(text), null, 2) }); } catch {}
  }
  if (/^kind:\s*Config\s*$/m.test(text) && /^clusters:/m.test(text)) add({ type: "kubeconfig", tool: "/validators/kubeconfig", toolName: "Kubeconfig Inspector", text, preview: "A Kubernetes login file — open it to see contexts, clusters and certificate expiry (it stays on your device)." });
  else if (/^apiVersion:\s*\S+/m.test(text) && /^kind:\s*\w+/m.test(text)) add({ type: "Kubernetes YAML", tool: "/validators/k8s-validator", toolName: "Kubernetes Validator", text, preview: `Kubernetes ${[...text.matchAll(/^kind:\s*(\w+)/gm)].map((m) => m[1]).join(", ")} — open the validator to check it.` });
  if (/^services:\s*$/m.test(text) && /^\s+(image|build):/m.test(text)) add({ type: "Docker Compose file", tool: "/validators/compose-validator", toolName: "Compose Validator", text, preview: "A compose file — open the validator to check it for mistakes." });
  if (/^\s*(server|http|events|location\s+\S+)\s*\{/m.test(text) && /;\s*$/m.test(text)) add({ type: "nginx config", tool: "/formatters/nginx", toolName: "NGINX Formatter", text, preview: "An nginx configuration — open the formatter to tidy it." });
  // Anything else: plain text stats
  if (!out.length) {
    const words = (text.match(/\S+/g) || []).length;
    add({ type: "Plain text", tool: "/text/inspector", toolName: "Text Inspector", text: raw,
      preview: `${[...raw].length} characters · ${words} words · ${raw.split(/\r?\n/).length} lines` });
  }
  return out;
}

export function SmartPaste() {
  const [text, setText] = useState(() => takeHandoff(""));
  const [sqlReady, setSqlReady] = useState(!!sqlLib);
  const looksSql = /^\s*(select|insert|update|delete|create|alter|drop|with)\s/i.test(text);
  useEffect(() => { if (looksSql && !sqlReady) warmSql().then(() => setSqlReady(true)); }, [looksSql, sqlReady]);
  const found = useMemo(() => detect(text), [text, sqlReady]); // eslint-disable-line react-hooks/exhaustive-deps
  const open = (f) => { if (f.text !== undefined) sendTo(f.tool, f.text, f.mode ? { mode: f.mode } : {}); navigate(f.tool); };
  const samples = [
    ["A token", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTQyIiwibmFtZSI6IkFsZXgiLCJpYXQiOjE3MzAwMDAwMDAsImV4cCI6MTk5OTk5OTk5OX0.c2lnbmF0dXJl"],
    ["A timestamp", "1730000000"],
    ["Base64", "eyJoZWxsbyI6IndvcmxkIn0="],
    ["A colour", "#3b82f6"],
    ["A link", "https://shop.example.com/search?q=red%20shoes&size=42"],
  ];
  return (
    <>
      <div className="panel smart-input">
        <div className="panel-head">
          <span className="panel-label">Paste anything</span>
          <div className="panel-actions">
            <PasteButton onPaste={setText} />
            <button className="btn ghost" onClick={() => setText("")} disabled={!text}><Trash2 size={16} /> Clear</button>
          </div>
        </div>
        <textarea
          className="field mono"
          rows={6}
          value={text}
          spellCheck={false}
          autoFocus
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste a token, JSON, a timestamp, a link, Base64, a colour, a number… and see what it is."
        />
        <div className="options-row">
          <span className="muted small">Try one:</span>
          {samples.map(([label, v]) => <button key={label} className="chip" onClick={() => setText(v)}>{label}</button>)}
        </div>
      </div>
      {text.trim() && (
        <div className="findings">
          <span className="panel-label">What we found ({found.length})</span>
          {found.map((f, i) => (
            <div className="finding" key={i}>
              <div className="finding-head">
                <span className="badge">{f.type}</span>
                {f.swatch && <span className="swatch-dot" style={{ background: f.swatch }} />}
                <div className="panel-actions">
                  <CopyButton value={f.preview} />
                  <button className="btn" onClick={() => open(f)}><ExternalLink size={15} /> Open in {f.toolName}</button>
                </div>
              </div>
              <pre className="field mono finding-body">{f.preview}</pre>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ======================================================================
   Tool Chain: run several steps in a row
   ====================================================================== */
async function sha256(t) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const lines = (t) => t.split(/\r?\n/);
const caseFn = (name) => CASES.find(([n]) => n === name)[1];

export const OPS = {
  "b64-decode": ["Base64 decode", b64decode],
  "b64-encode": ["Base64 encode", b64encode],
  "url-decode": ["URL decode", (t) => decodeURIComponent(t.replace(/\+/g, " "))],
  "url-encode": ["URL encode", encodeURIComponent],
  "html-decode": ["HTML decode", htmlDecode],
  "html-encode": ["HTML encode", htmlEncode],
  "jwt-payload": ["JWT → payload", (t) => b64decode(t.trim().split(".")[1] || "")],
  "json-format": ["Format JSON", (t) => JSON.stringify(JSON.parse(t), null, 2)],
  "json-minify": ["Minify JSON", (t) => JSON.stringify(JSON.parse(t))],
  "json-yaml": ["JSON → YAML", (t) => yaml.dump(JSON.parse(t))],
  "yaml-json": ["YAML → JSON", (t) => JSON.stringify(yaml.load(t), null, 2)],
  "upper": ["UPPER CASE", caseFn("UPPER CASE")],
  "lower": ["lower case", caseFn("lower case")],
  "title": ["Title Case", caseFn("Title Case")],
  "camel": ["camelCase", caseFn("camelCase")],
  "snake": ["snake_case", caseFn("snake_case")],
  "kebab": ["kebab-case", caseFn("kebab-case")],
  "trim": ["Trim spaces", (t) => lines(t).map((l) => l.trim()).join("\n").trim()],
  "no-empty": ["Remove empty lines", (t) => lines(t).filter((l) => l.trim()).join("\n")],
  "sort": ["Sort lines A→Z", (t) => lines(t).sort((a, b) => a.localeCompare(b)).join("\n")],
  "unique": ["Remove duplicate lines", (t) => [...new Set(lines(t))].join("\n")],
  "reverse-lines": ["Reverse line order", (t) => lines(t).reverse().join("\n")],
  "number-lines": ["Number the lines", (t) => lines(t).map((l, i) => `${i + 1}. ${l}`).join("\n")],
  "extract-urls": ["Pull out web links", (t) => (t.match(/https?:\/\/[^\s"'<>)]+/g) || []).join("\n")],
  "extract-emails": ["Pull out email addresses", (t) => (t.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) || []).join("\n")],
  "md5": ["MD5 hash", (t) => md5(t)],
  "sha256": ["SHA-256 hash", sha256],
  "csv-json": ["CSV → JSON", (t) => csvToJson(t)],
  "json-csv": ["JSON → CSV", (t) => jsonToCsv(t)],
  "sql-format": ["Format SQL", async (t) => (await warmSql()).format(t)],
  "xml-format": ["Format XML", (t) => formatXml(t)],
  "escape-json": ["Escape for JSON string", ESCAPES[0][1]],
  "escape-sql": ["Escape for SQL string", ESCAPES[3][1]],
  "escape-regex": ["Escape for regex", ESCAPES[2][1]],
};

const RECIPES = [
  ["Read a JWT", ["jwt-payload", "json-format"], "eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyIjoiYWxleCIsInJvbGUiOiJhZG1pbiJ9.sig"],
  ["Base64 → tidy JSON", ["b64-decode", "json-format"], "eyJoZWxsbyI6IndvcmxkIiwibGlzdCI6WzEsMiwzXX0="],
  ["Clean up a list", ["trim", "no-empty", "unique", "sort"], "banana\n apple\n\ncherry\napple \nbanana"],
  ["Make a URL slug", ["trim", "kebab"], "  My Great Blog Post! 2025  "],
  ["JSON → Base64", ["json-minify", "b64-encode"], '{\n  "id": 7,\n  "ok": true\n}'],
  ["Find all links", ["extract-urls", "unique"], "See https://a.example.com and https://b.example.org/docs, or https://a.example.com again."],
];

const CHAIN_KEY = "aurora-chain";

export function ChainTool() {
  const saved = (() => { try { return JSON.parse(localStorage.getItem(CHAIN_KEY) || "null"); } catch { return null; } })();
  const [input, setInput] = useState(() => takeHandoff(saved?.input ?? RECIPES[0][2]));
  const [steps, setSteps] = useState(saved?.steps ?? RECIPES[0][1]);
  const [results, setResults] = useState([]);
  const [adding, setAdding] = useState("b64-decode");

  useEffect(() => { try { localStorage.setItem(CHAIN_KEY, JSON.stringify({ input, steps })); } catch {} }, [input, steps]);
  useEffect(() => {
    let live = true;
    (async () => {
      const res = [];
      let cur = input;
      for (const id of steps) {
        if (cur === null) { res.push({ skipped: true }); continue; }
        try { cur = await OPS[id][1](cur); res.push({ out: String(cur) }); }
        catch (e) { res.push({ err: e.message || "This step couldn’t run on that text." }); cur = null; }
      }
      if (live) setResults(res);
    })();
    return () => { live = false; };
  }, [input, steps]);

  const move = (i, d) => setSteps((s) => { const n = [...s]; [n[i], n[i + d]] = [n[i + d], n[i]]; return n; });
  const finalRes = results[results.length - 1];
  const output = !steps.length ? input : finalRes?.out ?? "";

  return (
    <>
      <Options>
        <span className="muted small">Ready-made recipes:</span>
        {RECIPES.map(([name, s, sample]) => (
          <button key={name} className="chip" onClick={() => { setSteps(s); setInput(sample); }}>{name}</button>
        ))}
      </Options>
      <Panel label="Start with" value={input} onChange={setInput} rows={5} />
      <ol className="chain">
        {steps.map((id, i) => {
          const r = results[i] || {};
          return (
            <li key={i} className={`chain-step ${r.err ? "bad" : ""}`}>
              <span className="step-no">{i + 1}</span>
              <div className="step-main">
                <select className="field step-select" value={id} onChange={(e) => setSteps((s) => s.map((x, j) => (j === i ? e.target.value : x)))} aria-label={`Step ${i + 1}`}>
                  {Object.entries(OPS).map(([k, [n]]) => <option key={k} value={k}>{n}</option>)}
                </select>
                <div className="step-peek">{r.err ? `⚠ ${r.err}` : r.skipped ? "Skipped (an earlier step failed)" : (r.out ?? "…").slice(0, 160) || "(empty)"}</div>
              </div>
              <div className="step-actions">
                <button className="btn ghost" disabled={i === 0} onClick={() => move(i, -1)} title="Move up"><ArrowUp size={15} /><span className="sr-only">Move up</span></button>
                <button className="btn ghost" disabled={i === steps.length - 1} onClick={() => move(i, 1)} title="Move down"><ArrowDown size={15} /><span className="sr-only">Move down</span></button>
                <button className="btn ghost" onClick={() => setSteps((s) => s.filter((_, j) => j !== i))} title="Remove step"><Trash2 size={15} /><span className="sr-only">Remove step</span></button>
              </div>
            </li>
          );
        })}
        <li className="chain-add">
          <select className="field step-select" value={adding} onChange={(e) => setAdding(e.target.value)} aria-label="Step to add">
            {Object.entries(OPS).map(([k, [n]]) => <option key={k} value={k}>{n}</option>)}
          </select>
          <button className="btn primary" onClick={() => setSteps((s) => [...s, adding])}><Plus size={16} /> Add step</button>
        </li>
      </ol>
      <Panel label="Result" value={output} readOnly rows={8} error={finalRes?.err || (finalRes?.skipped ? "An earlier step failed — check the steps above." : "")} />
    </>
  );
}

/* ======================================================================
   Date & Timestamp
   ====================================================================== */
const ZONES = ["local", "UTC", "America/New_York", "America/Los_Angeles", "Europe/London", "Europe/Berlin", "Asia/Bangkok", "Asia/Singapore", "Asia/Tokyo", "Australia/Sydney"];

function parseWhen(s) {
  const t = s.trim();
  if (!t) return null;
  if (/^-?\d+(\.\d+)?$/.test(t)) { const n = Number(t); return new Date(Math.abs(n) >= 1e11 ? n : n * 1000); }
  const d = new Date(t);
  return isNaN(d) ? undefined : d;
}

function relative(d) {
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const sec = Math.round((d - Date.now()) / 1000);
  const units = [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60], ["second", 1]];
  for (const [u, s] of units) if (Math.abs(sec) >= s || u === "second") return rtf.format(Math.round(sec / s), u);
}

export function TimestampTool() {
  const [value, setValue] = useState(() => takeHandoff(String(Math.floor(Date.now() / 1000))));
  const [zone, setZone] = useState("local");
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const d = parseWhen(value);
  const tz = zone === "local" ? undefined : zone;
  const rows = d ? [
    ["Unix seconds", String(Math.floor(d / 1000))],
    ["Unix milliseconds", String(d.getTime())],
    ["ISO 8601 (UTC)", d.toISOString()],
    ["Readable", d.toLocaleString(undefined, { dateStyle: "full", timeStyle: "long", timeZone: tz })],
    ["RFC 2822", d.toUTCString()],
    ["Relative", relative(d)],
  ] : [];
  return (
    <>
      <Options>
        <button className="btn primary" onClick={() => setValue(String(Math.floor(Date.now() / 1000)))}><RefreshCw size={16} /> Now</button>
        <label className="check">Time zone
          <select className="field small wide" value={zone} onChange={(e) => setZone(e.target.value)}>
            {ZONES.map((z) => <option key={z} value={z}>{z === "local" ? "My time zone" : z.replace("_", " ")}</option>)}
          </select>
        </label>
        <span className="muted small live-clock">Right now: <code>{Math.floor(now / 1000)}</code></span>
      </Options>
      <div className="panel">
        <span className="panel-label">Timestamp or date</span>
        <input className={`field mono ${d === undefined ? "has-error" : ""}`} value={value} onChange={(e) => setValue(e.target.value)} placeholder="1730000000, 1730000000000 or 2025-01-31 14:30" />
        {d === undefined && <p className="error">We couldn’t read that date. Try a number like 1730000000 or a date like 2025-01-31 14:30.</p>}
      </div>
      <div className="result-list">
        {rows.map(([k, v]) => <div className="result" key={k}><span className="panel-label">{k}</span><code>{v}</code><CopyButton value={v} /></div>)}
      </div>
    </>
  );
}

/* ======================================================================
   Colour converter
   ====================================================================== */
export function parseColor(s) {
  const t = s.trim().toLowerCase();
  // "#abc" / "#aabbcc"; without "#" only 6 characters with a letter in them (so 755 stays a number)
  let m = t.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/) || (/[a-f]/.test(t) ? t.match(/^([0-9a-f]{6})$/) : null);
  if (m) { let h = m[1]; if (h.length === 3) h = [...h].map((c) => c + c).join(""); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); }
  m = t.match(/^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/);
  if (m) return m.slice(1, 4).map((v) => Math.min(255, Number(v)));
  m = t.match(/^hsla?\(\s*(\d{1,3}(?:\.\d+)?)(?:deg)?[\s,]+(\d{1,3}(?:\.\d+)?)%[\s,]+(\d{1,3}(?:\.\d+)?)%/);
  if (m) return hslToRgb(Number(m[1]), Number(m[2]), Number(m[3]));
  return null;
}
function hslToRgb(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)].map((v) => Math.round(v * 255));
}
function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
}
const toHex = (c) => "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
const toRgb = (c) => `rgb(${c.join(", ")})`;
const toHsl = (c) => { const [h, s, l] = rgbToHsl(c); return `hsl(${h}, ${s}%, ${l}%)`; };
const lum = (c) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

export function ColorTool() {
  const [value, setValue] = useState(() => takeHandoff("#3b82f6"));
  const c = parseColor(value);
  const [h, s] = c ? rgbToHsl(c) : [0, 0];
  const shades = c ? [92, 82, 70, 58, 46, 36, 26, 16].map((l) => toHex(hslToRgb(h, s, l))) : [];
  return (
    <>
      <div className="panel color-input">
        <span className="panel-label">Colour</span>
        <div className="options-row">
          <input type="color" className="color-pick" value={c ? toHex(c) : "#000000"} onChange={(e) => setValue(e.target.value)} aria-label="Pick a colour" />
          <input className={`field mono grow-field ${c ? "" : "has-error"}`} value={value} onChange={(e) => setValue(e.target.value)} placeholder="#3b82f6, rgb(59,130,246) or hsl(217, 91%, 60%)" />
        </div>
        {!c && <p className="error">Try a colour like #3b82f6, rgb(59, 130, 246) or hsl(217, 91%, 60%).</p>}
      </div>
      {c && (
        <>
          <div className="color-hero" style={{ background: toHex(c) }}>
            <span style={{ color: "#fff" }}>White text {contrast(c, [255, 255, 255]).toFixed(1)}:1 {contrast(c, [255, 255, 255]) >= 4.5 ? "✓ easy to read" : "✗ hard to read"}</span>
            <span style={{ color: "#000" }}>Black text {contrast(c, [0, 0, 0]).toFixed(1)}:1 {contrast(c, [0, 0, 0]) >= 4.5 ? "✓ easy to read" : "✗ hard to read"}</span>
          </div>
          <div className="result-list">
            {[["HEX", toHex(c)], ["RGB", toRgb(c)], ["HSL", toHsl(c)], ["CSS variable", `--brand: ${toHex(c)};`]].map(([k, v]) => (
              <div className="result" key={k}><span className="panel-label">{k}</span><code>{v}</code><CopyButton value={v} /></div>
            ))}
          </div>
          <div className="panel">
            <span className="panel-label">Lighter and darker shades (click one to use it)</span>
            <div className="shades">{shades.map((x) => <button key={x} style={{ background: x }} title={x} onClick={() => setValue(x)}><span>{x}</span></button>)}</div>
          </div>
        </>
      )}
    </>
  );
}

/* ======================================================================
   Password generator
   ====================================================================== */
const WORDS = "apple river tiger cloud piano lemon rocket candle forest orbit maple pepper silver garden marble thunder violet harbor pixel cactus breeze copper meadow falcon velvet comet anchor willow ember lantern puzzle saddle walnut glacier honey jungle kettle ladder magnet nectar oyster pebble quartz raven sunset tulip umbrella vapor wizard yogurt zebra bamboo crystal dolphin eagle fossil guitar hammock island jacket koala lobster mango noodle olive panda quiver rhino sparrow tornado unicorn volcano waffle yacht blossom canyon dragon echo feather galaxy horizon igloo jigsaw kayak lagoon mosaic nebula orchid parrot quilt ribbon summit trumpet urchin vortex whistle zephyr".split(" ");
const SETS = { lower: "abcdefghijkmnopqrstuvwxyz", upper: "ABCDEFGHJKLMNPQRSTUVWXYZ", digits: "23456789", symbols: "!@#$%^&*()-_=+[]{};:,.?" };
const SIMILAR = { lower: "l", upper: "IO", digits: "01" };
const pick = (n) => { const r = new Uint32Array(1); const lim = Math.floor(0x100000000 / n) * n; let x; do { crypto.getRandomValues(r); x = r[0]; } while (x >= lim); return x % n; };

export function PasswordTool() {
  const [mode, setMode] = useState("password");
  const [len, setLen] = useState(20);
  const [words, setWords] = useState(4);
  const [opts, setOpts] = useState({ lower: true, upper: true, digits: true, symbols: true, similar: false });
  const [sep, setSep] = useState("-");
  const [list, setList] = useState([]);
  const pool = Object.keys(SETS).filter((k) => opts[k]).map((k) => SETS[k] + (opts.similar ? SIMILAR[k] || "" : "")).join("") || SETS.lower;
  const bits = mode === "password" ? len * Math.log2(pool.length) : words * Math.log2(WORDS.length) + Math.log2(10);
  const strength = bits < 40 ? ["Weak", "weak"] : bits < 60 ? ["Okay", "ok"] : bits < 80 ? ["Strong", "strong"] : ["Very strong", "great"];
  const make = () => mode === "password"
    ? Array.from({ length: len }, () => pool[pick(pool.length)]).join("")
    : Array.from({ length: words }, () => { const w = WORDS[pick(WORDS.length)]; return w[0].toUpperCase() + w.slice(1); }).join(sep) + sep + pick(10);
  const generate = () => setList(Array.from({ length: 5 }, make));
  useEffect(generate, [mode, len, words, sep, JSON.stringify(opts)]); // eslint-disable-line
  const toggle = (k) => setOpts((o) => ({ ...o, [k]: !o[k] }));
  return (
    <>
      <Options>
        <Segmented label="Kind" value={mode} onChange={setMode} options={[["password", "Password"], ["passphrase", "Passphrase (easy to remember)"]]} />
        <button className="btn primary" onClick={generate}><RefreshCw size={16} /> New ones</button>
      </Options>
      <div className="panel">
        {mode === "password" ? (
          <>
            <label className="range-row"><span>Length: <strong>{len}</strong></span><input type="range" min="8" max="64" value={len} onChange={(e) => setLen(Number(e.target.value))} /></label>
            <div className="options-row">
              {[["lower", "abc"], ["upper", "ABC"], ["digits", "123"], ["symbols", "#$&"]].map(([k, l]) => (
                <label key={k} className="check"><input type="checkbox" checked={opts[k]} onChange={() => toggle(k)} /> {l}</label>
              ))}
              <label className="check"><input type="checkbox" checked={opts.similar} onChange={() => toggle("similar")} /> Allow look-alikes (l, 1, O, 0)</label>
            </div>
          </>
        ) : (
          <>
            <label className="range-row"><span>Words: <strong>{words}</strong></span><input type="range" min="3" max="8" value={words} onChange={(e) => setWords(Number(e.target.value))} /></label>
            <Segmented label="Separator" value={sep} onChange={setSep} options={[["-", "dash -"], [".", "dot ."], ["_", "under _"], [" ", "space"]]} />
          </>
        )}
        <div className={`meter ${strength[1]}`}><span style={{ width: `${Math.min(100, bits)}%` }} /></div>
        <span className="muted small">{strength[0]} · about {Math.round(bits)} bits of randomness · made on your device, never sent anywhere</span>
      </div>
      <div className="result-list">
        {list.map((p, i) => <div className="result pw" key={i}><code>{p}</code><CopyButton value={p} /></div>)}
      </div>
    </>
  );
}

/* ======================================================================
   Regex tester
   ====================================================================== */
const SNIPPETS = [["Email", "[\\w.+-]+@[\\w-]+\\.[\\w.-]+"], ["Web link", "https?://[^\\s]+"], ["Number", "-?\\d+(\\.\\d+)?"], ["Date 2025-01-31", "\\d{4}-\\d{2}-\\d{2}"], ["Word", "\\b\\w+\\b"], ["Hex colour", "#[0-9a-fA-F]{3,6}\\b"]];

export function RegexTool() {
  const [pattern, setPattern] = useState("[\\w.+-]+@[\\w-]+\\.[\\w.-]+");
  const [flags, setFlags] = useState("g");
  const [text, setText] = useState(() => takeHandoff("Contact anna@example.com or support@help.example.org.\nNot an email: hello@ or @world"));
  const [replace, setReplace] = useState("");
  const { re, err } = useMemo(() => { try { return { re: new RegExp(pattern, flags.includes("g") ? flags : flags + "g") }; } catch (e) { return { err: e.message }; } }, [pattern, flags]);
  const matches = useMemo(() => (re && pattern ? [...text.matchAll(re)].slice(0, 500) : []), [re, text, pattern]);
  const pieces = useMemo(() => {
    if (!matches.length) return [text];
    const out = []; let last = 0;
    matches.forEach((m, i) => { if (m[0] === "") return; out.push(text.slice(last, m.index)); out.push(<mark key={i}>{m[0]}</mark>); last = m.index + m[0].length; });
    out.push(text.slice(last));
    return out;
  }, [matches, text]);
  const toggle = (f) => setFlags((s) => (s.includes(f) ? s.replace(f, "") : s + f));
  let replaced = "";
  try { replaced = re && replace !== "" ? text.replace(new RegExp(pattern, flags), replace) : ""; } catch {}
  return (
    <>
      <div className="panel">
        <span className="panel-label">Pattern</span>
        <div className="regex-row">
          <span className="slash">/</span>
          <input className={`field mono ${err ? "has-error" : ""}`} value={pattern} onChange={(e) => setPattern(e.target.value)} spellCheck={false} aria-label="Pattern" />
          <span className="slash">/{flags}</span>
        </div>
        {err && <p className="error">{err}</p>}
        <div className="options-row">
          {[["g", "All matches"], ["i", "Ignore case"], ["m", "Multi-line"], ["s", "Dot matches newline"]].map(([f, l]) => (
            <label key={f} className="check"><input type="checkbox" checked={flags.includes(f)} onChange={() => toggle(f)} /> {l}</label>
          ))}
        </div>
        <div className="options-row"><span className="muted small">Common patterns:</span>{SNIPPETS.map(([n, p]) => <button key={n} className="chip" onClick={() => setPattern(p)}>{n}</button>)}</div>
      </div>
      <Panel label="Test text" value={text} onChange={setText} rows={6} mono={false} />
      <div className="panel">
        <span className="panel-label">{matches.length} {matches.length === 1 ? "match" : "matches"}</span>
        <pre className="field regex-out">{pieces}</pre>
        {matches.some((m) => m.length > 1) && (
          <ol className="match-list">
            {matches.slice(0, 50).map((m, i) => <li key={i}><code>{m[0]}</code>{m.slice(1).map((g, j) => <span key={j} className="group">group {j + 1}: <code>{g ?? "—"}</code></span>)}</li>)}
          </ol>
        )}
      </div>
      <div className="panel">
        <span className="panel-label">Replace with (optional — use $1 for group 1)</span>
        <input className="field mono" value={replace} onChange={(e) => setReplace(e.target.value)} placeholder="e.g. [hidden]" />
        {replace !== "" && <pre className="field regex-out">{replaced}</pre>}
      </div>
    </>
  );
}

export const POWER_VIEWS = {
  "/power/smart-paste": SmartPaste,
  "/power/chain": ChainTool,
  "/converters/timestamp": TimestampTool,
  "/converters/color": ColorTool,
  "/generators/password": PasswordTool,
  "/text/regex": RegexTool,
};

