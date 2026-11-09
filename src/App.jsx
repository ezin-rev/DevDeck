import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { House, Search, Settings, Star, History, WandSparkles, Palette as PaletteIcon, LayoutDashboard, Sparkles, ArrowRight, ArrowUpRight, ChevronRight, ChevronDown, ShieldCheck, CornerDownLeft, X } from "lucide-react";
import { GROUPS, ALL_TOOLS } from "./data.js";
import { usePath, Link, navigate } from "./router.jsx";
import { sendTo } from "./handoff.js";
import { usePins, useRecent, togglePin, markUsed, clearRecent } from "./store.js";
import { usePrefs, ThemePicker, LayoutPicker } from "./prefs.jsx";

const byPath = (p) => ALL_TOOLS.find((t) => t.path === p);

// The tools themselves load separately from the home page, so the first visit stays light.
// They are fetched once (in the background after the page settles, or when a tool is opened).
let viewsPromise = null;
const loadViews = () => (viewsPromise ||= Promise.all([
  import("./tools.jsx"), import("./power.jsx"), import("./tools2.jsx"), import("./devops.jsx"), import("./certs.jsx"),
]).then(([a, b, c, d, e]) => ({ ...a.TOOL_VIEWS, ...b.POWER_VIEWS, ...c.MORE_VIEWS, ...d.DEVOPS_VIEWS, ...e.CERT_VIEWS })));
const lazyViews = {};
const viewFor = (path) => (lazyViews[path] ||= lazy(() => loadViews().then((v) => ({ default: v[path] || (() => null) }))));

function ToolLoading() {
  return <div className="panel tool-loading" role="status"><span className="spinner" aria-hidden="true" /> Loading the tool…</div>;
}

const BLURBS = {
  power: "Things DevToys can’t do: smart detection and chaining tools together.",
  reference: "Quick look-ups you need while building for the web.",
  devops: "Networks, certificates, containers, Kubernetes, config files and uptime — the everyday DevOps toolbox.",
  converters: "Turn data from one format into another.",
  "encoders-decoders": "Make text safe for the web, or read it back.",
  formatters: "Tidy up messy data so it’s easy to read.",
  generators: "Create hashes, IDs, passwords and placeholder data in one click.",
  text: "Count, change case, compare and search text.",
};

// Search by words in any order ("format json" finds the JSON Formatter), including nicknames
// such as "epoch" or "k8s". Every word must match; tools whose title matches come first.
const splitWords = (s) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
const stem = (w) => (w.length > 4 ? w.replace(/(ting|ing|ers|er|ed|es|s)$/, "") : w);
const SEARCH_INDEX = ALL_TOOLS.map((t) => ({
  tool: t,
  fields: [[splitWords(`${t.title} ${t.short} ${t.short.replace(/\s+/g, "")}`), 4], [splitWords(t.words), 3], [splitWords(t.group.title), 2], [splitWords(t.desc), 1]],
}));

function filterTools(q) {
  const terms = splitWords(q);
  if (!terms.length) return ALL_TOOLS;
  const scored = [];
  for (const { tool, fields } of SEARCH_INDEX) {
    let score = 0;
    const all = terms.every((term) => {
      const s = stem(term);
      let best = 0;
      for (const [words, weight] of fields) {
        for (const w of words) {
          const hit = w === term ? 2 : w.startsWith(s) ? 1.5 : term.length > 2 && w.includes(term) ? 1 : 0;
          if (hit) best = Math.max(best, hit * weight);
        }
      }
      score += best;
      return best > 0;
    });
    if (all) scored.push([score, tool]);
  }
  return scored.sort((a, b) => b[0] - a[0]).map(([, t]) => t);
}

// True while the visitor is typing in a box, so page-wide shortcuts stay out of the way.
const isTyping = () => { const el = document.activeElement; return !!el && (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.isContentEditable); };

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

