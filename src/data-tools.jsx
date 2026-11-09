import { useMemo, useState } from "react";
import yaml from "js-yaml";
import { parse as tomlParse, stringify as tomlStringify } from "smol-toml";
import { JSONPath } from "jsonpath-plus";
import { Panel, Options, Segmented } from "./tools.jsx";
import { takeHandoff, peekHandoff } from "./handoff.js";
import { parseData, Table, Issues, issueSummary } from "./shared.jsx";

const SAMPLE_STORE = `{
  "store": {
    "name": "Corner Books",
    "open": true,
    "books": [
      { "title": "The Quiet Garden", "author": "A. Rivers", "price": 8.95, "tags": ["calm", "nature"] },
      { "title": "Night Train", "author": "B. Stone", "price": 12.5, "tags": ["mystery"] },
      { "title": "Small Steps", "author": "A. Rivers", "price": 22, "isbn": "0-123-45678-9" }
    ],
    "address": { "city": "Springfield", "zip": "12345" }
  }
}`;

/* ======================================================================
   JSONPath tester
   ====================================================================== */
export function JsonPathTool() {
  const [input, setInput] = useState(() => takeHandoff(SAMPLE_STORE));
  const [path, setPath] = useState("$.store.books[?(@.price < 15)].title");
  const data = useMemo(() => { try { return { v: parseData(input, yaml) }; } catch (e) { return { err: e.message }; } }, [input]);
  const res = useMemo(() => {
    if (data.err || data.v === undefined || !path.trim()) return { list: [] };
    try { return { list: JSONPath({ path: path.trim(), json: data.v, resultType: "all", eval: "safe" }) }; }
    catch (e) { return { list: [], err: e.message }; }
  }, [data, path]);
  const examples = [["All titles", "$.store.books[*].title"], ["Cheaper than 15", "$.store.books[?(@.price < 15)].title"], ["Every price anywhere", "$..price"], ["Last book", "$.store.books[-1:]"], ["Books with an isbn", "$.store.books[?(@.isbn)]"], ["First two authors", "$.store.books[0:2].author"]];
  const values = JSON.stringify(res.list.map((r) => r.value), null, 2);
  return (
    <>
      <div className="panel">
        <span className="panel-label">JSONPath query</span>
        <input className={`field mono ${res.err ? "has-error" : ""}`} value={path} onChange={(e) => setPath(e.target.value)} spellCheck={false} aria-label="JSONPath query" />
        {res.err && <p className="error">{res.err}</p>}
        <div className="options-row"><span className="muted small">Examples:</span>{examples.map(([l, p]) => <button key={l} className="chip" onClick={() => setPath(p)}>{l}</button>)}</div>
      </div>
      <div className="split">
        <Panel label="JSON or YAML" value={input} onChange={setInput} error={data.err} rows={18} />
        <Panel label={`Matches (${res.list.length})`} value={res.list.length ? values : ""} readOnly rows={18} />
      </div>
      {res.list.length > 0 && (
        <div className="panel">
          <span className="panel-label">Where each match is</span>
          <Table head={["Path", "Value"]} rows={res.list.map((r) => [<code key="p">{r.path}</code>, <code key="v">{short(r.value)}</code>])} />
        </div>
      )}
      <p className="muted small">Tips: <code>$</code> is the top, <code>..</code> searches at any depth, <code>[*]</code> means every item, <code>[?(@.price &lt; 10)]</code> filters, <code>[0:2]</code> slices.</p>
    </>
  );
}
const short = (v) => { const s = JSON.stringify(v); return s.length > 90 ? s.slice(0, 87) + "…" : s; };

/* ======================================================================
   YAML / JSON → every path (JSONPath, dot notation, helm --set)
   ====================================================================== */
export function leafPaths(v, style = "jsonpath") {
  const out = [];
  const key = (base, k) => {
    if (style === "jsonpath") return /^[A-Za-z_$][\w$]*$/.test(k) ? `${base}.${k}` : `${base}['${k.replace(/'/g, "\\'")}']`;
    const safe = style === "helm" ? k.replace(/([.,=\\])/g, "\\$1") : k;
    return base ? `${base}.${safe}` : safe;
  };
  const walk = (x, p) => {
    if (Array.isArray(x)) { if (!x.length) out.push([p, x]); x.forEach((y, i) => walk(y, `${p}[${i}]`)); }
    else if (x && typeof x === "object" && !(x instanceof Date)) { const ks = Object.keys(x); if (!ks.length) out.push([p, x]); ks.forEach((k) => walk(x[k], key(p, k))); }
    else out.push([p, x]);
  };
  walk(v, style === "jsonpath" ? "$" : "");
  return out;
}

export function YamlPathsTool() {
  const [input, setInput] = useState(() => takeHandoff("image:\n  repository: nginx\n  tag: \"1.27\"\nreplicaCount: 2\nservice:\n  type: ClusterIP\n  ports:\n    - name: http\n      port: 80\ningress:\n  enabled: false\n  annotations:\n    kubernetes.io/ingress.class: nginx\n"));
  const [style, setStyle] = useState("jsonpath");
  const [filter, setFilter] = useState("");
  const data = useMemo(() => { try { return { v: parseData(input, yaml) }; } catch (e) { return { err: e.message }; } }, [input]);
  const rows = useMemo(() => (data.v === undefined ? [] : leafPaths(data.v, style)), [data, style]);
  const shown = rows.filter(([p, v]) => !filter || `${p} ${JSON.stringify(v)}`.toLowerCase().includes(filter.toLowerCase()));
  const fmtVal = (v) => (typeof v === "string" ? (style === "jsonpath" ? JSON.stringify(v) : v) : JSON.stringify(v));
  const text = shown.map(([p, v]) => (style === "helm" ? `--set ${p}=${fmtVal(v)}` : `${p} = ${fmtVal(v)}`)).join("\n");
  return (
    <>
      <Options>
        <Segmented label="Path style" value={style} onChange={setStyle} options={[["jsonpath", "JSONPath ($.a.b[0])"], ["dot", "Dot notation (a.b[0])"], ["helm", "Helm --set flags"]]} />
        <input className="field" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter paths…" aria-label="Filter paths" />
      </Options>
      <div className="split">
        <Panel label="YAML or JSON" value={input} onChange={setInput} error={data.err} rows={18} />
        <Panel label={`Paths (${shown.length})`} value={text} readOnly rows={18} />
      </div>
      <p className="muted small">Each line is one value. Use these paths in JSONPath queries, <code>yq</code>, <code>kubectl -o jsonpath</code> or <code>helm install --set</code>.</p>
    </>
  );
}

/* ======================================================================
   JSON Schema: make one from an example, or check JSON against one
   ====================================================================== */
