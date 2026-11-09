// Plain list of page paths (kept free of JSX/icons so the build script can import it).
export const GROUP_TOOLS = {
  power: ["smart-paste", "chain"],
  devops: ["cidr", "cert-decoder", "cert-generator", "kubernetes", "docker-compose", "env", "units", "uptime", "semver", "curl"],
  converters: ["json-yaml", "number-base", "timestamp", "color", "csv-json", "cron", "chmod"],
  "encoders-decoders": ["html", "url", "base64", "jwt", "qr", "url-parser", "image-base64", "escape"],
  formatters: ["json", "sql", "xml", "markdown"],
  generators: ["hash", "uuid", "password", "lorem", "mock-data"],
  text: ["inspector", "diff", "regex"],
  reference: ["http-status", "keyboard"],
};

export const ROUTES = [
  "/settings",
  "/aurora", // old address of this design; the app sends it on to the home page
  ...Object.keys(GROUP_TOOLS).map((g) => `/${g}`),
  ...Object.entries(GROUP_TOOLS).flatMap(([g, ts]) => ts.map((t) => `/${g}/${t}`)),
];
