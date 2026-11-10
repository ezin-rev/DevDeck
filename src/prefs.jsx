import { useEffect, useState } from "react";

/* Colour themes. `fx` = "soft" (flat, no glow) or "vivid" (glow + gradients). Swatches are for the picker only. */
export const THEMES = [
  { id: "contrast", name: "High Contrast", note: "Black, white and yellow", fx: "soft", swatch: ["#000000", "#ffffff", "#ffd400"] },
  { id: "slate", name: "Calm Slate", note: "Neutral greys, quiet indigo", fx: "soft", swatch: ["#1c1f26", "#f5f6f8", "#5b63b7"] },
  { id: "paper", name: "Warm Paper", note: "Cream paper, terracotta ink", fx: "soft", swatch: ["#24201b", "#f7f3ec", "#b5653e"] },
  { id: "forest", name: "Sage Forest", note: "Soft greens, easy on the eyes", fx: "soft", swatch: ["#1a211b", "#f3f5f1", "#4f7a5a"] },
  { id: "ocean", name: "Harbor Blue", note: "Muted blues and teals", fx: "soft", swatch: ["#152029", "#f2f6f8", "#2f6f8f"] },
  { id: "rose", name: "Dusk Rose", note: "Gentle mauve and blush", fx: "soft", swatch: ["#231c1f", "#f8f4f5", "#a3566e"] },
  { id: "mono", name: "Ink & Paper", note: "Black and white, no colour", fx: "soft", swatch: ["#181818", "#fafafa", "#262626"] },
  { id: "aurora", name: "Neon Glow", note: "Purple and cyan with a soft moving glow", fx: "vivid", swatch: ["#0a0d1a", "#f6f7fb", "#8b7dff"] },
];

export const LAYOUT_OPTIONS = [
  { key: "nav", label: "Navigation", hint: "Where the tool groups live (side options are for wide screens)", options: [["tabs", "Top tabs"], ["side", "Side menu"], ["rail", "Icon bar"], ["minimal", "Search only"]] },
  { key: "view", label: "Tool cards", hint: "How tools are shown", options: [["cards", "Cards"], ["tiles", "Tiles"], ["list", "Compact list"]] },
  { key: "panels", label: "Tool boxes", hint: "Input and output next to each other, or one above the other", options: [["side", "Side by side"], ["stacked", "Stacked"]] },
  { key: "density", label: "Spacing", hint: "Roomy or tighter, to fit more on screen", options: [["comfortable", "Roomy"], ["compact", "Compact"]] },
  { key: "text", label: "Text size", hint: "Bigger text is easier to read", options: [["normal", "Normal"], ["large", "Large"]] },
  { key: "hero", label: "Welcome banner", hint: "The big search on the home page", options: [["show", "Show"], ["hide", "Hide"]] },
  { key: "width", label: "Page width", hint: "Centered column or edge to edge", options: [["centered", "Centered"], ["full", "Full width"]] },
  { key: "chrome", label: "Top bar & headers", hint: "Full with icons and descriptions, or slim and minimal for more room", options: [["full", "Full"], ["slim", "Slim"]] },
];

const LAYOUT_KEYS = LAYOUT_OPTIONS.map((o) => o.key);

/* One-click layout presets: each sets every layout option at once. */
export const LAYOUT_PRESETS = [
  { id: "modern", name: "Modern web", note: "Top tabs with icons, cards and a welcome search",
    set: { nav: "tabs", view: "cards", panels: "side", density: "comfortable", text: "normal", hero: "show", width: "centered", chrome: "full" } },
  { id: "pro", name: "Compact", note: "Clean and dense: slim top bar, plain tabs, compact lists, small headers",
    set: { nav: "tabs", view: "list", panels: "side", density: "compact", text: "normal", hero: "hide", width: "full", chrome: "slim" } },
  { id: "desktop", name: "Desktop app", note: "Side menu with every tool, like a desktop program",
    set: { nav: "side", view: "cards", panels: "side", density: "comfortable", text: "normal", hero: "hide", width: "full", chrome: "full" } },
  { id: "workspace", name: "Dev workspace", note: "Slim icon bar, compact list, lots of room for work",
    set: { nav: "rail", view: "list", panels: "side", density: "compact", text: "normal", hero: "hide", width: "full", chrome: "slim" } },
  { id: "launcher", name: "App launcher", note: "Big friendly tiles, like a phone home screen",
    set: { nav: "tabs", view: "tiles", panels: "stacked", density: "comfortable", text: "normal", hero: "show", width: "centered", chrome: "full" } },
  { id: "focus", name: "Focus", note: "Just a search bar and a simple list, nothing else",
    set: { nav: "minimal", view: "list", panels: "stacked", density: "compact", text: "normal", hero: "hide", width: "centered", chrome: "slim" } },
];

export const presetFor = (prefs) => LAYOUT_PRESETS.find((p) => LAYOUT_KEYS.every((k) => p.set[k] === prefs[k]));

export const DEFAULTS = { palette: "contrast", mode: "dark", ...LAYOUT_PRESETS[0].set };
const KEY = "aurora-prefs-v2"; // v2: High Contrast became the default

