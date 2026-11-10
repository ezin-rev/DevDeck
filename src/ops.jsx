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
// [host IP:][host port:]container port[/protocol] — the IP needs dots (IPv4) or brackets (IPv6) so "8080:80" isn't read as one
const PORT_RE = /^(?:((?:\d{1,3}\.){3}\d{1,3}|\[[0-9a-fA-F:]+\]):)?(?:(\d+(?:-\d+)?):)?(\d+(?:-\d+)?)(?:\/(tcp|udp|sctp))?$/;
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

/* ======================================================================
   Kubernetes YAML validator
   ====================================================================== */
const KINDS = {
  Deployment: "apps/v1", StatefulSet: "apps/v1", DaemonSet: "apps/v1", ReplicaSet: "apps/v1", Job: "batch/v1", CronJob: "batch/v1", Pod: "v1", Service: "v1", ConfigMap: "v1", Secret: "v1",
  Namespace: "v1", ServiceAccount: "v1", PersistentVolumeClaim: "v1", PersistentVolume: "v1", Ingress: "networking.k8s.io/v1", NetworkPolicy: "networking.k8s.io/v1", IngressClass: "networking.k8s.io/v1",
  HorizontalPodAutoscaler: "autoscaling/v2", PodDisruptionBudget: "policy/v1", Role: "rbac.authorization.k8s.io/v1", RoleBinding: "rbac.authorization.k8s.io/v1",
  ClusterRole: "rbac.authorization.k8s.io/v1", ClusterRoleBinding: "rbac.authorization.k8s.io/v1", StorageClass: "storage.k8s.io/v1", LimitRange: "v1", ResourceQuota: "v1",
};
const REMOVED = { "extensions/v1beta1": "1.16/1.22", "apps/v1beta1": "1.16", "apps/v1beta2": "1.16", "batch/v1beta1": "1.25", "autoscaling/v2beta1": "1.25", "autoscaling/v2beta2": "1.26", "policy/v1beta1": "1.25", "networking.k8s.io/v1beta1": "1.22", "rbac.authorization.k8s.io/v1beta1": "1.22", "storage.k8s.io/v1beta1": "1.22" };
const DNS1123 = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?(\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)*$/;
const LABEL = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
const QTY = /^[+-]?(\d+(\.\d+)?|\.\d+)([eE][+-]?\d+|Ki|Mi|Gi|Ti|Pi|Ei|n|u|m|k|M|G|T|P|E)?$/;

function podSpecChecks(spec, at, add) {
  if (!isObj(spec)) { add("error", at, "Missing the pod spec."); return; }
  const cs = spec.containers;
  if (!Array.isArray(cs) || !cs.length) { add("error", `${at}.containers`, "Needs at least one container."); return; }
  const seen = new Set();
  for (const [i, c] of [...cs.map((c) => ["containers", c]), ...(spec.initContainers || []).map((c) => ["initContainers", c])].entries()) {
    const [list, ct] = c; const w = `${at}.${list}[${list === "containers" ? i : i - cs.length}]`;
    if (!isObj(ct)) { add("error", w, "A container should be a set of settings."); continue; }
    if (!ct.name) add("error", w, "Container needs a name:."); else { if (!LABEL.test(ct.name)) add("error", `${w}.name`, `“${ct.name}” must be lower-case letters, digits and “-”.`); if (seen.has(ct.name)) add("error", `${w}.name`, `Two containers are called “${ct.name}”.`); seen.add(ct.name); }
    if (!ct.image) add("error", w, "Container needs an image:.");
    else if (!String(ct.image).split("/").pop().includes(":") && !String(ct.image).includes("@")) add("warning", `${w}.image`, `“${ct.image}” has no tag, which means :latest — pin a version.`);
    else if (/:latest$/.test(ct.image)) add("warning", `${w}.image`, "“:latest” can change under you — pin a version.");
    for (const [j, p] of (ct.ports || []).entries()) { if (!Number.isInteger(p?.containerPort) || p.containerPort < 1 || p.containerPort > 65535) add("error", `${w}.ports[${j}]`, "containerPort must be a whole number 1–65535."); if (p?.name && (p.name.length > 15 || !LABEL.test(p.name))) add("error", `${w}.ports[${j}].name`, "Port names are at most 15 lower-case letters, digits and “-”."); }
    for (const [j, e] of (ct.env || []).entries()) {
      if (!e?.name) add("error", `${w}.env[${j}]`, "Each env entry needs a name:.");
      if (e && "value" in e && typeof e.value !== "string") add("error", `${w}.env[${j}].value`, `${e.name}: values must be text — write ${JSON.stringify(String(e.value))} in quotes.`);
      if (e?.name && SECRETY.test(e.name) && typeof e.value === "string" && e.value) add("warning", `${w}.env[${j}]`, `${e.name} is written in plain text — use valueFrom.secretKeyRef.`);
    }
    if (list === "containers") {
      const r = ct.resources;
      if (!r?.requests && !r?.limits) add("warning", `${w}.resources`, "No resources: requests/limits — the pod can starve or be starved by others.");
      for (const k of ["requests", "limits"]) for (const [rk, rv] of Object.entries(r?.[k] || {})) if (!QTY.test(String(rv))) add("error", `${w}.resources.${k}.${rk}`, `“${rv}” isn’t a valid amount (examples: 250m, 0.5, 128Mi, 1Gi).`);
      if (!ct.readinessProbe && !ct.livenessProbe) add("info", w, "No readiness or liveness probe — Kubernetes can’t tell when it’s ready or stuck.");
    }
  }
  if (spec.restartPolicy && !["Always", "OnFailure", "Never"].includes(spec.restartPolicy)) add("error", `${at}.restartPolicy`, "restartPolicy must be Always, OnFailure or Never.");
}

