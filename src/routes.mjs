// Plain list of page paths (kept free of JSX/icons so the build script can import it).
export const GROUP_TOOLS = {
  power: ["smart-paste", "chain"],
  converters: ["json-yaml", "number-base", "timestamp", "color", "csv-json", "cron", "toml", "chmod", "env", "docker-compose", "curl"],
  "encoders-decoders": ["html", "url", "base64", "jwt", "qr", "qr-reader", "gzip", "url-parser", "image-base64", "escape"],
  formatters: ["json", "sql", "xml", "nginx", "markdown"],
  generators: ["hash", "uuid", "password", "ulid", "rsa", "ssh-key", "cert-generator", "kubernetes", "randomizer", "lorem", "mock-data"],
  validators: ["cert-decoder", "compose-validator", "k8s-validator", "kubeconfig", "docker-image"],
  calculators: ["cidr", "units", "uptime", "semver"],
  text: ["inspector", "diff", "list-compare", "duplicates", "delimiter", "resx", "regex"],
  data: ["jsonpath", "yaml-paths", "json-schema", "json-code", "helm-diff", "xsd-validator", "xsd-generator"],
  network: ["http", "websocket", "dns", "ports", "grpc"],
  files: ["image-convert", "png-compress", "color-blind", "split"],
  reference: ["http-status", "keyboard"],
};

// The tools of the old DevOps group now live in the general groups above; old links still work.
const OLD_DEVOPS = ["cidr", "cert-decoder", "cert-generator", "compose-validator", "k8s-validator", "helm-diff", "kubeconfig", "docker-image", "ssh-key", "kubernetes", "docker-compose", "env", "units", "uptime", "semver", "curl"];
export const MOVED = {
  "/devops": "/validators",
  ...Object.fromEntries(OLD_DEVOPS.map((t) => {
    const group = Object.keys(GROUP_TOOLS).find((g) => GROUP_TOOLS[g].includes(t));
    return [`/devops/${t}`, `/${group}/${t}`];
  })),
};

export const ROUTES = [
  "/settings",
  "/aurora", // old address of this design; the app sends it on to the home page
  ...Object.keys(MOVED), // old DevOps addresses; the app sends them on to the new ones
  ...Object.keys(GROUP_TOOLS).map((g) => `/${g}`),
  ...Object.entries(GROUP_TOOLS).flatMap(([g, ts]) => ts.map((t) => `/${g}/${t}`)),
];