function load() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return { ...DEFAULTS }; }
}

const darkQuery = () => window.matchMedia("(prefers-color-scheme: dark)");

export function usePrefs() {
  const [prefs, setPrefs] = useState(load);
  const [systemDark, setSystemDark] = useState(() => darkQuery().matches);
  useEffect(() => {
    const mq = darkQuery();
    const onChange = () => setSystemDark(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  const isDark = prefs.mode === "dark" || (prefs.mode === "system" && systemDark);
  useEffect(() => {
    const d = document.documentElement.dataset;
    const theme = THEMES.find((t) => t.id === prefs.palette) || THEMES[0];
    d.theme = isDark ? "dark" : "light";
    d.palette = theme.id;
    d.fx = theme.fx;
    for (const k of LAYOUT_KEYS) if (k !== "hero") d[k] = prefs[k];
    try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch {}
  }, [prefs, isDark]);
  const set = (key, value) => setPrefs((p) => ({ ...p, [key]: value }));
  const reset = () => setPrefs((p) => ({ ...p, ...LAYOUT_PRESETS[0].set }));
  const applyPreset = (preset) => setPrefs((p) => ({ ...p, ...preset.set }));
  return { prefs, set, reset, applyPreset, isDark };
}

/* ---------- pickers (used in the pop-up menus and on the Settings page) ---------- */
export function Choice({ label, hint, value, options, onChange }) {
  return (
    <div className="choice">
      <div className="choice-text"><strong>{label}</strong>{hint && <span>{hint}</span>}</div>
      <div className="segmented" role="radiogroup" aria-label={label}>
        {options.map(([v, text]) => (
          <button key={v} role="radio" aria-checked={value === v} className={value === v ? "on" : ""} onClick={() => onChange(v)}>{text}</button>
        ))}
      </div>
    </div>
  );
}

export function ThemePicker({ prefs, set }) {
  return (
    <div className="picker">
      <Choice label="Mode" hint="Light, dark, or follow your device" value={prefs.mode} onChange={(v) => set("mode", v)} options={[["light", "Light"], ["dark", "Dark"], ["system", "System"]]} />
      <div className="theme-grid" role="radiogroup" aria-label="Colour theme">
        {THEMES.map((t) => (
          <button key={t.id} role="radio" aria-checked={prefs.palette === t.id} className={`theme-opt ${prefs.palette === t.id ? "on" : ""}`} onClick={() => set("palette", t.id)}>
            <span className="swatch" aria-hidden="true">
              <i style={{ background: t.swatch[0] }} /><i style={{ background: t.swatch[1] }} /><i style={{ background: t.swatch[2] }} />
            </span>
            <span className="theme-name">{t.name}</span>
            <span className="theme-note">{t.note}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* Tiny drawing of a layout, built from its settings. */
function LayoutSketch({ set }) {
  const cells = set.view === "list" ? 4 : set.view === "tiles" ? 6 : 4;
  return (
    <span className={`sketch nav-${set.nav} view-${set.view} ${set.width === "full" ? "full" : ""}`} aria-hidden="true">
      <span className="sk-top" />
      {set.nav === "tabs" && <span className="sk-tabs"><i /><i /><i /></span>}
      <span className="sk-body">
        {(set.nav === "side" || set.nav === "rail") && <span className="sk-side"><i /><i /><i /><i /></span>}
        <span className="sk-main">
          {set.hero === "show" && <span className="sk-hero" />}
          <span className="sk-grid">{Array.from({ length: cells }, (_, i) => <i key={i} />)}</span>
        </span>
      </span>
    </span>
  );
}

export function PresetPicker({ prefs, applyPreset }) {
  const active = presetFor(prefs);
  return (
    <div className="choice">
      <div className="choice-text"><strong>Presets</strong><span>{active ? `Using “${active.name}”` : "Custom mix — pick a preset to start over"}</span></div>
      <div className="preset-grid" role="radiogroup" aria-label="Layout presets">
        {LAYOUT_PRESETS.map((p) => (
          <button key={p.id} role="radio" aria-checked={active === p} className={`preset-opt ${active === p ? "on" : ""}`} onClick={() => applyPreset(p)}>
            <LayoutSketch set={p.set} />
            <span className="theme-name">{p.name}</span>
            <span className="theme-note">{p.note}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function LayoutPicker({ prefs, set, reset, applyPreset }) {
  const [more, setMore] = useState(!presetFor(prefs));
  return (
    <div className="picker">
      {applyPreset && <PresetPicker prefs={prefs} applyPreset={applyPreset} />}
      <button className="btn ghost more-toggle" aria-expanded={more} onClick={() => setMore((m) => !m)}>
        {more ? "Hide fine-tuning" : "Fine-tune each option"}
      </button>
      {more && LAYOUT_OPTIONS.map((o) => (
        <Choice key={o.key} label={o.label} hint={o.hint} value={prefs[o.key]} options={o.options} onChange={(v) => set(o.key, v)} />
      ))}
      {more && reset && <button className="btn ghost reset" onClick={reset}>Reset layout to default</button>}
    </div>
  );
}
