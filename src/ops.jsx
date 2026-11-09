import { useMemo, useState } from "react";
import yaml from "js-yaml";
import { Panel, Options, Segmented } from "./tools.jsx";
import { takeHandoff } from "./handoff.js";
import { parseCron, describeCron } from "./tools2.jsx";
import { pemBlocks, parseCertificate } from "./certs-core.js";
import { b64ToBytes } from "./certs-core.js";
import { Result, Table, Issues, issueSummary, closest, fmtBytes } from "./shared.jsx";

const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
const loadAll = (text) => yaml.loadAll(text).filter((d) => d != null);
const yamlError = (e) => (e.mark ? `Line ${e.mark.line + 1}, column ${e.mark.column + 1}: ${e.reason}` : e.message);

/* ======================================================================
   Docker Compose validator
   ====================================================================== */
const TOP_KEYS = ["version", "name", "services", "networks", "volumes", "configs", "secrets", "include", "models"];
const SERVICE_KEYS = ["annotations", "attach", "blkio_config", "build", "cap_add", "cap_drop", "cgroup", "cgroup_parent", "command", "configs", "container_name", "cpu_count", "cpu_percent", "cpu_period", "cpu_quota", "cpu_rt_period", "cpu_rt_runtime", "cpu_shares", "cpus", "cpuset", "credential_spec", "depends_on", "deploy", "develop", "device_cgroup_rules", "devices", "dns", "dns_opt", "dns_search", "domainname", "driver_opts", "entrypoint", "env_file", "environment", "expose", "extends", "external_links", "extra_hosts", "gpus", "group_add", "healthcheck", "hostname", "image", "init", "ipc", "isolation", "labels", "label_file", "links", "logging", "mac_address", "mem_limit", "mem_reservation", "mem_swappiness", "memswap_limit", "models", "network_mode", "networks", "oom_kill_disable", "oom_score_adj", "pid", "pids_limit", "platform", "ports", "post_start", "pre_stop", "privileged", "profiles", "provider", "pull_policy", "read_only", "restart", "runtime", "scale", "secrets", "security_opt", "shm_size", "stdin_open", "stop_grace_period", "stop_signal", "storage_opt", "sysctls", "tmpfs", "tty", "ulimits", "use_api_socket", "user", "userns_mode", "uts", "volumes", "volumes_from", "working_dir"];
const PORT_RE = /^(?:(\[?[0-9a-fA-F.:]+\]?):)?(?:(\d+(?:-\d+)?):)?(\d+(?:-\d+)?)(?:\/(tcp|udp|sctp))?$/;
const SECRETY = /(pass(word)?|secret|token|api[_-]?key|private[_-]?key|credentials?)$/i;