const FORMATS = [["date-time", /^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d(\.\d+)?)?(Z|[+-]\d\d:?\d\d)?$/], ["date", /^\d{4}-\d\d-\d\d$/], ["email", /^[^\s@]+@[^\s@]+\.[^\s@]+$/], ["uri", /^[a-z][\w+.-]*:\/\/\S+$/i], ["uuid", /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i], ["ipv4", /^(\d{1,3}\.){3}\d{1,3}$/]];
const typeOf = (v) => (v === null ? "null" : Array.isArray(v) ? "array" : Number.isInteger(v) ? "integer" : typeof v);

export function inferSchema(samples, opts = {}) {
  const types = [...new Set(samples.map(typeOf))];
  // integers and decimals together are just numbers
  const t = types.includes("number") && types.includes("integer") ? types.filter((x) => x !== "integer") : types;
  const s = {};
  if (t.length === 1) s.type = t[0]; else s.type = t;
  if (t.includes("object")) {
    const objs = samples.filter((v) => typeOf(v) === "object");
    const keys = [...new Set(objs.flatMap(Object.keys))];
    s.properties = Object.fromEntries(keys.map((k) => [k, inferSchema(objs.filter((o) => k in o).map((o) => o[k]), opts)]));
    const req = keys.filter((k) => objs.every((o) => k in o));
    if (req.length) s.required = req;
    if (opts.strict) s.additionalProperties = false;
  }
  if (t.includes("array")) {
    const items = samples.filter(Array.isArray).flat();
    if (items.length) s.items = inferSchema(items, opts);
  }
  if (t.length === 1 && t[0] === "string") {
    const f = FORMATS.find(([, re]) => samples.every((v) => re.test(v)));
    if (f) s.format = f[0];
  }
  if (opts.examples && t.length === 1 && ["string", "number", "integer"].includes(t[0])) s.examples = [samples[0]];
  return s;
}

// A practical subset of JSON Schema (draft-07 / 2019-09 / 2020-12 keywords people use most).
export function validateSchema(value, schema, root = schema, path = "$", out = []) {
  if (schema === true || schema === undefined) return out;
  if (schema === false) { out.push([path, "Nothing is allowed here"]); return out; }
  if (schema.$ref) {
    const target = schema.$ref.startsWith("#") ? schema.$ref.slice(1).split("/").filter(Boolean).reduce((o, k) => o?.[decodeURIComponent(k.replace(/~1/g, "/").replace(/~0/g, "~"))], root) : undefined;
    if (!target) out.push([path, `Can’t follow $ref ${schema.$ref} (only references inside this schema work)`]);
    else validateSchema(value, target, root, path, out);
  }
  const t = typeOf(value);
  if (schema.type) {
    const want = [].concat(schema.type);
    if (!want.some((w) => w === t || (w === "number" && t === "integer"))) { out.push([path, `Should be ${want.join(" or ")}, but is ${t}`]); return out; }
  }
  if ("const" in schema && JSON.stringify(schema.const) !== JSON.stringify(value)) out.push([path, `Should be exactly ${JSON.stringify(schema.const)}`]);
  if (schema.enum && !schema.enum.some((e) => JSON.stringify(e) === JSON.stringify(value))) out.push([path, `Should be one of ${schema.enum.map((e) => JSON.stringify(e)).join(", ")}`]);
  if (t === "string") {
    if (schema.minLength != null && [...value].length < schema.minLength) out.push([path, `Should be at least ${schema.minLength} characters`]);
    if (schema.maxLength != null && [...value].length > schema.maxLength) out.push([path, `Should be at most ${schema.maxLength} characters`]);
    if (schema.pattern) { try { if (!new RegExp(schema.pattern, "u").test(value)) out.push([path, `Doesn’t match the pattern ${schema.pattern}`]); } catch { /* unsupported pattern */ } }
    if (schema.format) { const f = FORMATS.find(([n]) => n === schema.format); if (f && !f[1].test(value)) out.push([path, `Isn’t a valid ${schema.format}`]); }
  }
  if (t === "number" || t === "integer") {
    if (schema.minimum != null && value < schema.minimum) out.push([path, `Should be ≥ ${schema.minimum}`]);
    if (schema.maximum != null && value > schema.maximum) out.push([path, `Should be ≤ ${schema.maximum}`]);
    if (typeof schema.exclusiveMinimum === "number" && value <= schema.exclusiveMinimum) out.push([path, `Should be > ${schema.exclusiveMinimum}`]);
    if (typeof schema.exclusiveMaximum === "number" && value >= schema.exclusiveMaximum) out.push([path, `Should be < ${schema.exclusiveMaximum}`]);
    if (schema.multipleOf && Math.abs(value / schema.multipleOf - Math.round(value / schema.multipleOf)) > 1e-9) out.push([path, `Should be a multiple of ${schema.multipleOf}`]);
  }
  if (t === "array") {
    if (schema.minItems != null && value.length < schema.minItems) out.push([path, `Should have at least ${schema.minItems} items`]);
    if (schema.maxItems != null && value.length > schema.maxItems) out.push([path, `Should have at most ${schema.maxItems} items`]);
    if (schema.uniqueItems && new Set(value.map((v) => JSON.stringify(v))).size !== value.length) out.push([path, "Items should all be different"]);
    const prefix = schema.prefixItems || (Array.isArray(schema.items) ? schema.items : null);
    value.forEach((v, i) => {
      if (prefix && i < prefix.length) validateSchema(v, prefix[i], root, `${path}[${i}]`, out);
      else if (schema.items && !Array.isArray(schema.items)) validateSchema(v, schema.items, root, `${path}[${i}]`, out);
    });
    if (schema.contains && !value.some((v) => !validateSchema(v, schema.contains, root, path, []).length)) out.push([path, "Should contain at least one matching item"]);
  }
  if (t === "object") {
    for (const k of schema.required || []) if (!(k in value)) out.push([path, `Missing required “${k}”`]);
    const props = schema.properties || {};
    const pats = Object.entries(schema.patternProperties || {});
    for (const [k, v] of Object.entries(value)) {
      const p = /^[A-Za-z_$][\w$]*$/.test(k) ? `${path}.${k}` : `${path}['${k}']`;
      let known = false;
      if (k in props) { known = true; validateSchema(v, props[k], root, p, out); }
      for (const [re, sch] of pats) { try { if (new RegExp(re, "u").test(k)) { known = true; validateSchema(v, sch, root, p, out); } } catch { /* skip */ } }
      if (!known && schema.additionalProperties === false) out.push([p, `“${k}” isn’t allowed here`]);
      else if (!known && typeof schema.additionalProperties === "object") validateSchema(v, schema.additionalProperties, root, p, out);
    }
    const n = Object.keys(value).length;
    if (schema.minProperties != null && n < schema.minProperties) out.push([path, `Should have at least ${schema.minProperties} keys`]);
    if (schema.maxProperties != null && n > schema.maxProperties) out.push([path, `Should have at most ${schema.maxProperties} keys`]);
  }
  if (schema.allOf) schema.allOf.forEach((s) => validateSchema(value, s, root, path, out));
  if (schema.anyOf && !schema.anyOf.some((s) => !validateSchema(value, s, root, path, []).length)) out.push([path, "Doesn’t match any of the allowed shapes (anyOf)"]);
  if (schema.oneOf) { const n = schema.oneOf.filter((s) => !validateSchema(value, s, root, path, []).length).length; if (n !== 1) out.push([path, n ? `Matches ${n} shapes, but should match exactly one (oneOf)` : "Doesn’t match any allowed shape (oneOf)"]); }
  if (schema.not && !validateSchema(value, schema.not, root, path, []).length) out.push([path, "Matches something that isn’t allowed (not)"]);
  if (schema.if) {
    const ok = !validateSchema(value, schema.if, root, path, []).length;
    if (ok && schema.then) validateSchema(value, schema.then, root, path, out);
    if (!ok && schema.else) validateSchema(value, schema.else, root, path, out);
  }
  return out;
}

