# Writing DevDeck plugins

A plugin adds tools to DevDeck. Each plugin is a folder in `src/plugins/` with two files:

```
src/plugins/
  text-extras/          ← the example plugin that ships with DevDeck
    plugin.json         ← what the plugin is: name, author, its tools (read at build time)
    index.jsx           ← what the tools do (loaded only when one of its tools is opened)
```

Plugin tools appear in the **Plugins** tab, in search, in the home page lists and in
Settings → Manage tools. Each plugin can be switched on or off in **Settings → Plugins**.
Every plugin tool gets its own page at `/plugins/<tool-id>`, with its own title, description and
search-engine data, just like the built-in tools.

## Quick start

```bash
npm run new-plugin -- word-tools "Word Tools"   # creates src/plugins/word-tools/ from a template
npm run build                                   # the new tool is at /plugins/word-tools-reverse
```

Then edit the two files. The example in `src/plugins/text-extras/` shows both kinds of tools.

## 1. `plugin.json`

```json
{
  "id": "word-tools",
  "name": "Word Tools",
  "version": "1.0.0",
  "author": "Your Name",
  "description": "One sentence about what the plugin adds.",
  "homepage": "https://example.com/word-tools",
  "tools": [
    {
      "id": "word-count",
      "title": "Word Counter",
      "short": "Word Counter",
      "desc": "Count words and sentences in any text",
      "icon": "text",
      "keywords": "count words characters length",
      "level": 1
    }
  ]
}
```

| Field | Required | What it does |
|---|---|---|
| `id` | yes | Lower-case letters, digits and dashes. Same as the folder name and the `id` in `index.jsx`. |
| `name`, `version`, `author`, `description`, `homepage` | name + version | Shown in Settings → Plugins. |
| `tools[].id` | yes | Unique across **all** plugins; becomes the page address `/plugins/<id>`. Prefixing it with your plugin id avoids clashes. |
| `tools[].title`, `short`, `desc` | title + desc | Card title, short menu name, one-line description (also used for search engines). |
| `tools[].icon` | no | One of: `puzzle` (default), `link`, `search`, `text`, `hash`, `code`, `braces`, `clock`, `palette`, `lock`, `key`, `globe`, `image`, `file`, `database`, `terminal`, `calculator`, `wand`, `network`, `zap`. |
| `tools[].keywords` | no | Extra words people might search for. |
| `tools[].level` | no | Which tool set includes it: `1` Essentials, `2` Standard (default), `3` Complete. |

## 2. `index.jsx`

Import everything from the plugin kit and default-export `definePlugin(...)`:

```jsx
import { definePlugin } from "../../plugin-sdk.jsx";

export default definePlugin({
  id: "word-tools",                 // same as plugin.json
  tools: {
    "word-count": { /* a transform tool or a component tool, see below */ },
  },
});
```

### Transform tools — text in, text out (easiest)

DevDeck draws the screen: your options on top, the input box (with Paste/Clear/Copy and the code
editor) on the left, the output on the right. It recalculates as the person types.

```jsx
"word-count": {
  sample: "The quick brown fox.",               // text shown the first time
  inputLabel: "Text", outputLabel: "Counts",     // optional box titles
  options: [
    { id: "unique", label: "Count different words only", type: "toggle", default: false },
    { id: "mode", label: "Count", type: "select", choices: [["words", "Words"], ["chars", "Characters"]], default: "words" },
    { id: "min", label: "Ignore words shorter than", type: "number", default: 0, min: 0 },
    { id: "prefix", label: "Prefix", type: "text", default: "" },
  ],
  transform(input, options) {                    // may also be async (return a Promise)
    if (!input.trim()) throw new Error("Type some text first.");   // errors show under the input
    const words = input.match(/\S+/g) || [];
    return `${options.prefix}${options.unique ? new Set(words).size : words.length}`;
  },
},
```

Option types: `toggle` (checkbox), `select` (buttons for up to 4 choices, otherwise a drop-down),
`number`, `text`.

### Component tools — your own screen

Give a React component. Use the kit's building blocks so it matches every theme and layout:

```jsx
import { useState } from "react";
import { definePlugin, Panel, Table, CopyButton, takeHandoff } from "../../plugin-sdk.jsx";

function WordCount() {
  const [text, setText] = useState(() => takeHandoff("The quick brown fox."));
  const words = text.match(/\S+/g) || [];
  return (
    <>
      <Panel label="Text" value={text} onChange={setText} rows={8} mono={false} />
      <div className="big-answer">{words.length} words <CopyButton value={String(words.length)} /></div>
    </>
  );
}

export default definePlugin({ id: "word-tools", tools: { "word-count": { component: WordCount } } });
```

### What the plugin kit gives you (`src/plugin-sdk.jsx`)

| Export | Use |
|---|---|
| `definePlugin(def)` | Registers the plugin's tools. |
| `TransformTool` | The ready-made text in → text out screen (used for you by transform tools). |
| `Panel` | A titled text box with Paste / Clear / Copy (`mono` gives the code editor). |
| `Options`, `Segmented` | An options row and a button group. |
| `CopyButton`, `PasteButton` | Copy / paste buttons. |
| `Result` | A labelled value with a Copy button. |
| `Table` | A simple table: `head` (titles) and `rows` (arrays of cells). |
| `FileDrop`, `download`, `fmtBytes` | Drop/choose files, download a file, show a size like "1.2 MB". |
| `takeHandoff(fallback)` | Picks up text sent from Smart Paste or another tool. |

Useful page classes: `panel`, `split` (two columns), `options-row`, `big-answer`, `muted small`,
`badge ok-badge / warn-badge / no-badge`, `chip`.

## Rules of thumb

- **Keep it private.** Tools should work in the browser. If a tool must contact the internet, say so
  on its screen, like the built-in Network tools do.
- **Don't break the site.** If a plugin throws while loading, DevDeck skips it and logs the problem in
  the browser console; the rest of the site keeps working.
- **Small and fast.** A plugin's code loads only when one of its tools is opened. Import big libraries
  inside the plugin (`npm install …`) only if you really need them.
- **Test it:** `npm run build`, open `/plugins/<tool-id>`, and try it in light and dark themes, the
  Compact layout and on a phone-width window.

## Sharing a plugin

Send the folder (or publish it in a repository). Others copy it into `src/plugins/` and rebuild.
Pull requests with useful plugins are welcome at https://github.com/ezin-rev/devdeck.
