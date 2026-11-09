import { useEffect, useMemo, useRef, useState } from "react";
import { Send, Plug, Unplug, Trash2, Search, Globe } from "lucide-react";
import { Panel, Options, Segmented, CopyButton, b64encode } from "./tools.jsx";
import { takeHandoff } from "./handoff.js";
import { parseCurl } from "./devops.jsx";
import { Result, Table, fmtBytes } from "./shared.jsx";

const OUTSIDE = "This tool talks to the address you enter, so what you send leaves your device.";

/* ======================================================================
   HTTP request builder
   ====================================================================== */
const parseHeaders = (t) => t.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#") && l.includes(":")).map((l) => { const i = l.indexOf(":"); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; });
const shq = (s) => `'${s.replace(/'/g, "'\\''")}'`;

export function HttpTool() {
  const [method, setMethod] = useState("GET");
  const [url, setUrl] = useState("https://httpbin.org/anything?hello=world");
  const [headers, setHeaders] = useState("Accept: application/json");
  const [bodyType, setBodyType] = useState("json");
  const [body, setBody] = useState('{\n  "name": "DevDeck"\n}');
  const [auth, setAuth] = useState({ type: "none", token: "", user: "", pass: "" });
  const [timeout, setTimeoutS] = useState(30);
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [curlIn, setCurlIn] = useState(() => takeHandoff(""));
  const abort = useRef(null);
  const hasBody = !["GET", "HEAD"].includes(method) && bodyType !== "none";

  const allHeaders = useMemo(() => {
    const h = parseHeaders(headers);
    const has = (k) => h.some(([x]) => x.toLowerCase() === k);
    if (auth.type === "bearer" && auth.token) h.push(["Authorization", `Bearer ${auth.token}`]);
    if (auth.type === "basic" && (auth.user || auth.pass)) h.push(["Authorization", `Basic ${b64encode(`${auth.user}:${auth.pass}`)}`]);
    if (hasBody && !has("content-type")) h.push(["Content-Type", { json: "application/json", form: "application/x-www-form-urlencoded", text: "text/plain" }[bodyType]]);
    return h;
  }, [headers, auth, hasBody, bodyType]);

  const importCurl = (cmd) => {
    try {
      const r = parseCurl(cmd);
      setMethod(r.method); setUrl(r.url); setHeaders(r.headers.map(([k, v]) => `${k}: ${v}`).join("\n"));
      if (r.data) { setBody(r.data); setBodyType(/^\s*[[{]/.test(r.data) ? "json" : r.data.includes("=") ? "form" : "text"); } else setBodyType("none");
      setAuth({ type: "none", token: "", user: "", pass: "" });
    } catch { /* ignore incomplete commands */ }
  };
  useEffect(() => { if (curlIn.trim().startsWith("curl")) importCurl(curlIn); }, []); // eslint-disable-line

  const send = async () => {
    setBusy(true); setRes(null);
    const ctrl = new AbortController(); abort.current = ctrl;
    const timer = setTimeout(() => ctrl.abort("timeout"), timeout * 1000);
    const t0 = performance.now();
    try {
      const r = await fetch(url, { method, headers: allHeaders, body: hasBody ? body : undefined, signal: ctrl.signal, redirect: "follow" });
      const buf = new Uint8Array(await r.arrayBuffer());
      const ms = performance.now() - t0;
      const ct = r.headers.get("content-type") || "";
      let text = new TextDecoder().decode(buf);
      if (/json/.test(ct) || /^\s*[[{]/.test(text)) { try { text = JSON.stringify(JSON.parse(text), null, 2); } catch { /* not JSON after all */ } }
      setRes({ status: r.status, statusText: r.statusText, ok: r.ok, ms, size: buf.length, headers: [...r.headers], text, ct, redirected: r.redirected, finalUrl: r.url });
    } catch (e) {
      const ms = performance.now() - t0;
      setRes({ error: ctrl.signal.aborted ? (ctrl.signal.reason === "timeout" ? `No answer within ${timeout} seconds.` : "Stopped.") : "The browser couldn’t complete this request.", ms,
        hint: ctrl.signal.aborted ? "" : "Most often the server doesn’t allow requests from other websites (CORS), the address is wrong, or the server is down or uses an untrusted certificate. The same request usually works with curl — copy the command below." });
    }
    clearTimeout(timer); setBusy(false);
  };

  const curl = `curl${method !== "GET" ? ` -X ${method}` : ""} ${shq(url)}${allHeaders.map(([k, v]) => ` \\\n  -H ${shq(`${k}: ${v}`)}`).join("")}${hasBody ? ` \\\n  --data-raw ${shq(body)}` : ""}`;
  const fetchCode = `const res = await fetch(${JSON.stringify(url)}, {\n  method: ${JSON.stringify(method)},\n  headers: ${JSON.stringify(Object.fromEntries(allHeaders), null, 2).replace(/\n/g, "\n  ")},${hasBody ? `\n  body: ${bodyType === "json" ? `JSON.stringify(${body.trim()})` : JSON.stringify(body)},` : ""}\n});\nconst data = await res.${/json/i.test(allHeaders.find(([k]) => k.toLowerCase() === "accept")?.[1] || "json") ? "json" : "text"}();`;
  return (
    <>
      <div className="panel">
        <div className="request-line">
          <select className="field method" value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Method">{["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].map((m) => <option key={m}>{m}</option>)}</select>
          <input className="field mono grow-field" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://api.example.com/items" aria-label="Address" onKeyDown={(e) => { if (e.key === "Enter") send(); }} />
          {busy ? <button className="btn" onClick={() => abort.current?.abort()}>Stop</button> : <button className="btn primary" onClick={send} disabled={!/^https?:\/\//i.test(url)}><Send size={16} /> Send</button>}
        </div>
        <p className="muted small">{OUTSIDE}</p>
      </div>
      <div className="split">
        <div className="panel">
          <span className="panel-label">Headers (one per line, Name: value)</span>
          <textarea className="field mono" rows={5} value={headers} onChange={(e) => setHeaders(e.target.value)} spellCheck={false} />
          <span className="panel-label">Login</span>
          <div className="options-row">
            <Segmented label="Login" value={auth.type} onChange={(t) => setAuth((a) => ({ ...a, type: t }))} options={[["none", "None"], ["bearer", "Bearer token"], ["basic", "Username & password"]]} />
          </div>
          {auth.type === "bearer" && <input className="field mono" value={auth.token} onChange={(e) => setAuth((a) => ({ ...a, token: e.target.value }))} placeholder="Token" />}
          {auth.type === "basic" && <div className="options-row"><input className="field grow-field" value={auth.user} onChange={(e) => setAuth((a) => ({ ...a, user: e.target.value }))} placeholder="Username" /><input className="field grow-field" type="password" value={auth.pass} onChange={(e) => setAuth((a) => ({ ...a, pass: e.target.value }))} placeholder="Password" /></div>}
          <label className="check">Give up after <input className="field small" type="number" min="1" value={timeout} onChange={(e) => setTimeoutS(+e.target.value || 30)} /> seconds</label>
        </div>
        <div className="panel">
          <div className="panel-head"><span className="panel-label">Body</span><Segmented label="Body type" value={bodyType} onChange={setBodyType} options={[["none", "None"], ["json", "JSON"], ["form", "Form"], ["text", "Text"]]} /></div>
          <textarea className="field mono" rows={8} value={body} onChange={(e) => setBody(e.target.value)} disabled={!hasBody} spellCheck={false} placeholder={bodyType === "form" ? "name=Alex&age=30" : ""} />
          {!hasBody && ["GET", "HEAD"].includes(method) && <p className="muted small">{method} requests don’t send a body.</p>}
        </div>
      </div>
      {res && (res.error
        ? <div className="panel"><div className="big-answer"><span className="badge no-badge">Failed</span> {res.error} <span className="muted">· {Math.round(res.ms)} ms</span></div>{res.hint && <p className="muted small">{res.hint}</p>}</div>
        : <>
          <div className="big-answer"><span className={`badge ${res.ok ? "ok-badge" : res.status >= 400 ? "no-badge" : "warn-badge"}`}>{res.status} {res.statusText}</span> <span className="muted">{Math.round(res.ms)} ms · {fmtBytes(res.size)}{res.redirected ? ` · redirected to ${res.finalUrl}` : ""}</span></div>
          <div className="split">
            <Panel label={`Response body${res.ct ? ` (${res.ct.split(";")[0]})` : ""}`} value={res.text} readOnly rows={16} />
            <div className="panel"><span className="panel-label">Response headers ({res.headers.length})</span><Table head={["Header", "Value"]} rows={res.headers.map(([k, v]) => [<code key="k">{k}</code>, v])} />
              <p className="muted small">Browsers only show the headers the server allows; curl shows them all.</p></div>
          </div>
        </>)}
      <div className="split">
        <Panel label="As a curl command" value={curl} readOnly rows={6} />
        <Panel label="As JavaScript (fetch)" value={fetchCode} readOnly rows={6} />
      </div>
      <div className="panel">
        <span className="panel-label">Start from a curl command</span>
        <textarea className="field mono" rows={3} value={curlIn} onChange={(e) => { setCurlIn(e.target.value); importCurl(e.target.value); }} placeholder="curl -X POST https://api.example.com/items -H 'Content-Type: application/json' -d '{&quot;a&quot;:1}'" spellCheck={false} />
      </div>
    </>
  );
}

/* ======================================================================
   WebSocket client
   ====================================================================== */
export function WebSocketTool() {
  const [url, setUrl] = useState("wss://echo.websocket.org");
  const [protocols, setProtocols] = useState("");
  const [msg, setMsg] = useState('{"type":"hello","from":"DevDeck"}');
  const [log, setLog] = useState([]);
  const [state, setState] = useState("closed");
  const [pretty, setPretty] = useState(true);
  const ws = useRef(null);
  const add = (dir, text) => setLog((l) => [...l.slice(-499), { dir, text, at: new Date() }]);
  const connect = () => {
    try {
      const sock = new WebSocket(url, protocols.split(",").map((s) => s.trim()).filter(Boolean));
      ws.current = sock; setState("connecting"); add("info", `Connecting to ${url}…`);
      sock.onopen = () => { setState("open"); add("info", `Connected${sock.protocol ? ` (protocol ${sock.protocol})` : ""}`); };
      sock.onmessage = async (e) => add("in", typeof e.data === "string" ? e.data : `[binary, ${e.data.size ?? e.data.byteLength} bytes]`);
      sock.onerror = () => add("error", "Connection error (the browser doesn’t say more; check the address and that the server accepts this website).");
      sock.onclose = (e) => { setState("closed"); add("info", `Closed${e.code ? ` — code ${e.code}${e.reason ? `: ${e.reason}` : ""}` : ""}`); };
    } catch (e) { add("error", e.message); }
  };
  useEffect(() => () => ws.current?.close(), []);
  const send = () => { if (ws.current?.readyState === 1 && msg) { ws.current.send(msg); add("out", msg); } };
  const show = (t) => { if (!pretty) return t; try { return JSON.stringify(JSON.parse(t), null, 2); } catch { return t; } };
  return (
    <>
      <div className="panel">
        <div className="request-line">
          <input className="field mono grow-field" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="wss://example.com/socket" aria-label="WebSocket address" disabled={state !== "closed"} />
          <input className="field mono small wide-small" value={protocols} onChange={(e) => setProtocols(e.target.value)} placeholder="Protocols (optional)" aria-label="Sub-protocols" disabled={state !== "closed"} />
          {state === "closed" ? <button className="btn primary" onClick={connect} disabled={!/^wss?:\/\//i.test(url)}><Plug size={16} /> Connect</button> : <button className="btn" onClick={() => ws.current?.close()}><Unplug size={16} /> Disconnect</button>}
          <span className={`badge ${state === "open" ? "ok-badge" : state === "connecting" ? "warn-badge" : ""}`}>{state === "open" ? "Connected" : state === "connecting" ? "Connecting…" : "Not connected"}</span>
        </div>
        <p className="muted small">{OUTSIDE} Pages served over https can only connect to wss:// addresses.</p>
      </div>
      <div className="panel">
        <span className="panel-label">Message</span>
        <textarea className="field mono" rows={4} value={msg} onChange={(e) => setMsg(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(); }} spellCheck={false} />
        <div className="options-row"><button className="btn primary" onClick={send} disabled={state !== "open"}><Send size={16} /> Send</button><span className="muted small">Ctrl/⌘ + Enter sends</span></div>
      </div>
      <div className="panel">
        <div className="panel-head">
          <span className="panel-label">Messages ({log.filter((l) => l.dir !== "info").length})</span>
          <div className="panel-actions">
            <label className="check"><input type="checkbox" checked={pretty} onChange={(e) => setPretty(e.target.checked)} /> Format JSON</label>
            <CopyButton value={log.map((l) => `${l.at.toISOString()} ${l.dir.toUpperCase()} ${l.text}`).join("\n")} />
            <button className="btn ghost" onClick={() => setLog([])} disabled={!log.length}><Trash2 size={16} /> Clear</button>
          </div>
        </div>
        <ol className="ws-log">
          {log.map((l, i) => <li key={i} className={`ws-${l.dir}`}><span className="ws-meta">{l.dir === "in" ? "↓ received" : l.dir === "out" ? "↑ sent" : l.dir === "error" ? "⚠" : "•"} {l.at.toLocaleTimeString()}</span><pre>{show(l.text)}</pre></li>)}
          {!log.length && <li className="muted small">Connect, then send a message. The sample server echoes everything back.</li>}
        </ol>
      </div>
    </>
  );
}

/* ======================================================================
   DNS lookup (DNS-over-HTTPS)
   ====================================================================== */
const RR = { 1: "A", 2: "NS", 5: "CNAME", 6: "SOA", 12: "PTR", 15: "MX", 16: "TXT", 28: "AAAA", 33: "SRV", 35: "NAPTR", 43: "DS", 46: "RRSIG", 48: "DNSKEY", 64: "SVCB", 65: "HTTPS", 257: "CAA" };
const RCODE = { 0: "OK", 1: "Format error", 2: "Server failure", 3: "Name doesn’t exist (NXDOMAIN)", 5: "Refused" };
const PROVIDERS = { cloudflare: ["Cloudflare (1.1.1.1)", (n, t) => `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(n)}&type=${t}`], google: ["Google (8.8.8.8)", (n, t) => `https://dns.google/resolve?name=${encodeURIComponent(n)}&type=${t}`] };
const reverseName = (ip) => {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return ip.split(".").reverse().join(".") + ".in-addr.arpa";
  if (ip.includes(":")) {
    const [head, tail = ""] = ip.split("::");
    const h = head ? head.split(":") : [], t = tail ? tail.split(":") : [];
    const full = [...h, ...Array(8 - h.length - t.length).fill("0"), ...t].map((x) => x.padStart(4, "0")).join("");
    return [...full].reverse().join(".") + ".ip6.arpa";
  }
  return null;
};

export function DnsTool() {
  const [name, setName] = useState(() => takeHandoff("example.com"));
  const [type, setType] = useState("common");
  const [provider, setProvider] = useState("cloudflare");
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const lookup = async () => {
    const clean = name.trim().replace(/^https?:\/\//, "").replace(/[/?#].*$/, "").replace(/\.$/, "");
    if (!clean) return;
    const rev = reverseName(clean);
    const jobs = rev ? [[rev, "PTR"]] : type === "common" ? ["A", "AAAA", "CNAME", "MX", "NS", "TXT", "CAA", "SOA"].map((t) => [clean, t]).concat([[`_dmarc.${clean}`, "TXT"]]) : [[clean, type]];
    setBusy(true);
    const t0 = performance.now();
    try {
      const results = await Promise.all(jobs.map(async ([n, t]) => {
        const r = await fetch(PROVIDERS[provider][1](n, t), { headers: { accept: "application/dns-json" } });
        if (!r.ok) throw new Error(`The DNS service answered ${r.status}`);
        return { n, t, j: await r.json() };
      }));
      const rows = []; const seen = new Set(); let status = 0, ad = false;
      for (const { n, t, j } of results) {
        if (j.Status && j.Status !== 3) status = j.Status;
        if (j.Status === 3 && n === clean) status = 3;
        ad ||= j.AD;
        for (const a of j.Answer || []) {
          const k = `${a.name}|${a.type}|${a.data}`;
          if (seen.has(k) || (t === "TXT" && n.startsWith("_dmarc.") && !/v=DMARC1/i.test(a.data))) continue;
          seen.add(k); rows.push({ name: a.name.replace(/\.$/, ""), type: RR[a.type] || a.type, ttl: a.TTL, data: a.data.replace(/^"|"$/g, "").replace(/" "/g, "") });
        }
      }
      const order = ["A", "AAAA", "CNAME", "MX", "NS", "TXT", "CAA", "SOA", "PTR"];
      const rank = (t) => { const i = order.indexOf(t); return i < 0 ? 99 : i; };
      rows.sort((a, b) => rank(a.type) - rank(b.type));
      setRes({ rows, status, ad, ms: performance.now() - t0, name: clean });
    } catch (e) { setRes({ err: e.message || "The lookup failed — check your internet connection." }); }
    setBusy(false);
  };
  const spf = res?.rows?.find((r) => r.type === "TXT" && /^v=spf1/i.test(r.data));
  const dmarc = res?.rows?.find((r) => r.type === "TXT" && /^v=DMARC1/i.test(r.data));
  const mx = res?.rows?.filter((r) => r.type === "MX") || [];
  return (
    <>
      <div className="panel">
        <div className="request-line">
          <input className="field mono grow-field" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") lookup(); }} placeholder="example.com or an IP address" aria-label="Domain or IP" />
          <select className="field method" value={type} onChange={(e) => setType(e.target.value)} aria-label="Record type"><option value="common">All common</option>{["A", "AAAA", "CNAME", "MX", "NS", "TXT", "SOA", "SRV", "CAA", "PTR", "HTTPS", "DS", "DNSKEY"].map((t) => <option key={t}>{t}</option>)}</select>
          <button className="btn primary" onClick={lookup} disabled={busy}><Search size={16} /> {busy ? "Looking up…" : "Look up"}</button>
        </div>
        <div className="options-row"><Segmented label="DNS service" value={provider} onChange={setProvider} options={Object.entries(PROVIDERS).map(([k, [l]]) => [k, l])} /><span className="muted small">The name you look up is sent to this service (over HTTPS).</span></div>
      </div>
      {res?.err && <p className="error">{res.err}</p>}
      {res?.rows && <>
        <div className="big-answer">
          <span className={`badge ${res.status ? "no-badge" : "ok-badge"}`}>{RCODE[res.status] || `Status ${res.status}`}</span> {res.name}
          <span className="muted"> · {res.rows.length} records · {Math.round(res.ms)} ms{res.ad ? " · DNSSEC signed ✓" : ""}</span>
        </div>
        <Table head={["Type", "Name", "TTL", "Value"]} rows={res.rows.map((r) => [<span key="t" className="badge">{r.type}</span>, <code key="n">{r.name}</code>, `${r.ttl}s`, <code key="d" className="wrap-cell">{r.data}</code>])} empty="No records of this type." />
        {type === "common" && !reverseName(res.name) && (
          <div className="panel">
            <span className="panel-label">Email setup</span>
            <div className="result-list">
              <Result label="Mail servers (MX)" value={mx.length ? mx.map((m) => m.data).join(", ") : "None — this domain doesn’t receive email"} copy={false} />
              <Result label="SPF" value={spf ? spf.data : "Missing — anyone can pretend to send mail from this domain"} copy={false} />
              <Result label="DMARC" value={dmarc ? dmarc.data : "Missing — add a _dmarc TXT record"} copy={false} />
            </div>
          </div>
        )}
      </>}
      <div className="panel"><span className="panel-label">Same lookup in a terminal</span><Result label="dig" value={`dig ${reverseName(name.trim()) ? `-x ${name.trim()}` : `${name.trim() || "example.com"} ${type === "common" ? "ANY" : type}`} +noall +answer`} /><Result label="nslookup" value={`nslookup -type=${type === "common" ? "any" : type.toLowerCase()} ${name.trim() || "example.com"}`} /></div>
    </>
  );
}

/* ======================================================================
   Port checker (best effort from the browser) + port reference
   ====================================================================== */
// Ports that browsers refuse to connect to (the Fetch standard's "bad ports").
const BLOCKED = new Set([1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95, 101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137, 139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532, 540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669, 6697, 10080]);
export const PORTS = [
  [20, "FTP data"], [21, "FTP"], [22, "SSH / SFTP"], [23, "Telnet"], [25, "SMTP (mail between servers)"], [53, "DNS"], [67, "DHCP server"], [69, "TFTP"], [80, "HTTP"], [110, "POP3"], [123, "NTP (time)"], [135, "Windows RPC"], [139, "NetBIOS / SMB"],
  [143, "IMAP"], [161, "SNMP"], [389, "LDAP"], [443, "HTTPS"], [445, "SMB (Windows file sharing)"], [465, "SMTPS"], [514, "Syslog"], [587, "SMTP submission"], [636, "LDAPS"], [993, "IMAPS"], [995, "POP3S"], [1433, "Microsoft SQL Server"],
  [1521, "Oracle DB"], [1883, "MQTT"], [2049, "NFS"], [2375, "Docker API (unencrypted!)"], [2376, "Docker API (TLS)"], [2379, "etcd"], [3000, "Dev servers (Node, Grafana)"], [3306, "MySQL / MariaDB"], [3389, "Remote Desktop (RDP)"], [4222, "NATS"],
  [5000, "Dev servers (Flask, registry)"], [5432, "PostgreSQL"], [5601, "Kibana"], [5672, "RabbitMQ (AMQP)"], [5900, "VNC"], [6379, "Redis"], [6443, "Kubernetes API"], [8000, "Dev servers (Django)"], [8080, "HTTP alternative / proxies"], [8443, "HTTPS alternative"],
  [8883, "MQTT over TLS"], [9000, "MinIO / SonarQube / PHP-FPM"], [9042, "Cassandra"], [9090, "Prometheus"], [9092, "Kafka"], [9093, "Alertmanager"], [9200, "Elasticsearch"], [9418, "Git"], [10250, "Kubelet"], [11211, "Memcached"], [15672, "RabbitMQ admin"], [27017, "MongoDB"], [30000, "Kubernetes NodePorts (30000–32767)"],
];
const parsePorts = (s) => {
  const out = [];
  for (const part of s.split(/[\s,]+/).filter(Boolean)) {
    const m = part.match(/^(\d+)(?:-(\d+))?$/);
    if (!m) continue;
    const a = +m[1], b = m[2] ? +m[2] : a;
    for (let p = Math.min(a, b); p <= Math.max(a, b) && out.length < 30; p++) if (p > 0 && p < 65536) out.push(p);
  }
  return [...new Set(out)];
};

export function PortTool() {
  const [host, setHost] = useState("example.com");
  const [ports, setPorts] = useState("80, 443, 8080");
  const [results, setResults] = useState({});
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");
  const list = parsePorts(ports);
  const secure = typeof location !== "undefined" && location.protocol === "https:";
  const check = async () => {
    setBusy(true); setResults({});
    const h = host.trim().replace(/^\w+:\/\//, "").replace(/[/:].*$/, "");
    await Promise.all(list.map(async (p) => {
      if (BLOCKED.has(p)) { setResults((r) => ({ ...r, [p]: ["", "Browsers aren’t allowed to test this port — use a command below"] })); return; }
      const scheme = p === 80 || p === 8080 || p === 3000 || p === 8000 ? (secure ? "https" : "http") : "https";
      const ctrl = new AbortController(); const t0 = performance.now();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      try {
        await fetch(`${scheme}://${h}:${p}/`, { mode: "no-cors", cache: "no-store", signal: ctrl.signal });
        setResults((r) => ({ ...r, [p]: ["ok-badge", `Open — a web server answered (${Math.round(performance.now() - t0)} ms)`] }));
      } catch {
        const ms = performance.now() - t0;
        setResults((r) => ({ ...r, [p]: ctrl.signal.aborted ? ["warn-badge", "No answer in 5 s — closed by a firewall, or not reachable"] : ms < 3000 ? ["", `Something answered or refused quickly (${Math.round(ms)} ms) — open but not ${scheme.toUpperCase()}, or closed`] : ["no-badge", "Couldn’t connect"] }));
      }
      clearTimeout(timer);
    }));
    setBusy(false);
  };
  const h = host.trim() || "example.com";
  const shownPorts = PORTS.filter(([p, n]) => !filter || String(p).startsWith(filter.trim()) || n.toLowerCase().includes(filter.toLowerCase()));
  return (
    <>
      <div className="panel">
        <div className="request-line">
          <input className="field mono grow-field" value={host} onChange={(e) => setHost(e.target.value)} placeholder="Host name or IP" aria-label="Host" />
          <input className="field mono small wide-small" value={ports} onChange={(e) => setPorts(e.target.value)} placeholder="80, 443, 8000-8010" aria-label="Ports" />
          <button className="btn primary" onClick={check} disabled={busy || !list.length}><Globe size={16} /> {busy ? "Checking…" : "Check from this browser"}</button>
        </div>
        <p className="muted small">Web pages can’t open raw network connections, so this only tries a web (HTTP/HTTPS) request to each port and reads the timing — a rough hint, not a real port scan. For a true answer, run one of the commands below from the machine you’re checking from.</p>
        {Object.keys(results).length > 0 && <div className="result-list">{list.map((p) => results[p] && <div className="result" key={p}><span className="panel-label">Port {p}</span><span>{results[p][0] && <span className={`badge ${results[p][0]}`}>{results[p][0] === "ok-badge" ? "Open" : results[p][0] === "warn-badge" ? "Timeout" : "Closed"}</span>} {results[p][1]}</span><span /></div>)}</div>}
      </div>
      <div className="panel">
        <span className="panel-label">Check it properly in a terminal</span>
        <div className="result-list">
          <Result label="macOS / Linux" value={`nc -zv -w 3 ${h} ${list[0] || 443}`} />
          <Result label="Windows PowerShell" value={`Test-NetConnection ${h} -Port ${list[0] || 443}`} />
          <Result label="Many ports (nmap)" value={`nmap -Pn -p ${ports.replace(/\s+/g, "") || "443"} ${h}`} />
          <Result label="With curl" value={`curl -v telnet://${h}:${list[0] || 443}`} />
        </div>
      </div>
      <div className="panel">
        <div className="panel-head"><span className="panel-label">Common ports</span><input className="field small wide-small" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find a port or service" aria-label="Find a port" /></div>
        <Table head={["Port", "Usually used for"]} rows={shownPorts.map(([p, n]) => [<code key="p">{p}</code>, n])} />
      </div>
    </>
  );
}

/* ======================================================================
   gRPC helper: grpcurl command builder + raw protobuf decoder
   ====================================================================== */
function readVarint(b, i) { let v = 0n, s = 0n, p = i; while (p < b.length) { const x = b[p++]; v |= BigInt(x & 0x7f) << s; if (!(x & 0x80)) return [v, p]; s += 7n; if (s > 70n) break; } throw new Error("bad varint"); }
export function decodeProto(b, depth = 0) {
  const fields = []; let i = 0;
  while (i < b.length) {
    const [key, p] = readVarint(b, i); i = p;
    const field = Number(key >> 3n), wire = Number(key & 7n);
    if (field < 1) throw new Error("bad field number");
    if (wire === 0) { const [v, q] = readVarint(b, i); i = q; const signed = v > 0x7fffffffffffffffn ? v - (1n << 64n) : v; fields.push({ field, wire: "varint", value: signed === v ? String(v) : `${v} (signed: ${signed})` }); }
    else if (wire === 1) { if (i + 8 > b.length) throw new Error("cut off"); const dv = new DataView(b.buffer, b.byteOffset + i, 8); fields.push({ field, wire: "64-bit", value: `${dv.getBigUint64(0, true)} (double: ${dv.getFloat64(0, true)})` }); i += 8; }
    else if (wire === 5) { if (i + 4 > b.length) throw new Error("cut off"); const dv = new DataView(b.buffer, b.byteOffset + i, 4); fields.push({ field, wire: "32-bit", value: `${dv.getUint32(0, true)} (float: ${dv.getFloat32(0, true)})` }); i += 4; }
    else if (wire === 2) {
      const [len, q] = readVarint(b, i); i = q;
      const n = Number(len); if (i + n > b.length) throw new Error("cut off");
      const sub = b.subarray(i, i + n); i += n;
      let nested = null;
      if (n && depth < 12) { try { nested = decodeProto(sub, depth + 1); } catch { nested = null; } }
      const text = new TextDecoder("utf-8", { fatal: false }).decode(sub);
      const printable = n > 0 && !/[\u0000-\u0008\u000e-\u001f�]/.test(text);
      if (printable && (!nested || /^[\x20-\x7e\s]+$/.test(text))) fields.push({ field, wire: "string", value: JSON.stringify(text) });
      else if (nested) fields.push({ field, wire: "message", children: nested });
      else fields.push({ field, wire: "bytes", value: [...sub].map((x) => x.toString(16).padStart(2, "0")).join(" ") || "(empty)" });
    } else throw new Error(`unsupported wire type ${wire}`);
  }
  return fields;
}
const protoText = (fields, ind = "") => fields.map((f) => (f.children ? `${ind}${f.field} {\n${protoText(f.children, ind + "  ")}\n${ind}}` : `${ind}${f.field}: ${f.value}   # ${f.wire}`)).join("\n");
const bytesFrom = (s) => {
  const t = s.trim();
  if (/^([0-9a-f]{2}[\s:]*)+$/i.test(t)) return Uint8Array.from(t.replace(/[\s:]/g, "").match(/../g), (h) => parseInt(h, 16));
  const c = t.replace(/\s/g, "").replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(c + "===".slice((c.length + 3) % 4)), (ch) => ch.charCodeAt(0));
};

export function GrpcTool() {
  const [f, setF] = useState({ address: "localhost:50051", tls: "plaintext", service: "helloworld.Greeter/SayHello", data: '{"name": "DevDeck"}', meta: "authorization: Bearer <token>", proto: "", action: "call" });
  const set = (k) => (e) => setF((o) => ({ ...o, [k]: e.target.value }));
  const [raw, setRaw] = useState("0a074465764465636b1001");
  const meta = f.meta.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && l.includes(":"));
  const flags = [f.tls === "plaintext" ? "-plaintext" : f.tls === "insecure" ? "-insecure" : "", f.proto ? `-proto ${shq(f.proto)}` : "", ...meta.map((m) => `-H ${shq(m)}`)].filter(Boolean).join(" ");
  const svc = f.service.trim();
  const cmd = f.action === "list" ? `grpcurl ${flags} ${f.address} list${svc ? ` ${svc.split("/")[0]}` : ""}`
    : f.action === "describe" ? `grpcurl ${flags} ${f.address} describe ${svc.replace("/", ".")}`
    : `grpcurl ${flags} -d ${shq(f.data.replace(/\s*\n\s*/g, " ").trim())} ${f.address} ${svc}`;
  const decoded = useMemo(() => {
    if (!raw.trim()) return { text: "" };
    try {
      let b = bytesFrom(raw);
      let note = "";
      // gRPC frames start with a 1-byte flag and a 4-byte length.
      if (b.length >= 5 && b[0] <= 1 && ((b[1] << 24) | (b[2] << 16) | (b[3] << 8) | b[4]) === b.length - 5) { note = `Removed the 5-byte gRPC frame header${b[0] ? " (message is compressed — decompress it first)" : ""}.\n\n`; b = b.subarray(5); }
      return { text: note + protoText(decodeProto(b)) };
    } catch (e) { return { err: `Couldn’t decode this as a protobuf message (${e.message}). Paste hex or Base64 bytes.` }; }
  }, [raw]);
  return (
    <>
      <p className="muted small">Browsers can’t open gRPC connections (they need raw HTTP/2), so this builds the <code>grpcurl</code> command for you and decodes protobuf bytes you’ve captured.</p>
      <div className="panel">
        <span className="panel-label">grpcurl command</span>
        <div className="form-grid">
          <label className="form-field"><span>Server address</span><input className="field mono" value={f.address} onChange={set("address")} /></label>
          <label className="form-field"><span>Connection</span><select className="field" value={f.tls} onChange={set("tls")}><option value="plaintext">Plain (no TLS)</option><option value="tls">TLS</option><option value="insecure">TLS, skip certificate check</option></select></label>
          <label className="form-field"><span>What to do</span><select className="field" value={f.action} onChange={set("action")}><option value="call">Call a method</option><option value="list">List services</option><option value="describe">Describe a service/method</option></select></label>
          <label className="form-field"><span>Service/Method (package.Service/Method)</span><input className="field mono" value={f.service} onChange={set("service")} /></label>
          <label className="form-field"><span>.proto file (only if the server has no reflection)</span><input className="field mono" value={f.proto} onChange={set("proto")} placeholder="api/greeter.proto" /></label>
          <label className="form-field"><span>Metadata (one per line, key: value)</span><textarea className="field mono" rows={2} value={f.meta} onChange={set("meta")} /></label>
        </div>
        {f.action === "call" && <label className="form-field"><span>Request (JSON)</span><textarea className="field mono" rows={4} value={f.data} onChange={set("data")} /></label>}
        <Result label="Command" value={cmd.replace(/\s+/g, " ")} />
      </div>
      <div className="split">
        <Panel label="Protobuf bytes (hex or Base64; gRPC frame header is removed automatically)" value={raw} onChange={setRaw} error={decoded.err} rows={10} />
        <Panel label="Decoded (field numbers, like protoc --decode_raw)" value={decoded.text || ""} readOnly rows={10} />
      </div>
    </>
  );
}

export const NET_VIEWS = {
  "/network/http": HttpTool,
  "/network/websocket": WebSocketTool,
  "/network/dns": DnsTool,
  "/network/ports": PortTool,
  "/network/grpc": GrpcTool,
};