export function JsonSchemaTool() {
  const [mode, setMode] = useState("generate");
  const [input, setInput] = useState(() => takeHandoff('{\n  "id": 42,\n  "name": "Alex",\n  "email": "alex@example.com",\n  "joined": "2024-05-01T09:30:00Z",\n  "tags": ["admin", "beta"],\n  "address": { "city": "Springfield", "zip": "12345" }\n}'));
  const [strict, setStrict] = useState(false);
  const [examples, setExamples] = useState(false);
  const [schemaText, setSchemaText] = useState("");
  const data = useMemo(() => { try { return { v: parseData(input, yaml) }; } catch (e) { return { err: e.message }; } }, [input]);
  const generated = useMemo(() => (data.v === undefined ? "" : JSON.stringify({ $schema: "https://json-schema.org/draft/2020-12/schema", title: "Generated schema", ...inferSchema([data.v], { strict, examples }) }, null, 2)), [data, strict, examples]);
  const sch = useMemo(() => { if (!schemaText.trim()) return {}; try { return { v: parseData(schemaText, yaml) }; } catch (e) { return { err: e.message }; } }, [schemaText]);
  const problems = useMemo(() => (mode === "validate" && sch.v !== undefined && data.v !== undefined ? validateSchema(data.v, sch.v) : []), [mode, sch, data]);
  return (
    <>
      <Options>
        <Segmented label="Mode" value={mode} onChange={(m) => { setMode(m); if (m === "validate" && !schemaText) setSchemaText(generated); }} options={[["generate", "Make a schema from JSON"], ["validate", "Check JSON against a schema"]]} />
        {mode === "generate" && <>
          <label className="check"><input type="checkbox" checked={strict} onChange={(e) => setStrict(e.target.checked)} /> No extra keys allowed</label>
          <label className="check"><input type="checkbox" checked={examples} onChange={(e) => setExamples(e.target.checked)} /> Include examples</label>
        </>}
      </Options>
      <div className="split">
        <Panel label="JSON (or YAML) data" value={input} onChange={setInput} error={data.err} rows={18} />
        {mode === "generate"
          ? <Panel label="JSON Schema" value={generated} readOnly rows={18} />
          : <Panel label="JSON Schema" value={schemaText} onChange={setSchemaText} error={sch.err} rows={18} />}
      </div>
      {mode === "validate" && sch.v !== undefined && data.v !== undefined && (
        problems.length
          ? <div className="panel"><span className="panel-label">{problems.length} {problems.length === 1 ? "problem" : "problems"}</span><Table head={["Where", "What’s wrong"]} rows={problems.map(([p, m]) => [<code key="p">{p}</code>, m])} /></div>
          : <div className="big-answer"><span className="badge ok-badge">Valid</span> The data matches the schema.</div>
      )}
    </>
  );
}

/* ======================================================================
   JSON → code (C#, PHP, TypeScript, Go, Python, Java)
   ====================================================================== */
const pascal = (s) => (s.replace(/[^A-Za-z0-9]+(.)?/g, (_, c) => (c ? c.toUpperCase() : "")).replace(/^./, (c) => c.toUpperCase()) || "Item").replace(/^(\d)/, "_$1");
const camel = (s) => pascal(s).replace(/^./, (c) => c.toLowerCase());
const snake = (s) => s.replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/[^A-Za-z0-9]+/g, "_").toLowerCase().replace(/^(\d)/, "_$1");
const singular = (s) => (/ies$/i.test(s) ? s.replace(/ies$/i, "y") : /(ses|xes|ches|shes)$/i.test(s) ? s.slice(0, -2) : /[^s]s$/i.test(s) ? s.slice(0, -1) : s + "Item");

// Collect the classes: one per kind of object, fields merged across array items.
function shapeOf(samples, name, classes) {
  const kinds = new Set(samples.map(typeOf));
  const nullable = kinds.has("null"); kinds.delete("null");
  if (kinds.has("integer") && kinds.has("number")) kinds.delete("integer");
  if (kinds.size !== 1) return { t: "any", nullable };
  const k = [...kinds][0];
  if (k === "object") {
    const objs = samples.filter((v) => typeOf(v) === "object");
    const keys = [...new Set(objs.flatMap(Object.keys))];
    let cname = pascal(name); let n = 2;
    while (classes.some((c) => c.name === cname)) cname = pascal(name) + n++;
    const cls = { name: cname, fields: [] };
    classes.push(cls);
    cls.fields = keys.map((key) => ({ key, optional: !objs.every((o) => key in o), ...shapeOf(objs.filter((o) => key in o).map((o) => o[key]), key, classes) }));
    return { t: "object", cls: cname, nullable };
  }
  if (k === "array") return { t: "array", item: shapeOf(samples.filter(Array.isArray).flat(), singular(name), classes), nullable };
  return { t: k, nullable };
}

