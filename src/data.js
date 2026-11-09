import {
  ArrowLeftRight, Hash, CodeXml, Link, Equal, KeyRound, Braces, Fingerprint,
  CaseSensitive, Diff, Binary, AlignLeft, PackagePlus, Type,
  WandSparkles, Workflow, Zap, Clock, Palette, LockKeyhole, Regex,
  Sheet, CalendarClock, FileLock2, QrCode, Link2, Image, Quote, Database, FileCode,
  FileText, Pilcrow, Users, Globe, Keyboard, BookOpen,
  Server, Network, Boxes, Container, FileKey2, Ruler, Activity, Tags, Terminal, FileBadge, BadgeCheck,
} from "lucide-react";

export const GROUPS = [
  {
    id: "power", title: "Power tools", icon: Zap, tone: "green", isNew: true,
    tools: [
      { id: "smart-paste", short: "Smart Paste", title: "Smart Paste", desc: "Paste anything — it figures out what it is and shows you the answer", icon: WandSparkles, isNew: true },
      { id: "chain", short: "Tool Chain", title: "Tool Chain", desc: "Link tools together, e.g. Base64 decode → format JSON, all in one go", icon: Workflow, isNew: true },
    ],
  },
  {
    id: "devops", title: "DevOps", icon: Server, tone: "sky", isNew: true,
    // Tools in other groups that DevOps engineers reach for often (shown on the DevOps page).
    related: ["/converters/cron", "/converters/chmod", "/converters/json-yaml", "/encoders-decoders/base64", "/encoders-decoders/jwt", "/generators/hash", "/generators/password", "/reference/http-status"],
    tools: [
      { id: "cidr", short: "CIDR / Subnets", title: "CIDR & Subnet Calculator", desc: "Network, mask, host range and subnets for any IP range, plus an “is this IP inside?” check", icon: Network, isNew: true },
      { id: "cert-decoder", short: "Certificate Decoder", title: "SSL/TLS Certificate Decoder", desc: "Read a certificate, chain or CSR: who it’s for, expiry, fingerprints, chain check and key match", icon: FileBadge, isNew: true },
      { id: "cert-generator", short: "Certificate Generator", title: "Certificate & CSR Generator", desc: "Make a self-signed certificate, a signing request (CSR) or your own CA, with its private key", icon: BadgeCheck, isNew: true },
      { id: "kubernetes", short: "Kubernetes YAML", title: "Kubernetes Manifest Generator", desc: "Fill in a form, get a Deployment, Service and Ingress ready to apply", icon: Boxes, isNew: true },
      { id: "docker-compose", short: "docker run → Compose", title: "docker run → Compose", desc: "Turn a long docker run command into a tidy compose.yaml", icon: Container, isNew: true },
      { id: "env", short: ".env Converter", title: ".env Converter", desc: "Turn a .env file into JSON, YAML, a Kubernetes Secret or ConfigMap, docker -e flags and more", icon: FileKey2, isNew: true },
      { id: "units", short: "Sizes & Durations", title: "Sizes, Durations & Transfer Time", desc: "Mi vs MB, 1h30m in seconds, and how long a download takes", icon: Ruler, isNew: true },
      { id: "uptime", short: "Uptime / SLA", title: "Uptime & SLA Calculator", desc: "What 99.9% really allows in downtime, and the uptime of a whole chain of services", icon: Activity, isNew: true },
      { id: "semver", short: "Version Ranges", title: "Version Range Checker", desc: "Check which versions match ^1.4.0, ~2.1 or >=1 <2, compare and sort versions", icon: Tags, isNew: true },
      { id: "curl", short: "curl → Code", title: "curl to Code", desc: "Turn a curl command into JavaScript, Python, HTTPie or PowerShell", icon: Terminal, isNew: true },
    ],
  },
  {
    id: "converters", title: "Converters", icon: ArrowLeftRight, tone: "blue",
    tools: [
      { id: "json-yaml", short: "Json <> Yaml", title: "Json <> Yaml Converter", desc: "Convert Json data to Yaml and vice versa", icon: ArrowLeftRight },
      { id: "number-base", short: "Number Base", title: "Number Base Converter", desc: "Convert numbers from one base to another", icon: Hash },
      { id: "timestamp", short: "Date & Time", title: "Date & Timestamp Converter", desc: "Turn Unix timestamps into readable dates and back, in any time zone", icon: Clock, isNew: true },
      { id: "color", short: "Color", title: "Color Converter", desc: "Pick a colour and get HEX, RGB and HSL, plus a contrast check", icon: Palette, isNew: true },
      { id: "csv-json", short: "CSV <> JSON", title: "CSV <> JSON Converter", desc: "Turn spreadsheet data into JSON and back, with a table preview", icon: Sheet, isNew: true },
      { id: "cron", short: "Cron", title: "Cron Schedule Explainer", desc: "See what a cron schedule means in plain words, and when it runs next", icon: CalendarClock, isNew: true },
      { id: "chmod", short: "chmod", title: "File Permission Calculator", desc: "Tick boxes to get chmod numbers like 755, or read what they mean", icon: FileLock2, isNew: true },
    ],
  },
  {
    id: "encoders-decoders", title: "Encoders / Decoders", icon: Binary, tone: "violet",
    tools: [
      { id: "html", short: "HTML", title: "HTML Encoder / Decoder", desc: "Encode or decode all the applicable characters to their corresponding HTML entities", icon: CodeXml },
      { id: "url", short: "URL", title: "URL Encoder / Decoder", desc: "Encode or decode all the applicable characters to their corresponding URL entities", icon: Link },
      { id: "base64", short: "Base 64", title: "Base 64 Encoder / Decoder", desc: "Encode and decode Base64 data", icon: Equal },
      { id: "jwt", short: "JWT", title: "JWT Decoder", desc: "Decode a JWT header, payload and signature", icon: KeyRound },
      { id: "qr", short: "QR Code", title: "QR Code Generator", desc: "Make a QR code for a link, text or Wi-Fi login, and download it", icon: QrCode, isNew: true },
      { id: "url-parser", short: "URL Parser", title: "URL Parser & Builder", desc: "Break a web address into parts and edit its parameters", icon: Link2, isNew: true },
      { id: "image-base64", short: "Image <> Base64", title: "Image <> Base64", desc: "Turn an image into a data address for code, or preview one", icon: Image, isNew: true },
      { id: "escape", short: "String Escaper", title: "String Escaper", desc: "Escape text safely for JSON, JavaScript, SQL, regex, shell and CSV", icon: Quote, isNew: true },
    ],
  },
  {
    id: "formatters", title: "Formatters", icon: AlignLeft, tone: "teal",
    tools: [
      { id: "json", short: "JSON", title: "JSON Formatter", desc: "Indent or minify JSON data", icon: Braces },
      { id: "sql", short: "SQL", title: "SQL Formatter", desc: "Tidy up database queries for PostgreSQL, MySQL, SQL Server and more", icon: Database, isNew: true },
      { id: "xml", short: "XML", title: "XML Formatter", desc: "Indent or minify XML and spot mistakes", icon: FileCode, isNew: true },
      { id: "markdown", short: "Markdown", title: "Markdown Preview", desc: "Write Markdown and see the formatted result side by side", icon: FileText, isNew: true },
    ],
  },
  {
    id: "generators", title: "Generators", icon: PackagePlus, tone: "amber",
    tools: [
      { id: "hash", short: "Hash", title: "Hash Generator", desc: "Calculate MD5, SHA1, SHA256 and SHA512 hash from text data", icon: Fingerprint },
      { id: "uuid", short: "UUID", title: "UUID Generator", desc: "Generate UUIDs version 1 and 4", icon: Hash },
      { id: "password", short: "Password", title: "Password Generator", desc: "Make strong passwords or easy-to-remember passphrases", icon: LockKeyhole, isNew: true },
      { id: "lorem", short: "Lorem Ipsum", title: "Lorem Ipsum Generator", desc: "Placeholder text for designs, in paragraphs, sentences or words", icon: Pilcrow, isNew: true },
      { id: "mock-data", short: "Fake Data", title: "Fake Data Generator", desc: "Realistic test people as JSON, CSV or SQL — never real data", icon: Users, isNew: true },
    ],
  },
  {
    id: "text", title: "Text", icon: Type, tone: "rose",
    tools: [
      { id: "inspector", short: "Inspector & Case Converter", title: "Text Inspector & Case Converter", desc: "Analyze text and convert it to a different case", icon: CaseSensitive },
      { id: "diff", short: "Comparer", title: "Text Comparer", desc: "Compare two texts and highlight the differences", icon: Diff },
      { id: "regex", short: "Regex Tester", title: "Regex Tester", desc: "Try a search pattern and see every match highlighted live", icon: Regex, isNew: true },
    ],
  },
  {
    id: "reference", title: "Reference", icon: BookOpen, tone: "indigo", isNew: true,
    tools: [
      { id: "http-status", short: "HTTP Status", title: "HTTP Status Codes", desc: "What 404, 500 and friends mean, in plain words", icon: Globe, isNew: true },
      { id: "keyboard", short: "Keyboard Keys", title: "Keyboard Event Inspector", desc: "Press any key to see its key, code and keyCode for your scripts", icon: Keyboard, isNew: true },
    ],
  },
];