export function validateK8s(text) {
  const out = [];
  let docs;
  try { docs = loadAll(text); } catch (e) { return { issues: [{ level: "error", where: "", text: `Not valid YAML. ${yamlError(e)}` }], docs: [] }; }
  const all = [];
  docs.forEach((d, n) => {
    const tag = isObj(d) && d.kind ? `${d.kind}/${d.metadata?.name || "?"}` : `document ${n + 1}`;
    const add = (level, where, t) => out.push({ level, where: `${tag}${where ? " · " + where : ""}`, text: t });
    if (!isObj(d)) { add("error", "", "Each document should be a Kubernetes object (apiVersion, kind, metadata…)."); return; }
    if (d.kind === "List" && Array.isArray(d.items)) { add("info", "", `A List of ${d.items.length} objects — split them to check each.`); return; }
    if (!d.apiVersion) add("error", "apiVersion", "Missing apiVersion:.");
    if (!d.kind) add("error", "kind", "Missing kind:.");
    if (REMOVED[d.apiVersion]) add("error", "apiVersion", `${d.apiVersion} was removed in Kubernetes ${REMOVED[d.apiVersion]} — use ${KINDS[d.kind] || "the current version"}.`);
    else if (KINDS[d.kind] && d.apiVersion && d.apiVersion !== KINDS[d.kind]) add("warning", "apiVersion", `${d.kind} usually uses apiVersion ${KINDS[d.kind]}.`);
    const md = d.metadata;
    if (!isObj(md) || !(md.name || md.generateName)) add("error", "metadata.name", "Missing metadata.name.");
    else if (md.name && (!DNS1123.test(md.name) || md.name.length > 253)) add("error", "metadata.name", `“${md.name}” must be lower-case letters, digits, “-” and “.” (no capitals or “_”).`);
    for (const [k, v] of Object.entries(md?.labels || {})) if (typeof v !== "string") add("error", `metadata.labels.${k}`, `Label values must be text — quote ${JSON.stringify(String(v))}.`); else if (v.length > 63 || (v && !/^[A-Za-z0-9]([-A-Za-z0-9_.]*[A-Za-z0-9])?$/.test(v))) add("error", `metadata.labels.${k}`, `“${v}” isn’t a valid label value (max 63 letters, digits, - _ .).`);
    for (const [k, v] of Object.entries(md?.annotations || {})) if (typeof v !== "string") add("error", `metadata.annotations.${k}`, `Annotation values must be text — quote ${JSON.stringify(String(v))}.`);
    const s = d.spec;
    if (["Deployment", "StatefulSet", "DaemonSet", "ReplicaSet"].includes(d.kind)) {
      if (!isObj(s)) { add("error", "spec", "Missing spec:."); return; }
      const sel = s.selector?.matchLabels, tl = s.template?.metadata?.labels;
      if (!sel) add("error", "spec.selector.matchLabels", "Needs spec.selector.matchLabels.");
      if (!tl) add("error", "spec.template.metadata.labels", "Needs labels on the pod template.");
      if (sel && tl) for (const [k, v] of Object.entries(sel)) if (tl[k] !== v) add("error", "spec.selector", `Selector ${k}=${v} doesn’t match the pod template labels — the ${d.kind} would never find its pods.`);
      if (s.replicas != null && (!Number.isInteger(s.replicas) || s.replicas < 0)) add("error", "spec.replicas", "replicas must be a whole number.");
      if (d.kind === "StatefulSet" && !s.serviceName) add("warning", "spec.serviceName", "StatefulSets usually need serviceName: (a headless Service).");
      podSpecChecks(s.template?.spec, "spec.template.spec", add);
      all.push({ kind: "workload", labels: tl || {}, ns: md?.namespace, d });
    } else if (d.kind === "Pod") { podSpecChecks(s, "spec", add); all.push({ kind: "workload", labels: md?.labels || {}, ns: md?.namespace, d }); }
    else if (d.kind === "Job") podSpecChecks(s?.template?.spec, "spec.template.spec", add);
    else if (d.kind === "CronJob") {
      if (!s?.schedule) add("error", "spec.schedule", "Needs schedule: (a cron expression).");
      else { try { const f = parseCron(String(s.schedule)); add("info", "spec.schedule", `Runs ${describeCron(f)}${s.timeZone ? ` (${s.timeZone})` : " (in the cluster’s time zone, usually UTC)"}.`); } catch (e) { add("error", "spec.schedule", `“${s.schedule}” isn’t a valid cron schedule: ${e.message}`); } }
      podSpecChecks(s?.jobTemplate?.spec?.template?.spec, "spec.jobTemplate.spec.template.spec", add);
    } else if (d.kind === "Service") {
      const type = s?.type || "ClusterIP";
      if (!["ClusterIP", "NodePort", "LoadBalancer", "ExternalName"].includes(type)) add("error", "spec.type", `“${type}” isn’t a Service type.`);
      if (type !== "ExternalName" && !s?.selector) add("warning", "spec.selector", "No selector — this Service won’t send traffic to any pods unless you add Endpoints yourself.");
      for (const [i, p] of (s?.ports || []).entries()) {
        if (!Number.isInteger(p?.port)) add("error", `spec.ports[${i}].port`, "port must be a whole number.");
        if (p?.nodePort != null && (p.nodePort < 30000 || p.nodePort > 32767)) add("error", `spec.ports[${i}].nodePort`, "nodePort must be between 30000 and 32767.");
        if ((s.ports.length > 1) && !p?.name) add("error", `spec.ports[${i}]`, "With several ports, each one needs a name:.");
      }
      all.push({ kind: "service", d, ns: md?.namespace });
    } else if (d.kind === "Ingress") {
      for (const [i, r] of (s?.rules || []).entries()) for (const [j, p] of (r?.http?.paths || []).entries()) {
        const w = `spec.rules[${i}].http.paths[${j}]`;
        if (!p?.pathType) add("error", w, "Each path needs pathType: Prefix, Exact or ImplementationSpecific.");
        if (p?.backend?.serviceName) add("error", `${w}.backend`, "serviceName/servicePort is the old format — use backend.service.name and backend.service.port.number.");
        else if (!p?.backend?.service?.name) add("error", `${w}.backend`, "Needs backend.service.name.");
        else all.push({ kind: "ingressRef", name: p.backend.service.name, ns: md?.namespace, where: `${tag} · ${w}` });
      }
      if (!s?.ingressClassName && !md?.annotations?.["kubernetes.io/ingress.class"]) add("info", "spec.ingressClassName", "No ingressClassName — the cluster’s default ingress controller will be used, if there is one.");
    } else if (d.kind === "ConfigMap") {
      for (const [k, v] of Object.entries(d.data || {})) if (typeof v !== "string") add("error", `data.${k}`, `ConfigMap values must be text — quote ${JSON.stringify(String(v))}.`);
    } else if (d.kind === "Secret") {
      for (const [k, v] of Object.entries(d.data || {})) { if (typeof v !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(v.replace(/\s/g, ""))) add("error", `data.${k}`, "Values under data: must be Base64 — or put plain text under stringData: instead."); }
      add("info", "", "Secrets in YAML are only Base64 encoded, not encrypted — don’t commit them to git.");
    }
  });
  // cross-document checks
  for (const svc of all.filter((x) => x.kind === "service")) {
    const sel = svc.d.spec?.selector;
    if (!sel || svc.d.spec?.type === "ExternalName") continue;
    const workloads = all.filter((x) => x.kind === "workload" && (x.ns || "default") === (svc.ns || "default"));
    if (workloads.length && !workloads.some((w) => Object.entries(sel).every(([k, v]) => w.labels[k] === v))) out.push({ level: "warning", where: `Service/${svc.d.metadata?.name}`, text: `Its selector (${Object.entries(sel).map(([k, v]) => `${k}=${v}`).join(", ")}) doesn’t match the pods of any workload in this file.` });
  }
  const svcNames = new Set(all.filter((x) => x.kind === "service").map((x) => `${x.ns || "default"}/${x.d.metadata?.name}`));
  if (svcNames.size) for (const r of all.filter((x) => x.kind === "ingressRef")) if (!svcNames.has(`${r.ns || "default"}/${r.name}`)) out.push({ level: "info", where: r.where, text: `Points to Service “${r.name}”, which isn’t in this file (fine if it already exists).` });
  return { issues: out, docs };
}

