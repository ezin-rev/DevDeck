import {
  ArrowLeftRight, Hash, CodeXml, Link, Equal, KeyRound, Braces, Fingerprint,
  CaseSensitive, Diff, Binary, AlignLeft, PackagePlus, Type,
  WandSparkles, Workflow, Zap, Clock, Palette, LockKeyhole, Regex,
  Sheet, CalendarClock, FileLock2, QrCode, Link2, Image, Quote, Database, FileCode,
  FileText, Pilcrow, Users, Globe, Keyboard, BookOpen,
  ShieldCheck, Calculator, Network, Boxes, Container, FileKey2, Ruler, Activity, Tags, Terminal, FileBadge, BadgeCheck,
  ScanQrCode, FileArchive, ImageDown, ImageMinus, Eye, SearchCode, FileJson, FileCheck2, ListChecks, CopyCheck, Dices,
  Languages, Key, Radio, Webhook, Send, FileDiff, PackageSearch, ServerCog, TextQuote, GitCompare, Waypoints, Cable, FileCog, ScrollText, Split,
} from "lucide-react";

// The tools that used to form the "DevOps" group; they now sit in the general groups by what they do.
const T = Object.fromEntries([
      { id: "cidr", short: "CIDR / Subnets", title: "CIDR & Subnet Calculator", desc: "Network, mask, host range and subnets for any IP range, plus an “is this IP inside?” check", icon: Network },
      { id: "cert-decoder", short: "Certificate Decoder", title: "SSL/TLS Certificate Decoder", desc: "Read a certificate, chain or CSR: who it’s for, expiry, fingerprints, chain check and key match", icon: FileBadge },
      { id: "cert-generator", short: "Certificate Generator", title: "Certificate & CSR Generator", desc: "Make a self-signed certificate, a signing request (CSR) or your own CA, with its private key", icon: BadgeCheck },
      { id: "compose-validator", short: "Compose Validator", title: "Docker Compose Validator", desc: "Find typos, port clashes, missing volumes and risky settings in a compose.yaml", icon: Container },
      { id: "k8s-validator", short: "Kubernetes Validator", title: "Kubernetes YAML Validator", desc: "Check manifests for removed APIs, selector mismatches, bad names, missing resources and more", icon: ServerCog },
      { id: "helm-diff", short: "Helm Values Diff", title: "Helm Values Diff", desc: "Compare two values.yaml files and get just your overrides or --set flags", icon: FileDiff },
      { id: "kubeconfig", short: "Kubeconfig Inspector", title: "Kubeconfig Inspector", desc: "See contexts, clusters and logins, certificate expiry, and copy it without secrets", icon: FileCog },
      { id: "docker-image", short: "Docker Image Inspector", title: "Docker Image Inspector", desc: "Break down an image name and read docker inspect output: user, ports, env, layers", icon: PackageSearch },
      { id: "ssh-key", short: "SSH Key Generator", title: "SSH Key Generator", desc: "Make Ed25519, ECDSA or RSA SSH keys in OpenSSH format, and check fingerprints", icon: Key },
      { id: "kubernetes", short: "Kubernetes YAML", title: "Kubernetes Manifest Generator", desc: "Fill in a form, get a Deployment, Service and Ingress ready to apply", icon: Boxes },
      { id: "docker-compose", short: "docker run → Compose", title: "docker run → Compose", desc: "Turn a long docker run command into a tidy compose.yaml", icon: Container },
      { id: "env", short: ".env Converter", title: ".env Converter", desc: "Turn a .env file into JSON, YAML, a Kubernetes Secret or ConfigMap, docker -e flags and more", icon: FileKey2 },
      { id: "units", short: "Sizes & Durations", title: "Sizes, Durations & Transfer Time", desc: "Mi vs MB, 1h30m in seconds, and how long a download takes", icon: Ruler },
      { id: "uptime", short: "Uptime / SLA", title: "Uptime & SLA Calculator", desc: "What 99.9% really allows in downtime, and the uptime of a whole chain of services", icon: Activity },
      { id: "semver", short: "Version Ranges", title: "Version Range Checker", desc: "Check which versions match ^1.4.0, ~2.1 or >=1 <2, compare and sort versions", icon: Tags },
      { id: "curl", short: "curl → Code", title: "curl to Code", desc: "Turn a curl command into JavaScript, Python, HTTPie or PowerShell", icon: Terminal },
].map((t) => [t.id, t]));