const LANGS = {
  csharp: {
    type: (s) => { const b = s.t === "object" ? s.cls : s.t === "array" ? `List<${LANGS.csharp.type(s.item)}>` : { string: "string", integer: "long", number: "double", boolean: "bool", any: "object" }[s.t]; return b + (s.nullable || s.optional ? "?" : ""); },
    render: (classes) => `using System.Collections.Generic;\nusing System.Text.Json.Serialization;\n\n${classes.map((c) => `public class ${c.name}\n{\n${c.fields.map((f) => `    [JsonPropertyName("${f.key}")]\n    public ${LANGS.csharp.type(f)} ${pascal(f.key) === c.name ? pascal(f.key) + "Value" : pascal(f.key)} { get; set; }`).join("\n\n")}\n}`).join("\n\n")}\n`,
  },
  typescript: {
    type: (s) => { const b = s.t === "object" ? s.cls : s.t === "array" ? `${LANGS.typescript.type({ ...s.item, optional: false })}[]` : { string: "string", integer: "number", number: "number", boolean: "boolean", any: "unknown" }[s.t]; return s.nullable ? `${b} | null` : b; },
    render: (classes) => classes.map((c) => `export interface ${c.name} {\n${c.fields.map((f) => `  ${/^[A-Za-z_$][\w$]*$/.test(f.key) ? f.key : JSON.stringify(f.key)}${f.optional ? "?" : ""}: ${LANGS.typescript.type(f)};`).join("\n")}\n}`).join("\n\n") + "\n",
  },
  go: {
    type: (s) => { const b = s.t === "object" ? s.cls : s.t === "array" ? `[]${LANGS.go.type({ ...s.item, optional: false })}` : { string: "string", integer: "int64", number: "float64", boolean: "bool", any: "interface{}" }[s.t]; return (s.nullable || s.optional) && s.t !== "array" && s.t !== "any" ? `*${b}` : b; },
    render: (classes) => classes.map((c) => `type ${c.name} struct {\n${c.fields.map((f) => `\t${pascal(f.key)} ${LANGS.go.type(f)} \`json:"${f.key}${f.optional ? ",omitempty" : ""}"\``).join("\n")}\n}`).join("\n\n") + "\n",
  },
  python: {
    type: (s) => { const b = s.t === "object" ? `"${s.cls}"` : s.t === "array" ? `list[${LANGS.python.type({ ...s.item, optional: false })}]` : { string: "str", integer: "int", number: "float", boolean: "bool", any: "Any" }[s.t]; return s.nullable || s.optional ? `Optional[${b}]` : b; },
    render: (classes) => `from __future__ import annotations\nfrom dataclasses import dataclass\nfrom typing import Any, Optional\n\n${[...classes].reverse().map((c) => `@dataclass\nclass ${c.name}:\n${c.fields.length ? [...c.fields].sort((a, b) => (a.optional || a.nullable) - (b.optional || b.nullable)).map((f) => `    ${snake(f.key)}: ${LANGS.python.type(f)}${f.optional || f.nullable ? " = None" : ""}`).join("\n") : "    pass"}`).join("\n\n\n")}\n`,
  },
  java: {
    type: (s) => (s.t === "object" ? s.cls : s.t === "array" ? `List<${LANGS.java.type({ ...s.item, optional: true })}>` : { string: "String", integer: s.nullable || s.optional ? "Long" : "long", number: s.nullable || s.optional ? "Double" : "double", boolean: s.nullable || s.optional ? "Boolean" : "boolean", any: "Object" }[s.t]),
    render: (classes) => `import java.util.List;\nimport com.fasterxml.jackson.annotation.JsonProperty;\n\n${classes.map((c) => `public class ${c.name} {\n${c.fields.map((f) => `    @JsonProperty("${f.key}")\n    public ${LANGS.java.type(f)} ${camel(f.key)};`).join("\n\n")}\n}`).join("\n\n")}\n`,
  },
  phpclass: {
    type: (s) => { const b = s.t === "object" ? s.cls : s.t === "array" ? "array" : { string: "string", integer: "int", number: "float", boolean: "bool", any: "mixed" }[s.t]; return (s.nullable || s.optional) && b !== "mixed" ? `?${b}` : b; },
    render: (classes) => `<?php\n\ndeclare(strict_types=1);\n\n${classes.map((c) => `final class ${c.name}\n{\n    public function __construct(\n${c.fields.map((f) => `${f.t === "array" ? `        /** @var ${LANGS.phpclass.type({ ...f.item, optional: false, nullable: false })}[] */\n` : ""}        public ${LANGS.phpclass.type(f)} $${camel(f.key)}${f.optional || f.nullable ? " = null" : ""},`).join("\n")}\n    ) {}\n}`).join("\n\n")}\n`,
  },
};

export function phpArray(v, ind = "") {
  const next = ind + "    ";
  if (v === null) return "null";
  if (typeof v === "string") return `'${v.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
  if (typeof v !== "object") return String(v);
  const isList = Array.isArray(v);
  const entries = isList ? v.map((x) => `${next}${phpArray(x, next)}`) : Object.entries(v).map(([k, x]) => `${next}'${k.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}' => ${phpArray(x, next)}`);
  return entries.length ? `[\n${entries.join(",\n")},\n${ind}]` : "[]";
}

export function jsonToCode(value, lang, root = "Root") {
  if (lang === "phparray") return `<?php\n\n$data = ${phpArray(value)};\n`;
  const classes = [];
  shapeOf(typeOf(value) === "array" ? value : [value], root || "Root", classes);
  if (!classes.length) return "// The JSON needs an object (or a list of objects) to turn into classes.";
  return LANGS[lang].render(classes);
}

export function JsonToCodeTool() {
  const [lang, setLang] = useState(() => peekHandoff("lang", "csharp"));
  const [root, setRoot] = useState("Root");
  const [input, setInput] = useState(() => takeHandoff('{\n  "orderId": 1001,\n  "customer": { "name": "Alex", "email": "alex@example.com" },\n  "items": [\n    { "sku": "A-1", "qty": 2, "price": 9.5 },\n    { "sku": "B-7", "qty": 1, "price": 20, "note": "gift" }\n  ],\n  "paid": true,\n  "couponCode": null\n}'));
  const data = useMemo(() => { try { return { v: parseData(input, yaml) }; } catch (e) { return { err: e.message }; } }, [input]);
  const out = useMemo(() => (data.v === undefined ? "" : jsonToCode(data.v, lang, root)), [data, lang, root]);
  return (
    <>
      <Options>
        <Segmented label="Language" value={lang} onChange={setLang} options={[["csharp", "C#"], ["phparray", "PHP array"], ["phpclass", "PHP class"], ["typescript", "TypeScript"], ["go", "Go"], ["python", "Python"], ["java", "Java"]]} />
        {lang !== "phparray" && <label className="check">Main class name <input className="field small wide-small" value={root} onChange={(e) => setRoot(e.target.value)} /></label>}
      </Options>
      <div className="split">
        <Panel label="JSON" value={input} onChange={setInput} error={data.err} rows={20} />
        <Panel label={{ csharp: "C# classes", phparray: "PHP array", phpclass: "PHP classes", typescript: "TypeScript types", go: "Go structs", python: "Python dataclasses", java: "Java classes" }[lang]} value={out} readOnly rows={20} />
      </div>
      <p className="muted small">Fields missing from some list items, or set to null, become optional. Check number types: whole numbers become long/int64, others double/float.</p>
    </>
  );
}

/* ======================================================================
   TOML converter
   ====================================================================== */
const stripNull = (v) => (Array.isArray(v) ? v.filter((x) => x != null).map(stripNull) : v && typeof v === "object" && !(v instanceof Date) ? Object.fromEntries(Object.entries(v).filter(([, x]) => x != null).map(([k, x]) => [k, stripNull(x)])) : v);