const SAMPLE_K8S = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: shop_web
  labels:
    app: shop
spec:
  replicas: 2
  selector:
    matchLabels:
      app: shop
  template:
    metadata:
      labels:
        app: shop-web
    spec:
      containers:
        - name: web
          image: nginx
          ports:
            - containerPort: 80
          env:
            - name: FEATURE_X
              value: true
---
apiVersion: v1
kind: Service
metadata:
  name: shop
spec:
  selector:
    app: shop
  ports:
    - port: 80
      targetPort: 80
---
apiVersion: extensions/v1beta1
kind: Ingress
metadata:
  name: shop
spec:
  rules:
    - host: shop.example
      http:
        paths:
          - path: /
            backend:
              serviceName: shop
              servicePort: 80
`;

export function K8sValidateTool() {
  const [text, setText] = useState(() => takeHandoff(SAMPLE_K8S));
  const r = useMemo(() => (text.trim() ? validateK8s(text) : { issues: [], docs: [] }), [text]);
  return (
    <>
      <Panel label="Kubernetes YAML (several documents separated by ---)" value={text} onChange={setText} rows={18} />
      {text.trim() && <>
        <div className="panel-label">{r.docs.length} {r.docs.length === 1 ? "object" : "objects"} · {issueSummary(r.issues)}</div>
        <Issues items={r.issues} okText="These manifests look good." />
      </>}
      <p className="muted small">Checks required fields, removed API versions, names, labels and selectors, container images, resources, probes, ports, env values and links between objects. To check against your real cluster, also run <code>kubectl apply --dry-run=server -f file.yaml</code>.</p>
    </>
  );
}

/* ======================================================================
   Helm values diff
   ====================================================================== */
export function diffValues(a, b, path = "", out = []) {
  const key = (p, k) => (/^[A-Za-z_][\w-]*$/.test(k) ? (p ? `${p}.${k}` : k) : `${p}["${k}"]`);
  if (isObj(a) && isObj(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (!(k in b)) out.push({ kind: "removed", path: key(path, k), old: a[k] });
      else if (!(k in a)) out.push({ kind: "added", path: key(path, k), new: b[k] });
      else diffValues(a[k], b[k], key(path, k), out);
    }
  } else if (Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x) => isObj(x) || Array.isArray(x))) {
    a.forEach((x, i) => diffValues(x, b[i], `${path}[${i}]`, out));
  } else if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ kind: "changed", path: path || "(top)", old: a, new: b });
  return out;
}
const show = (v) => (v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v));
const setIn = (obj, path, v) => { const parts = path.match(/[^.[\]"]+/g); let o = obj; parts.slice(0, -1).forEach((p) => { o = o[p] ??= {}; }); o[parts.at(-1)] = v; };

export function HelmDiffTool() {
  const [a, setA] = useState(() => takeHandoff("replicaCount: 1\nimage:\n  repository: nginx\n  tag: \"1.25\"\n  pullPolicy: IfNotPresent\nservice:\n  type: ClusterIP\n  port: 80\ningress:\n  enabled: false\nresources: {}\n"));
  const [b, setB] = useState("replicaCount: 3\nimage:\n  repository: nginx\n  tag: \"1.27\"\n  pullPolicy: IfNotPresent\nservice:\n  type: LoadBalancer\n  port: 80\ningress:\n  enabled: true\n  hosts:\n    - shop.example\nresources:\n  limits:\n    memory: 256Mi\n");
  const [view, setView] = useState("table");
  const r = useMemo(() => {
    try {
      const va = yaml.load(a) ?? {}, vb = yaml.load(b) ?? {};
      const list = diffValues(va, vb);
      const overrides = {};
      list.filter((x) => x.kind !== "removed").forEach((x) => setIn(overrides, x.path, x.new));
      return { list, overrides };
    } catch (e) { return { err: yamlError(e), list: [] }; }
  }, [a, b]);
  const sets = r.list.filter((x) => x.kind !== "removed" && (typeof x.new !== "object" || x.new === null)).map((x) => `--set ${x.path.replace(/\["([^"]+)"\]/g, (_, k) => "." + k.replace(/\./g, "\\."))}=${show(x.new)}`);
  const count = (k) => r.list.filter((x) => x.kind === k).length;
  return (
    <>
      <div className="split">
        <Panel label="Before (e.g. the chart’s default values.yaml)" value={a} onChange={setA} rows={14} />
        <Panel label="After (e.g. your values or the new chart version)" value={b} onChange={setB} rows={14} error={r.err} />
      </div>
      {!r.err && <>
        <div className="options-row">
          <span className="badge ok-badge">{count("added")} added</span><span className="badge warn-badge">{count("changed")} changed</span><span className="badge no-badge">{count("removed")} removed</span>
          <Segmented label="Show" value={view} onChange={setView} options={[["table", "Differences"], ["overrides", "Only my overrides (YAML)"], ["set", "--set flags"]]} />
        </div>
        {view === "table" && <Table head={["", "Key", "Before", "After"]} rows={r.list.map((x) => [<span key="k" className={`badge ${x.kind === "added" ? "ok-badge" : x.kind === "removed" ? "no-badge" : "warn-badge"}`}>{x.kind}</span>, <code key="p">{x.path}</code>, <code key="o" className="wrap-cell">{show(x.old)}</code>, <code key="n" className="wrap-cell">{show(x.new)}</code>])} empty="The two files have the same values." />}
        {view === "overrides" && <Panel label="values-override.yaml (only what differs)" value={Object.keys(r.overrides).length ? yaml.dump(r.overrides, { lineWidth: -1 }) : ""} readOnly rows={12} />}
        {view === "set" && <Panel label="helm upgrade … flags" value={sets.join(" \\\n")} readOnly rows={8} />}
      </>}
      <p className="muted small">Lists of settings are compared item by item; other lists are compared as a whole. With a live cluster, <code>helm get values RELEASE</code> shows what’s deployed.</p>
    </>
  );
}