// Extra words people search for that aren't in a tool's title or description.
const SEARCH_WORDS = {
  "smart-paste": "detect identify guess what is this auto clipboard",
  chain: "pipeline recipe workflow combine steps multiple",
  cidr: "ip subnet netmask network range ipv4 calculator",
  kubernetes: "k8s kubectl deployment service ingress manifest yaml",
  "docker-compose": "docker compose container convert",
  env: "dotenv environment variables secret configmap",
  units: "bytes kb mb gb gib mib bandwidth download speed duration time convert",
  uptime: "sla slo availability nines downtime",
  semver: "semantic version npm package range caret tilde",
  "cert-decoder": "ssl tls https x509 x.509 cert certs certificate pem crt cer der csr chain expiry expire expiration fingerprint san openssl inspect check",
  "cert-generator": "ssl tls https x509 cert certs certificate csr self signed selfsigned ca root private key openssl create make new",
  curl: "http request fetch python javascript powershell httpie convert",
  "json-yaml": "convert yml",
  "number-base": "hex hexadecimal binary octal decimal radix convert",
  timestamp: "unix epoch time date iso utc timezone convert",
  color: "colour hex rgb hsl contrast wcag picker convert",
  "csv-json": "spreadsheet excel table convert",
  cron: "crontab schedule job timer",
  chmod: "unix linux file permissions rwx octal",
  html: "entities escape unescape encode decode",
  url: "percent encoding uri escape encode decode",
  base64: "b64 encode decode",
  jwt: "token bearer auth oauth claims decode expiry",
  qr: "qrcode barcode wifi",
  "url-parser": "query string parameters link",
  "image-base64": "data uri picture png jpg svg",
  escape: "quotes backslash unescape",
  json: "format beautify prettify pretty print minify validate lint",
  sql: "query format beautify prettify database",
  xml: "format beautify prettify minify validate",
  markdown: "md readme preview render",
  hash: "md5 sha sha1 sha256 sha512 checksum digest",
  uuid: "guid unique id random",
  password: "passphrase random secure strong generator",
  lorem: "placeholder dummy text filler",
  "mock-data": "fake test people names emails dummy random",
  inspector: "count words characters case upper lower camel snake kebab title",
  diff: "compare difference changes",
  regex: "regular expression pattern match test",
  "http-status": "error codes 404 500 response",
  keyboard: "keycode key code event javascript",
};

export const ALL_TOOLS = GROUPS.flatMap((g) =>
  g.tools.map((t) => ({ ...t, group: g, path: `/${g.id}/${t.id}`, words: SEARCH_WORDS[t.id] || "" }))
);

