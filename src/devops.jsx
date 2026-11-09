import { useMemo, useState } from "react";
import yaml from "js-yaml";
import { Panel, Options, Segmented, CopyButton } from "./tools.jsx";
import { takeHandoff } from "./handoff.js";

const Result = ({ label, value }) => (
  <div className="result"><span className="panel-label">{label}</span><code>{value === "" || value == null ? "—" : value}</code><CopyButton value={String(value ?? "")} /></div>
);
const dumpYaml = (o) => yaml.dump(o, { noRefs: true, lineWidth: -1, quotingType: '"' });

/* Shell-like word splitting for pasted commands (quotes, escapes, line continuations). */
export function shellWords(src) {
  const s = src.replace(/\\\r?\n/g, " ");
  const out = []; let cur = "", q = null, has = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === q) q = null;
      else if (c === "\\" && q === '"' && i + 1 < s.length) cur += s[++i];
      else cur += c;
    } else if (c === "'" || c === '"') { q = c; has = true; }
    else if (c === "\\" && i + 1 < s.length) { cur += s[++i]; has = true; }
    else if (/\s/.test(c)) { if (cur || has) out.push(cur); cur = ""; has = false; }
    else { cur += c; has = true; }
  }
  if (cur || has) out.push(cur);
  return out;
}

/* ======================================================================
   CIDR / subnet calculator
   ====================================================================== */
const ipToInt = (ip) => {
  const p = ip.split(".");
  if (p.length !== 4 || p.some((x) => !/^\d{1,3}$/.test(x) || +x > 255)) throw new Error(`“${ip}” isn’t a valid IPv4 address`);
  return p.reduce((n, x) => (n * 256) + Number(x), 0) >>> 0;
};
const intToIp = (n) => [24, 16, 8, 0].map((s) => (n >>> s) & 255).join(".");
const bin = (n) => [24, 16, 8, 0].map((s) => ((n >>> s) & 255).toString(2).padStart(8, "0")).join(".");
const maskOf = (p) => (p === 0 ? 0 : (0xffffffff << (32 - p)) >>> 0);
const RANGES = [["10.0.0.0/8", "Private network"], ["172.16.0.0/12", "Private network"], ["192.168.0.0/16", "Private network"], ["100.64.0.0/10", "Carrier-grade NAT"], ["127.0.0.0/8", "Loopback (this machine)"], ["169.254.0.0/16", "Link-local"], ["224.0.0.0/4", "Multicast"]];