export function validateCompose(text) {
  const out = [];
  const add = (level, where, t) => out.push({ level, where, text: t });
  let doc;
  try { doc = yaml.load(text); } catch (e) { return [{ level: "error", where: "", text: `Not valid YAML. ${yamlError(e)}` }]; }
  if (!isObj(doc)) return [{ level: "error", where: "", text: "A compose file should be a set of keys such as services:, volumes: and networks:." }];
  for (const k of Object.keys(doc)) if (!TOP_KEYS.includes(k) && !k.startsWith("x-")) add("error", k, `“${k}” isn’t a top-level compose key${closest(k, TOP_KEYS) ? ` — did you mean “${closest(k, TOP_KEYS)}”?` : ""}`);
  if ("version" in doc) add("info", "version", "“version” is obsolete in Compose v2 and is ignored — you can remove it.");
  const services = doc.services;
  if (!isObj(services) || !Object.keys(services).length) { add("error", "services", "There are no services. Add at least one under services:."); return out; }
  const declared = (k) => new Set(isObj(doc[k]) ? Object.keys(doc[k]) : []);
  const nets = declared("networks"), vols = declared("volumes"), secrets = declared("secrets"), configs = declared("configs");
  const hostPorts = new Map();
  const names = Object.keys(services);
  const vars = new Set();
  JSON.stringify(doc).replace(/\$\{([A-Za-z_]\w*)(?::?[-?+][^}]*)?\}|\$([A-Za-z_]\w*)/g, (_, a, b) => vars.add(a || b));
  for (const [name, s] of Object.entries(services)) {
    const at = (k) => `services.${name}${k ? "." + k : ""}`;
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(name)) add("error", at(), "Service names may only use letters, digits, “_”, “.” and “-”.");
    if (!isObj(s)) { add("error", at(), "A service should be a set of settings (image:, ports: …)."); continue; }
    for (const k of Object.keys(s)) if (!SERVICE_KEYS.includes(k) && !k.startsWith("x-")) add("error", at(k), `“${k}” isn’t a service setting${closest(k, SERVICE_KEYS) ? ` — did you mean “${closest(k, SERVICE_KEYS)}”?` : ""}`);
    if (!s.image && !s.build && !s.extends && !s.provider) add("error", at(), "Needs an image: or a build: to know what to run.");
    if (typeof s.image === "string") {
      const last = s.image.split("/").pop();
      if (!last.includes(":") && !s.image.includes("@")) add("warning", at("image"), `“${s.image}” has no version tag, so it means :latest — pin a version for repeatable deploys.`);
      else if (/:latest$/.test(s.image)) add("warning", at("image"), "“:latest” can change under you — pin a version.");
    }
    if (s.build && !(typeof s.build === "string" || isObj(s.build))) add("error", at("build"), "build: should be a folder path or a set of settings with context:.");
    if (s.restart != null && !/^(no|always|unless-stopped|on-failure(:\d+)?)$/.test(String(s.restart))) add("error", at("restart"), `restart: “${s.restart}” isn’t valid — use no, always, unless-stopped or on-failure.`);
    if (s.container_name && (s.deploy?.replicas > 1 || s.scale > 1)) add("error", at("container_name"), "A fixed container_name can’t be used with more than one replica.");
    // ports
    for (const [i, p] of (Array.isArray(s.ports) ? s.ports : s.ports != null ? [s.ports] : []).entries()) {
      const where = at(`ports[${i}]`);
      if (isObj(p)) { if (p.target == null) add("error", where, "The long port syntax needs target:."); if (p.published != null) { const k = `${p.host_ip || "*"}:${p.published}/${p.protocol || "tcp"}`; (hostPorts.get(k) || hostPorts.set(k, []).get(k)).push(name); } continue; }
      const m = String(p).match(PORT_RE);
      if (!m) { add("error", where, `“${p}” isn’t a valid port mapping (examples: "8080:80", "127.0.0.1:5432:5432", "53:53/udp").`); continue; }
      if (typeof p === "number") add("info", where, "Write ports in quotes, like \"8080:80\" — some YAML readers turn unquoted values with colons into numbers.");
      if (m[2]) { const k = `${m[1] || "*"}:${m[2]}/${m[4] || "tcp"}`; (hostPorts.get(k) || hostPorts.set(k, []).get(k)).push(name); }
      if (m[2] && !m[1] && /^(5432|3306|6379|27017|9200|11211|1433)$/.test(m[2])) add("warning", where, `Port ${m[2]} (a database) is open to your whole network. Use "127.0.0.1:${m[2]}:${m[3]}" to keep it local.`);
    }
    // volumes
    for (const [i, v] of (Array.isArray(s.volumes) ? s.volumes : []).entries()) {
      const where = at(`volumes[${i}]`);
      if (isObj(v)) { if (!v.target) add("error", where, "The long volume syntax needs target:."); if (v.type === "volume" && v.source && !vols.has(v.source)) add("error", where, `Named volume “${v.source}” isn’t listed under the top-level volumes:.`); continue; }
      const str = String(v);
      const src = str.match(/^([A-Za-z]:\\[^:]*|[^:]+):/)?.[1];
      if (src && !/^[./~$\\]|^[A-Za-z]:\\/.test(src) && !vols.has(src)) add("error", where, `Named volume “${src}” isn’t listed under the top-level volumes:. (For a folder on this computer start it with ./ or /.)`);
      if (/docker\.sock/.test(str)) add("warning", where, "Mounting the Docker socket gives this container full control of the host.");
    }
    // depends_on
    const deps = Array.isArray(s.depends_on) ? s.depends_on : isObj(s.depends_on) ? Object.keys(s.depends_on) : [];
    for (const d of deps) {
      if (d === name) add("error", at("depends_on"), "A service can’t depend on itself.");
      else if (!services[d]) add("error", at("depends_on"), `Depends on “${d}”, but there’s no service with that name${closest(d, names) ? ` — did you mean “${closest(d, names)}”?` : ""}.`);
      const cond = isObj(s.depends_on) ? s.depends_on[d]?.condition : null;
      if (cond && !["service_started", "service_healthy", "service_completed_successfully"].includes(cond)) add("error", at(`depends_on.${d}.condition`), `“${cond}” isn’t a valid condition.`);
      if (cond === "service_healthy" && services[d] && !services[d].healthcheck) add("warning", at(`depends_on.${d}`), `Waits for “${d}” to be healthy, but “${d}” has no healthcheck: here (fine only if its image defines one).`);
    }
    // networks
    const sn = Array.isArray(s.networks) ? s.networks : isObj(s.networks) ? Object.keys(s.networks) : [];
    for (const n of sn) if (n !== "default" && !nets.has(n)) add("error", at("networks"), `Network “${n}” isn’t listed under the top-level networks:.`);
    if (s.network_mode && sn.length) add("error", at("network_mode"), "network_mode can’t be combined with networks:.");
    for (const k of ["secrets", "configs"]) for (const x of Array.isArray(s[k]) ? s[k] : []) { const n = isObj(x) ? x.source : x; if (!(k === "secrets" ? secrets : configs).has(n)) add("error", at(k), `${k === "secrets" ? "Secret" : "Config"} “${n}” isn’t listed under the top-level ${k}:.`); }
    // environment
    if (isObj(s.environment)) for (const [k, v] of Object.entries(s.environment)) {
      if (typeof v === "boolean") add("warning", at(`environment.${k}`), `Write “${v}” in quotes ("${v}") — compose environment values should be text.`);
      if (SECRETY.test(k) && typeof v === "string" && v && !v.includes("${")) add("warning", at(`environment.${k}`), "Looks like a password or key written in the file — use an .env file, ${VARIABLE} or secrets: instead.");
    } else if (Array.isArray(s.environment)) for (const e of s.environment) { const [k, v] = String(e).split(/=(.*)/s); if (!/^[A-Za-z_][\w.]*$/.test(k)) add("error", at("environment"), `“${e}” should look like NAME=value.`); if (SECRETY.test(k) && v && !v.includes("${")) add("warning", at("environment"), `${k} looks like a password written in the file — use an .env file or secrets: instead.`); }
    else if (s.environment != null) add("error", at("environment"), "environment: should be a list (- NAME=value) or a set of NAME: value.");
    if (s.healthcheck?.test != null) { const t = s.healthcheck.test; if (Array.isArray(t) && !["NONE", "CMD", "CMD-SHELL"].includes(t[0])) add("error", at("healthcheck.test"), "A healthcheck list must start with \"CMD\", \"CMD-SHELL\" or \"NONE\"."); }
    if (s.privileged === true) add("warning", at("privileged"), "privileged: true gives the container almost full access to the host.");
  }
  for (const [k, who] of hostPorts) if (who.length > 1) add("error", "ports", `Host port ${k.replace(/^\*:/, "")} is used by more than one service (${who.join(", ")}).`);
  for (const k of ["networks", "volumes"]) for (const n of declared(k)) {
    const used = Object.values(services).some((s) => JSON.stringify(k === "networks" ? s.networks ?? "" : s.volumes ?? "").includes(`"${n}`));
    if (!used) add("info", `${k}.${n}`, `${k === "networks" ? "Network" : "Volume"} “${n}” is declared but no service uses it.`);
  }
  if (vars.size) add("info", "", `Needs these variables from the environment or an .env file: ${[...vars].join(", ")}.`);
  return out;
}