export function convertToml(input, from, to) {
  const v = from === "toml" ? tomlParse(input) : from === "json" ? JSON.parse(input) : yaml.load(input);
  if (to === "toml") {
    if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("TOML needs a table (an object with keys) at the top.");
    return tomlStringify(stripNull(v));
  }
  const plain = JSON.parse(JSON.stringify(v));
  return to === "json" ? JSON.stringify(plain, null, 2) : yaml.dump(plain, { lineWidth: -1 });
}

export function TomlTool() {
  const [mode, setMode] = useState(() => peekHandoff("mode", "toml2json"));
  const [input, setInput] = useState(() => takeHandoff('title = "My app"\n\n[server]\nhost = "0.0.0.0"\nport = 8080\ntimeout = "30s"\n\n[database]\nurl = "postgres://localhost/app"\npool = 5\nenabled = true\n\n[[workers]]\nname = "email"\nthreads = 2\n\n[[workers]]\nname = "reports"\nthreads = 1\n'));
  const [from, to] = mode.split("2");
  const { out, err } = useMemo(() => {
    if (!input.trim()) return { out: "", err: "" };
    try { return { out: convertToml(input, from, to), err: "" }; } catch (e) { return { out: "", err: e.message }; }
  }, [input, from, to]);
  const names = { toml: "TOML", json: "JSON", yaml: "YAML" };
  return (
    <>
      <Options>
        <Segmented label="Direction" value={mode} onChange={(m) => { if (out && m.split("2")[0] === to) setInput(out); setMode(m); }} options={[["toml2json", "TOML → JSON"], ["json2toml", "JSON → TOML"], ["toml2yaml", "TOML → YAML"], ["yaml2toml", "YAML → TOML"]]} />
      </Options>
      <div className="split">
        <Panel label={names[from]} value={input} onChange={setInput} error={err} rows={18} />
        <Panel label={names[to]} value={out} readOnly rows={18} />
      </div>
      {to === "toml" && <p className="muted small">TOML has no “null”, so empty values are left out.</p>}
    </>
  );
}

/* ======================================================================
   XML / XSD validator
   ====================================================================== */
const XS = "http://www.w3.org/2001/XMLSchema";
const kids = (el, name) => [...el.children].filter((c) => c.namespaceURI === XS && (!name || c.localName === name));
const local = (q) => (q || "").replace(/^.*:/, "");

export function parseXml(text, what) {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  const err = doc.getElementsByTagName("parsererror")[0];
  if (err) {
    const msg = (err.textContent || "").replace(/\s+/g, " ").replace(/^.*?error[^:]*:\s*/i, "").trim();
    throw new Error(`The ${what} isn’t well-formed XML: ${msg.slice(0, 220)}`);
  }
  return doc;
}

