// DevDeck plugin kit: everything a plugin needs, in one import.
//   import { definePlugin, Panel, Options, … } from "../../plugin-sdk.jsx";
// See PLUGINS.md for the full guide.
import { useEffect, useState } from "react";
import { Panel, Options, Segmented, CopyButton, PasteButton } from "./tools.jsx";
import { Result, Table, FileDrop, download, fmtBytes } from "./shared.jsx";
import { takeHandoff } from "./handoff.js";

export { Panel, Options, Segmented, CopyButton, PasteButton, Result, Table, FileDrop, download, fmtBytes, takeHandoff };

/* A ready-made screen for "text in → text out" tools: options on top, input and output side by side.
   spec = { transform(input, options), options?: [...], sample?, inputLabel?, outputLabel?, mono? } */
export function TransformTool({ spec }) {
  const opts = spec.options || [];
  const [input, setInput] = useState(() => takeHandoff(spec.sample ?? ""));
  const [values, setValues] = useState(() => Object.fromEntries(opts.map((o) => [o.id, o.default ?? (o.type === "toggle" ? false : o.type === "number" ? 0 : o.choices?.[0]?.[0] ?? "")])));
  const [res, setRes] = useState({ out: "", err: "" });
  useEffect(() => {
    let live = true;
    if (!input) { setRes({ out: "", err: "" }); return; }
    Promise.resolve()
      .then(() => spec.transform(input, values))
      .then((out) => live && setRes({ out: out == null ? "" : String(out), err: "" }), (e) => live && setRes({ out: "", err: e?.message || String(e) }));
    return () => { live = false; };
  }, [input, values]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (id, v) => setValues((p) => ({ ...p, [id]: v }));
  const mono = spec.mono ?? true;
  return (
    <>
      {opts.length > 0 && (
        <Options>
          {opts.map((o) => {
            if (o.type === "toggle") return <label key={o.id} className="check"><input type="checkbox" checked={!!values[o.id]} onChange={(e) => set(o.id, e.target.checked)} /> {o.label}</label>;
            if (o.type === "select" && o.choices.length <= 4) return <Segmented key={o.id} label={o.label} value={values[o.id]} onChange={(v) => set(o.id, v)} options={o.choices} />;
            if (o.type === "select") return <label key={o.id} className="check">{o.label} <select className="field small-select" value={values[o.id]} onChange={(e) => set(o.id, e.target.value)}>{o.choices.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>;
            return <label key={o.id} className="check">{o.label} <input className={`field small ${o.type === "text" ? "wide-small" : ""}`} type={o.type === "number" ? "number" : "text"} value={values[o.id]} min={o.min} max={o.max} onChange={(e) => set(o.id, o.type === "number" ? Number(e.target.value) : e.target.value)} /></label>;
          })}
        </Options>
      )}
      <div className="split">
        <Panel label={spec.inputLabel || "Input"} value={input} onChange={setInput} error={res.err} rows={spec.rows || 12} mono={mono} />
        <Panel label={spec.outputLabel || "Output"} value={res.out} readOnly rows={spec.rows || 12} mono={mono} />
      </div>
    </>
  );
}

/* Describe a plugin. `tools` maps each tool id from plugin.json to either
     { component: MyReactComponent }                      — your own screen, or
     { transform(input, options) { … }, options, sample } — a ready-made text in → text out screen.
   Returns { id, views } — DevDeck uses `views` to show each tool. */
export function definePlugin(def) {
  if (!def || !def.id) throw new Error("definePlugin: an id is required (the same as in plugin.json).");
  const views = {};
  for (const [toolId, spec] of Object.entries(def.tools || {})) {
    if (spec.component) views[toolId] = spec.component;
    else if (typeof spec.transform === "function") {
      const View = () => <TransformTool spec={spec} />;
      View.displayName = `${def.id}/${toolId}`;
      views[toolId] = View;
    } else throw new Error(`definePlugin(${def.id}): tool “${toolId}” needs a component or a transform function.`);
  }
  return { id: def.id, views };
}