/* ---------- pop-up menus ---------- */
function MenuButton({ icon: Icon, label, title, children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  return (
    <div className="menu" ref={ref}>
      <button className={`round-btn ${open ? "pressed" : ""}`} aria-expanded={open} aria-haspopup="dialog" title={label} onClick={() => setOpen((o) => !o)}>
        <Icon size={18} /><span className="sr-only">{label}</span>
      </button>
      {open && (
        <div className="popover" role="dialog" aria-label={label}>
          <div className="popover-head">
            <strong>{title}</strong>
            <button className="round-btn small" onClick={() => setOpen(false)} title="Close"><X size={16} /><span className="sr-only">Close</span></button>
          </div>
          {children}
        </div>
      )}
    </div>
  );
}

/* ---------- navigation ---------- */
const TABS = [{ id: "", title: "All tools", icon: House, tone: "blue" }, ...GROUPS];
const tabActive = (t, path) => (t.id ? path === `/${t.id}` || path.startsWith(`/${t.id}/`) : path === "/");

function TopBar({ path, prefsApi, openPalette }) {
  const { prefs, set, reset, applyPreset } = prefsApi;
  return (
    <header className="topbar">
      <div className="topbar-row">
        <Link to="/" className="logo">
          <span className="logo-mark"><Sparkles size={16} /></span>
          <span>DevDeck</span>
          <span className="logo-pill">Aurora</span>
        </Link>
        {/* A real search form: focusing or typing opens the quick-search palette. */}
        <form className="search-trigger" aria-label="Search tools" onSubmit={(e) => { e.preventDefault(); openPalette(); }} onClick={() => openPalette()}>
          <Search size={16} />
          <input
            type="search"
            name="q"
            className="search-trigger-text"
            placeholder="Search tools…"
            aria-label="Search tools"
            readOnly
            onFocus={(e) => { e.target.blur(); openPalette(); }}
          />
          <kbd>{isMac ? "⌘" : "Ctrl"} K</kbd>
        </form>
        <div className="top-actions">
          <MenuButton icon={PaletteIcon} label="Theme menu" title="Theme">
            <ThemePicker prefs={prefs} set={set} />
          </MenuButton>
          <MenuButton icon={LayoutDashboard} label="Layout menu" title="Layout">
            <LayoutPicker prefs={prefs} set={set} reset={reset} applyPreset={applyPreset} />
          </MenuButton>
          <Link to="/settings" className="round-btn" title="Settings"><Settings size={18} /><span className="sr-only">Settings</span></Link>
        </div>
      </div>
      <nav className="tabs" aria-label="Tool groups">
        {TABS.map((t) => {
          const to = t.id ? `/${t.id}` : "/";
          const active = tabActive(t, path);
          const Icon = t.icon;
          const group = GROUPS.find((g) => g.id === t.id);
          const link = (
            <Link key={to} to={to} className={`tab tone-${t.tone} ${active ? "active" : ""} ${group ? "has-menu" : ""}`} aria-current={active ? "page" : undefined}>
              <Icon size={15} /> {t.title}
            </Link>
          );
          return group ? <span key={to} className={`tab-wrap ${active ? "active" : ""}`}>{link}<TabMenu group={group} path={path} active={active} /></span> : link;
        })}
      </nav>
    </header>
  );
}

/* Drop-down list of a group's tools, opened from the small arrow next to each tab. */
function TabMenu({ group, path, active }) {
  const [pos, setPos] = useState(null);
  const btn = useRef(null);
  const panel = useRef(null);
  const open = !!pos;
  const toggle = () => {
    if (open) return setPos(null);
    const r = btn.current.getBoundingClientRect();
    setPos({ top: r.bottom + 8, left: Math.max(8, Math.min(r.right - 280, window.innerWidth - 288)) });
  };
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!btn.current?.contains(e.target) && !panel.current?.contains(e.target)) setPos(null); };
    const onKey = (e) => { if (e.key === "Escape") setPos(null); };
    const onMove = () => setPos(null);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onMove);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", onKey); window.removeEventListener("resize", onMove); };
  }, [open]);
  useEffect(() => setPos(null), [path]);
  const id = `tabmenu-${group.id}`;
  return (
    <>
      <button
        ref={btn}
        className={`tab tab-caret tone-${group.tone} ${active ? "active" : ""} ${open ? "open" : ""}`}
        aria-expanded={open}
        aria-controls={id}
        aria-haspopup="true"
        aria-label="toggle open/close state of the tool group"
        title={`${group.title} tools`}
        onClick={toggle}
      >
        <ChevronDown size={14} />
      </button>
      {open && (
        <div ref={panel} id={id} className={`tab-menu tone-${group.tone}`} style={{ top: pos.top, left: pos.left }} role="menu" aria-label={`${group.title} tools`}>
          {group.tools.map((tool) => {
            const TIcon = tool.icon;
            const tp = `/${group.id}/${tool.id}`;
            return (
              <Link key={tp} to={tp} role="menuitem" className={`tab-menu-item ${path === tp ? "active" : ""}`}>
                <span className="mini-tile"><TIcon size={15} /></span>
                <span className="tab-menu-text"><strong>{tool.title}</strong><span>{tool.desc}</span></span>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

function SideNav({ path }) {
  return (
    <aside className="sidenav" aria-label="All tools by group">
      {TABS.map((t) => {
        const to = t.id ? `/${t.id}` : "/";
        const Icon = t.icon;
        const group = GROUPS.find((g) => g.id === t.id);
        return (
          <div key={to} className="side-group">
            <Link to={to} title={t.title} className={`side-link tone-${t.tone} ${tabActive(t, path) && path === to ? "active" : ""} ${tabActive(t, path) ? "within" : ""}`}>
              <span className="mini-tile"><Icon size={15} /></span> <span className="side-label">{t.title}</span>
            </Link>
            {group && (
              <ul className="side-tools">
                {group.tools.map((tool) => {
                  const tp = `/${group.id}/${tool.id}`;
                  return <li key={tp}><Link to={tp} className={`side-tool ${path === tp ? "active" : ""}`}>{tool.short}</Link></li>;
                })}
              </ul>
            )}
          </div>
        );
      })}
    </aside>
  );
}

/* ---------- command palette ---------- */
function Palette({ open, onClose }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const pins = usePins();
  const recent = useRecent();
  const results = useMemo(() => {
    const r = filterTools(q);
    if (q.trim()) return r;
    const first = [...new Set([...pins, ...recent])].map(byPath).filter(Boolean);
    return [...first, ...r.filter((t) => !first.includes(t))];
  }, [q, pins, recent]);
  useEffect(() => { if (open) { setQ(""); setSel(0); setTimeout(() => inputRef.current?.focus(), 0); } }, [open]);
  useEffect(() => setSel(0), [q]);
  // Keep the highlighted result visible while moving with the arrow keys.
  useEffect(() => { listRef.current?.querySelector(".palette-item.sel")?.scrollIntoView({ block: "nearest" }); }, [sel, open]);
  if (!open) return null;
  const go = (t) => { onClose(); navigate(t.path); };
  return (
    <div className="palette-backdrop" onMouseDown={onClose}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Search tools" onMouseDown={(e) => e.stopPropagation()}>
        <div className="palette-input">
          <Search size={18} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="What do you want to do? e.g. “format json”"
            aria-label="Search tools"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, results.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
              if (e.key === "Home" && !q) { e.preventDefault(); setSel(0); }
              if (e.key === "End" && !q) { e.preventDefault(); setSel(results.length - 1); }
              if (e.key === "Enter" && results[sel]) go(results[sel]);
              if (e.key === "Escape") onClose();
            }}
          />
          <kbd>Esc</kbd>
        </div>
        <ul className="palette-list" ref={listRef}>
          {results.map((t, i) => {
            const Icon = t.icon;
            return (
              <li key={t.path}>
                <button className={`palette-item tone-${t.group.tone} ${i === sel ? "sel" : ""}`} onMouseEnter={() => setSel(i)} onClick={() => go(t)}>
                  <span className="mini-tile"><Icon size={16} /></span>
                  <span className="palette-text"><strong>{t.title}</strong><span>{t.group.title}</span></span>
                  {i === sel && <CornerDownLeft size={15} className="palette-enter" />}
                </button>
              </li>
            );
          })}
          {!results.length && <li className="palette-empty">No tools found. Try “base64”, “uuid” or “compare”, or <button className="inline-link as-btn" onClick={() => { sendTo("/power/smart-paste", q); onClose(); navigate("/power/smart-paste"); }}>ask Smart Paste what “{q.trim()}” is</button>.</li>}
        </ul>
      </div>
    </div>
  );
}

/* ---------- cards ---------- */
function PinButton({ path, big }) {
  const pinned = usePins().includes(path);
  return (
    <button
      className={`pin-btn ${pinned ? "on" : ""} ${big ? "big" : ""}`}
      aria-pressed={pinned}
      title={pinned ? "Unpin from home" : "Pin to home"}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); togglePin(path); }}
    >
      <Star size={big ? 18 : 16} fill={pinned ? "currentColor" : "none"} />
      {big ? <span>{pinned ? "Pinned" : "Pin"}</span> : <span className="sr-only">{pinned ? "Unpin" : "Pin"}</span>}
    </button>
  );
}

function ToolCard({ tool }) {
  const Icon = tool.icon;
  return (
    <li className="card-slot">
      <Link to={tool.path} className={`tcard tone-${tool.group.tone}`}>
        <span className="tile"><Icon size={26} /></span>
        <span className="tcard-body">
          <h3>{tool.title}{tool.isNew && <span className="new-badge">New</span>}</h3>
          <p>{tool.desc}</p>
        </span>
        <ArrowUpRight size={18} className="tcard-arrow" />
      </Link>
      <PinButton path={tool.path} />
    </li>
  );
}

function ShortcutRow({ title, icon: Icon, paths, action }) {
  const tools = paths.map(byPath).filter(Boolean);
  if (!tools.length) return null;
  return (
    <section className="group-section">
      <div className="section-head">
        <span className="mini-tile"><Icon size={16} /></span>
        <h2>{title}</h2>
        {action}
      </div>
      <ul className="cards">{tools.map((t) => <ToolCard key={t.path} tool={t} />)}</ul>
    </section>
  );
}

/* ---------- pages ---------- */
function Home({ openPalette, showHero }) {
  const [q, setQ] = useState("");
  // Tool groups the visitor folded away on the home page (remembered on this device).
  const [collapsed, setCollapsed] = useState(() => { try { return JSON.parse(localStorage.getItem("aurora-collapsed") || "[]"); } catch { return []; } });
  const toggleGroup = (id) => setCollapsed((c) => {
    const next = c.includes(id) ? c.filter((x) => x !== id) : [...c, id];
    try { localStorage.setItem("aurora-collapsed", JSON.stringify(next)); } catch {}
    return next;
  });
  const tools = filterTools(q);
  const pins = usePins();
  const recent = useRecent();
  // Paste anywhere on the home page (outside a text box) to run Smart Paste.
  useEffect(() => {
    const onPaste = (e) => {
      if (isTyping()) return;
      const text = e.clipboardData?.getData("text");
      if (!text) return;
      sendTo("/power/smart-paste", text);
      navigate("/power/smart-paste");
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);
  const quick = [["Format JSON", "/formatters/json"], ["Generate a UUID", "/generators/uuid"], ["Decode a JWT", "/encoders-decoders/jwt"], ["Compare two texts", "/text/diff"]];
  return (
    <>
      {showHero ? <section className="hero">
        <span className="eyebrow"><ShieldCheck size={14} /> {ALL_TOOLS.length} free tools · everything stays in your browser</span>
        <h1>Every little dev tool,<br /><span className="grad">in one friendly place.</span></h1>
        <p className="hero-sub">Convert, encode, format and generate — no sign-up, no uploads. Built for developers, simple enough for everyone.</p>
        <div className="hero-search">
          <Search size={20} />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search tools…"
            aria-label="Search tools"
            onKeyDown={(e) => { if (e.key === "Enter" && tools[0]) navigate(tools[0].path); }}
          />
          <button className="hero-kbd" onClick={openPalette} title="Open quick search"><kbd>{isMac ? "⌘" : "Ctrl"} K</kbd></button>
        </div>
        <Link to="/power/smart-paste" className="smart-cta">
          <WandSparkles size={18} />
          <span><strong>New: Smart Paste</strong> — paste anything (a token, JSON, a date, Base64…) and we’ll tell you what it is.</span>
          <kbd>{isMac ? "⌘" : "Ctrl"} V</kbd>
        </Link>
        <div className="quick">
          <span>Popular:</span>
          {quick.map(([label, to]) => <Link key={to} to={to} className="chip">{label}</Link>)}
        </div>
      </section> : (
        <section className="mini-hero">
          <h1>All tools</h1>
          <div className="hero-search compact">
            <Search size={18} />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter tools…" aria-label="Search tools"
              onKeyDown={(e) => { if (e.key === "Enter" && tools[0]) navigate(tools[0].path); }} />
          </div>
        </section>
      )}

      {q.trim() ? (
        <section className="group-section">
          <div className="section-head"><h2>Results for “{q.trim()}”</h2><span className="count">{tools.length}</span></div>
          {tools.length ? <ul className="cards">{tools.map((t) => <ToolCard key={t.path} tool={t} />)}</ul> : (
            <p className="muted">No tools match. Try another word, or <button className="inline-link as-btn" onClick={() => { sendTo("/power/smart-paste", q); navigate("/power/smart-paste"); }}>let Smart Paste work out what “{q.trim()}” is</button>.</p>
          )}
        </section>
      ) : (<>
        <ShortcutRow title="Pinned" icon={Star} paths={pins} />
        <ShortcutRow title="Recently used" icon={History} paths={recent}
          action={<button className="see-all as-btn" onClick={clearRecent}>Clear</button>} />
        <div className="all-head">
          <h2>All tools</h2>
          <span className="count">{ALL_TOOLS.length}</span>
          {collapsed.length > 0 && <button className="see-all as-btn" onClick={() => { setCollapsed([]); try { localStorage.removeItem("aurora-collapsed"); } catch {} }}>Show all groups</button>}
        </div>
        {GROUPS.map((g) => {
          const Icon = g.icon;
          const open = !collapsed.includes(g.id);
          return (
            <section key={g.id} className={`group-section tone-${g.tone} ${open ? "" : "collapsed"}`}>
              <div className="section-head">
                <span className="mini-tile"><Icon size={16} /></span>
                <h2>{g.title}</h2>
                <span className="count">{g.tools.length}</span>
                <Link to={`/${g.id}`} className="see-all">See all <ArrowRight size={14} /></Link>
                <button
                  className="round-btn small group-toggle"
                  aria-expanded={open}
                  aria-controls={`group-${g.id}`}
                  aria-label={`${open ? "Hide" : "Show"} ${g.title}`}
                  title={`${open ? "Hide" : "Show"} ${g.title}`}
                  onClick={() => toggleGroup(g.id)}
                >
                  <ChevronDown size={16} className={open ? "chev open" : "chev"} />
                </button>
              </div>
              {open && <ul className="cards" id={`group-${g.id}`}>{ALL_TOOLS.filter((t) => t.group === g).map((t) => <ToolCard key={t.path} tool={t} />)}</ul>}
            </section>
          );
        })}
        <section className="group-section tone-blue">
          <div className="section-head">
            <span className="mini-tile"><Settings size={16} /></span>
            <h2>Settings</h2>
          </div>
          <ul className="cards">
            <li className="card-slot">
              <Link to="/settings" className="tcard tone-blue">
                <span className="tile"><Settings size={26} /></span>
                <span className="tcard-body">
                  <h3>Theme & layout</h3>
                  <p>Customize DevDeck look & feel: colours, light or dark, layout presets and text size</p>
                </span>
                <ArrowUpRight size={18} className="tcard-arrow" />
              </Link>
            </li>
          </ul>
        </section>
      </>)}
    </>
  );
}

function GroupPage({ group }) {
  const Icon = group.icon;
  const tools = ALL_TOOLS.filter((t) => t.group === group);
  return (
    <>
      <section className={`banner tone-${group.tone}`}>
        <span className="banner-tile"><Icon size={30} /></span>
        <div>
          <Crumbs items={[["All tools", "/"]]} />
          <h1>{group.title}</h1>
          <p>{BLURBS[group.id]} {tools.length} {tools.length === 1 ? "tool" : "tools"}.</p>
        </div>
      </section>
      <ul className="cards">{tools.map((t) => <ToolCard key={t.path} tool={t} />)}</ul>
      {group.related && (
        <div className="more">
          <span className="panel-label">Also handy for this work</span>
          <div className="more-row">
            {group.related.map(byPath).filter(Boolean).map((t) => { const I = t.icon; return <Link key={t.path} to={t.path} className={`chip tone-${t.group.tone}`}><I size={14} /> {t.title}</Link>; })}
          </div>
        </div>
      )}
    </>
  );
}

function Crumbs({ items }) {
  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      {items.map(([label, to]) => (
        <span key={to}><Link to={to}>{label}</Link><ChevronRight size={14} /></span>
      ))}
    </nav>
  );
}

function ToolPage({ tool }) {
  const View = viewFor(tool.path);
  const Icon = tool.icon;
  const siblings = ALL_TOOLS.filter((t) => t.group === tool.group && t !== tool);
  useEffect(() => { markUsed(tool.path); }, [tool.path]);
  return (
    <section className="page tool-page">
      <div className={`tool-hero tone-${tool.group.tone}`}>
        <span className="banner-tile"><Icon size={26} /></span>
        <div>
          <Crumbs items={[["All tools", "/"], [tool.group.title, `/${tool.group.id}`]]} />
          <h1>{tool.title}</h1>
          <p className="lead">{tool.desc}</p>
        </div>
        <PinButton path={tool.path} big />
      </div>
      <Suspense fallback={<ToolLoading />}><View /></Suspense>
      {siblings.length > 0 && (
        <div className="more">
          <span className="panel-label">More {tool.group.title.toLowerCase()}</span>
          <div className="more-row">
            {siblings.map((t) => { const I = t.icon; return <Link key={t.path} to={t.path} className={`chip tone-${t.group.tone}`}><I size={14} /> {t.title}</Link>; })}
          </div>
        </div>
      )}
    </section>
  );
}

function NotFound() {
  return (
    <section className="hero small">
      <h1>Page not found</h1>
      <p className="hero-sub">This page doesn’t exist. <Link to="/" className="inline-link">Back to all tools</Link></p>
    </section>
  );
}

function SettingsPage({ prefsApi }) {
  const { prefs, set, reset, applyPreset } = prefsApi;
  return (
    <section className="page settings-page">
      <div className="tool-hero tone-blue">
        <span className="banner-tile"><Settings size={26} /></span>
        <div>
          <Crumbs items={[["All tools", "/"]]} />
          <h1>Settings</h1>
          <p className="lead">Make DevDeck look the way you like. Your choices are saved on this device.</p>
        </div>
      </div>
      <div className="settings-grid">
        <div className="panel"><span className="panel-label">Theme</span><ThemePicker prefs={prefs} set={set} /></div>
        <div className="panel"><span className="panel-label">Layout</span><LayoutPicker prefs={prefs} set={set} reset={reset} applyPreset={applyPreset} /></div>
      </div>
    </section>
  );
}

const titleFor = (path) => {
  const tool = ALL_TOOLS.find((t) => t.path === path);
  if (tool) return `${tool.title} – DevDeck`;
  const g = GROUPS.find((x) => path === `/${x.id}`);
  if (g) return `${g.title} – DevDeck`;
  if (path === "/settings") return "Settings – DevDeck";
  return "DevDeck";
};

export default function App() {
  const path = usePath();
  const prefsApi = usePrefs();
  const [palette, setPalette] = useState(false);
  // After moving to another page, put keyboard/screen-reader focus on the new content (not on first load).
  const mainRef = useRef(null);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    mainRef.current?.focus({ preventScroll: true });
  }, [path]);

  useEffect(() => { document.title = titleFor(path); }, [path]);
  // Fetch the tools quietly once the page is idle, so opening one feels instant.
  useEffect(() => {
    const warm = () => { loadViews().catch(() => {}); };
    if ("requestIdleCallback" in window) { const id = window.requestIdleCallback(warm, { timeout: 3000 }); return () => window.cancelIdleCallback(id); }
    const t = setTimeout(warm, 1500);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette((o) => !o); }
      else if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !isTyping()) { e.preventDefault(); setPalette(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  let content;
  const group = GROUPS.find((g) => path === `/${g.id}`);
  const tool = ALL_TOOLS.find((t) => t.path === path);
  if (path === "/") content = <Home openPalette={() => setPalette(true)} showHero={prefsApi.prefs.hero !== "hide"} />;
  else if (path === "/settings") content = <SettingsPage prefsApi={prefsApi} />;
  else if (group) content = <GroupPage group={group} />;
  else if (tool) content = <ToolPage tool={tool} />;
  else content = <NotFound />;

  return (
    <div className="app">
      <a href="#main" className="skip-link" onClick={(e) => { e.preventDefault(); mainRef.current?.focus(); }}>Skip to main content</a>
      <div className="aurora-bg" aria-hidden="true"><i /><i /><i /></div>
      <TopBar path={path} prefsApi={prefsApi} openPalette={() => setPalette(true)} />
      <div className="frame">
        <SideNav path={path} />
        <main className="content" key={path} id="main" ref={mainRef} tabIndex={-1} aria-label={titleFor(path).replace(/ – DevDeck$/, "")}>{content}</main>
      </div>
      <footer className="footer">
        <span><ShieldCheck size={14} /> Everything runs in your browser — nothing you type is uploaded.</span>
        <Link to="/settings">Theme & layout settings</Link>
      </footer>
      <Palette open={palette} onClose={() => setPalette(false)} />
    </div>
  );
}
