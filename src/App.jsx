import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { House, Search, Settings, Star, History, WandSparkles, LayoutDashboard, Github, ChevronsDownUp, ChevronsUpDown, Sparkles, ArrowRight, ArrowUpRight, ChevronRight, ChevronDown, ShieldCheck, CornerDownLeft, X, SquareArrowOutUpRight, PictureInPicture2, Puzzle, Code } from "lucide-react";
import { GROUPS, ALL_TOOLS, TOOL_SETS, PLUGINS } from "./data.js";
import { createRoot } from "react-dom/client";
import { usePath, Link, navigate, href } from "./router.jsx";
import { sendTo } from "./handoff.js";
import { usePins, useRecent, togglePin, markUsed, clearRecent, useHidden, setHidden, toggleHidden, useCodeEditor, setCodeEditor, useEditorKeys, setEditorKeys } from "./store.js";
import { SHORTCUTS } from "./keymap.js";
import { isDesktop, invoke } from "./desktop.js";
import { HelpDialog, DOCS_URL } from "./help.jsx";
import { USER_VIEWS, USER_PLUGIN_ERRORS, evaluatePlugin, fetchPluginCode, installPlugin, uninstallPlugin, listUserPlugins } from "./user-plugins.js";import { usePrefs, ThemePicker, ThemeEditor, LayoutPicker } from "./prefs.jsx";

const byPath = (p) => ALL_TOOLS.find((t) => t.path === p);

// The tools themselves load separately from the home page, so the first visit stays light.
// They are fetched once (in the background after the page settles, or when a tool is opened).
let viewsPromise = null;
const loadViews = () => (viewsPromise ||= Promise.all([
  import("./tools.jsx").then((m) => m.TOOL_VIEWS), import("./power.jsx").then((m) => m.POWER_VIEWS), import("./tools2.jsx").then((m) => m.MORE_VIEWS),
  import("./devops.jsx").then((m) => m.DEVOPS_VIEWS), import("./certs.jsx").then((m) => m.CERT_VIEWS), import("./data-tools.jsx").then((m) => m.DATA_VIEWS),
  import("./more-tools.jsx").then((m) => m.MORE_TOOL_VIEWS), import("./media.jsx").then((m) => m.MEDIA_VIEWS), import("./net.jsx").then((m) => m.NET_VIEWS),
  import("./ops.jsx").then((m) => m.OPS_VIEWS), import("./keys.jsx").then((m) => m.KEY_VIEWS),
  loadPluginViews(),
]).then((all) => Object.assign({}, ...all, USER_VIEWS)));

// Plugins (src/plugins/<id>/index.jsx): each default-exports definePlugin(…) → { id, views }.
// A plugin that fails to load is skipped (and reported in the console) so it can't break the site.
const PLUGIN_CODE = import.meta.glob("./plugins/*/index.{js,jsx}");
function loadPluginViews() {
  return Promise.all(Object.entries(PLUGIN_CODE).map(([file, load]) => load()
    .then((m) => Object.fromEntries(Object.entries(m.default?.views || {}).map(([toolId, View]) => [`/plugins/${toolId}`, View])))
    .catch((e) => { console.error(`DevDeck: plugin ${file} failed to load`, e); return {}; })))
    .then((all) => Object.assign({}, ...all));
}
const lazyViews = {};
const viewFor = (path) => (lazyViews[path] ||= lazy(() => loadViews().then((v) => ({ default: v[path] || (() => null) }))));

function ToolLoading() {
  return <div className="panel tool-loading" role="status"><span className="spinner" aria-hidden="true" /> Loading the tool…</div>;
}

const BLURBS = {
  power: "Things DevToys can’t do: smart detection and chaining tools together.",
  reference: "Quick look-ups you need while building for the web.",
  validators: "Check files and certificates for mistakes, and see what’s inside them.",
  calculators: "Work out network ranges, sizes and transfer times, uptime and version ranges.",
  converters: "Turn data, commands and config files from one format into another.",
  "encoders-decoders": "Make text safe for the web, or read it back.",
  formatters: "Tidy up messy data so it’s easy to read.",
  generators: "Create hashes, IDs, passwords, keys, certificates and placeholder data in one click.",
  text: "Count, clean up, compare, de-duplicate and translate text.",
  data: "Query, validate, compare and convert JSON, YAML and XML — and turn JSON into code.",
  network: "Talk to APIs, WebSockets and DNS, and check ports — the tools that reach out to the network.",
  files: "Convert, compress and check images, and split big files.",
};

