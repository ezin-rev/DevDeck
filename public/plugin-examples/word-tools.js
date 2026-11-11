// Example single-file DevDeck plugin — install it from Settings → Plugins → Install
// (or "Try the example plugin"). Copy this file to start your own; see the plugin docs.
//
// The default export is a function that receives `sdk`, DevDeck's plugin kit:
//   sdk.h / sdk.React / sdk.useState …  — React, for tools with their own screen (no JSX needed)
//   sdk.Panel, sdk.Table, sdk.CopyButton, sdk.takeHandoff … — DevDeck's building blocks
export default (sdk) => ({
  id: "word-tools",
  name: "Word Tools",
  version: "1.0.0",
  author: "ezin-rev",
  description: "Example installable plugin: word frequency (a text in → text out tool) and reading time (a tool with its own screen).",
  homepage: "https://ezin-rev.github.io/docs/plugins.html",
  tools: [
    {
      // A "transform" tool: DevDeck draws the input, options and output.
      id: "word-frequency",
      title: "Word Frequency",
      desc: "Count how often each word appears, most used first",
      icon: "text",
      keywords: "words count frequency often common",
      level: 2,
      sample: "The cat sat on the mat. The mat was flat, and the cat was happy.",
      options: [
        { id: "top", label: "Show top", type: "number", default: 10, min: 1 },
        { id: "skipShort", label: "Skip words of 1–2 letters", type: "toggle", default: true },
      ],
      transform(input, { top, skipShort }) {
        const counts = {};
        for (const w of input.toLowerCase().match(/[\p{L}\p{N}'’-]+/gu) || []) {
          if (skipShort && w.length < 3) continue;
          counts[w] = (counts[w] || 0) + 1;
        }
        const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, Math.max(1, top));
        if (!rows.length) throw new Error("No words found.");
        return rows.map(([w, n]) => `${String(n).padStart(4)}  ${w}`).join("\n");
      },
    },
    {
      // A "component" tool: your own screen, built with sdk.h (React.createElement).
      id: "reading-time",
      title: "Reading Time",
      desc: "How long a text takes to read aloud or silently",
      icon: "clock",
      keywords: "reading time minutes speech words per minute",
      level: 1,
      component: function ReadingTime() {
        const { h, useState, Panel } = sdk;
        const [text, setText] = useState(() => sdk.takeHandoff("Paste an article, a speech or an email here to see how long it takes to read."));
        const [wpm, setWpm] = useState(230);
        const words = (text.match(/\S+/g) || []).length;
        const fmt = (min) => (min < 1 ? `${Math.max(1, Math.round(min * 60))} seconds` : `${Math.floor(min)} min ${Math.round((min % 1) * 60)} s`);
        return h(sdk.React.Fragment, null,
          h(Panel, { label: "Text", value: text, onChange: setText, rows: 8, mono: false }),
          h("div", { className: "options-row" },
            h("label", { className: "check" }, "Reading speed ",
              h("input", { className: "field small", type: "number", min: 50, max: 1000, value: wpm, onChange: (e) => setWpm(Number(e.target.value) || 230) }),
              " words per minute")),
          h("div", { className: "stats" },
            h("div", { className: "stat" }, h("strong", null, words), h("span", null, "Words")),
            h("div", { className: "stat" }, h("strong", null, fmt(words / wpm)), h("span", null, "Reading silently")),
            h("div", { className: "stat" }, h("strong", null, fmt(words / 140)), h("span", null, "Reading aloud"))));
      },
    },
  ],
});
