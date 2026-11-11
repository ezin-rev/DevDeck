// F1 help: "How to use DevDeck". Opens with F1, "?" or Help in the footer.
import { useEffect, useRef, useState } from "react";
import { X, Search, WandSparkles, Settings, Puzzle, Keyboard, ShieldCheck, BookOpen, SquareArrowOutUpRight, Code } from "lucide-react";
import { SHORTCUTS, MOD } from "./keymap.js";

export const DOCS_URL = "https://ezin-rev.github.io/devdeck/docs/";

const SECTIONS = [
  { id: "start", icon: Search, title: "Getting around", items: [
    ["Find a tool", `Type in the search box (or press ${MOD}+K or /). Words can be in any order: “format json”, “decode jwt”, “epoch”.`],
    ["Browse", "Use the tabs at the top, the Browse by category tiles on the home page, or each group’s See all page."],
    ["Pin favourites", "Click the ☆ on a tool card (or Pin on a tool page) to keep it at the top of the home page. Recently used tools show there too."],
  ] },
  { id: "paste", icon: WandSparkles, title: "Smart Paste", items: [
    ["Paste anything", "Paste on the home page (outside a text box) — a token, JSON, a date, Base64, a certificate… DevDeck works out what it is and shows the answer."],
    ["Open in the right tool", "Each result has an Open button that carries your text into the matching tool."],
  ] },
  { id: "tools", icon: Code, title: "Working with a tool", items: [
    ["Boxes", "Results update as you type. Every box has Paste, Clear and Copy. Code boxes show line numbers and colours."],
    ["Pop out", "Pop out opens a tool in its own small window — open several side by side. Keep on top (Chrome/Edge) floats it over other apps."],
    ["Send to another tool", "Many results have buttons to continue in another tool, e.g. Inspect a certificate you just made."],
  ] },
  { id: "keys", icon: Keyboard, title: "Keyboard", items: [
    ["F1 or ?", "This help"],
    [`${MOD}+K or /`, "Quick search; ↑ ↓ to choose, Enter to open, Esc to close"],
    ["Esc", "Close menus and dialogs"],
  ], shortcuts: true },
  { id: "custom", icon: Settings, title: "Make it yours", items: [
    ["Theme", "Settings → Theme: pick a colour theme, light/dark/system, or Custom to choose your own colours, roundness and font."],
    ["Layout", "The layout button in the top bar: Modern web, Compact, Desktop app, Dev workspace, App launcher or Focus — or fine-tune each option."],
    ["Which tools show", "Settings → Manage tools: one-click sets (Essentials, Standard, Complete) or switch single tools off. Groups with nothing switched on disappear from the tabs."],
  ] },
  { id: "plugins", icon: Puzzle, title: "Plugins", items: [
    ["Add tools", "Settings → Plugins → Install: from a web address, a .js file or pasted code. Remove them there too."],
    ["Make your own", "A plugin is a small JavaScript file. The docs show how, with examples."],
  ] },
  { id: "privacy", icon: ShieldCheck, title: "Privacy & offline", items: [
    ["Stays on your device", "Tools run in your browser — nothing you type is uploaded. Only the Network & APIs tools contact the address you enter."],
    ["Works offline", "After one visit DevDeck keeps working without internet. Install it as an app from the browser menu, or use the desktop app."],
  ] },
];

export function HelpDialog({ open, onClose, tool }) {
  const [tab, setTab] = useState("start");
  const closeRef = useRef(null);
  useEffect(() => { if (open) setTimeout(() => closeRef.current?.focus(), 0); }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  const sec = SECTIONS.find((s) => s.id === tab) || SECTIONS[0];
  return (
    <div className="help-backdrop" onPointerDown={onClose}>
      <div className="help" role="dialog" aria-modal="true" aria-labelledby="help-title" onPointerDown={(e) => e.stopPropagation()}>
        <div className="help-head">
          <strong id="help-title"><BookOpen size={18} /> How to use DevDeck</strong>
          <button ref={closeRef} className="round-btn small" onClick={onClose} title="Close (Esc)"><X size={16} /><span className="sr-only">Close</span></button>
        </div>
        {tool && (
          <div className={`help-tool tone-${tool.group.tone}`}>
            <span className="mini-tile"><tool.icon size={16} /></span>
            <span><strong>You’re in {tool.title}.</strong> {tool.desc}. Type or paste into the first box; the answer appears as you type. Use Copy to take it with you, ☆ Pin to keep it handy.</span>
          </div>
        )}
        <div className="help-body">
          <nav className="help-nav" aria-label="Help topics">
            {SECTIONS.map((s) => <button key={s.id} className={`help-topic ${tab === s.id ? "on" : ""}`} onClick={() => setTab(s.id)} aria-current={tab === s.id}><s.icon size={15} /> {s.title}</button>)}
          </nav>
          <div className="help-content">
            <h3><sec.icon size={18} /> {sec.title}</h3>
            <dl>{sec.items.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
            {sec.shortcuts && <>
              <h4>In code boxes</h4>
              <table className="data-table"><tbody>{SHORTCUTS.map(([k, v]) => <tr key={k}><td><kbd>{k}</kbd></td><td>{v}</td></tr>)}</tbody></table>
            </>}
          </div>
        </div>
        <div className="help-foot">
          <a className="btn ghost" href={DOCS_URL} target="_blank" rel="noopener noreferrer"><BookOpen size={16} /> Full documentation <SquareArrowOutUpRight size={14} /></a>
          <span className="muted small">Press <kbd>F1</kbd> any time to open this help.</span>
        </div>
      </div>
    </div>
  );
}