const isInt = (v) => /^[+-]?\d+$/.test(v.trim());
const BUILTIN = {
  string: () => true, normalizedString: (v) => !/[\r\n\t]/.test(v), token: (v) => v === v.trim() && !/\s\s/.test(v), anyURI: () => true,
  boolean: (v) => /^(true|false|1|0)$/.test(v.trim()),
  decimal: (v) => /^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(v.trim()), float: (v) => /^([+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?|INF|-INF|NaN)$/.test(v.trim()), double: (v) => BUILTIN.float(v),
  integer: isInt, int: (v) => isInt(v) && Math.abs(+v) <= 2147483648, long: isInt, short: (v) => isInt(v) && +v >= -32768 && +v <= 32767, byte: (v) => isInt(v) && +v >= -128 && +v <= 127,
  positiveInteger: (v) => isInt(v) && +v > 0, nonNegativeInteger: (v) => isInt(v) && +v >= 0, negativeInteger: (v) => isInt(v) && +v < 0, nonPositiveInteger: (v) => isInt(v) && +v <= 0,
  unsignedInt: (v) => isInt(v) && +v >= 0 && +v <= 4294967295, unsignedLong: (v) => isInt(v) && +v >= 0, unsignedShort: (v) => isInt(v) && +v >= 0 && +v <= 65535, unsignedByte: (v) => isInt(v) && +v >= 0 && +v <= 255,
  date: (v) => /^-?\d{4,}-\d\d-\d\d(Z|[+-]\d\d:\d\d)?$/.test(v.trim()), dateTime: (v) => /^-?\d{4,}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?(Z|[+-]\d\d:\d\d)?$/.test(v.trim()), time: (v) => /^\d\d:\d\d:\d\d(\.\d+)?(Z|[+-]\d\d:\d\d)?$/.test(v.trim()),
  gYear: (v) => /^-?\d{4,}(Z|[+-]\d\d:\d\d)?$/.test(v.trim()), duration: (v) => /^-?P(?!$)(\d+Y)?(\d+M)?(\d+D)?(T(?!$)(\d+H)?(\d+M)?(\d+(\.\d+)?S)?)?$/.test(v.trim()),
  ID: (v) => /^[A-Za-z_][\w.-]*$/.test(v.trim()), IDREF: (v) => /^[A-Za-z_][\w.-]*$/.test(v.trim()), NCName: (v) => /^[A-Za-z_][\w.-]*$/.test(v.trim()), Name: (v) => /^[A-Za-z_:][\w.:-]*$/.test(v.trim()), NMTOKEN: (v) => /^[\w.:-]+$/.test(v.trim()),
  language: (v) => /^[a-zA-Z]{1,8}(-[a-zA-Z0-9]{1,8})*$/.test(v.trim()), base64Binary: (v) => /^[A-Za-z0-9+/\s]*={0,2}$/.test(v), hexBinary: (v) => /^([0-9a-fA-F]{2})*$/.test(v.trim()), anySimpleType: () => true, anyType: () => true,
};

export function validateXsd(xmlText, xsdText) {
  const xsd = parseXml(xsdText, "schema");
  const xml = parseXml(xmlText, "XML");
  const schema = xsd.documentElement;
  if (schema.localName !== "schema") throw new Error("The schema should start with <xs:schema>.");
  const global = { element: {}, complexType: {}, simpleType: {}, group: {}, attributeGroup: {}, attribute: {} };
  for (const c of kids(schema)) if (global[c.localName] && c.getAttribute("name")) global[c.localName][c.getAttribute("name")] = c;
  const errors = [];
  const err = (where, text) => errors.push({ level: "error", where, text });

  const facetsOk = (v, restr, where, label) => {
    const vals = (n) => kids(restr, n).map((f) => f.getAttribute("value"));
    const en = vals("enumeration");
    if (en.length && !en.includes(v.trim())) err(where, `${label} “${v}” should be one of: ${en.join(", ")}`);
    for (const p of vals("pattern")) { try { if (!new RegExp(`^(?:${p.replace(/\\i/g, "[A-Za-z_:]").replace(/\\c/g, "[\\w.:-]")})$`, "u").test(v)) err(where, `${label} “${v}” doesn’t match the pattern ${p}`); } catch { /* unsupported pattern */ } }
    const one = (n) => vals(n)[0];
    const len = [...v].length;
    if (one("length") != null && len !== +one("length")) err(where, `${label} should be exactly ${one("length")} characters`);
    if (one("minLength") != null && len < +one("minLength")) err(where, `${label} should be at least ${one("minLength")} characters`);
    if (one("maxLength") != null && len > +one("maxLength")) err(where, `${label} should be at most ${one("maxLength")} characters`);
    const n = Number(v);
    if (one("minInclusive") != null && !(n >= +one("minInclusive"))) err(where, `${label} should be ≥ ${one("minInclusive")}`);
    if (one("maxInclusive") != null && !(n <= +one("maxInclusive"))) err(where, `${label} should be ≤ ${one("maxInclusive")}`);
    if (one("minExclusive") != null && !(n > +one("minExclusive"))) err(where, `${label} should be > ${one("minExclusive")}`);
    if (one("maxExclusive") != null && !(n < +one("maxExclusive"))) err(where, `${label} should be < ${one("maxExclusive")}`);
    if (one("totalDigits") != null && v.replace(/[^0-9]/g, "").replace(/^0+/, "").length > +one("totalDigits")) err(where, `${label} has more than ${one("totalDigits")} digits`);
    if (one("fractionDigits") != null && (v.split(".")[1] || "").length > +one("fractionDigits")) err(where, `${label} has more than ${one("fractionDigits")} decimals`);
  };
  // Check a text value against a type name or an inline <xs:simpleType>.
  const checkSimple = (v, typeName, inline, where, label) => {
    let st = inline;
    if (!st && typeName) {
      const n = local(typeName);
      if (BUILTIN[n] && (typeName.includes(":") || !global.simpleType[n])) { if (!BUILTIN[n](v)) err(where, `${label} “${v}” isn’t a valid ${n}`); return; }
      st = global.simpleType[n];
      if (!st) return;
    }
    if (!st) return;
    const r = kids(st, "restriction")[0], list = kids(st, "list")[0], union = kids(st, "union")[0];
    if (r) { checkSimple(v, r.getAttribute("base"), kids(r, "simpleType")[0], where, label); facetsOk(v, r, where, label); }
    else if (list) v.trim().split(/\s+/).filter(Boolean).forEach((x) => checkSimple(x, list.getAttribute("itemType"), kids(list, "simpleType")[0], where, label));
    else if (union) {
      const types = (union.getAttribute("memberTypes") || "").split(/\s+/).filter(Boolean);
      const ok = [...types.map((t) => [t, null]), ...kids(union, "simpleType").map((s) => [null, s])].some(([t, s]) => { const before = errors.length; checkSimple(v, t, s, where, label); const fine = errors.length === before; errors.length = before; return fine; });
      if (!ok) err(where, `${label} “${v}” doesn’t match any allowed type`);
    }
  };

  // Attributes and content model of a complex type (following extensions).
  const collect = (ct) => {
    const attrs = [], particles = []; let anyAttr = false, simpleBase = null, mixed = ct.getAttribute("mixed") === "true", inlineSimple = null;
    const addAttrs = (el) => {
      for (const a of kids(el, "attribute")) attrs.push(a.getAttribute("ref") ? (global.attribute[local(a.getAttribute("ref"))] || a) : a);
      for (const g of kids(el, "attributeGroup")) { const ref = global.attributeGroup[local(g.getAttribute("ref"))]; if (ref) addAttrs(ref); }
      if (kids(el, "anyAttribute").length) anyAttr = true;
    };
    const addParticles = (el) => { for (const p of kids(el)) if (["sequence", "choice", "all", "group"].includes(p.localName)) particles.push(p); };
    const sc = kids(ct, "simpleContent")[0], cc = kids(ct, "complexContent")[0];
    if (sc) {
      const ext = kids(sc).find((c) => c.localName !== "annotation");
      simpleBase = ext.getAttribute("base");
      if (ext.localName === "restriction") inlineSimple = ext;
      const baseCt = global.complexType[local(simpleBase)];
      if (baseCt) { const b = collect(baseCt); attrs.push(...b.attrs); simpleBase = b.simpleBase; }
      addAttrs(ext);
    } else if (cc) {
      const ext = kids(cc).find((c) => c.localName !== "annotation");
      if (cc.getAttribute("mixed") === "true") mixed = true;
      const baseCt = global.complexType[local(ext.getAttribute("base"))];
      if (baseCt && ext.localName === "extension") { const b = collect(baseCt); attrs.push(...b.attrs); particles.push(...b.particles); anyAttr ||= b.anyAttr; mixed ||= b.mixed; }
      addAttrs(ext); addParticles(ext);
    } else { addAttrs(ct); addParticles(ct); }
    return { attrs, particles, anyAttr, simpleBase, mixed, inlineSimple };
  };

  // Which element names can appear, mapped to their declarations (for checking each child).
  const declsIn = (p, map = {}) => {
    if (p.localName === "element") { const d = p.getAttribute("ref") ? global.element[local(p.getAttribute("ref"))] : p; const name = local(p.getAttribute("ref")) || p.getAttribute("name"); if (name) map[name] = d || p; }
    else if (p.localName === "group") { const g = global.group[local(p.getAttribute("ref"))] || p; kids(g).forEach((c) => declsIn(c, map)); }
    else kids(p).forEach((c) => declsIn(c, map));
    return map;
  };
  const occurs = (p) => [p.hasAttribute("minOccurs") ? +p.getAttribute("minOccurs") : 1, p.getAttribute("maxOccurs") === "unbounded" ? Infinity : p.hasAttribute("maxOccurs") ? +p.getAttribute("maxOccurs") : 1];
  const nameOf = (p) => local(p.getAttribute("ref")) || p.getAttribute("name");
  // Every position the particle can end at, starting at index i of the child names.
  const match = (p, names, i) => {
    const [min, max] = occurs(p);
    const once = (j) => {
      if (p.localName === "element") return names[j] === nameOf(p) ? new Set([j + 1]) : new Set();
      if (p.localName === "any") return j < names.length ? new Set([j + 1]) : new Set();
      if (p.localName === "group") { const g = global.group[local(p.getAttribute("ref"))]; const inner = g ? kids(g).find((c) => ["sequence", "choice", "all"].includes(c.localName)) : null; return inner ? match(inner, names, j) : new Set([j]); }
      const parts = kids(p).filter((c) => c.localName !== "annotation");
      if (p.localName === "sequence") { let set = new Set([j]); for (const c of parts) { const nx = new Set(); for (const s of set) for (const e of match(c, names, s)) nx.add(e); set = nx; if (!set.size) break; } return set; }
      if (p.localName === "choice") { const set = new Set(); for (const c of parts) for (const e of match(c, names, j)) set.add(e); return set; }
      if (p.localName === "all") {
        const seen = new Set(); let k = j;
        while (k < names.length) { const el = parts.find((a) => nameOf(a) === names[k]); if (!el || seen.has(names[k])) break; seen.add(names[k]); k++; }
        return parts.some((a) => occurs(a)[0] > 0 && !seen.has(nameOf(a))) ? new Set() : new Set([k]);
      }
      return new Set([j]);
    };
    const ends = new Set(min === 0 ? [i] : []);
    let frontier = new Set([i]);
    for (let n = 1; n <= max && frontier.size && n <= names.length + 1; n++) {
      const nx = new Set();
      for (const s of frontier) for (const e of once(s)) nx.add(e);
      if (n >= min) nx.forEach((e) => ends.add(e));
      // keep repeating only from positions that moved forward
      frontier = new Set([...nx].filter((e) => !frontier.has(e)));
    }
    return ends;
  };

  const pathOf = (el) => { const parts = []; for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const sib = e.parentElement ? [...e.parentElement.children].filter((c) => c.localName === e.localName) : [e]; parts.unshift(sib.length > 1 ? `${e.localName}[${sib.indexOf(e) + 1}]` : e.localName); } return "/" + parts.join("/"); };

  const checkElement = (el, decl) => {
    const where = pathOf(el);
    if (decl.getAttribute("ref")) decl = global.element[local(decl.getAttribute("ref"))] || decl;
    const typeName = decl.getAttribute("type");
    const ct = kids(decl, "complexType")[0] || (typeName && global.complexType[local(typeName)]);
    const childEls = [...el.children];
    const text = [...el.childNodes].filter((n) => n.nodeType === 3 || n.nodeType === 4).map((n) => n.nodeValue).join("");
    if (decl.getAttribute("fixed") != null && text.trim() !== decl.getAttribute("fixed")) err(where, `Should be fixed to “${decl.getAttribute("fixed")}”`);
    if (!ct) {
      if (childEls.length) err(where, `<${el.localName}> should contain only text, but has child elements`);
      if (!(decl.getAttribute("nillable") === "true" && el.getAttribute("xsi:nil") === "true")) checkSimple(text, typeName || (kids(decl, "simpleType").length ? null : "xs:string"), kids(decl, "simpleType")[0], where, "Value");
      for (const a of el.attributes) if (!/^(xmlns|xsi:)/.test(a.name)) err(where, `Attribute “${a.name}” isn’t allowed on <${el.localName}>`);
      return;
    }
    const m = collect(ct);
    const declared = new Map(m.attrs.map((a) => [a.getAttribute("name"), a]));
    for (const a of m.attrs) if (a.getAttribute("use") === "required" && !el.hasAttribute(a.getAttribute("name"))) err(where, `Missing required attribute “${a.getAttribute("name")}”`);
    for (const a of el.attributes) {
      if (/^(xmlns|xsi:)/.test(a.name)) continue;
      const d = declared.get(a.localName);
      if (!d) { if (!m.anyAttr) err(where, `Attribute “${a.name}” isn’t allowed on <${el.localName}>`); continue; }
      if (d.getAttribute("use") === "prohibited") err(where, `Attribute “${a.name}” isn’t allowed`);
      if (d.getAttribute("fixed") != null && a.value !== d.getAttribute("fixed")) err(where, `Attribute “${a.name}” should be “${d.getAttribute("fixed")}”`);
      checkSimple(a.value, d.getAttribute("type") || (kids(d, "simpleType").length ? null : "xs:string"), kids(d, "simpleType")[0], where, `Attribute ${a.name}`);
    }
    if (m.simpleBase) {
      if (childEls.length) err(where, `<${el.localName}> should contain only text`);
      checkSimple(text, m.simpleBase, null, where, "Value");
      if (m.inlineSimple) facetsOk(text, m.inlineSimple, where, "Value");
      return;
    }
    if (!m.mixed && text.trim()) err(where, `<${el.localName}> shouldn’t contain loose text (“${text.trim().slice(0, 30)}”)`);
    const names = childEls.map((c) => c.localName);
    const decls = m.particles.reduce((acc, p) => declsIn(p, acc), {});
    if (!m.particles.length) { if (childEls.length) err(where, `<${el.localName}> should be empty, but contains <${names[0]}>`); return; }
    let ends = new Set([0]);
    for (const p of m.particles) { const nx = new Set(); for (const s of ends) for (const e of match(p, names, s)) nx.add(e); ends = nx; }
    if (!ends.has(names.length)) {
      const stray = names.find((n) => !decls[n]);
      const req = Object.entries(decls).filter(([n, d]) => occurs(d)[0] > 0 && !names.includes(n)).map(([n]) => n);
      err(where, stray ? `<${stray}> isn’t allowed inside <${el.localName}>${Object.keys(decls).length ? ` (allowed: ${Object.keys(decls).join(", ")})` : ""}`
        : req.length ? `<${el.localName}> is missing <${req.join(">, <")}>`
        : `The child elements of <${el.localName}> are in the wrong order or repeat too often (expected: ${Object.keys(decls).join(", ")})`);
    }
    for (const c of childEls) if (decls[c.localName]) checkElement(c, decls[c.localName]);
  };

  const rootEl = xml.documentElement;
  const rootDecl = global.element[rootEl.localName];
  if (!rootDecl) err("/" + rootEl.localName, `The schema has no top-level element named <${rootEl.localName}> (it has: ${Object.keys(global.element).join(", ") || "none"})`);
  else checkElement(rootEl, rootDecl);
  return errors;
}