const SAMPLE_COMPOSE = `services:
  web:
    image: nginx
    ports:
      - "8080:80"
    depends_on:
      - api
    restart: alway
  api:
    build: ./api
    ports:
      - "8080:3000"
    environment:
      DATABASE_URL: postgres://app:\${DB_PASSWORD}@db:5432/app
      DEBUG: true
    depends_on:
      db:
        condition: service_healthy
    netwrks:
      - backend
  db:
    image: postgres:16
    ports:
      - "5432:5432"
    environment:
      POSTGRES_PASSWORD: supersecret
    volumes:
      - pgdata:/var/lib/postgresql/data
`;

export function ComposeTool() {
  const [text, setText] = useState(() => takeHandoff(SAMPLE_COMPOSE));
  const issues = useMemo(() => (text.trim() ? validateCompose(text) : []), [text]);
  const summary = useMemo(() => { try { const d = yaml.load(text); return isObj(d?.services) ? Object.entries(d.services).filter(([, s]) => isObj(s)).map(([n, s]) => [<code key="n">{n}</code>, s.image || (s.build ? `build: ${typeof s.build === "string" ? s.build : s.build.context || "."}` : "—"), (s.ports || []).map((p) => (isObj(p) ? `${p.published ?? ""}:${p.target}` : String(p))).join(", ") || "—", (Array.isArray(s.depends_on) ? s.depends_on : isObj(s.depends_on) ? Object.keys(s.depends_on) : []).join(", ") || "—"]) : []; } catch { return []; } }, [text]);
  return (
    <>
      <Panel label="compose.yaml" value={text} onChange={setText} rows={18} />
      {text.trim() && <><div className="panel-label">{issueSummary(issues)}</div><Issues items={issues} okText="This compose file looks good." /></>}
      {summary.length > 0 && <div className="panel"><span className="panel-label">Services</span><Table head={["Service", "Runs", "Ports (host:container)", "Starts after"]} rows={summary} /></div>}
      <p className="muted small">For the final word, also run <code>docker compose config</code> — it checks with your installed Docker version.</p>
    </>
  );
}

/*__MORE__*/
