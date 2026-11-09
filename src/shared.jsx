// Small pieces shared by the newer tool files (data, media, network).
import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { CopyButton } from "./tools.jsx";

export const Result = ({ label, value, copy = true }) => (
  <div className="result"><span className="panel-label">{label}</span><code>{value === "" || value == null ? "—" : value}</code>{copy ? <CopyButton value={String(value ?? "")} /> : <span />}</div>
);

export function download(name, data, type = "text/plain") {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const fmtBytes = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : n < 1073741824 ? `${(n / 1048576).toFixed(2)} MB` : `${(n / 1073741824).toFixed(2)} GB`);

// Drop a file here or click to pick one (several when `multiple`).
export function FileDrop({ onFiles, accept, title, hint, multiple = false }) {
  const [drag, setDrag] = useState(false);
  const ref = useRef(null);
  const send = (list) => { const files = [...(list || [])]; if (files.length) onFiles(multiple ? files : files.slice(0, 1)); };
  return (
    <div
      className={`dropzone ${drag ? "over" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); send(e.dataTransfer.files); }}
      onClick={() => ref.current?.click()}
      role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ref.current?.click(); } }}
    >
      <Upload size={26} />
      <strong>{title || "Drop a file here, or click to choose one"}</strong>
      <span className="muted small">{hint || "It never leaves your device"}</span>
      <input ref={ref} type="file" accept={accept} multiple={multiple} hidden onChange={(e) => { send(e.target.files); e.target.value = ""; }} />
    </div>
  );
}

// Read YAML or JSON (JSON is valid YAML, but JSON.parse gives clearer errors for JSON).
export function parseData(text, yaml) {
  const t = text.trim();
  if (!t) return undefined;
  if (/^[[{]/.test(t)) { try { return JSON.parse(t); } catch { /* fall through to YAML, which accepts JSON-ish text */ } }
  return yaml.load(t);
}

// Two-dimensional table from rows of cells.
export function Table({ head, rows, empty = "Nothing to show." }) {
  if (!rows.length) return <p className="muted small">{empty}</p>;
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

// "Did you mean …?" for typos in config keys.
export function closest(word, options, max = 2) {
  let best = null, bestD = max + 1;
  for (const o of options) {
    const d = lev(word.toLowerCase(), o.toLowerCase());
    if (d < bestD) { best = o; bestD = d; }
  }
  return best;
}
function lev(a, b) {
  const m = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) m[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return m[a.length][b.length];
}

// List of problems with a coloured level badge.
export function Issues({ items, okText = "No problems found." }) {
  if (!items.length) return <div className="big-answer"><span className="badge ok-badge">OK</span> {okText}</div>;
  const order = { error: 0, warning: 1, info: 2 };
  return (
    <ul className="issue-list">
      {[...items].sort((a, b) => order[a.level] - order[b.level]).map((x, i) => (
        <li key={i} className={`issue ${x.level}`}>
          <span className={`badge ${x.level === "error" ? "no-badge" : x.level === "warning" ? "warn-badge" : ""}`}>{x.level === "error" ? "Error" : x.level === "warning" ? "Warning" : "Tip"}</span>
          {x.where && <code className="issue-where">{x.where}</code>}
          <span>{x.text}</span>
        </li>
      ))}
    </ul>
  );
}
export const issueSummary = (items) => {
  const e = items.filter((x) => x.level === "error").length, w = items.filter((x) => x.level === "warning").length;
  return `${e} ${e === 1 ? "error" : "errors"}, ${w} ${w === 1 ? "warning" : "warnings"}`;
};
