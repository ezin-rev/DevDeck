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
  { id: "custom", name: "Custom", note: "Your own colours — fine-tune them in Settings", fx: "soft", swatch: [] },
];

/* ---------- custom theme: the nine base colours (per light/dark mode) plus a few style knobs ---------- */
export const CUSTOM_COLORS = [
  ["bg", "Background"], ["card", "Cards & panels"], ["field", "Text boxes"],
  ["text", "Text"], ["text-strong", "Headings"], ["muted", "Quiet text"],
  ["accent", "Accent"], ["accent-2", "Second accent"], ["on-accent", "Text on accent"],
];
export const CUSTOM_FONTS = {
  jakarta: ["Rounded sans (default)", '"Plus Jakarta Sans Variable", ui-sans-serif, system-ui, sans-serif'],
  system: ["Your device’s font", 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'],
  serif: ["Serif", 'Georgia, "Iowan Old Style", "Times New Roman", serif'],
  mono: ["Monospace everywhere", '"JetBrains Mono Variable", ui-monospace, Menlo, monospace'],
};
const CUSTOM_VARS = [...CUSTOM_COLORS.map(([k]) => `--${k}`), "--r-s", "--r-m", "--r-l", "--sat", "--line-mix", "--font"];

export function applyCustomTheme(custom, mode) {
  const s = document.documentElement.style;
  const c = custom?.[mode];
  if (!c) return clearCustomTheme();
  for (const [k] of CUSTOM_COLORS) if (c[k]) s.setProperty(`--${k}`, c[k]);
  const r = custom.radius ?? 1;
  s.setProperty("--r-s", `${Math.round(10 * r)}px`); s.setProperty("--r-m", `${Math.round(14 * r)}px`); s.setProperty("--r-l", `${Math.round(18 * r)}px`);
  s.setProperty("--sat", `${custom.sat ?? 62}%`);
  s.setProperty("--line-mix", `${custom.line ?? 9}%`);
  s.setProperty("--font", (CUSTOM_FONTS[custom.font] || CUSTOM_FONTS.jakarta)[1]);
}
export function clearCustomTheme() { const s = document.documentElement.style; for (const v of CUSTOM_VARS) s.removeProperty(v); }

const hex6 = (v) => { const h = (v || "").trim().replace(/^#/, ""); return /^[0-9a-f]{3}$/i.test(h) ? `#${h.replace(/./g, "$&$&")}`.toLowerCase() : /^[0-9a-f]{6}$/i.test(h) ? `#${h}`.toLowerCase() : "#888888"; };
// Read a built-in theme's base colours (both modes) straight from the stylesheet.
export function readThemeColors(paletteId) {
  const el = document.documentElement, d = el.dataset, keep = { theme: d.theme, palette: d.palette };
  const inline = CUSTOM_VARS.map((v) => [v, el.style.getPropertyValue(v)]);
  clearCustomTheme();
  d.palette = paletteId;
  const read = (mode) => { d.theme = mode; const cs = getComputedStyle(el); return Object.fromEntries(CUSTOM_COLORS.map(([k]) => [k, hex6(cs.getPropertyValue(`--${k}`))])); };
  const out = { light: read("light"), dark: read("dark") };
  d.theme = keep.theme; d.palette = keep.palette;
  for (const [v, val] of inline) if (val) el.style.setProperty(v, val);
  return out;
}
export const seedCustom = (fromPalette, prev = {}) => ({ radius: 1, fx: "soft", sat: 62, line: 9, font: "jakarta", ...prev, ...readThemeColors(fromPalette) });

// WCAG contrast ratio between two hex colours (4.5+ is comfortable for normal text).
export function contrast(a, b) {
  const lum = (h) => { const n = parseInt(hex6(h).slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0); };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

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
    const custom = prefs.palette === "custom" && prefs.custom ? prefs.custom : null;
    const theme = THEMES.find((t) => t.id === prefs.palette && (t.id !== "custom" || custom)) || THEMES[0];
    d.theme = isDark ? "dark" : "light";
    d.palette = theme.id;
    d.fx = custom ? (custom.fx || "soft") : theme.fx;
    if (custom) applyCustomTheme(custom, isDark ? "dark" : "light"); else clearCustomTheme();
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
        {THEMES.map((t) => {
          const sw = t.id === "custom" ? (prefs.custom ? [prefs.custom.dark.bg, prefs.custom.light.bg, prefs.custom.light.accent] : ["#444", "#bbb", "conic-gradient(#f43f5e, #f59e0b, #22c55e, #3b82f6, #a855f7, #f43f5e)"]) : t.swatch;
          return (
          <button key={t.id} role="radio" aria-checked={prefs.palette === t.id} className={`theme-opt ${prefs.palette === t.id ? "on" : ""}`}
            onClick={() => { if (t.id === "custom" && !prefs.custom) set("custom", seedCustom(prefs.palette === "custom" ? "contrast" : prefs.palette)); set("palette", t.id); }}>
            <span className="swatch" aria-hidden="true">
              <i style={{ background: sw[0] }} /><i style={{ background: sw[1] }} /><i style={{ background: sw[2] }} />
            </span>
            <span className="theme-name">{t.name}</span>
            <span className="theme-note">{t.note}</span>
          </button>
          );
        })}
      </div>
    </div>
  );
}

/* Fine-tune your own theme (Settings page): colours for the current mode, shape, glow and font. */
export function ThemeEditor({ prefs, set, isDark }) {
  const [shared, setShared] = useState("");
  const [msg, setMsg] = useState("");
  const mode = isDark ? "dark" : "light";
  const c = prefs.palette === "custom" ? prefs.custom : null;
  if (!c) {
    return (
      <div className="theme-editor-cta">
        <span className="muted small">Want your own colours, roundness or font?</span>
        <button className="btn" onClick={() => { set("custom", seedCustom(prefs.palette, prefs.custom)); set("palette", "custom"); }}>Customize this theme</button>
      </div>
    );
  }
  const upd = (patch) => set("custom", { ...c, ...patch });
  const col = c[mode];
  const checks = [
    ["Text on background", contrast(col.text, col.bg), 4.5],
    ["Text on cards", contrast(col.text, col.card), 4.5],
    ["Quiet text", contrast(col.muted, col.bg), 3],
    ["Text on accent buttons", contrast(col["on-accent"], col.accent), 4.5],
  ];
  return (
    <div className="theme-editor">
      <div className="panel-head">
        <span className="panel-label">Fine-tune your theme — {mode} mode</span>
        <span className="muted small">Switch Light/Dark above to edit the other mode’s colours.</span>
      </div>
      <div className="color-grid">
        {CUSTOM_COLORS.map(([k, label]) => (
          <label key={k} className="color-field">
            <input type="color" value={col[k]} onChange={(e) => upd({ [mode]: { ...col, [k]: e.target.value } })} aria-label={label} />
            <span><strong>{label}</strong><code>{col[k]}</code></span>
          </label>
        ))}
      </div>
      <div className="contrast-row">
        {checks.map(([label, ratio, need]) => (
          <span key={label} className={`badge ${ratio >= need ? "ok-badge" : "warn-badge"}`} title={`Contrast ${ratio.toFixed(1)}:1 — at least ${need}:1 is easy to read`}>
            {label}: {ratio.toFixed(1)}:1 {ratio >= need ? "✓" : "— hard to read"}
          </span>
        ))}
      </div>
      <div className="knob-grid">
        <label className="knob">Roundness <input type="range" min="0" max="2" step="0.1" value={c.radius ?? 1} onChange={(e) => upd({ radius: +e.target.value })} /> <span>{Math.round((c.radius ?? 1) * 100)}%</span></label>
        <label className="knob">Border strength <input type="range" min="0" max="30" value={c.line ?? 9} onChange={(e) => upd({ line: +e.target.value })} /> <span>{c.line ?? 9}%</span></label>
        <label className="knob">Category colours <input type="range" min="0" max="100" value={c.sat ?? 62} onChange={(e) => upd({ sat: +e.target.value })} /> <span>{c.sat ?? 62}%</span></label>
        <label className="knob">Font <select className="field small-select" value={c.font || "jakarta"} onChange={(e) => upd({ font: e.target.value })}>{Object.entries(CUSTOM_FONTS).map(([k, [name]]) => <option key={k} value={k}>{name}</option>)}</select></label>
        <label className="check"><input type="checkbox" checked={c.fx === "vivid"} onChange={(e) => upd({ fx: e.target.checked ? "vivid" : "soft" })} /> Glow & gradients</label>
      </div>
      <div className="options-row">
        <label className="check">Start again from <select className="field small-select" value="" onChange={(e) => { if (e.target.value) { upd(readThemeColors(e.target.value)); setMsg(`Colours copied from ${THEMES.find((t) => t.id === e.target.value).name}.`); } }}>
          <option value="">choose a theme…</option>{THEMES.filter((t) => t.id !== "custom").map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select></label>
        <button className="btn ghost" onClick={async () => { try { await navigator.clipboard.writeText(JSON.stringify(c)); setMsg("Theme copied — paste it to share or back it up."); } catch { setShared(JSON.stringify(c)); } }}>Copy theme</button>
        <button className="btn ghost" onClick={() => setShared(shared ? "" : " ")}>Paste a theme…</button>
      </div>
      {shared && (
        <div className="options-row">
          <input className="field mono grow-field" value={shared.trim()} onChange={(e) => setShared(e.target.value)} placeholder='{"light":{…},"dark":{…}}' aria-label="Theme to paste" />
          <button className="btn" onClick={() => { try { const t = JSON.parse(shared); if (!t.light || !t.dark) throw 0; upd(t); setShared(""); setMsg("Theme applied."); } catch { setMsg("That isn’t a DevDeck theme (it needs light and dark colours)."); } }}>Use it</button>
        </div>
      )}
      {msg && <p className="muted small">{msg}</p>}
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