// Search by words in any order ("format json" finds the JSON Formatter), including nicknames
// such as "epoch" or "k8s". Every word must match; tools whose title matches come first.
const splitWords = (s) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
const stem = (w) => (w.length > 4 ? w.replace(/(ting|ing|ers|er|ed|es|s)$/, "") : w);
// Rebuilt whenever the tool list changes (plugins installed in the app are added after start-up).
let searchIndex = { size: -1, list: [] };
const SEARCH_INDEX_FOR = () => {
  if (searchIndex.size !== ALL_TOOLS.length) searchIndex = { size: ALL_TOOLS.length, list: ALL_TOOLS.map((t) => ({
    tool: t,
    fields: [[splitWords(`${t.title} ${t.short} ${t.short.replace(/\s+/g, "")}`), 4], [splitWords(t.words), 3], [splitWords(t.group.title), 2], [splitWords(t.desc), 1]],
  })) };
  return searchIndex.list;
};

// Tools the visitor switched off in Settings → Manage tools are left out of lists and search.
const visibleIn = (group, hidden) => group.tools.filter((t) => !hidden.includes(`/${group.id}/${t.id}`));

function filterTools(q, hidden = []) {
  const terms = splitWords(q);
  if (!terms.length) return ALL_TOOLS.filter((t) => !hidden.includes(t.path));
  const scored = [];
  for (const { tool, fields } of SEARCH_INDEX_FOR()) {
    if (hidden.includes(tool.path)) continue;
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

// Where DevDeck's source lives (credited in the footer and on the Settings page).
const REPO_URL = "https://github.com/ezin-rev/devdeck";

/* ---------- pop-up menus ---------- */
function MenuButton({ icon: Icon, label, title, children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown); // pointer events cover mouse, touch and pen
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
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
// Built fresh on each render: a group only gets a tab (and a side-menu entry) while at least one of
// its tools is switched on, and plugins installed in the app appear as soon as they're added.
const ALL_TAB = { id: "", title: "All tools", icon: House, tone: "blue" };
const tabsFor = (hidden) => [ALL_TAB, ...GROUPS.filter((g) => g.tools.some((t) => !hidden.includes(`/${g.id}/${t.id}`)))];
const tabActive = (t, path) => (t.id ? path === `/${t.id}` || path.startsWith(`/${t.id}/`) : path === "/");

function TopBar({ path, prefsApi, openPalette }) {
  // The bar stays pinned to the top; its real height (it changes with layout, slim bar, tabs, notch)
  // is shared as --topbar-h so the side menu and jump links sit right below it.
  const barRef = useRef(null);
  useEffect(() => {
    const el = barRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty("--topbar-h", `${Math.round(el.getBoundingClientRect().height)}px`));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const { prefs, set, reset, applyPreset } = prefsApi;
  const hidden = useHidden();
  // On phones and tablets the tab bar scrolls sideways: keep the current group's tab in view.
  const tabsRef = useRef(null);
  useEffect(() => {
    const bar = tabsRef.current, tab = bar?.querySelector(".tab.active");
    if (!bar || !tab || bar.scrollWidth <= bar.clientWidth) return;
    const b = bar.getBoundingClientRect(), t = tab.getBoundingClientRect();
    bar.scrollTo({ left: bar.scrollLeft + (t.left - b.left) - (b.width - t.width) / 2, behavior: "smooth" });
  }, [path]);
  // Soft fade on an edge when more tabs are hidden that way (narrow windows, phones, tablets).
  const [edges, setEdges] = useState("");
  useEffect(() => {
    const bar = tabsRef.current;
    if (!bar) return;
    const update = () => {
      const max = bar.scrollWidth - bar.clientWidth;
      setEdges(`${bar.scrollLeft > 4 ? "fade-left" : ""} ${bar.scrollLeft < max - 4 ? "fade-right" : ""}`.trim());
    };
    update();
    bar.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => { bar.removeEventListener("scroll", update); window.removeEventListener("resize", update); };
  }, []);
  return (
    <header className="topbar" ref={barRef}>
      <div className="topbar-row">
        <Link to="/" className="logo">
          <span className="logo-mark"><Sparkles size={16} /></span>
          <span>DevDeck</span>
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
          <MenuButton icon={LayoutDashboard} label="Layout menu" title="Layout">
            <LayoutPicker prefs={prefs} set={set} reset={reset} applyPreset={applyPreset} />
          </MenuButton>
          <Link to="/settings" className="round-btn" title="Settings"><Settings size={18} /><span className="sr-only">Settings</span></Link>
        </div>
      </div>
      <nav className={`tabs ${edges}`} aria-label="Tool groups" ref={tabsRef}>
        {/* One row of rounded tabs, each with its group's icon; each group's page lists its tools. */}
        {tabsFor(hidden).map((t) => {
          const to = t.id ? `/${t.id}` : "/";
          const active = tabActive(t, path);
          const Icon = t.icon;
          return (
            <Link key={to} to={to} title={t.tab && t.tab !== t.title ? t.title : undefined} className={`tab tone-${t.tone} ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}>
              <Icon size={15} /> {t.tab || t.title}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}

// Side menu (Desktop app / Dev workspace layouts). Each category folds open and shut; the choice is
// remembered. Until the visitor folds something, every category is open.
const SIDE_KEY = "aurora-side-open-v2"; // v2: everything starts open (v1 opened only the current category)
function SideNav({ path }) {
  const hidden = useHidden();
  const tabs = tabsFor(hidden);
  const groupIds = tabs.filter((t) => t.id).map((t) => t.id);
  const current = groupIds.find((id) => path === `/${id}` || path.startsWith(`/${id}/`));
  const [open, setOpen] = useState(() => { try { const v = JSON.parse(localStorage.getItem(SIDE_KEY)); return Array.isArray(v) ? v : null; } catch { return null; } });
  const isOpen = (id) => (open ? open.includes(id) : true);
  const save = (next) => { setOpen(next); try { localStorage.setItem(SIDE_KEY, JSON.stringify(next)); } catch {} };
  const toggle = (id) => { const now = groupIds.filter(isOpen); save(now.includes(id) ? now.filter((x) => x !== id) : [...now, id]); };
  // Going to a tool in a folded category opens that category.
  useEffect(() => { if (current && open && !open.includes(current)) save([...open, current]); }, [current]); // eslint-disable-line react-hooks/exhaustive-deps
  const allOpen = groupIds.every(isOpen);
  return (
    <aside className="sidenav" aria-label="All tools by group">
      <div className="side-head">
        <span className="panel-label">Categories</span>
        <button className="side-all" onClick={() => save(allOpen ? [] : groupIds)} title={allOpen ? "Fold every category" : "Open every category"}>
          {allOpen ? <><ChevronsDownUp size={14} /> Collapse all</> : <><ChevronsUpDown size={14} /> Expand all</>}
        </button>
      </div>
      {tabs.map((t) => {
        const to = t.id ? `/${t.id}` : "/";
        const Icon = t.icon;
        const group = GROUPS.find((g) => g.id === t.id);
        const tools = group ? visibleIn(group, hidden) : [];
        const expanded = group && isOpen(group.id);
        return (
          <div key={to} className={`side-group ${expanded ? "open" : ""}`}>
            <div className="side-row">
              <Link to={to} title={t.title} className={`side-link tone-${t.tone} ${tabActive(t, path) && path === to ? "active" : ""} ${tabActive(t, path) ? "within" : ""}`}>
                <span className="mini-tile"><Icon size={15} /></span> <span className="side-label">{t.title}</span>
                {group && <span className="side-count">{tools.length}</span>}
              </Link>
              {group && (
                <button className="side-toggle" onClick={() => toggle(group.id)} aria-expanded={expanded} aria-controls={`side-${group.id}`} title={expanded ? `Fold ${group.title}` : `Show ${group.title} tools`}>
                  <ChevronDown size={15} className={expanded ? "chev open" : "chev"} />
                </button>
              )}
            </div>
            {expanded && (
              <ul className="side-tools" id={`side-${group.id}`}>
                {tools.map((tool) => {
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
  const hidden = useHidden();
  const results = useMemo(() => {
    const r = filterTools(q, hidden);
    if (q.trim()) return r;
    const first = [...new Set([...pins, ...recent])].map(byPath).filter(Boolean);
    return [...first, ...r.filter((t) => !first.includes(t))];
  }, [q, pins, recent, hidden]);
  useEffect(() => { if (open) { setQ(""); setSel(0); setTimeout(() => inputRef.current?.focus(), 0); } }, [open]);
  useEffect(() => setSel(0), [q]);
  // Keep the highlighted result visible while moving with the arrow keys.
  useEffect(() => { listRef.current?.querySelector(".palette-item.sel")?.scrollIntoView({ block: "nearest" }); }, [sel, open]);
  if (!open) return null;
  const go = (t) => { onClose(); navigate(t.path); };
  return (
    <div className="palette-backdrop" onPointerDown={onClose}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Search tools" onPointerDown={(e) => e.stopPropagation()}>
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
          <h3>{tool.title}</h3>
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
  const hidden = useHidden();
  const tools = filterTools(q, hidden);
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
        {/* counted live: built-in tools + plugins, minus any switched off in Settings */}
        <span className="eyebrow"><ShieldCheck size={14} /> {ALL_TOOLS.length - hidden.length} free {ALL_TOOLS.length - hidden.length === 1 ? "tool" : "tools"} · everything stays in your browser</span>
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
          <span><strong>Smart Paste</strong> — paste anything (a token, JSON, a date, Base64…) and we’ll tell you what it is.</span>
          <kbd>{isMac ? "⌘" : "Ctrl"} V</kbd>
        </Link>
        <div className="quick">
          <span>Popular:</span>
          {quick.map(([label, to]) => <Link key={to} to={to} className="chip">{label}</Link>)}
        </div>
      </section> : (
        // Without the welcome banner, searching is done from the top bar (no second search box here).
        <h1 className="sr-only">All tools</h1>
      )}

      {q.trim() ? (
        <section className="group-section">
          <div className="section-head"><h2>Results for “{q.trim()}”</h2><span className="count">{tools.length}</span></div>
          {tools.length ? <ul className="cards">{tools.map((t) => <ToolCard key={t.path} tool={t} />)}</ul> : (
            <p className="muted">No tools match. Try another word, or <button className="inline-link as-btn" onClick={() => { sendTo("/power/smart-paste", q); navigate("/power/smart-paste"); }}>let Smart Paste work out what “{q.trim()}” is</button>.</p>
          )}
        </section>
      ) : (<>
        <nav className="cat-grid" aria-label="Browse by category">
          {GROUPS.map((g) => {
            const n = ALL_TOOLS.filter((t) => t.group === g && !hidden.includes(t.path)).length;
            if (!n) return null;
            const Icon = g.icon;
            return (
              <a key={g.id} href={`#sec-${g.id}`} className={`cat tone-${g.tone}`}
                onClick={(e) => { e.preventDefault(); if (collapsed.includes(g.id)) toggleGroup(g.id); requestAnimationFrame(() => document.getElementById(`sec-${g.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })); }}>
                <span className="mini-tile"><Icon size={16} /></span>
                <span className="cat-name">{g.title}</span>
                <span className="cat-count">{n}</span>
              </a>
            );
          })}
        </nav>
        <ShortcutRow title="Pinned" icon={Star} paths={pins} />
        <ShortcutRow title="Recently used" icon={History} paths={recent}
          action={<button className="see-all as-btn" onClick={clearRecent}>Clear</button>} />
        <div className="all-head">
          <h2>All tools</h2>
          <span className="count">{ALL_TOOLS.length - hidden.length}</span>
          {collapsed.length > 0 && <button className="see-all as-btn" onClick={() => { setCollapsed([]); try { localStorage.removeItem("aurora-collapsed"); } catch {} }}>Show all groups</button>}
          {hidden.length > 0 && <Link to="/settings#manage-tools" className="see-all">{hidden.length} switched off · Manage</Link>}
        </div>
        {GROUPS.map((g) => {
          const Icon = g.icon;
          const open = !collapsed.includes(g.id);
          const shown = ALL_TOOLS.filter((t) => t.group === g && !hidden.includes(t.path));
          if (!shown.length) return null;
          return (
            <section key={g.id} id={`sec-${g.id}`} className={`group-section tone-${g.tone} ${open ? "" : "collapsed"}`}>
              <div className="section-head">
                <span className="mini-tile"><Icon size={16} /></span>
                <h2>{g.title}</h2>
                <span className="count">{shown.length}</span>
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
              {open && <ul className="cards" id={`group-${g.id}`}>{shown.map((t) => <ToolCard key={t.path} tool={t} />)}</ul>}
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
                  <h3>Theme, layout & tools</h3>
                  <p>Colours, light or dark, layout presets, text size, the code editor, and which tools to show</p>
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
  const hidden = useHidden();
  const tools = ALL_TOOLS.filter((t) => t.group === group && !hidden.includes(t.path));
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
        <div className="hero-actions">
          <PinButton path={tool.path} big />
          <PopOut tool={tool} />
        </div>
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

/* ---------- compact windows ("overlay" mode) ---------- */
// Just the tool, without the site around it: used in pop-out windows and the always-on-top window.
function CompactTool({ tool }) {
  const View = viewFor(tool.path);
  const Icon = tool.icon;
  return (
    <div className={`compact-tool tone-${tool.group.tone}`}>
      <header className="compact-head">
        <span className="mini-tile"><Icon size={15} /></span>
        <strong>{tool.title}</strong>
        <a className="see-all" href={href(tool.path)} target="_blank" rel="noopener">Full page ↗</a>
      </header>
      <Suspense fallback={<ToolLoading />}><View /></Suspense>
    </div>
  );
}

// Copy the page's styles and theme into another window (for the always-on-top window).
function cloneStyles(target) {
  for (const sheet of document.styleSheets) {
    try {
      const style = target.document.createElement("style");
      style.textContent = [...sheet.cssRules].map((r) => r.cssText).join("\n");
      target.document.head.appendChild(style);
    } catch {
      if (sheet.href) target.document.head.appendChild(Object.assign(target.document.createElement("link"), { rel: "stylesheet", href: sheet.href }));
    }
  }
  Object.assign(target.document.documentElement.dataset, document.documentElement.dataset);
}

function PopOut({ tool }) {
  const canFloat = typeof window !== "undefined" && "documentPictureInPicture" in window;
  const newWindow = () => window.open(`${href(tool.path)}?compact=1`, `devdeck-${Date.now()}`, "popup,width=560,height=780");
  const keepOnTop = async () => {
    try {
      const pip = await window.documentPictureInPicture.requestWindow({ width: 480, height: 640 });
      cloneStyles(pip);
      pip.document.title = tool.title;
      pip.document.body.className = "pip-body";
      const host = pip.document.body.appendChild(pip.document.createElement("div"));
      const root = createRoot(host);
      root.render(<CompactTool tool={tool} />);
      pip.addEventListener("pagehide", () => root.unmount());
    } catch { newWindow(); }
  };
  return (
    <span className="popout">
      <button className="pin-btn big" onClick={newWindow} title="Open this tool in its own small window — open several to use tools side by side">
        <SquareArrowOutUpRight size={18} /><span>Pop out</span>
      </button>
      {canFloat && <button className="pin-btn big" onClick={keepOnTop} title="A small window that stays on top of your other apps">
        <PictureInPicture2 size={18} /><span>Keep on top</span>
      </button>}
    </span>
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
  const editorOn = useCodeEditor();
  const editorKeysOn = useEditorKeys();
  useEffect(() => { if (location.hash === "#manage-tools") document.getElementById("manage-tools")?.scrollIntoView(); }, []);
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
        <div className="panel"><span className="panel-label">Theme</span><ThemePicker prefs={prefs} set={set} /><ThemeEditor prefs={prefs} set={set} isDark={prefsApi.isDark} /></div>
        <div className="panel"><span className="panel-label">Layout</span><LayoutPicker prefs={prefs} set={set} reset={reset} applyPreset={applyPreset} /></div>
      </div>
      <div className="panel">
        <span className="panel-label"><Code size={14} /> Code boxes</span>
        <label className="check"><input type="checkbox" checked={editorOn} onChange={(e) => setCodeEditor(e.target.checked)} /> Code editor look: line numbers and coloured JSON / YAML / XML / SQL</label>
        <label className="check"><input type="checkbox" checked={editorKeysOn} onChange={(e) => setEditorKeys(e.target.checked)} /> VS Code-style shortcuts (move and copy lines, comment, auto-close brackets…)</label>
        {editorKeysOn ? (
          <details className="shortcut-list">
            <summary className="muted small">Show all shortcuts</summary>
            <table className="data-table"><tbody>{SHORTCUTS.map(([keys, what]) => <tr key={keys}><td><kbd>{keys}</kbd></td><td>{what}</td></tr>)}</tbody></table>
          </details>
        ) : <p className="muted small">Without the shortcuts, Tab still indents the selected lines (Shift + Tab un-indents). Press Esc, then Tab, to move on to the next control.</p>}
      </div>
      <ManageTools />
      <PluginsPanel />
      <div className="panel about">
        <span className="panel-label">About</span>
        <p>DevDeck is made by <strong>ezin-rev</strong> and is free and open source under the MIT license. The source code is on GitHub — <a className="inline-link" href={REPO_URL} target="_blank" rel="noopener noreferrer">github.com/ezin-rev/devdeck</a>.</p>
        <DesktopInfo />
      </div>
    </section>
  );
}

// In the desktop app: which version is running (asked from the Rust side, src-tauri/src/lib.rs).
function DesktopInfo() {
  const [info, setInfo] = useState(null);
  useEffect(() => { if (isDesktop) invoke("app_info").then(setInfo, () => {}); }, []);
  if (!info) return null;
  const os = { macos: "macOS", windows: "Windows", linux: "Linux" }[info.os] || info.os;
  return <p className="muted small">Desktop app {info.version} · {os} ({info.arch})</p>;
}

// Installed plugins (src/plugins/*): switch each one on or off; switching off hides all its tools.
function PluginsPanel() {
  const hidden = useHidden();
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const update = async (m) => {
    setBusy(m.id); setNote("");
    try { const code = await fetchPluginCode(m.url); const res = await evaluatePlugin(code); installPlugin({ ...res, code, source: "url", url: m.url }); location.reload(); }
    catch (e) { setNote(`${m.name}: ${e.message}`); setBusy(""); }
  };
  const remove = (m) => {
    if (!window.confirm(`Uninstall “${m.name}”? Its tools will be removed from DevDeck on this device.`)) return;
    uninstallPlugin(m.id);
    setHidden(hidden.filter((p) => !m.tools.some((t) => p === `/plugins/${t.id}`)));
    location.reload();
  };
  return (
    <div className="panel" id="plugins">
      <div className="panel-head">
        <span className="panel-label"><Puzzle size={14} /> Plugins — {PLUGINS.length} installed</span>
        <a className="see-all" href={`${DOCS_URL}plugins.html`} target="_blank" rel="noopener noreferrer">How to make a plugin ↗</a>
      </div>
      {PLUGINS.length === 0 && <p className="muted small">No plugins yet — install one below.</p>}
      {USER_PLUGIN_ERRORS.map((e) => (
        <p key={e.id} className="error">“{e.name}” couldn’t load: {e.message} <button className="inline-link as-btn" onClick={() => { uninstallPlugin(e.id); location.reload(); }}>Uninstall it</button></p>
      ))}
      <div className="plugin-list">
        {PLUGINS.map((m) => {
          const paths = m.tools.map((t) => `/plugins/${t.id}`);
          const on = paths.some((p) => !hidden.includes(p));
          return (
            <div key={m.id} className={`plugin-card ${on ? "" : "off"}`}>
              <div className="plugin-head">
                <span className="mini-tile tone-violet"><Puzzle size={16} /></span>
                <span className="plugin-name"><strong>{m.name}</strong> <span className="muted small">v{m.version}{m.author ? ` · by ${m.author}` : ""}</span></span>
                <label className="check switch"><input type="checkbox" checked={on} onChange={() => setHidden(on ? [...hidden, ...paths] : hidden.filter((p) => !paths.includes(p)))} /> {on ? "On" : "Off"}</label>
              </div>
              {m.description && <p className="muted small">{m.description}</p>}
              <div className="options-row">
                {m.tools.map((t) => <Link key={t.id} to={`/plugins/${t.id}`} className="chip tone-violet">{t.title}</Link>)}
                {m.homepage && <a className="see-all" href={m.homepage} target="_blank" rel="noopener noreferrer">Website ↗</a>}
              </div>
              <div className="plugin-foot">
                <span className="muted small">{m.user ? `Installed by you${m.source === "url" ? " from a web address" : m.source === "file" ? " from a file" : ""}` : "Built in (part of this DevDeck)"}</span>
                {m.user && m.url && <button className="btn ghost" disabled={busy === m.id} onClick={() => update(m)}>{busy === m.id ? "Updating…" : "Update"}</button>}
                {m.user && <button className="btn ghost danger" onClick={() => remove(m)}>Uninstall</button>}
              </div>
            </div>
          );
        })}
      </div>
      {note && <p className="error">{note}</p>}
      <PluginInstaller />
    </div>
  );
}

// Install a plugin from a web address, a file or pasted code: check it, show what it adds, then save it.
function PluginInstaller() {
  const [how, setHow] = useState("url");
  const [url, setUrl] = useState("");
  const [code, setCode] = useState("");
  const [preview, setPreview] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const exampleUrl = new URL(href("/plugin-examples/word-tools.js"), location.href).href;
  const check = async (text, source, from) => {
    setErr(""); setPreview(null); setBusy(true);
    try {
      const res = await evaluatePlugin(text);
      if (PLUGINS.some((p) => p.id === res.manifest.id && !p.user)) throw new Error(`“${res.manifest.id}” is already built into DevDeck.`);
      const existing = listUserPlugins().find((p) => p.id === res.manifest.id);
      setPreview({ ...res, code: text, source, url: from, replaces: existing });
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const fromUrl = async (u) => { setErr(""); setBusy(true); try { await check(await fetchPluginCode(u), "url", u); } catch (e) { setErr(e.message); setBusy(false); } };
  return (
    <div className="plugin-installer">
      <div className="panel-head">
        <span className="panel-label">Install a plugin</span>
        <button className="btn ghost" onClick={() => { setHow("url"); setUrl(exampleUrl); fromUrl(exampleUrl); }}>Try the example plugin</button>
      </div>
      <p className="muted small">⚠ Plugins run code inside DevDeck, with the same access as DevDeck itself. Only install plugins from people you trust.</p>
      <div className="segmented" role="radiogroup" aria-label="Install from">
        {[["url", "Web address"], ["file", "File"], ["code", "Paste code"]].map(([v, l]) => (
          <button key={v} role="radio" aria-checked={how === v} className={how === v ? "on" : ""} onClick={() => { setHow(v); setErr(""); setPreview(null); }}>{l}</button>
        ))}
      </div>
      {how === "url" && (
        <div className="request-line">
          <input className="field mono grow-field" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://raw.githubusercontent.com/you/plugin/main/plugin.js" aria-label="Plugin address" />
          <button className="btn" disabled={busy || !/^https?:\/\//.test(url.trim())} onClick={() => fromUrl(url.trim())}>{busy ? "Checking…" : "Check"}</button>
        </div>
      )}
      {how === "file" && (
        <label className="dropzone">
          <strong>Choose a plugin file (.js)</strong>
          <span className="muted small">It’s read on this device</span>
          <input type="file" accept=".js,.mjs,text/javascript" hidden onChange={async (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) check(await f.text(), "file", ""); }} />
        </label>
      )}
      {how === "code" && <>
        <textarea className="field mono" rows={8} value={code} onChange={(e) => setCode(e.target.value)} spellCheck={false} placeholder={'export default (sdk) => ({\n  id: "my-plugin", name: "My Plugin", version: "1.0.0",\n  tools: [{ id: "shout", title: "Shout", desc: "Make text loud", transform: (s) => s.toUpperCase() }],\n});'} />
        <button className="btn" disabled={busy || !code.trim()} onClick={() => check(code, "code", "")}>{busy ? "Checking…" : "Check"}</button>
      </>}
      {err && <p className="error">{err}</p>}
      {preview && (
        <div className="plugin-preview">
          <strong>{preview.manifest.name}</strong> <span className="muted small">v{preview.manifest.version}{preview.manifest.author ? ` · by ${preview.manifest.author}` : ""}</span>
          {preview.manifest.description && <p className="muted small">{preview.manifest.description}</p>}
          <p className="small">Adds: {preview.manifest.tools.map((t) => t.title).join(", ")}</p>
          {preview.replaces && <p className="muted small">This replaces the installed version {preview.replaces.version}.</p>}
          <div className="options-row">
            <button className="btn primary" onClick={() => { try { installPlugin(preview); location.reload(); } catch (e) { setErr(e.message); } }}>Install</button>
            <button className="btn ghost" onClick={() => setPreview(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

// Switch tools on or off (like extensions): switched-off tools leave the menus, home page and search.
function ManageTools() {
  const hidden = useHidden();
  const [q, setQ] = useState("");
  const shown = (g) => g.tools.filter((t) => !q.trim() || `${t.title} ${t.desc}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="panel" id="manage-tools">
      <div className="panel-head">
        <span className="panel-label"><Puzzle size={14} /> Manage tools — {ALL_TOOLS.length - hidden.length} of {ALL_TOOLS.length} switched on</span>
        <div className="panel-actions">
          <input className="field small wide-small" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a tool" aria-label="Find a tool" />
          <button className="btn ghost" onClick={() => setHidden([])} disabled={!hidden.length}>Switch all on</button>
        </div>
      </div>
      <div className="toolset-grid" role="radiogroup" aria-label="Tool set">
        {TOOL_SETS.map((s) => {
          const off = ALL_TOOLS.filter((t) => t.level > s.level).map((t) => t.path);
          const on = off.length === hidden.length && off.every((p) => hidden.includes(p));
          const count = ALL_TOOLS.length - off.length;
          return (
            <button key={s.id} role="radio" aria-checked={on} className={`toolset ${on ? "on" : ""}`} onClick={() => setHidden(off)}>
              <span className="toolset-head"><strong>{s.name}</strong><span className="count">{count} tools</span></span>
              <span className="toolset-desc">{s.desc}</span>
            </button>
          );
        })}
      </div>
      {!TOOL_SETS.some((s) => { const off = ALL_TOOLS.filter((t) => t.level > s.level).map((t) => t.path); return off.length === hidden.length && off.every((p) => hidden.includes(p)); }) &&
        <p className="muted small">Custom selection — pick a set above to start again, or switch single tools on and off below.</p>}
      <div className="manage-grid">
        {GROUPS.map((g) => {
          const list = shown(g);
          if (!list.length) return null;
          const paths = g.tools.map((t) => `/${g.id}/${t.id}`);
          const allOff = paths.every((p) => hidden.includes(p));
          return (
            <fieldset key={g.id} className={`manage-group tone-${g.tone}`}>
              <legend>
                <label className="check"><input type="checkbox" checked={!allOff} onChange={() => setHidden(allOff ? hidden.filter((p) => !paths.includes(p)) : [...hidden, ...paths])} /> <strong>{g.title}</strong></label>
              </legend>
              {list.map((t) => {
                const p = `/${g.id}/${t.id}`;
                return <label key={p} className="check manage-item"><input type="checkbox" checked={!hidden.includes(p)} onChange={() => toggleHidden(p)} /> {t.title}</label>;
              })}
            </fieldset>
          );
        })}
      </div>
      <p className="muted small">Switched-off tools still open from a saved link or bookmark.</p>
    </div>
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
  const [help, setHelp] = useState(false);
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
      else if (e.key === "F1" || (e.key === "?" && !e.metaKey && !e.ctrlKey && !isTyping())) { e.preventDefault(); setPalette(false); setHelp((o) => !o); }
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

  // Pop-out windows open the tool alone (…/tool?compact=1).
  if (tool && new URLSearchParams(window.location.search).has("compact")) {
    return <div className="app compact-app"><main className="content" id="main"><CompactTool tool={tool} /></main></div>;
  }

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
        <span title="Network & APIs tools contact the address you enter; everything else stays on your device."><ShieldCheck size={14} /> Runs in your browser</span>
        <span className="footer-links">
          <button className="as-btn footer-help" onClick={() => setHelp(true)}>Help <kbd>F1</kbd></button>
          <a href={DOCS_URL} target="_blank" rel="noopener noreferrer">Docs</a>
          <Link to="/settings">Settings</Link>
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="credit"><Github size={14} /> GitHub</a>
        </span>
      </footer>
      <Palette open={palette} onClose={() => setPalette(false)} />
      <HelpDialog open={help} onClose={() => setHelp(false)} tool={tool} />
    </div>
  );
}