export function parseCidr(text) {
  const t = text.trim();
  const m = t.match(/^(\d+\.\d+\.\d+\.\d+)(?:\/(\d{1,2})|\s+(\d+\.\d+\.\d+\.\d+))?$/);
  if (!m) throw new Error("Type an address like 10.0.0.0/16 or 192.168.1.10/24");
  const ip = ipToInt(m[1]);
  let prefix = m[2] !== undefined ? Number(m[2]) : 32;
  if (m[3]) { const mk = ipToInt(m[3]); prefix = bin(mk).replace(/\./g, "").indexOf("0"); if (prefix < 0) prefix = 32; }
  if (prefix > 32) throw new Error("The number after / must be 0–32");
  const mask = maskOf(prefix);
  const network = (ip & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  const total = 2 ** (32 - prefix);
  const usable = prefix >= 31 ? total : total - 2;
  const first = prefix >= 31 ? network : network + 1;
  const last = prefix >= 31 ? broadcast : broadcast - 1;
  const kind = RANGES.find(([c]) => { const [b, p] = c.split("/"); return ((ip & maskOf(+p)) >>> 0) === ipToInt(b); });
  return { ip, prefix, mask, network, broadcast, total, usable, first, last, kind: kind ? kind[1] : "Public internet address" };
}

export function CidrTool() {
  const [text, setText] = useState(() => takeHandoff("10.0.0.0/16"));
  const [check, setCheck] = useState("10.0.12.34");
  const [split, setSplit] = useState(0);
  const r = useMemo(() => { try { return parseCidr(text); } catch (e) { return { err: e.message }; } }, [text]);
  let inside = null;
  try { if (!r.err && check.trim()) { const n = ipToInt(check.trim()); inside = n >= r.network && n <= r.broadcast; } } catch { inside = "bad"; }
  const newPrefix = !r.err && split ? Math.min(32, r.prefix + split) : null;
  const subnets = newPrefix != null ? Array.from({ length: Math.min(256, 2 ** (newPrefix - r.prefix)) }, (_, i) => `${intToIp(r.network + i * 2 ** (32 - newPrefix))}/${newPrefix}`) : [];
  return (
    <>
      <div className="panel">
        <span className="panel-label">Address and prefix (CIDR) — or an IP and netmask</span>
        <input className={`field mono cron-input ${r.err ? "has-error" : ""}`} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
        {r.err && <p className="error">{r.err}</p>}
        <div className="options-row"><span className="muted small">Examples:</span>{["10.0.0.0/16", "192.168.1.10/24", "172.16.0.0/12", "10.1.2.0/27", "192.168.0.1 255.255.255.0"].map((x) => <button key={x} className="chip" onClick={() => setText(x)}>{x}</button>)}</div>
      </div>
      {!r.err && (
        <>
          <div className="big-answer">{intToIp(r.network)}/{r.prefix} <span className="muted">·</span> {r.usable.toLocaleString()} usable {r.usable === 1 ? "address" : "addresses"} <span className="muted">·</span> {r.kind}</div>
          <div className="result-list">
            <Result label="Network" value={intToIp(r.network)} />
            <Result label="First host" value={intToIp(r.first)} />
            <Result label="Last host" value={intToIp(r.last)} />
            <Result label="Broadcast" value={intToIp(r.broadcast)} />
            <Result label="Netmask" value={intToIp(r.mask)} />
            <Result label="Wildcard" value={intToIp(~r.mask >>> 0)} />
            <Result label="Total addresses" value={r.total.toLocaleString()} />
            <Result label="Mask in binary" value={bin(r.mask)} />
          </div>
          <div className="panel">
            <span className="panel-label">Is this address inside the range?</span>
            <div className="options-row">
              <input className="field mono grow-field" value={check} onChange={(e) => setCheck(e.target.value)} />
              {inside === true && <span className="badge ok-badge">Yes, inside</span>}
              {inside === false && <span className="badge no-badge">No, outside</span>}
              {inside === "bad" && <span className="error">Not a valid IP</span>}
            </div>
          </div>
          <div className="panel">
            <span className="panel-label">Split into smaller subnets</span>
            <Segmented label="Split into" value={split} onChange={setSplit} options={[[0, "Don’t split"], [1, "2"], [2, "4"], [3, "8"], [4, "16"], [8, "256"]].filter(([n]) => r.prefix + n <= 32)} />
            {subnets.length > 0 && <pre className="field mono finding-body">{subnets.join("\n")}{2 ** (newPrefix - r.prefix) > 256 ? "\n…" : ""}</pre>}
          </div>
        </>
      )}
    </>
  );
}

/* ======================================================================
   Kubernetes manifest generator
   ====================================================================== */
const parseEnvLines = (t) => t.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#") && l.includes("=")).map((l) => { const i = l.indexOf("="); return { name: l.slice(0, i).trim(), value: l.slice(i + 1).trim() }; });

export function K8sTool() {
  const [f, setF] = useState({ name: "web", namespace: "default", image: "nginx:1.27", replicas: 2, port: 80, svc: "ClusterIP", svcPort: 80, env: "LOG_LEVEL=info", cpuReq: "100m", cpuLim: "500m", memReq: "128Mi", memLim: "256Mi", health: "/", host: "" });
  const set = (k) => (e) => setF((o) => ({ ...o, [k]: e.target.type === "number" ? Number(e.target.value) : e.target.value }));
  const out = useMemo(() => {
    const labels = { app: f.name };
    const meta = { name: f.name, ...(f.namespace && f.namespace !== "default" ? { namespace: f.namespace } : {}), labels };
    const probe = f.health ? { httpGet: { path: f.health, port: f.port } } : null;
    const resources = {};
    if (f.cpuReq || f.memReq) resources.requests = { ...(f.cpuReq ? { cpu: f.cpuReq } : {}), ...(f.memReq ? { memory: f.memReq } : {}) };
    if (f.cpuLim || f.memLim) resources.limits = { ...(f.cpuLim ? { cpu: f.cpuLim } : {}), ...(f.memLim ? { memory: f.memLim } : {}) };
    const env = parseEnvLines(f.env);
    const docs = [{
      apiVersion: "apps/v1", kind: "Deployment", metadata: meta,
      spec: {
        replicas: f.replicas, selector: { matchLabels: labels },
        template: {
          metadata: { labels },
          spec: { containers: [{
            name: f.name, image: f.image, ports: [{ containerPort: f.port }],
            ...(env.length ? { env } : {}),
            ...(Object.keys(resources).length ? { resources } : {}),
            ...(probe ? { readinessProbe: { ...probe, initialDelaySeconds: 5, periodSeconds: 10 }, livenessProbe: { ...probe, initialDelaySeconds: 15, periodSeconds: 20 } } : {}),
          }] },
        },
      },
    }];
    if (f.svc !== "None") docs.push({ apiVersion: "v1", kind: "Service", metadata: meta, spec: { type: f.svc, selector: labels, ports: [{ port: f.svcPort, targetPort: f.port, protocol: "TCP" }] } });
    if (f.host && f.svc !== "None") docs.push({
      apiVersion: "networking.k8s.io/v1", kind: "Ingress", metadata: meta,
      spec: { rules: [{ host: f.host, http: { paths: [{ path: "/", pathType: "Prefix", backend: { service: { name: f.name, port: { number: f.svcPort } } } }] } }] },
    });
    return docs.map(dumpYaml).join("---\n");
  }, [f]);
  const Field = ({ k, label, type = "text", ...rest }) => (
    <label className="form-field"><span>{label}</span><input className="field mono" type={type} value={f[k]} onChange={set(k)} {...rest} /></label>
  );
  return (
    <div className="split">
      <div className="panel">
        <span className="panel-label">Your app</span>
        <div className="form-grid">
          {Field({ k: "name", label: "Name" })}
          {Field({ k: "namespace", label: "Namespace" })}
          {Field({ k: "image", label: "Container image" })}
          {Field({ k: "replicas", label: "Copies (replicas)", type: "number", min: 0 })}
          {Field({ k: "port", label: "App port", type: "number", min: 1 })}
          {Field({ k: "health", label: "Health check path (empty = none)" })}
          {Field({ k: "cpuReq", label: "CPU request" })}
          {Field({ k: "cpuLim", label: "CPU limit" })}
          {Field({ k: "memReq", label: "Memory request" })}
          {Field({ k: "memLim", label: "Memory limit" })}
          <label className="form-field"><span>Service type</span>
            <select className="field" value={f.svc} onChange={set("svc")}>{["ClusterIP", "NodePort", "LoadBalancer", "None"].map((x) => <option key={x}>{x}</option>)}</select>
          </label>
          {Field({ k: "svcPort", label: "Service port", type: "number", min: 1 })}
          {Field({ k: "host", label: "Public host name (adds an Ingress)", placeholder: "app.example.com" })}
        </div>
        <label className="form-field"><span>Environment variables (one KEY=value per line)</span>
          <textarea className="field mono" rows={4} value={f.env} onChange={set("env")} />
        </label>
      </div>
      <Panel label="Kubernetes YAML" value={out} readOnly rows={30} />
    </div>
  );
}

/* ======================================================================
   docker run → docker compose
   ====================================================================== */
const VALUE_FLAGS = {
  "--name": "name", "-p": "ports", "--publish": "ports", "-e": "env", "--env": "env", "--env-file": "env_file",
  "-v": "volumes", "--volume": "volumes", "--restart": "restart", "--network": "network", "--net": "network",
  "-w": "working_dir", "--workdir": "working_dir", "-u": "user", "--user": "user", "--entrypoint": "entrypoint",
  "-l": "labels", "--label": "labels", "-h": "hostname", "--hostname": "hostname", "-m": "mem_limit", "--memory": "mem_limit",
  "--cpus": "cpus", "--cap-add": "cap_add", "--cap-drop": "cap_drop", "--add-host": "extra_hosts", "--health-cmd": "health",
  "--dns": "dns", "--platform": "platform", "--expose": "expose", "--device": "devices", "--log-driver": "log_driver", "--pull": "pull_policy",
  "--log-opt": "log_opt", "--tmpfs": "tmpfs", "--shm-size": "shm_size", "--security-opt": "security_opt", "--sysctl": "sysctls",
  "--stop-signal": "stop_signal", "--stop-timeout": "stop_grace_period", "--health-interval": "health_interval", "--health-timeout": "health_timeout",
  "--health-retries": "health_retries", "--pid": "pid", "--ipc": "ipc", "--runtime": "runtime", "--group-add": "group_add", "--network-alias": "network_alias",
};
// Options that take a value but have no compose equivalent here: skip them along with their value.
const SKIP_WITH_VALUE = new Set(["--mount", "--ulimit", "--volumes-from", "--link", "--cidfile", "--label-file", "--ip", "--ip6", "--mac-address", "--memory-swap", "--memory-reservation", "--cpu-shares", "--cpuset-cpus", "--gpus", "-a", "--attach", "--userns", "--uts", "--cgroupns", "--dns-search", "--dns-option", "--oom-score-adj", "--name-prefix", "--isolation", "--blkio-weight", "--kernel-memory", "--storage-opt"]);
const BOOL_FLAGS = { "-d": null, "--detach": null, "--rm": null, "-i": "stdin_open", "--interactive": "stdin_open", "-t": "tty", "--tty": "tty", "-it": "both", "-ti": "both", "--privileged": "privileged", "--init": "init", "--read-only": "read_only" };

export function dockerRunToCompose(cmd) {
  const w = shellWords(cmd.trim());
  let i = 0;
  if (w[i] === "sudo") i++;
  if (w[i] !== "docker" && w[i] !== "podman") throw new Error("Paste a command that starts with “docker run”");
  i++;
  if (w[i] === "container") i++;
  if (w[i] !== "run") throw new Error("Only “docker run” commands can be converted");
  i++;
  const svc = {}; const notes = []; let name = "app";
  const list = (k, v) => { (svc[k] = svc[k] || []).push(v); };
  while (i < w.length && w[i].startsWith("-")) {
    let flag = w[i], val;
    if (flag.includes("=") && flag.startsWith("--")) [flag, val] = [flag.slice(0, flag.indexOf("=")), flag.slice(flag.indexOf("=") + 1)];
    if (flag in BOOL_FLAGS) {
      const k = BOOL_FLAGS[flag];
      if (k === "both") { svc.stdin_open = true; svc.tty = true; } else if (k) svc[k] = true;
      i++; continue;
    }
    if (!(flag in VALUE_FLAGS)) {
      // Known value-taking options are skipped with their value; unknown ones are treated as on/off switches
      // so we never swallow the image name by mistake.
      if (SKIP_WITH_VALUE.has(flag) && val === undefined) i++;
      notes.push(`Skipped ${flag}${SKIP_WITH_VALUE.has(flag) ? "" : " (unknown option)"} — add it to compose.yaml by hand if you need it`);
      i++; continue;
    }
    if (val === undefined) val = w[++i];
    i++;
    const k = VALUE_FLAGS[flag];
    if (k === "name") { name = val; svc.container_name = val; }
    else if (["ports", "volumes", "cap_add", "cap_drop", "extra_hosts", "dns", "expose", "devices", "env_file", "tmpfs", "security_opt", "sysctls", "group_add"].includes(k)) list(k, val);
    else if (k === "log_opt") { const j = val.indexOf("="); svc.logging = { ...(svc.logging || {}), options: { ...(svc.logging?.options || {}), [val.slice(0, j)]: val.slice(j + 1) } }; }
    else if (k === "health_interval" || k === "health_timeout" || k === "health_retries") svc.healthcheck = { ...(svc.healthcheck || {}), [k.slice(7)]: k === "health_retries" ? Number(val) : val };
    else if (k === "stop_grace_period") svc.stop_grace_period = `${val}s`;
    else if (k === "network_alias") notes.push(`Network alias “${val}”: add it under networks → aliases if you need it`);
    else if (k === "env") { if (val.includes("=")) list("environment", val); else list("environment", `${val}=\${${val}}`); }
    else if (k === "labels") list("labels", val);
    else if (k === "network") { if (["host", "none", "bridge"].includes(val)) { if (val !== "bridge") svc.network_mode = val; } else list("networks", val); }
    else if (k === "health") svc.healthcheck = { test: ["CMD-SHELL", val], ...(svc.healthcheck || {}) };
    else if (k === "log_driver") svc.logging = { driver: val, ...(svc.logging || {}) };
    else if (k === "cpus") svc.cpus = Number(val);
    else svc[k] = val;
  }
  if (!w[i]) throw new Error("No image found — the image name comes after the options");
  const service = { image: w[i++], ...svc };
  if (i < w.length) service.command = w.slice(i);
  const doc = { services: { [name.replace(/[^\w.-]/g, "-")]: service } };
  const named = (svc.volumes || []).map((v) => v.split(":")[0]).filter((v) => v && !/^[./~$]/.test(v) && !v.startsWith("/"));
  if (named.length) doc.volumes = Object.fromEntries(named.map((v) => [v, {}]));
  if (svc.networks) doc.networks = Object.fromEntries(svc.networks.map((n) => [n, { external: true }]));
  return { yaml: dumpYaml(doc), notes };
}

export function DockerRunTool() {
  const [cmd, setCmd] = useState(() => takeHandoff('docker run -d --name api --restart unless-stopped \\\n  -p 8080:3000 -e NODE_ENV=production -e DB_URL="postgres://db:5432/app" \\\n  -v api-data:/var/lib/app -v ./config:/app/config:ro \\\n  --network backend --memory 512m --cpus 1.5 \\\n  myorg/api:2.4.1 node server.js'));
  const r = useMemo(() => { if (!cmd.trim()) return { yaml: "" }; try { return dockerRunToCompose(cmd); } catch (e) { return { err: e.message }; } }, [cmd]);
  return (
    <>
      <div className="split">
        <Panel label="docker run command" value={cmd} onChange={setCmd} rows={12} error={r.err} />
        <Panel label="compose.yaml" value={r.yaml || ""} readOnly rows={12} />
      </div>
      {r.notes?.length > 0 && <div className="panel"><span className="panel-label">Heads-up</span><ul className="note-list">{r.notes.map((n, i) => <li key={i}>{n}</li>)}</ul></div>}
    </>
  );
}

/* ======================================================================
   .env converter
   ====================================================================== */
export function parseDotenv(text) {
  const vars = []; const problems = []; const seen = new Map();
  text.split(/\r?\n/).forEach((raw, n) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const m = line.replace(/^export\s+/, "").match(/^([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(.*)$/);
    if (!m) { problems.push(`Line ${n + 1} isn’t KEY=value: ${line.slice(0, 40)}`); return; }
    let v = m[2];
    if (/^"/.test(v)) v = v.replace(/^"((?:\\.|[^"\\])*)".*$/, "$1").replace(/\\n/g, "\n").replace(/\\"/g, '"');
    else if (/^'/.test(v)) v = v.replace(/^'([^']*)'.*$/, "$1");
    else v = v.replace(/\s+#.*$/, "").trim();
    if (seen.has(m[1])) problems.push(`${m[1]} is set twice (lines ${seen.get(m[1])} and ${n + 1}); the last one wins`);
    seen.set(m[1], n + 1);
    const at = vars.findIndex((x) => x.key === m[1]);
    if (at >= 0) vars.splice(at, 1);
    vars.push({ key: m[1], value: v });
  });
  return { vars, problems };
}
const b64 = (s) => { const bytes = new TextEncoder().encode(s); let x = ""; bytes.forEach((c) => (x += String.fromCharCode(c))); return btoa(x); };
const shq = (s) => (/^[\w./:@%+-]*$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`);

export function EnvTool() {
  const [text, setText] = useState(() => takeHandoff("# app settings\nNODE_ENV=production\nPORT=8080\nDATABASE_URL=\"postgres://user:pass@db:5432/app\"\nexport API_KEY='s3cr3t-key'\nFEATURE_FLAGS=search,chat  # comma list"));
  const [fmt, setFmt] = useState("json");
  const [name, setName] = useState("app-config");
  const { vars, problems } = useMemo(() => parseDotenv(text), [text]);
  const obj = Object.fromEntries(vars.map((v) => [v.key, v.value]));
  const out = {
    json: JSON.stringify(obj, null, 2),
    yaml: vars.length ? dumpYaml(obj) : "",
    secret: dumpYaml({ apiVersion: "v1", kind: "Secret", metadata: { name }, type: "Opaque", data: Object.fromEntries(vars.map((v) => [v.key, b64(v.value)])) }),
    configmap: dumpYaml({ apiVersion: "v1", kind: "ConfigMap", metadata: { name }, data: obj }),
    docker: vars.map((v) => `-e ${v.key}=${shq(v.value)}`).join(" \\\n"),
    export: vars.map((v) => `export ${v.key}=${shq(v.value)}`).join("\n"),
    compose: vars.length ? dumpYaml({ environment: obj }) : "",
  }[fmt];
  return (
    <>
      <Options>
        <Segmented label="Output" value={fmt} onChange={setFmt} options={[["json", "JSON"], ["yaml", "YAML"], ["secret", "K8s Secret"], ["configmap", "K8s ConfigMap"], ["compose", "Compose"], ["docker", "docker -e"], ["export", "Shell export"]]} />
        {(fmt === "secret" || fmt === "configmap") && <label className="check">Name <input className="field small wide" value={name} onChange={(e) => setName(e.target.value)} /></label>}
      </Options>
      <div className="split">
        <Panel label={`.env file — ${vars.length} ${vars.length === 1 ? "variable" : "variables"}`} value={text} onChange={setText} rows={14} />
        <Panel label="Converted" value={out} readOnly rows={14} />
      </div>
      {problems.length > 0 && <div className="panel"><span className="panel-label">Things to check</span><ul className="note-list">{problems.map((p, i) => <li key={i}>{p}</li>)}</ul></div>}
    </>
  );
}

/* ======================================================================
   Units: data sizes, durations, transfer time
   ====================================================================== */
const SIZE_UNITS = { b: 1, byte: 1, bytes: 1, k: 1e3, kb: 1e3, m: 1e6, mb: 1e6, g: 1e9, gb: 1e9, t: 1e12, tb: 1e12, p: 1e15, pb: 1e15, ki: 1024, kib: 1024, mi: 1024 ** 2, mib: 1024 ** 2, gi: 1024 ** 3, gib: 1024 ** 3, ti: 1024 ** 4, tib: 1024 ** 4, pi: 1024 ** 5, pib: 1024 ** 5 };
export function parseSize(s) {
  const m = s.trim().toLowerCase().replace(/,/g, "").match(/^(\d+(?:\.\d+)?)\s*([a-z]*)$/);
  if (!m) return null;
  const u = m[2] || "b";
  return u in SIZE_UNITS ? Number(m[1]) * SIZE_UNITS[u] : null;
}
const DUR = { ms: 1, s: 1000, sec: 1000, m: 60000, min: 60000, h: 3600000, hr: 3600000, d: 86400000, day: 86400000, w: 604800000, wk: 604800000 };
export function parseDuration(s) {
  const t = s.trim().toLowerCase().replace(/\s+/g, "");
  if (/^\d+(\.\d+)?$/.test(t)) return Number(t) * 1000;
  const parts = [...t.matchAll(/(\d+(?:\.\d+)?)(ms|sec|s|min|m|hr|h|day|d|wk|w)/g)];
  if (!parts.length || parts.map((p) => p[0]).join("") !== t) return null;
  return parts.reduce((n, [, v, u]) => n + Number(v) * DUR[u], 0);
}
export function humanDuration(ms) {
  if (ms < 1000) return `${+ms.toFixed(2)} ms`;
  const units = [["day", 86400000], ["hour", 3600000], ["minute", 60000], ["second", 1000]];
  const out = []; let left = Math.round(ms);
  for (const [n, size] of units) { const q = Math.floor(left / size); if (q) { out.push(`${q} ${n}${q === 1 ? "" : "s"}`); left -= q * size; } }
  return out.slice(0, 3).join(" ") || "0 seconds";
}
const goDuration = (ms) => { let left = Math.round(ms / 1000); const h = Math.floor(left / 3600); left -= h * 3600; const m = Math.floor(left / 60); const s = left - m * 60; return `${h ? h + "h" : ""}${h || m ? m + "m" : ""}${s}s`; };
const nice = (n) => (n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : +n.toPrecision(4) + "");

export function UnitsTool() {
  const [size, setSize] = useState(() => takeHandoff("512Mi"));
  const [dur, setDur] = useState("1h30m");
  const [speed, setSpeed] = useState(100);
  const bytes = parseSize(size);
  const ms = parseDuration(dur);
  const seconds = bytes != null && speed > 0 ? (bytes * 8) / (speed * 1e6) : null;
  return (
    <>
      <div className="panel">
        <span className="panel-label">Data size (e.g. 512Mi, 1.5GB, 2 GiB, 1048576)</span>
        <input className={`field mono ${bytes == null && size.trim() ? "has-error" : ""}`} value={size} onChange={(e) => setSize(e.target.value)} />
        {bytes != null && (
          <div className="unit-grid">
            {[["Bytes", 1], ["KB", 1e3], ["MB", 1e6], ["GB", 1e9], ["TB", 1e12], ["KiB / Ki", 1024], ["MiB / Mi", 1024 ** 2], ["GiB / Gi", 1024 ** 3], ["TiB / Ti", 1024 ** 4]].map(([n, d]) => (
              <div key={n} className="unit-cell"><span className="panel-label">{n}</span><code>{nice(bytes / d)}</code></div>
            ))}
          </div>
        )}
        <p className="muted small">KB/MB/GB count in thousands (disk makers); KiB/MiB/GiB count in 1024s (Kubernetes “Mi”/“Gi”, most operating systems).</p>
      </div>
      <div className="panel">
        <span className="panel-label">Download / upload time for that size</span>
        <label className="range-row"><span>Speed: <strong>{speed} Mbps</strong></span><input type="range" min="1" max="10000" step="1" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} /></label>
        <div className="options-row">{[10, 100, 1000, 10000].map((v) => <button key={v} className="chip" onClick={() => setSpeed(v)}>{v >= 1000 ? `${v / 1000} Gbps` : `${v} Mbps`}</button>)}</div>
        {seconds != null && <div className="big-answer">{humanDuration(seconds * 1000)}</div>}
      </div>
      <div className="panel">
        <span className="panel-label">Duration (e.g. 1h30m, 90m, 5400, 250ms, 2d4h)</span>
        <input className={`field mono ${ms == null && dur.trim() ? "has-error" : ""}`} value={dur} onChange={(e) => setDur(e.target.value)} />
        {ms != null && (
          <div className="result-list">
            <Result label="In words" value={humanDuration(ms)} />
            <Result label="Go / Kubernetes" value={goDuration(ms)} />
            <Result label="Milliseconds" value={nice(ms)} />
            <Result label="Seconds" value={nice(ms / 1000)} />
            <Result label="Minutes" value={nice(ms / 60000)} />
            <Result label="Hours" value={nice(ms / 3600000)} />
          </div>
        )}
      </div>
    </>
  );
}

/* ======================================================================
   Uptime / SLA calculator
   ====================================================================== */
const PERIODS = [["Per day", 86400], ["Per week", 604800], ["Per month", 2629746], ["Per quarter", 7889238], ["Per year", 31556952]];

export function UptimeTool() {
  const [pct, setPct] = useState(() => takeHandoff("99.9"));
  const [chain, setChain] = useState("99.95, 99.9, 99.99");
  const p = Number(pct);
  const valid = pct.trim() !== "" && p >= 0 && p <= 100;
  const parts = chain.split(/[,\s]+/).map(Number).filter((n) => n > 0 && n <= 100);
  const combined = parts.length ? parts.reduce((a, n) => a * (n / 100), 1) * 100 : null;
  return (
    <>
      <div className="panel">
        <span className="panel-label">Uptime promise (%)</span>
        <input className={`field mono cron-input ${valid ? "" : "has-error"}`} value={pct} onChange={(e) => setPct(e.target.value)} inputMode="decimal" />
        <div className="options-row">{["99", "99.5", "99.9", "99.95", "99.99", "99.999"].map((x) => <button key={x} className="chip" onClick={() => setPct(x)}>{x}%</button>)}</div>
      </div>
      {valid && (
        <div className="result-list">
          {PERIODS.map(([n, secs]) => <Result key={n} label={n} value={`${humanDuration(secs * (1 - p / 100) * 1000)} of downtime allowed`} />)}
        </div>
      )}
      <div className="panel">
        <span className="panel-label">Services that all must work (e.g. load balancer, app, database)</span>
        <input className="field mono" value={chain} onChange={(e) => setChain(e.target.value)} placeholder="99.95, 99.9, 99.99" />
        {combined != null && <p>Together they give about <strong>{combined.toFixed(4).replace(/0+$/, "").replace(/\.$/, "")}%</strong> uptime — {humanDuration(2629746 * (1 - combined / 100) * 1000)} of downtime a month. A chain is only as reliable as all its links combined.</p>}
      </div>
    </>
  );
}

/* ======================================================================
   Semantic versions
   ====================================================================== */
export function parseVer(s) {
  const m = String(s).trim().replace(/^[v=]+/, "").match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([\w.-]+))?(?:\+[\w.-]+)?$/);
  if (!m) return null;
  return { major: +m[1], minor: +(m[2] ?? 0), patch: +(m[3] ?? 0), pre: m[4] ? m[4].split(".") : [], raw: s.trim() };
}
export function cmpVer(a, b) {
  for (const k of ["major", "minor", "patch"]) if (a[k] !== b[k]) return a[k] < b[k] ? -1 : 1;
  if (!a.pre.length || !b.pre.length) return a.pre.length ? -1 : b.pre.length ? 1 : 0;
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
    const x = a.pre[i], y = b.pre[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (x === y) continue;
    const nx = /^\d+$/.test(x), ny = /^\d+$/.test(y);
    if (nx && ny) return +x < +y ? -1 : 1;
    if (nx !== ny) return nx ? -1 : 1;
    return x < y ? -1 : 1;
  }
  return 0;
}
// Turn one range piece (e.g. "^1.2.3", "~1.2", ">=2", "1.x") into [operator, version] tests.
function expand(tok) {
  const m = tok.match(/^(\^|~|>=|<=|>|<|=)?\s*v?([\dxX*]+(?:\.[\dxX*]+)?(?:\.[\dxX*]+)?(?:-[\w.-]+)?)$/);
  if (!m) throw new Error(`Can’t read “${tok}”`);
  const op = m[1] || "";
  const parts = m[2].split("-")[0].split(".");
  const wild = (x) => x === undefined || /^[xX*]$/.test(x);
  const nums = parts.map((x) => (wild(x) ? null : +x));
  const [M, mi, pa] = [nums[0], nums[1], nums[2]];
  const v = (a, b, c, pre = "") => parseVer(`${a}.${b}.${c}${pre}`);
  const pre = m[2].includes("-") ? "-" + m[2].split("-").slice(1).join("-") : "";
  if (M === null) return [];
  if (op === "^") {
    const lo = v(M, mi ?? 0, pa ?? 0, pre);
    const hi = M > 0 || mi == null ? v(M + 1, 0, 0) : mi > 0 || pa == null ? v(0, mi + 1, 0) : v(0, 0, pa + 1);
    return [[">=", lo], ["<", hi]];
  }
  if (op === "~") return [[">=", v(M, mi ?? 0, pa ?? 0, pre)], ["<", mi == null ? v(M + 1, 0, 0) : v(M, mi + 1, 0)]];
  if (mi == null || pa == null) {
    const lo = v(M, mi ?? 0, 0);
    const hi = mi == null ? v(M + 1, 0, 0) : v(M, mi + 1, 0);
    if (op === "" || op === "=") return [[">=", lo], ["<", hi]];
    if (op === ">") return [[">=", hi]];
    if (op === "<=") return [["<", hi]];
    return [[op, lo]];
  }
  return [[op || "=", v(M, mi, pa, pre)]];
}
export function satisfies(ver, range) {
  const v = parseVer(ver);
  if (!v) throw new Error(`“${ver}” isn’t a version like 1.2.3`);
  return range.split("||").some((alt) => {
    const a = alt.trim();
    if (!a || a === "*") return true;
    const hy = a.match(/^(\S+)\s+-\s+(\S+)$/);
    const tests = hy ? [...expand(">=" + hy[1]), ...expand("<=" + hy[2])] : a.split(/\s+/).flatMap((t, i, arr) => (/^(\^|~|>=|<=|>|<|=)$/.test(t) ? [] : expand(/^(\^|~|>=|<=|>|<|=)$/.test(arr[i - 1]) ? arr[i - 1] + t : t)));
    // Like npm: a pre-release (2.0.0-beta.1) only matches if the range names a pre-release of that same version.
    if (v.pre.length && !tests.some(([, b]) => b.pre.length && b.major === v.major && b.minor === v.minor && b.patch === v.patch)) return false;
    return tests.every(([op, b]) => { const c = cmpVer(v, b); return { "=": c === 0, ">": c > 0, ">=": c >= 0, "<": c < 0, "<=": c <= 0 }[op]; });
  });
}

export function SemverTool() {
  const [range, setRange] = useState(() => takeHandoff("^1.4.0"));
  const [list, setList] = useState("1.3.9\n1.4.0\n1.4.7\n1.10.2\n2.0.0-beta.1\n2.0.0\n0.9.0");
  const [a, setA] = useState("1.10.0");
  const [b, setB] = useState("1.9.3");
  const versions = list.split(/[\s,]+/).filter(Boolean);
  let rangeErr = "";
  const checked = versions.map((x) => { try { return [x, satisfies(x, range)]; } catch (e) { rangeErr = e.message; return [x, null]; } });
  const pa = parseVer(a), pb = parseVer(b);
  const cmp = pa && pb ? cmpVer(pa, pb) : null;
  const sorted = versions.map(parseVer).filter(Boolean).sort(cmpVer).map((v) => v.raw);
  const bump = pa ? [["Next patch", `${pa.major}.${pa.minor}.${pa.patch + 1}`], ["Next minor", `${pa.major}.${pa.minor + 1}.0`], ["Next major", `${pa.major + 1}.0.0`]] : [];
  return (
    <>
      <div className="panel">
        <span className="panel-label">Version range (as in package.json, Helm charts, Terraform)</span>
        <input className={`field mono cron-input ${rangeErr ? "has-error" : ""}`} value={range} onChange={(e) => setRange(e.target.value)} />
        {rangeErr && <p className="error">{rangeErr}</p>}
        <div className="options-row"><span className="muted small">Try:</span>{["^1.4.0", "~1.4.0", ">=1.4 <2", "1.x", "1.4.0 - 1.9.9", "^0.9.0 || ^1.10"].map((x) => <button key={x} className="chip" onClick={() => setRange(x)}>{x}</button>)}</div>
      </div>
      <div className="split">
        <Panel label="Versions to test (one per line)" value={list} onChange={setList} rows={8} />
        <div className="panel">
          <span className="panel-label">Matches the range?</span>
          <div className="ver-list">{checked.map(([x, ok], i) => <div key={i} className={`ver-row ${ok ? "ok" : ok === false ? "no" : ""}`}><code>{x}</code><span>{ok ? "✓ allowed" : ok === false ? "✗ not allowed" : "?"}</span></div>)}</div>
          <span className="panel-label">Sorted oldest → newest</span>
          <code className="mono small">{sorted.join("  <  ")}</code>
        </div>
      </div>
      <div className="panel">
        <span className="panel-label">Compare two versions</span>
        <div className="options-row">
          <input className="field mono grow-field" value={a} onChange={(e) => setA(e.target.value)} aria-label="First version" />
          <strong className="cmp-sign">{cmp == null ? "?" : cmp < 0 ? "<" : cmp > 0 ? ">" : "="}</strong>
          <input className="field mono grow-field" value={b} onChange={(e) => setB(e.target.value)} aria-label="Second version" />
        </div>
        {cmp != null && <p className="muted">{cmp === 0 ? "They are the same version." : `${cmp > 0 ? a : b} is newer.`}</p>}
        {bump.length > 0 && <div className="options-row">{bump.map(([n, v]) => <span key={n} className="chip">{n}: <code>{v}</code></span>)}</div>}
      </div>
    </>
  );
}

/* ======================================================================
   curl → code
   ====================================================================== */
export function parseCurl(cmd) {
  const w = shellWords(cmd.trim());
  if (w[0] !== "curl") throw new Error("Paste a command that starts with “curl”");
  const r = { method: null, url: null, headers: [], data: null, form: [], user: null, notes: [], get: false };
  const takes = new Set(["-X", "--request", "-H", "--header", "-d", "--data", "--data-raw", "--data-binary", "--data-ascii", "--data-urlencode", "--json", "-u", "--user", "-F", "--form", "-b", "--cookie", "-A", "--user-agent", "-e", "--referer", "-o", "--output", "--url", "-m", "--max-time", "--connect-timeout"]);
  for (let i = 1; i < w.length; i++) {
    let f = w[i], v;
    if (f.startsWith("--") && f.includes("=")) [f, v] = [f.slice(0, f.indexOf("=")), f.slice(f.indexOf("=") + 1)];
    if (takes.has(f) && v === undefined) v = w[++i];
    switch (f) {
      case "-X": case "--request": r.method = v.toUpperCase(); break;
      case "-H": case "--header": { const k = v.indexOf(":"); r.headers.push([v.slice(0, k).trim(), v.slice(k + 1).trim()]); break; }
      case "-d": case "--data": case "--data-raw": case "--data-binary": case "--data-ascii":
        r.data = r.data ? `${r.data}&${v}` : v; break;
      case "--data-urlencode": { const k = v.indexOf("="); const enc = k >= 0 ? `${v.slice(0, k)}=${encodeURIComponent(v.slice(k + 1))}` : encodeURIComponent(v); r.data = r.data ? `${r.data}&${enc}` : enc; break; }
      case "--json": r.data = v; r.headers.push(["Content-Type", "application/json"], ["Accept", "application/json"]); break;
      case "-u": case "--user": r.user = v; break;
      case "-F": case "--form": r.form.push(v); break;
      case "-b": case "--cookie": r.headers.push(["Cookie", v]); break;
      case "-A": case "--user-agent": r.headers.push(["User-Agent", v]); break;
      case "-e": case "--referer": r.headers.push(["Referer", v]); break;
      case "-G": case "--get": r.get = true; break;
      case "-k": case "--insecure": r.notes.push("-k skips certificate checks; the code below keeps checks on (safer)."); break;
      case "--url": r.url = v; break;
      case "-L": case "--location": case "-s": case "--silent": case "-S": case "-v": case "-i": case "--compressed": case "-f": case "--fail": break;
      case "-o": case "--output": case "-m": case "--max-time": case "--connect-timeout": r.notes.push(`${f} isn’t converted.`); break;
      default:
        if (f.startsWith("-")) r.notes.push(`Skipped ${f}`);
        else if (!r.url) r.url = f;
    }
  }
  if (!r.url) throw new Error("No web address found in the command");
  if (!/^https?:\/\//i.test(r.url)) r.url = "https://" + r.url;
  if (r.get && r.data) { r.url += (r.url.includes("?") ? "&" : "?") + r.data; r.data = null; }
  r.method = r.method || (r.data || r.form.length ? "POST" : "GET");
  if (r.user) r.headers.push(["Authorization", `Basic ${b64(r.user)}`]);
  if (r.data && !r.headers.some(([k]) => /^content-type$/i.test(k))) r.headers.push(["Content-Type", "application/x-www-form-urlencoded"]);
  return r;
}

const jsStr = (s) => JSON.stringify(s);
const pyStr = (s) => JSON.stringify(s);
const isJson = (r) => r.headers.some(([k, v]) => /^content-type$/i.test(k) && /json/i.test(v));

function toFetch(r) {
  const opts = [`  method: ${jsStr(r.method)}`];
  const hs = r.headers.filter(([k]) => !(r.form.length && /^content-type$/i.test(k)));
  if (hs.length) opts.push(`  headers: {\n${hs.map(([k, v]) => `    ${jsStr(k)}: ${jsStr(v)}`).join(",\n")}\n  }`);
  let pre = "";
  if (r.form.length) {
    pre = `const form = new FormData();\n${r.form.map((f) => { const i = f.indexOf("="); const k = f.slice(0, i), v = f.slice(i + 1); return v.startsWith("@") ? `form.append(${jsStr(k)}, fileInput.files[0]); // was ${v}` : `form.append(${jsStr(k)}, ${jsStr(v)});`; }).join("\n")}\n\n`;
    opts.push("  body: form");
  } else if (r.data) opts.push(`  body: ${isJson(r) ? `JSON.stringify(${(() => { try { return JSON.stringify(JSON.parse(r.data), null, 2).replace(/\n/g, "\n  "); } catch { return jsStr(r.data); } })()})` : jsStr(r.data)}`);
  return `${pre}const res = await fetch(${jsStr(r.url)}, {\n${opts.join(",\n")}\n});\nconst data = await res.${isJson(r) || /json/i.test(r.headers.map(([, v]) => v).join(" ")) ? "json" : "text"}();\nconsole.log(res.status, data);`;
}
function toPython(r) {
  const lines = ["import requests", ""];
  const hs = r.headers.filter(([k]) => !/^authorization$/i.test(k) || !r.user).filter(([k]) => !(r.form.length && /^content-type$/i.test(k)));
  if (hs.length) lines.push(`headers = {\n${hs.map(([k, v]) => `    ${pyStr(k)}: ${pyStr(v)},`).join("\n")}\n}`);
  const args = [pyStr(r.url)];
  if (hs.length) args.push("headers=headers");
  if (r.user) { const i = r.user.indexOf(":"); args.push(`auth=(${pyStr(r.user.slice(0, i < 0 ? undefined : i))}, ${pyStr(i < 0 ? "" : r.user.slice(i + 1))})`); }
  if (r.form.length) {
    const files = r.form.filter((f) => f.includes("=@")), fields = r.form.filter((f) => !f.includes("=@"));
    if (fields.length) { lines.push(`data = {${fields.map((f) => { const i = f.indexOf("="); return `${pyStr(f.slice(0, i))}: ${pyStr(f.slice(i + 1))}`; }).join(", ")}}`); args.push("data=data"); }
    if (files.length) { lines.push(`files = {${files.map((f) => { const i = f.indexOf("=@"); return `${pyStr(f.slice(0, i))}: open(${pyStr(f.slice(i + 2))}, "rb")`; }).join(", ")}}`); args.push("files=files"); }
  } else if (r.data) {
    let asJson = null;
    if (isJson(r)) { try { asJson = JSON.parse(r.data); } catch {} }
    if (asJson !== null) { lines.push(`payload = ${JSON.stringify(asJson, null, 4).replace(/\btrue\b/g, "True").replace(/\bfalse\b/g, "False").replace(/\bnull\b/g, "None")}`); args.push("json=payload"); }
    else { lines.push(`data = ${pyStr(r.data)}`); args.push("data=data"); }
  }
  lines.push("", `response = requests.${r.method.toLowerCase()}(${args.join(", ")})`, "print(response.status_code)", "print(response.text)");
  return lines.join("\n");
}
function toHttpie(r) {
  const parts = ["http", r.method, shq(r.url)];
  r.headers.filter(([k]) => !/^authorization$/i.test(k) || !r.user).forEach(([k, v]) => parts.push(shq(`${k}:${v}`)));
  if (r.user) parts.splice(1, 0, "-a", shq(r.user));
  if (r.form.length) { parts.splice(1, 0, "--form"); r.form.forEach((f) => parts.push(shq(f.replace("=@", "@")))); }
  else if (r.data) return `${parts.join(" ")} <<< ${shq(r.data)}`;
  return parts.join(" ");
}
function toPowershell(r) {
  const hs = r.headers.filter(([k]) => !/^content-type$/i.test(k));
  const ct = r.headers.find(([k]) => /^content-type$/i.test(k));
  const lines = [];
  if (hs.length) lines.push(`$headers = @{\n${hs.map(([k, v]) => `  "${k}" = "${v.replace(/"/g, '`"')}"`).join("\n")}\n}`);
  const args = [`-Uri "${r.url}"`, `-Method ${r.method}`];
  if (hs.length) args.push("-Headers $headers");
  if (ct) args.push(`-ContentType "${ct[1]}"`);
  if (r.data) args.push(`-Body '${r.data.replace(/'/g, "''")}'`);
  lines.push(`Invoke-RestMethod ${args.join(" `\n  ")}`);
  return lines.join("\n");
}

export function CurlTool() {
  const [cmd, setCmd] = useState(() => takeHandoff(`curl -X POST https://api.example.com/v1/deployments \\\n  -H "Authorization: Bearer $TOKEN" \\\n  -H "Content-Type: application/json" \\\n  -d '{"service":"api","version":"2.4.1","replicas":3}'`));
  const [lang, setLang] = useState("fetch");
  const r = useMemo(() => { try { return parseCurl(cmd); } catch (e) { return { err: e.message }; } }, [cmd]);
  const out = r.err ? "" : { fetch: toFetch, python: toPython, httpie: toHttpie, powershell: toPowershell }[lang](r);
  return (
    <>
      <Options>
        <Segmented label="Language" value={lang} onChange={setLang} options={[["fetch", "JavaScript fetch"], ["python", "Python requests"], ["httpie", "HTTPie"], ["powershell", "PowerShell"]]} />
      </Options>
      <div className="split">
        <Panel label="curl command" value={cmd} onChange={setCmd} rows={12} error={r.err} />
        <Panel label="Code" value={out} readOnly rows={12} />
      </div>
      {!r.err && (
        <div className="result-list">
          <Result label="Method" value={r.method} />
          <Result label="Address" value={r.url} />
          {r.headers.length > 0 && <Result label="Headers" value={r.headers.map(([k, v]) => `${k}: ${v}`).join(" · ")} />}
        </div>
      )}
      {r.notes?.length > 0 && <div className="panel"><span className="panel-label">Heads-up</span><ul className="note-list">{r.notes.map((n, i) => <li key={i}>{n}</li>)}</ul></div>}
    </>
  );
}

export const DEVOPS_VIEWS = {
  "/devops/cidr": CidrTool,
  "/devops/kubernetes": K8sTool,
  "/devops/docker-compose": DockerRunTool,
  "/devops/env": EnvTool,
  "/devops/units": UnitsTool,
  "/devops/uptime": UptimeTool,
  "/devops/semver": SemverTool,
  "/devops/curl": CurlTool,
};