/* ======================================================================
   Kubeconfig inspector
   ====================================================================== */
const certInfo = (b64) => {
  try {
    const c = parseCertificate(b64ToBytes(b64));
    const days = Math.floor((c.notAfter - Date.now()) / 864e5);
    const cn = c.subject.parts.find((p) => p.short === "CN")?.value;
    const groups = c.subject.parts.filter((p) => p.short === "O").map((p) => p.value);
    return { cn, groups, notAfter: c.notAfter, days, issuer: c.issuer.parts.find((p) => p.short === "CN")?.value || c.issuer.text };
  } catch { return null; }
};
const jwtExp = (t) => { try { const p = JSON.parse(new TextDecoder().decode(b64ToBytes(t.split(".")[1]))); return p; } catch { return null; } };
const REDACT = ["client-key-data", "token", "password", "client-key", "refresh-token", "id-token", "access-token", "client-secret"];
const redact = (v) => (Array.isArray(v) ? v.map(redact) : isObj(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, REDACT.includes(k) && typeof x === "string" ? "REDACTED" : redact(x)])) : v);

export function KubeconfigTool() {
  const [text, setText] = useState(() => takeHandoff(`apiVersion: v1
kind: Config
current-context: dev
clusters:
  - name: dev-cluster
    cluster:
      server: https://10.0.0.10:6443
      insecure-skip-tls-verify: true
  - name: prod-cluster
    cluster:
      server: https://k8s.prod.example:6443
      certificate-authority: /etc/kubernetes/pki/ca.crt
contexts:
  - name: dev
    context: { cluster: dev-cluster, user: dev-admin, namespace: shop }
  - name: prod
    context: { cluster: prod-cluster, user: prod-sso }
  - name: old
    context: { cluster: gone-cluster, user: dev-admin }
users:
  - name: dev-admin
    user:
      token: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJkZXYtYWRtaW4iLCJleHAiOjE3MDAwMDAwMDB9.c2ln
  - name: prod-sso
    user:
      exec:
        apiVersion: client.authentication.k8s.io/v1beta1
        command: kubelogin
        args: [get-token, --server-id, abc]
`));
  const [pick, setPick] = useState("");
  const r = useMemo(() => {
    let cfg;
    try { cfg = yaml.load(text); } catch (e) { return { err: `Not valid YAML. ${yamlError(e)}` }; }
    if (!isObj(cfg) || !(cfg.clusters || cfg.contexts || cfg.users)) return { err: "This doesn’t look like a kubeconfig (it should have clusters:, contexts: and users:)." };
    const issues = [];
    const add = (level, where, t) => issues.push({ level, where, text: t });
    const clusters = Object.fromEntries((cfg.clusters || []).map((c) => [c.name, c.cluster || {}]));
    const users = Object.fromEntries((cfg.users || []).map((u) => [u.name, u.user || {}]));
    const contexts = (cfg.contexts || []).map((c) => ({ name: c.name, ...(c.context || {}) }));
    if (!cfg["current-context"]) add("info", "current-context", "No current context is set — kubectl will ask you to choose one.");
    else if (!contexts.some((c) => c.name === cfg["current-context"])) add("error", "current-context", `“${cfg["current-context"]}” isn’t one of the contexts.`);
    for (const c of contexts) {
      if (!clusters[c.cluster]) add("error", `contexts.${c.name}`, `Uses cluster “${c.cluster}”, which isn’t defined.`);
      if (!users[c.user]) add("error", `contexts.${c.name}`, `Uses user “${c.user}”, which isn’t defined.`);
    }
    const clusterRows = Object.entries(clusters).map(([n, c]) => {
      let ca = c["certificate-authority-data"] ? certInfo(c["certificate-authority-data"]) : null;
      if (c["insecure-skip-tls-verify"]) add("warning", `clusters.${n}`, "insecure-skip-tls-verify: true — the server’s identity isn’t checked.");
      if (ca && ca.days < 0) add("error", `clusters.${n}`, `The cluster’s CA certificate expired on ${ca.notAfter.toLocaleDateString()}.`);
      if (c.server && !/^https:\/\//.test(c.server)) add("warning", `clusters.${n}`, "The server address isn’t https.");
      return [<code key="n">{n}</code>, <code key="s">{c.server || "—"}</code>, c["insecure-skip-tls-verify"] ? "Not checked (insecure)" : ca ? `${ca.issuer}, until ${ca.notAfter.toLocaleDateString()}` : c["certificate-authority"] ? `File: ${c["certificate-authority"]}` : "System trust store"];
    });
    const userRows = Object.entries(users).map(([n, u]) => {
      let how = "Nothing set", detail = "";
      if (u["client-certificate-data"]) {
        const ci = certInfo(u["client-certificate-data"]);
        how = "Client certificate";
        if (ci) { detail = `User “${ci.cn}”${ci.groups.length ? `, groups ${ci.groups.join(", ")}` : ""}; valid until ${ci.notAfter.toLocaleDateString()} (${ci.days < 0 ? "expired" : `${ci.days} days left`})`; if (ci.days < 0) add("error", `users.${n}`, "The client certificate has expired."); else if (ci.days < 30) add("warning", `users.${n}`, `The client certificate expires in ${ci.days} days.`); if (ci.groups.includes("system:masters")) add("warning", `users.${n}`, "This certificate is in system:masters — full, unrevocable cluster-admin access."); }
      } else if (u["client-certificate"]) { how = "Client certificate (file)"; detail = u["client-certificate"]; }
      else if (u.token) {
        how = "Token"; const p = jwtExp(u.token);
        if (p?.exp) { const d = new Date(p.exp * 1000); detail = `${p.sub ? `for ${p.sub}, ` : ""}expires ${d.toLocaleString()}`; if (d < Date.now()) add("warning", `users.${n}`, `The token expired on ${d.toLocaleDateString()}.`); }
        else detail = p?.sub ? `for ${p.sub} (no expiry)` : "Not a JWT (or no expiry)";
      } else if (u.exec) { how = "Command (exec plugin)"; detail = [u.exec.command, ...(u.exec.args || [])].join(" "); if (/v1alpha1/.test(u.exec.apiVersion || "")) add("warning", `users.${n}.exec`, "client.authentication.k8s.io/v1alpha1 was removed in Kubernetes 1.24 — use v1beta1 or v1."); }
      else if (u["auth-provider"]) { how = `auth-provider (${u["auth-provider"].name})`; add("warning", `users.${n}`, "auth-provider plugins were removed in Kubernetes 1.26 — switch to an exec plugin (e.g. kubelogin, gke-gcloud-auth-plugin)."); }
      else if (u.username) { how = "Username & password"; add("warning", `users.${n}`, "Basic username/password login isn’t supported by modern clusters."); }
      if (u["client-key-data"] || u.token || u.password) add("info", `users.${n}`, "Contains a secret — use “Copy without secrets” before sharing this file.");
      return [<code key="n">{n}</code>, how, <span key="d" className="wrap-cell">{detail}</span>];
    });
    return { cfg, issues, contexts, clusterRows, userRows, clusters, users };
  }, [text]);
  const one = useMemo(() => {
    if (!r.cfg || !pick) return "";
    const c = r.contexts.find((x) => x.name === pick); if (!c) return "";
    return yaml.dump({ apiVersion: "v1", kind: "Config", "current-context": c.name, clusters: (r.cfg.clusters || []).filter((x) => x.name === c.cluster), contexts: (r.cfg.contexts || []).filter((x) => x.name === c.name), users: (r.cfg.users || []).filter((x) => x.name === c.user) }, { lineWidth: -1 });
  }, [r, pick]);
  return (
    <>
      <Panel label="kubeconfig (~/.kube/config) — it stays on your device" value={text} onChange={setText} rows={12} error={r.err} />
      {r.cfg && <>
        <div className="panel"><span className="panel-label">Contexts ({r.contexts.length})</span>
          <Table head={["", "Context", "Cluster", "User", "Namespace"]} rows={r.contexts.map((c) => [c.name === r.cfg["current-context"] ? <span key="c" className="badge ok-badge">current</span> : "", <code key="n">{c.name}</code>, c.cluster, c.user, c.namespace || "default"])} />
        </div>
        <div className="panel"><span className="panel-label">Clusters</span><Table head={["Cluster", "Server", "Server identity checked with"]} rows={r.clusterRows} /></div>
        <div className="panel"><span className="panel-label">Users</span><Table head={["User", "Logs in with", "Details"]} rows={r.userRows} /></div>
        <div className="panel-label">{issueSummary(r.issues)}</div>
        <Issues items={r.issues} okText="No problems found in this kubeconfig." />
        <div className="split">
          <Panel label="Copy without secrets (keys, tokens and passwords replaced)" value={yaml.dump(redact(r.cfg), { lineWidth: -1 })} readOnly rows={10} />
          <div className="panel">
            <div className="panel-head"><span className="panel-label">Just one context</span><select className="field small-select" value={pick} onChange={(e) => setPick(e.target.value)}><option value="">Choose…</option>{r.contexts.map((c) => <option key={c.name}>{c.name}</option>)}</select></div>
            <textarea className="field mono" rows={9} readOnly value={one} placeholder="Pick a context to get a small kubeconfig with only it" />
          </div>
        </div>
      </>}
    </>
  );
}

/* ======================================================================
   Docker image inspector (name breakdown + pasted docker inspect output)
   ====================================================================== */
export function parseImageRef(ref) {
  let s = ref.trim().replace(/^docker:\/\//, "");
  if (!s || /\s/.test(s)) throw new Error("Enter an image name such as nginx:1.27 or ghcr.io/owner/app:v2.");
  let digest = null;
  if (s.includes("@")) [s, digest] = s.split("@");
  const parts = s.split("/");
  let registry = "docker.io";
  if (parts.length > 1 && (parts[0].includes(".") || parts[0].includes(":") || parts[0] === "localhost")) registry = parts.shift();
  let last = parts.pop(), tag = null;
  if (last.includes(":")) [last, tag] = last.split(":");
  parts.push(last);
  let repo = parts.join("/");
  if (registry === "docker.io" && !repo.includes("/")) repo = `library/${repo}`;
  if (!/^[a-z0-9]+([._-][a-z0-9]+)*(\/[a-z0-9]+([._-][a-z0-9]+)*)*$/.test(repo)) throw new Error("Repository names use lower-case letters, digits, “.”, “_” and “-”.");
  if (tag && !/^[\w][\w.-]{0,127}$/.test(tag)) throw new Error(`“${tag}” isn’t a valid tag.`);
  if (digest && !/^sha256:[a-f0-9]{64}$/.test(digest)) throw new Error("A digest looks like sha256: followed by 64 hex characters.");
  return { registry, repo, tag: tag || (digest ? null : "latest"), implicitTag: !tag && !digest, digest, full: `${registry}/${repo}${tag || !digest ? `:${tag || "latest"}` : ""}${digest ? `@${digest}` : ""}` };
}

export function DockerImageTool() {
  const [ref, setRef] = useState("nginx");
  const [json, setJson] = useState(() => takeHandoff(""));
  const r = useMemo(() => { try { return parseImageRef(ref); } catch (e) { return { err: e.message }; } }, [ref]);
  const insp = useMemo(() => {
    if (!json.trim()) return null;
    let d; try { d = JSON.parse(json); } catch (e) { return { err: `Paste the JSON printed by docker image inspect (${e.message}).` }; }
    if (Array.isArray(d)) d = d[0];
    if (!isObj(d)) return { err: "That JSON isn’t image details." };
    const issues = [];
    if (d.manifests) return { platforms: d.manifests.map((m) => [`${m.platform?.os}/${m.platform?.architecture}${m.platform?.variant ? "/" + m.platform.variant : ""}`, <code key="d">{m.digest?.slice(0, 19)}…</code>, fmtBytes(m.size || 0)]), issues };
    if (d.layers && !d.Config) return { layers: d.layers.map((l, i) => [i + 1, <code key="d">{l.digest?.slice(0, 19)}…</code>, fmtBytes(l.size || 0)]), total: d.layers.reduce((n, l) => n + (l.size || 0), 0), issues };
    const c = d.Config || {};
    const env = c.Env || [];
    if (!c.User || /^(0|root)(:|$)/.test(c.User)) issues.push({ level: "warning", where: "Config.User", text: "Runs as root — if someone breaks in, they get root inside the container. Add a USER line to the Dockerfile." });
    if (!c.Healthcheck) issues.push({ level: "info", where: "Config.Healthcheck", text: "No HEALTHCHECK — Docker can’t tell if the app inside is working." });
    for (const e of env) { const k = e.split("=")[0]; if (SECRETY.test(k) && e.split("=")[1]) issues.push({ level: "warning", where: `Env ${k}`, text: "A secret is baked into the image — anyone who can pull it can read it." }); }
    if ((d.RepoTags || []).some((t) => t.endsWith(":latest"))) issues.push({ level: "info", where: "RepoTags", text: "Tagged :latest — use a version tag for deployments." });
    if (d.Size > 1e9) issues.push({ level: "warning", where: "Size", text: `The image is ${fmtBytes(d.Size)} — consider a slimmer base image or a multi-stage build.` });
    return {
      rows: [["ID", d.Id], ["Tags", (d.RepoTags || []).join(", ")], ["Digest", (d.RepoDigests || []).join(", ")], ["Created", d.Created ? new Date(d.Created).toLocaleString() : ""], ["Platform", [d.Os, d.Architecture, d.Variant].filter(Boolean).join("/")], ["Size", d.Size ? fmtBytes(d.Size) : ""], ["Layers", String(d.RootFS?.Layers?.length ?? "")],
        ["Runs", [...(c.Entrypoint || []), ...(c.Cmd || [])].join(" ")], ["Working folder", c.WorkingDir], ["User", c.User || "root (not set)"], ["Ports", Object.keys(c.ExposedPorts || {}).join(", ")], ["Volumes", Object.keys(c.Volumes || {}).join(", ")],
        ["Healthcheck", c.Healthcheck ? (c.Healthcheck.Test || []).join(" ") : ""], ["Environment", env.join("\n")], ["Labels", Object.entries(c.Labels || {}).map(([k, v]) => `${k}=${v}`).join("\n")]].filter(([, v]) => v),
      issues,
    };
  }, [json]);
  const hub = r.registry === "docker.io" ? (r.repo.startsWith("library/") ? `https://hub.docker.com/_/${r.repo.slice(8)}` : `https://hub.docker.com/r/${r.repo}`) : r.registry === "ghcr.io" ? `https://github.com/${r.repo?.split("/")[0]}?tab=packages` : r.registry === "quay.io" ? `https://quay.io/repository/${r.repo}` : null;
  const name = r.err ? "" : r.full.replace(/^docker\.io\/(library\/)?/, "");
  return (
    <>
      <div className="panel">
        <span className="panel-label">Image name</span>
        <input className={`field mono ${r.err ? "has-error" : ""}`} value={ref} onChange={(e) => setRef(e.target.value)} placeholder="nginx:1.27, ghcr.io/owner/app:v2, registry:5000/team/api@sha256:…" aria-label="Image name" />
        {r.err && <p className="error">{r.err}</p>}
        {!r.err && <div className="result-list">
          <Result label="Registry" value={r.registry === "docker.io" ? "docker.io (Docker Hub)" : r.registry} copy={false} />
          <Result label="Repository" value={r.repo} />
          <Result label="Tag" value={r.tag ? `${r.tag}${r.implicitTag ? " (not written — means latest)" : ""}` : "—"} copy={false} />
          {r.digest && <Result label="Digest" value={r.digest} />}
          <Result label="Full name" value={r.full} />
        </div>}
        {r.implicitTag && <p className="muted small">No tag means <code>:latest</code>, which changes whenever the publisher pushes. Pin a version or a digest for repeatable builds.</p>}
      </div>
      {!r.err && <div className="panel">
        <span className="panel-label">Look inside it (run these, then paste the output below)</span>
        <div className="result-list">
          <Result label="Details" value={`docker image inspect ${name}`} />
          <Result label="Layers & sizes" value={`docker history --no-trunc ${name}`} />
          <Result label="Platforms" value={`docker manifest inspect ${name}`} />
          <Result label="Without pulling" value={`skopeo inspect docker://${r.full}`} />
        </div>
        {hub && <p className="muted small">Registry page: <a className="inline-link" href={hub} target="_blank" rel="noreferrer noopener">{hub} ↗</a> (registries don’t let other websites read image details directly, so this can’t be fetched here).</p>}
      </div>}
      <Panel label="Paste the output of docker image inspect (or docker manifest inspect)" value={json} onChange={setJson} rows={8} error={insp?.err} />
      {insp?.rows && <>
        <div className="result-list">{insp.rows.map(([k, v]) => <Result key={k} label={k} value={v} />)}</div>
        <Issues items={insp.issues} okText="No obvious problems with this image." />
      </>}
      {insp?.platforms && <div className="panel"><span className="panel-label">Platforms in this image</span><Table head={["Platform", "Digest", "Manifest size"]} rows={insp.platforms} /></div>}
      {insp?.layers && <div className="panel"><span className="panel-label">{insp.layers.length} layers · {fmtBytes(insp.total)} compressed</span><Table head={["#", "Digest", "Size"]} rows={insp.layers} /></div>}
    </>
  );
}

/* ======================================================================
   NGINX config formatter
   ====================================================================== */
export function formatNginx(src, indent = "    ") {
  const toks = []; let i = 0, line = 1;
  while (i < src.length) {
    const c = src[i];
    if (c === "\n") { toks.push({ t: "nl", line }); line++; i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (c === "#") { let j = i; while (j < src.length && src[j] !== "\n") j++; toks.push({ t: "comment", v: src.slice(i, j).trimEnd(), line }); i = j; continue; }
    if (c === "{" || c === "}" || c === ";") { toks.push({ t: c, line }); i++; continue; }
    let j = i, word = "";
    while (j < src.length && !/[\s{};#]/.test(src[j]) || (j < src.length && src[j] === "#" && word && !/\s/.test(src[j - 1]))) {
      if (src[j] === '"' || src[j] === "'") { const q = src[j]; let k = j + 1; while (k < src.length && src[k] !== q) { if (src[k] === "\\") k++; if (src[k] === "\n") line++; k++; } word += src.slice(j, k + 1); j = k + 1; continue; }
      if (src[j] === "$" && src[j + 1] === "{") { const k = src.indexOf("}", j); word += src.slice(j, k + 1); j = k + 1; continue; }
      if (src[j] === "\\") { word += src.slice(j, j + 2); j += 2; continue; }
      word += src[j++];
    }
    toks.push({ t: "word", v: word, line }); i = j;
  }
  const out = []; let depth = 0, cur = [], blank = 0, lastWasOpen = false;
  const errors = [];
  const emit = (s) => { if (blank && out.length && !lastWasOpen) out.push(""); blank = 0; out.push(indent.repeat(depth) + s); lastWasOpen = false; };
  let nlRun = 0;
  for (const tk of toks) {
    if (tk.t === "nl") { if (!cur.length) { nlRun++; if (nlRun >= 2) blank = 1; } continue; }
    nlRun = 0;
    if (tk.t === "word") cur.push(tk.v);
    else if (tk.t === ";") { if (!cur.length) continue; emit(cur.join(" ") + ";"); cur = []; nlRun = 1; }
    else if (tk.t === "{") { emit(cur.length ? cur.join(" ") + " {" : "{"); cur = []; depth++; lastWasOpen = true; blank = 0; nlRun = 1; }
    else if (tk.t === "}") {
      if (cur.length) { errors.push(`Line ${tk.line}: “${cur.join(" ")}” is missing a “;” at the end.`); emit(cur.join(" ") + ";"); cur = []; }
      if (depth === 0) { errors.push(`Line ${tk.line}: there’s a “}” without a matching “{”.`); continue; }
      depth--; blank = 0; out.push(indent.repeat(depth) + "}"); nlRun = 1;
      lastWasOpen = false;
    } else if (tk.t === "comment") {
      if (cur.length) { // comment in the middle of a directive: keep it on its own line above
        out.push(indent.repeat(depth) + tk.v);
      } else {
        const prev = out[out.length - 1];
        const sameLine = toks[toks.indexOf(tk) - 1]?.t === ";" || toks[toks.indexOf(tk) - 1]?.t === "{" || toks[toks.indexOf(tk) - 1]?.t === "}";
        if (sameLine && prev !== undefined && nlRun <= 1) out[out.length - 1] = `${prev}  ${tk.v}`; else emit(tk.v);
      }
    }
  }
  if (cur.length) { errors.push(`The last directive “${cur.join(" ")}” is missing a “;”.`); emit(cur.join(" ") + ";"); }
  if (depth > 0) errors.push(`${depth} “{” ${depth === 1 ? "is" : "are"} never closed with “}”.`);
  return { text: out.join("\n") + "\n", errors };
}

export function NginxTool() {
  const [input, setInput] = useState(() => takeHandoff(`server {
listen 80;
  server_name shop.example www.shop.example;   # main site
    location / {
  proxy_pass http://127.0.0.1:3000;
proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
  }


location ~* \\.(css|js|png)$ { expires 30d; add_header Cache-Control "public"; }
    location /api { return 301 https://$host$request_uri }
}`));
  const [ind, setInd] = useState("4");
  const r = useMemo(() => (input.trim() ? formatNginx(input, ind === "tab" ? "\t" : " ".repeat(+ind)) : { text: "", errors: [] }), [input, ind]);
  return (
    <>
      <Options>
        <Segmented label="Indent" value={ind} onChange={setInd} options={[["2", "2 spaces"], ["4", "4 spaces"], ["tab", "Tab"]]} />
      </Options>
      <div className="split">
        <Panel label="nginx.conf" value={input} onChange={setInput} rows={18} />
        <Panel label="Formatted" value={r.text} readOnly rows={18} />
      </div>
      {r.errors.length > 0 && <Issues items={r.errors.map((t) => ({ level: "error", text: t }))} />}
      <p className="muted small">Formatting only — to check the settings themselves, run <code>nginx -t</code> on the server.</p>
    </>
  );
}

export const OPS_VIEWS = {
  "/validators/compose-validator": ComposeTool,
  "/validators/k8s-validator": K8sValidateTool,
  "/data/helm-diff": HelmDiffTool,
  "/validators/kubeconfig": KubeconfigTool,
  "/validators/docker-image": DockerImageTool,
  "/formatters/nginx": NginxTool,
};