const SAMPLE_XSD = `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="order">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="customer" type="xs:string"/>
        <xs:element name="email" type="emailType" minOccurs="0"/>
        <xs:element name="item" maxOccurs="unbounded">
          <xs:complexType>
            <xs:sequence>
              <xs:element name="name" type="xs:string"/>
              <xs:element name="qty" type="xs:positiveInteger"/>
              <xs:element name="price" type="xs:decimal"/>
            </xs:sequence>
            <xs:attribute name="sku" type="xs:string" use="required"/>
          </xs:complexType>
        </xs:element>
      </xs:sequence>
      <xs:attribute name="id" type="xs:integer" use="required"/>
      <xs:attribute name="status" default="new">
        <xs:simpleType>
          <xs:restriction base="xs:string">
            <xs:enumeration value="new"/>
            <xs:enumeration value="paid"/>
            <xs:enumeration value="shipped"/>
          </xs:restriction>
        </xs:simpleType>
      </xs:attribute>
    </xs:complexType>
  </xs:element>
  <xs:simpleType name="emailType">
    <xs:restriction base="xs:string">
      <xs:pattern value="[^@\\s]+@[^@\\s]+\\.[^@\\s]+"/>
    </xs:restriction>
  </xs:simpleType>
</xs:schema>`;
const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<order id="1001" status="pending">
  <customer>Alex</customer>
  <item sku="A-1">
    <name>Notebook</name>
    <qty>2</qty>
    <price>4.50</price>
  </item>
  <item>
    <name>Pen</name>
    <qty>zero</qty>
    <price>1.20</price>
  </item>