export const GROUPS = [
  {
    id: "power", title: "Power tools", tab: "Power tools", icon: Zap, tone: "green",
    tools: [
      { id: "smart-paste", short: "Smart Paste", title: "Smart Paste", desc: "Paste anything — it figures out what it is and shows you the answer", icon: WandSparkles },
      { id: "chain", short: "Tool Chain", title: "Tool Chain", desc: "Link tools together, e.g. Base64 decode → format JSON, all in one go", icon: Workflow },
    ],
  },
  {
    id: "converters", title: "Converters", tab: "Convert", icon: ArrowLeftRight, tone: "blue",
    tools: [
      { id: "json-yaml", short: "Json <> Yaml", title: "Json <> Yaml Converter", desc: "Convert Json data to Yaml and vice versa", icon: ArrowLeftRight },
      { id: "number-base", short: "Number Base", title: "Number Base Converter", desc: "Convert numbers from one base to another", icon: Hash },
      { id: "timestamp", short: "Date & Time", title: "Date & Timestamp Converter", desc: "Turn Unix timestamps into readable dates and back, in any time zone", icon: Clock },
      { id: "color", short: "Color", title: "Color Converter", desc: "Pick a colour and get HEX, RGB and HSL, plus a contrast check", icon: Palette },
      { id: "csv-json", short: "CSV <> JSON", title: "CSV <> JSON Converter", desc: "Turn spreadsheet data into JSON and back, with a table preview", icon: Sheet },
      { id: "cron", short: "Cron", title: "Cron Schedule Explainer", desc: "See what a cron schedule means in plain words, and when it runs next", icon: CalendarClock },
      { id: "toml", short: "TOML", title: "TOML Converter", desc: "Turn TOML into JSON or YAML and back", icon: FileCog },
      { id: "chmod", short: "chmod", title: "File Permission Calculator", desc: "Tick boxes to get chmod numbers like 755, or read what they mean", icon: FileLock2 },
      T.env, T["docker-compose"], T.curl,
    ],
  },
  {
    id: "encoders-decoders", title: "Encoders / Decoders", tab: "Encode / Decode", icon: Binary, tone: "violet",
    tools: [
      { id: "html", short: "HTML", title: "HTML Encoder / Decoder", desc: "Encode or decode all the applicable characters to their corresponding HTML entities", icon: CodeXml },
      { id: "url", short: "URL", title: "URL Encoder / Decoder", desc: "Encode or decode all the applicable characters to their corresponding URL entities", icon: Link },
      { id: "base64", short: "Base 64", title: "Base 64 Encoder / Decoder", desc: "Encode and decode Base64 data", icon: Equal },
      { id: "jwt", short: "JWT", title: "JWT Encoder / Decoder", desc: "Decode, verify and create signed JWTs (HS, RS, PS and ES algorithms)", icon: KeyRound },
      { id: "qr", short: "QR Code", title: "QR Code Generator", desc: "Make a QR code for a link, text or Wi-Fi login, and download it", icon: QrCode },
      { id: "qr-reader", short: "QR Reader", title: "QR Code Reader", desc: "Read a QR code from a picture, a pasted screenshot or your camera", icon: ScanQrCode },
      { id: "gzip", short: "GZIP", title: "GZIP Compressor / Decompressor", desc: "Compress text or files with gzip/deflate, or unpack them", icon: FileArchive },
      { id: "url-parser", short: "URL Parser", title: "URL Parser & Builder", desc: "Break a web address into parts and edit its parameters", icon: Link2 },
      { id: "image-base64", short: "Image <> Base64", title: "Image <> Base64", desc: "Turn an image into a data address for code, or preview one", icon: Image },
      { id: "escape", short: "String Escaper", title: "String Escaper", desc: "Escape text safely for JSON, JavaScript, SQL, regex, shell and CSV", icon: Quote },
    ],
  },
  {
    id: "formatters", title: "Formatters", tab: "Format", icon: AlignLeft, tone: "teal",
    tools: [
      { id: "json", short: "JSON", title: "JSON Formatter", desc: "Indent or minify JSON data", icon: Braces },
      { id: "sql", short: "SQL", title: "SQL Formatter", desc: "Tidy up database queries for PostgreSQL, MySQL, SQL Server and more", icon: Database },
      { id: "xml", short: "XML", title: "XML Formatter", desc: "Indent or minify XML and spot mistakes", icon: FileCode },
      { id: "nginx", short: "NGINX", title: "NGINX Config Formatter", desc: "Tidy nginx.conf indentation and spot missing ; and }", icon: ScrollText },
      { id: "markdown", short: "Markdown", title: "Markdown Preview", desc: "Write Markdown and see the formatted result side by side", icon: FileText },
    ],
  },
  {
    id: "generators", title: "Generators", tab: "Generate", icon: PackagePlus, tone: "amber",
    tools: [
      { id: "hash", short: "Hash / Checksum", title: "Hash / Checksum Generator", desc: "MD5, SHA-1, SHA-256, SHA-512 and CRC32 of text or files, and compare checksums", icon: Fingerprint },
      { id: "uuid", short: "UUID", title: "UUID Generator", desc: "Generate UUIDs version 1 and 4", icon: Hash },
      { id: "password", short: "Password", title: "Password Generator", desc: "Make strong passwords or easy-to-remember passphrases", icon: LockKeyhole },
      { id: "ulid", short: "ULID", title: "ULID Generator", desc: "Make sortable ULIDs and read the time inside one", icon: Hash },
      { id: "rsa", short: "RSA Keys", title: "RSA Key Generator", desc: "Make RSA key pairs as PEM, PKCS#1, JWK or OpenSSH", icon: KeyRound },
      T["ssh-key"], T["cert-generator"], T.kubernetes,
      { id: "randomizer", short: "Randomizer", title: "Randomizer", desc: "Random numbers, pick or shuffle from a list, split into groups, dice and coin flips", icon: Dices },
      { id: "lorem", short: "Lorem Ipsum", title: "Lorem Ipsum Generator", desc: "Placeholder text for designs, in paragraphs, sentences or words", icon: Pilcrow },
      { id: "mock-data", short: "Fake Data", title: "Fake Data Generator", desc: "Realistic test people as JSON, CSV or SQL — never real data", icon: Users },
    ],
  },
  {
    id: "validators", title: "Validators & Inspectors", tab: "Validate", icon: ShieldCheck, tone: "sky",
    tools: [T["cert-decoder"], T["compose-validator"], T["k8s-validator"], T.kubeconfig, T["docker-image"]],
  },
  {
    id: "calculators", title: "Calculators", tab: "Calculate", icon: Calculator, tone: "indigo",
    tools: [T.cidr, T.units, T.uptime, T.semver],
  },
  {
    id: "text", title: "Text", icon: Type, tone: "rose",
    tools: [
      { id: "inspector", short: "Text Analyzer & Utilities", title: "Text Analyzer & Utilities", desc: "Count words and characters, change case, sort, dedupe, trim and clean up text", icon: CaseSensitive },
      { id: "diff", short: "Comparer", title: "Text Comparer", desc: "Compare two texts and highlight the differences", icon: Diff },
      { id: "list-compare", short: "List Comparer", title: "List Comparer", desc: "Two lists: what’s only in one, in both, or in either", icon: GitCompare },
      { id: "duplicates", short: "Duplicate Detector", title: "Duplicate Detector", desc: "Find repeated lines and values, with counts, and remove them", icon: CopyCheck },
      { id: "delimiter", short: "Text Delimiter", title: "Text Delimiter", desc: "Turn a list into comma-separated text, ('a','b') for SQL, a JSON array and more", icon: TextQuote },
      { id: "resx", short: "RESX Translator", title: "RESX Translator", desc: "Translate .NET .resx resource files side by side and export the translated file", icon: Languages },
      { id: "regex", short: "Regex Tester", title: "Regex Tester", desc: "Try a search pattern and see every match highlighted live", icon: Regex },
    ],
  },
  {
    id: "data", title: "JSON, YAML & XML", tab: "JSON & XML", icon: FileJson, tone: "teal",
    tools: [
      { id: "jsonpath", short: "JSONPath Tester", title: "JSONPath Tester", desc: "Try JSONPath queries on JSON or YAML and see every match", icon: SearchCode },
      { id: "yaml-paths", short: "YAML to JSONPath", title: "YAML to JSONPath", desc: "List every value in YAML/JSON with its path — JSONPath, dot notation or helm --set", icon: Waypoints },
      { id: "json-schema", short: "JSON Schema", title: "JSON Schema Generator & Validator", desc: "Make a schema from example JSON, or check JSON against a schema", icon: FileCheck2 },
      { id: "json-code", short: "JSON to Code", title: "JSON to C#, PHP, TypeScript, Go…", desc: "Turn JSON into C# classes, PHP arrays or classes, TypeScript, Go, Python or Java", icon: Braces },
      { ...T["helm-diff"], short: "YAML / Helm Diff", title: "YAML & Helm Values Diff", desc: "Compare two YAML/JSON files key by key — and get just the overrides or helm --set flags" },
      { id: "xsd-validator", short: "XML / XSD Validator", title: "XML / XSD Validator", desc: "Check XML is well-formed and matches an XSD schema", icon: ListChecks },
      { id: "xsd-generator", short: "XSD Generator", title: "XSD Generator", desc: "Make an XSD schema from a sample XML file", icon: FileCode },
    ],
  },
  {
    id: "network", title: "Network & APIs", tab: "Network", icon: Cable, tone: "sky",
    tools: [
      { id: "http", short: "HTTP Requests", title: "HTTP Request Builder", desc: "Send GET/POST/PUT… requests with headers and a body, and see the response", icon: Send },
      { id: "websocket", short: "WebSocket", title: "WebSocket Client", desc: "Connect to a WebSocket, send messages and watch replies live", icon: Radio },
      { id: "dns", short: "DNS Lookup", title: "DNS Lookup", desc: "A, AAAA, MX, TXT, NS, CAA and more for any domain, plus an email setup check", icon: Globe },
      { id: "ports", short: "Port Checker", title: "Port Checker & Port List", desc: "Quick check whether a web port answers, commands for a real check, and common ports", icon: Network },
      { id: "grpc", short: "gRPC Helper", title: "gRPC Helper", desc: "Build grpcurl commands and decode raw protobuf messages", icon: Webhook },
    ],
  },
  {
    id: "files", title: "Files & Images", tab: "Files & Images", icon: ImageDown, tone: "amber",
    tools: [
      { id: "image-convert", short: "Image Converter", title: "Image Converter", desc: "Convert between PNG, JPEG, WebP, AVIF and BMP, resize, rotate and flip", icon: Image },
      { id: "png-compress", short: "PNG Compressor", title: "PNG Compressor", desc: "Shrink PNGs by reducing colours, keeping transparency", icon: ImageMinus },
      { id: "color-blind", short: "Color Blind Simulator", title: "Color Blind Simulator", desc: "See an image or colour palette the way people with colour blindness do", icon: Eye },
      { id: "split", short: "File Splitter", title: "File Splitter & Joiner", desc: "Split text or big files into pieces, and join pieces back together", icon: Split },
    ],
  },
  {
    id: "reference", title: "Reference", icon: BookOpen, tone: "indigo",
    tools: [
      { id: "http-status", short: "HTTP Status", title: "HTTP Status Codes", desc: "What 404, 500 and friends mean, in plain words", icon: Globe },
      { id: "keyboard", short: "Keyboard Keys", title: "Keyboard Event Inspector", desc: "Press any key to see its key, code and keyCode for your scripts", icon: Keyboard },
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
  "compose-validator": "docker compose validate lint check yaml docker-compose",
  "k8s-validator": "kubernetes k8s kubectl lint validate check manifest deployment yaml",
  "helm-diff": "helm values compare diff override set chart",
  kubeconfig: "kubernetes k8s kubectl config context cluster user certificate expiry",
  "docker-image": "docker image inspect registry tag digest layers container",
  "ssh-key": "ssh keygen ssh-keygen ed25519 rsa ecdsa public private key openssh fingerprint authorized_keys",
  toml: "toml config cargo pyproject json yaml convert",
  "qr-reader": "qr scan read decode camera barcode",
  gzip: "gzip gunzip compress decompress deflate zlib zip",
  nginx: "nginx conf config format beautify",
  ulid: "ulid id unique sortable uuid",
  rsa: "rsa key pair pem pkcs public private jwk generate",
  randomizer: "random number picker shuffle dice coin lottery raffle team",
  "list-compare": "compare lists difference intersection union",
  duplicates: "duplicate dedupe unique repeated",
  delimiter: "join split comma separated list quotes sql in csv",
  resx: "resx translate translation localization dotnet resources language",
  jsonpath: "jsonpath query filter json yaml",
  "yaml-paths": "yaml jsonpath paths keys flatten helm set",
  "json-schema": "json schema validate generate",
  "json-code": "json csharp c# php typescript go golang python java class model convert",
  "xsd-validator": "xml xsd schema validate check",
  "xsd-generator": "xml xsd schema generate create",
  http: "http request rest api postman get post put fetch client",
  websocket: "websocket ws wss socket client realtime",
  dns: "dns lookup dig nslookup mx txt record domain spf dmarc",
  ports: "port check open scan tcp telnet netcat",
  grpc: "grpc grpcurl protobuf proto decode",
  "image-convert": "image convert png jpg jpeg webp avif bmp resize rotate",
  "png-compress": "png compress optimize shrink tinypng smaller",
  "color-blind": "color colour blind blindness accessibility simulate daltonism",
  split: "file split join chunks pieces large csv",
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

// Tool sets for Settings → Manage tools: from simple everyday tools up to every specialist tool.
// Level 1 = Essentials, 2 = Standard (adds common developer tools), 3 = Complete (everything).
const ESSENTIALS = ["smart-paste", "json-yaml", "number-base", "timestamp", "color", "csv-json", "html", "url", "base64", "jwt", "qr", "qr-reader",
  "json", "markdown", "hash", "uuid", "password", "lorem", "randomizer", "inspector", "diff", "list-compare", "duplicates", "regex", "image-convert", "png-compress", "http-status"];
const SPECIALIST = ["cert-decoder", "cert-generator", "ssh-key", "rsa", "kubernetes", "compose-validator", "k8s-validator", "kubeconfig", "docker-image", "uptime",
  "helm-diff", "xsd-validator", "xsd-generator", "websocket", "ports", "grpc", "nginx", "resx", "keyboard"];
export const TOOL_SETS = [
  { level: 1, id: "essentials", name: "Essentials", desc: "Everyday basics: format and convert data, encode and decode, hashes, IDs, passwords, text and images." },
  { level: 2, id: "standard", name: "Standard", desc: "Essentials plus the common developer tools: SQL/XML, JSON queries and schemas, cron, .env, curl, HTTP and DNS, and more." },
  { level: 3, id: "complete", name: "Complete", desc: "Every tool, including specialist ones: certificates and keys, Docker and Kubernetes checks, gRPC, WebSocket, XSD and more." },
];
const levelOf = (id) => (ESSENTIALS.includes(id) ? 1 : SPECIALIST.includes(id) ? 3 : 2);

// Searching "devops" still finds the tools that used to be in the DevOps group.
export const ALL_TOOLS = GROUPS.flatMap((g) =>
  g.tools.map((t) => ({ ...t, group: g, path: `/${g.id}/${t.id}`, level: levelOf(t.id), words: `${SEARCH_WORDS[t.id] || ""}${T[t.id] ? " devops ops infrastructure" : ""}` }))
);

