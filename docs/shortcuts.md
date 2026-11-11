# Keyboard shortcuts

## Anywhere

| Keys | What it does |
|---|---|
| **F1** or **?** | Open help |
| **Ctrl/⌘ + K** or **/** | Quick search — ↑ ↓ to choose, Enter to open |
| **Esc** | Close menus, search and dialogs |

## In code boxes (VS Code-style)

On by default; switch them off in **Settings → Code boxes** (Tab still indents). Every change keeps the
browser's **Undo / Redo** (Ctrl/⌘ + Z).

| Keys | What it does |
|---|---|
| **Tab / Shift + Tab** | Indent / un-indent (works on several lines) |
| **Ctrl/⌘ + ] / [** | Indent / un-indent lines |
| **Ctrl/⌘ + /** | Comment or uncomment lines — `//` (JSON), `#` (YAML), `--` (SQL), `<!-- -->` (XML) |
| **Alt/⌥ + ↑ / ↓** | Move lines up / down |
| **Shift + Alt/⌥ + ↑ / ↓** | Copy lines up / down |
| **Ctrl/⌘ + Shift + K** | Delete lines |
| **Ctrl/⌘ + Enter** / **Ctrl/⌘ + Shift + Enter** | New line below / above |
| **Ctrl/⌘ + L** | Select the line (again to add the next one) |
| **Ctrl/⌘ + D** | Select the word, then jump to its next match |
| **Ctrl/⌘ + G** | Go to line |
| **Shift + Alt/⌥ + F** | Format the whole document (JSON) |
| **Enter** | Keeps the indentation; indents after `{ [ (` or `:` |
| **( [ { " ' `** | Closed automatically; wraps a selection |
| **Home** | First character of the line, then the very start |
| **Esc, then Tab** | Leave the box with the keyboard |

The shortcuts are defined in `src/keymap.js`.