</order>`;

export function XsdValidatorTool() {
  const [xml, setXml] = useState(() => takeHandoff(SAMPLE_XML));
  const [xsd, setXsd] = useState(SAMPLE_XSD);
  const res = useMemo(() => {
    if (!xml.trim()) return null;
    try {
      if (!xsd.trim()) { parseXml(xml, "XML"); return { list: [], wellFormedOnly: true }; }
      return { list: validateXsd(xml, xsd) };
    } catch (e) { return { fatal: e.message }; }
  }, [xml, xsd]);
  return (
    <>
      <div className="split">
        <Panel label="XML" value={xml} onChange={setXml} rows={18} />
        <Panel label="XSD schema (leave empty to only check the XML is well-formed)" value={xsd} onChange={setXsd} rows={18} extra={<button className="btn ghost" onClick={() => { try { setXsd(generateXsd(xml)); } catch { /* invalid xml */ } }}>Make from XML</button>} />
      </div>
      {res?.fatal && <div className="big-answer"><span className="badge no-badge">Not valid</span> {res.fatal}</div>}
      {res?.list && (res.list.length
        ? <><div className="panel-label">{issueSummary(res.list)}</div><Issues items={res.list} /></>
        : <div className="big-answer"><span className="badge ok-badge">Valid</span> {res.wellFormedOnly ? "The XML is well-formed." : "The XML matches the schema."}</div>)}
      <p className="muted small">Checks elements, order, how often they appear, attributes, built-in types (int, date, decimal…), enumerations, patterns and lengths. Imports, keys/keyrefs and namespaces across several files aren’t checked.</p>
    </>
  );
}

/* ======================================================================
   XSD generator (from a sample XML)
   ====================================================================== */
const guessType = (vals) => {
  const v = vals.map((x) => x.trim()).filter((x) => x !== "");
  if (!v.length) return "xs:string";
  if (v.every((x) => /^(true|false)$/.test(x))) return "xs:boolean";
  if (v.every((x) => /^[+-]?\d{1,9}$/.test(x))) return "xs:integer";
  if (v.every((x) => /^[+-]?(\d+\.?\d*|\.\d+)$/.test(x))) return "xs:decimal";
  if (v.every((x) => BUILTIN.dateTime(x))) return "xs:dateTime";
  if (v.every((x) => BUILTIN.date(x))) return "xs:date";
  return "xs:string";
};

export function generateXsd(xmlText) {
  const doc = parseXml(xmlText, "XML");
  const ind = (n) => "  ".repeat(n);
  const render = (name, els, depth, minO, maxO) => {
    const childNames = [];
    const per = els.map((e) => { const counts = {}; for (const c of e.children) { counts[c.localName] = (counts[c.localName] || 0) + 1; if (!childNames.includes(c.localName)) childNames.push(c.localName); } return counts; });
    const attrNames = [...new Set(els.flatMap((e) => [...e.attributes].filter((a) => !/^(xmlns|xsi:)/.test(a.name)).map((a) => a.name)))];
    const text = els.map((e) => [...e.childNodes].filter((n) => n.nodeType === 3 || n.nodeType === 4).map((n) => n.nodeValue).join(""));
    const occ = `${minO === 0 ? ' minOccurs="0"' : ""}${maxO > 1 ? ' maxOccurs="unbounded"' : ""}`;
    const attrs = (d) => attrNames.map((a) => `${ind(d)}<xs:attribute name="${a}" type="${guessType(els.filter((e) => e.hasAttribute(a)).map((e) => e.getAttribute(a)))}"${els.every((e) => e.hasAttribute(a)) ? ' use="required"' : ""}/>`);
    if (!childNames.length && !attrNames.length) return `${ind(depth)}<xs:element name="${name}" type="${guessType(text)}"${occ}/>`;
    if (!childNames.length) {
      return [`${ind(depth)}<xs:element name="${name}"${occ}>`, `${ind(depth + 1)}<xs:complexType>`, `${ind(depth + 2)}<xs:simpleContent>`, `${ind(depth + 3)}<xs:extension base="${guessType(text)}">`,
        ...attrs(depth + 4), `${ind(depth + 3)}</xs:extension>`, `${ind(depth + 2)}</xs:simpleContent>`, `${ind(depth + 1)}</xs:complexType>`, `${ind(depth)}</xs:element>`].join("\n");
    }
    const mixed = text.some((t) => t.trim());
    const children = childNames.map((c) => {
      const counts = per.map((p) => p[c] || 0);
      const all = els.flatMap((e) => [...e.children].filter((x) => x.localName === c));
      return render(c, all, depth + 3, Math.min(...counts) === 0 ? 0 : 1, Math.max(...counts));
    });
    return [`${ind(depth)}<xs:element name="${name}"${occ}>`, `${ind(depth + 1)}<xs:complexType${mixed ? ' mixed="true"' : ""}>`, `${ind(depth + 2)}<xs:sequence>`, ...children, `${ind(depth + 2)}</xs:sequence>`,
      ...attrs(depth + 2), `${ind(depth + 1)}</xs:complexType>`, `${ind(depth)}</xs:element>`].join("\n");
  };
  const root = doc.documentElement;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" elementFormDefault="qualified">\n${render(root.localName, [root], 1, 1, 1)}\n</xs:schema>\n`;
}

export function XsdGeneratorTool() {
  const [xml, setXml] = useState(() => takeHandoff(SAMPLE_XML.replace("<qty>zero</qty>", "<qty>1</qty>").replace("<item>", '<item sku="B-2">')));
  const { out, err } = useMemo(() => { if (!xml.trim()) return { out: "", err: "" }; try { return { out: generateXsd(xml), err: "" }; } catch (e) { return { out: "", err: e.message }; } }, [xml]);
  return (
    <>
      <div className="split">
        <Panel label="Sample XML" value={xml} onChange={setXml} error={err} rows={20} />
        <Panel label="XSD schema" value={out} readOnly rows={20} />
      </div>
      <p className="muted small">Types are guessed from the sample (whole numbers, decimals, dates, true/false). Elements that are missing somewhere become optional; elements that repeat can appear many times. Check the result before relying on it.</p>
    </>
  );
}

export const DATA_VIEWS = {
  "/data/jsonpath": JsonPathTool,
  "/data/yaml-paths": YamlPathsTool,
  "/data/json-schema": JsonSchemaTool,
  "/data/json-code": JsonToCodeTool,
  "/data/xsd-validator": XsdValidatorTool,
  "/data/xsd-generator": XsdGeneratorTool,
  "/converters/toml": TomlTool,
};
