// Certificates (X.509), signing requests (CSR) and keys: read and write the DER/PEM format by hand,
// so nothing extra has to load and nothing leaves the browser. Kept free of JSX so it can be tested in Node.

/* ======================================================================
   Reading DER
   ====================================================================== */
export function readNode(b, pos = 0) {
  if (pos + 2 > b.length) throw new Error("The data ends too early — is part of it missing?");
  const tag = b[pos];
  let len = b[pos + 1], p = pos + 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n < 1 || n > 4) throw new Error("This isn’t valid certificate data.");
    len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + b[p++];
  }
  const end = p + len;
  if (end > b.length) throw new Error("The data ends too early — is part of it missing?");
  const node = { tag, b, start: pos, body: p, end, kids: null };
  if (tag & 0x20) {
    node.kids = [];
    for (let q = p; q < end;) { const k = readNode(b, q); node.kids.push(k); q = k.end; }
  }
  return node;
}
const val = (n) => n.b.subarray(n.body, n.end);
const raw = (n) => n.b.subarray(n.start, n.end);
const bits = (n) => n.b.subarray(n.body + 1, n.end); // BIT STRING without its "unused bits" byte

export function oidStr(bytes) {
  const out = []; let v = 0;
  for (const x of bytes) { v = v * 128 + (x & 0x7f); if (!(x & 0x80)) { out.push(v); v = 0; } }
  const first = out.shift() ?? 0;
  const a = first < 80 ? Math.floor(first / 40) : 2;
  return [a, first - a * 40, ...out].join(".");
}
const oid = (n) => oidStr(val(n));

function str(n) {
  const v = val(n);
  if (n.tag === 0x1e) { let s = ""; for (let i = 0; i + 1 < v.length; i += 2) s += String.fromCharCode((v[i] << 8) | v[i + 1]); return s; }
  if (n.tag === 0x14) return String.fromCharCode(...v);
  return new TextDecoder().decode(v);
}

function time(n) {
  const s = new TextDecoder().decode(val(n));
  const m = n.tag === 0x17
    ? s.match(/^(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)?Z$/)
    : s.match(/^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)?(?:\.\d+)?Z$/);
  if (!m) return new Date(NaN);
  let y = +m[1];
  if (n.tag === 0x17) y += y < 50 ? 2000 : 1900;
  return new Date(Date.UTC(y, +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)));
}

export const hexColons = (bytes) => [...bytes].map((x) => x.toString(16).padStart(2, "0").toUpperCase()).join(":");
const stripZeros = (bytes) => { let i = 0; while (i < bytes.length - 1 && bytes[i] === 0) i++; return bytes.subarray(i); };
const sameBytes = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

/* ---------- names for the numbers inside certificates ---------- */
export const NAME_PARTS = {
  "2.5.4.3": ["CN", "Common name"], "2.5.4.6": ["C", "Country"], "2.5.4.7": ["L", "City / locality"],
  "2.5.4.8": ["ST", "State / province"], "2.5.4.10": ["O", "Organisation"], "2.5.4.11": ["OU", "Department"],
  "2.5.4.5": ["serialNumber", "Serial number"], "2.5.4.9": ["street", "Street"], "2.5.4.17": ["postalCode", "Postal code"],
  "2.5.4.4": ["SN", "Surname"], "2.5.4.42": ["GN", "Given name"], "2.5.4.15": ["businessCategory", "Business category"],
  "2.5.4.97": ["organizationIdentifier", "Organisation ID"], "1.2.840.113549.1.9.1": ["emailAddress", "Email"],
  "0.9.2342.19200300.100.1.25": ["DC", "Domain component"], "0.9.2342.19200300.100.1.1": ["UID", "User ID"],
  "1.3.6.1.4.1.311.60.2.1.3": ["jurisdictionC", "Registered in country"],
};
const SIG_ALGS = {
  "1.2.840.113549.1.1.5": ["SHA-1 with RSA", "rsa", "SHA-1"],
  "1.2.840.113549.1.1.11": ["SHA-256 with RSA", "rsa", "SHA-256"],
  "1.2.840.113549.1.1.12": ["SHA-384 with RSA", "rsa", "SHA-384"],
  "1.2.840.113549.1.1.13": ["SHA-512 with RSA", "rsa", "SHA-512"],
  "1.2.840.113549.1.1.10": ["RSA-PSS", "pss"],
  "1.2.840.10045.4.3.2": ["ECDSA with SHA-256", "ec", "SHA-256"],
  "1.2.840.10045.4.3.3": ["ECDSA with SHA-384", "ec", "SHA-384"],
  "1.2.840.10045.4.3.4": ["ECDSA with SHA-512", "ec", "SHA-512"],
  "1.3.101.112": ["Ed25519", "ed25519"],
  "1.3.101.113": ["Ed448", "ed448"],
};
const KEY_ALGS = { "1.2.840.113549.1.1.1": "RSA", "1.2.840.10045.2.1": "EC", "1.3.101.112": "Ed25519", "1.3.101.113": "Ed448", "1.2.840.113549.1.1.10": "RSA-PSS" };
const CURVES = { "1.2.840.10045.3.1.7": ["P-256", 32], "1.3.132.0.34": ["P-384", 48], "1.3.132.0.35": ["P-521", 66] };
const EKU = {
  "1.3.6.1.5.5.7.3.1": "Website (TLS server)", "1.3.6.1.5.5.7.3.2": "Client login (TLS client)", "1.3.6.1.5.5.7.3.3": "Code signing",
  "1.3.6.1.5.5.7.3.4": "Email (S/MIME)", "1.3.6.1.5.5.7.3.8": "Time stamping", "1.3.6.1.5.5.7.3.9": "OCSP signing",
  "2.5.29.37.0": "Any purpose", "1.3.6.1.4.1.311.10.3.3": "Microsoft server gated crypto",
};
const KEY_USAGE = ["Digital signature", "Non-repudiation", "Key encipherment", "Data encipherment", "Key agreement", "Certificate signing", "CRL signing", "Encipher only", "Decipher only"];
const POLICIES = { "2.23.140.1.2.1": "Domain validated (DV)", "2.23.140.1.2.2": "Organisation validated (OV)", "2.23.140.1.2.3": "Individual validated (IV)", "2.23.140.1.1": "Extended validation (EV)" };
const EXT_NAMES = {
  "2.5.29.17": "Other names (SAN)", "2.5.29.15": "Key usage", "2.5.29.37": "Extended key usage", "2.5.29.19": "Basic constraints",
  "2.5.29.14": "Subject key ID", "2.5.29.35": "Authority key ID", "1.3.6.1.5.5.7.1.1": "Authority info access", "2.5.29.31": "CRL distribution points",
  "2.5.29.32": "Certificate policies", "1.3.6.1.4.1.11129.2.4.2": "Certificate Transparency (SCTs)", "1.3.6.1.4.1.11129.2.4.3": "CT poison (precertificate)",
  "2.5.29.30": "Name constraints", "1.3.6.1.5.5.7.1.24": "TLS feature (OCSP must-staple)",
};

/* ---------- pieces ---------- */
function parseName(n) {
  const parts = [];
  for (const set of n.kids || []) for (const atv of set.kids || []) {
    const id = oid(atv.kids[0]);
    const [short, label] = NAME_PARTS[id] || [id, id];
    parts.push({ id, short, label, value: str(atv.kids[1]) });
  }
  return { parts, text: parts.map((p) => `${p.short}=${p.value}`).join(", ") || "(empty)", der: raw(n) };
}

function parseKey(spkiNode) {
  const [algSeq, bitNode] = spkiNode.kids;
  const algId = oid(algSeq.kids[0]);
  const key = { algId, type: KEY_ALGS[algId] || algId, spki: raw(spkiNode), pub: bits(bitNode) };
  if (key.type === "RSA") {
    const rsa = readNode(key.pub);
    key.modulus = stripZeros(val(rsa.kids[0]));
    key.size = key.modulus.length * 8 - Math.clz32(key.modulus[0]) + 24;
    key.exponent = parseInt([...val(rsa.kids[1])].map((x) => x.toString(16).padStart(2, "0")).join(""), 16);
    key.summary = `RSA ${key.size}-bit`;
  } else if (key.type === "EC") {
    const c = algSeq.kids[1] && algSeq.kids[1].tag === 0x06 ? oid(algSeq.kids[1]) : "";
    [key.curve, key.curveBytes] = CURVES[c] || [c, 0];
    key.size = ((key.pub.length - 1) / 2) * 8;
    key.summary = key.curve ? `Elliptic curve ${key.curve}` : `Elliptic curve, ${key.size}-bit (spelled-out curve parameters)`;
  } else key.summary = key.type;
  return key;
}

function generalNames(seq) {
  const out = [];
  for (const g of seq.kids || []) {
    const t = g.tag & 0x1f;
    if (t === 2) out.push(["DNS", new TextDecoder().decode(val(g))]);
    else if (t === 1) out.push(["Email", new TextDecoder().decode(val(g))]);
    else if (t === 6) out.push(["URI", new TextDecoder().decode(val(g))]);
    else if (t === 7) {
      const v = val(g);
      out.push(["IP", v.length === 4 ? [...v].join(".") : [...Array(v.length / 2)].map((_, i) => ((v[2 * i] << 8) | v[2 * i + 1]).toString(16)).join(":").replace(/(^|:)0(:0)+(:|$)/, "::")]);
    } else if (t === 4 && g.kids?.[0]) out.push(["Directory", parseName(g.kids[0]).text]);
    else out.push(["Other", `type ${t}`]);
  }
  return out;
}

const findUris = (n, out = []) => { if ((n.tag & 0x1f) === 6 && (n.tag & 0xc0) === 0x80 && !n.kids) out.push(new TextDecoder().decode(val(n))); (n.kids || []).forEach((k) => findUris(k, out)); return out; };

function parseExtensions(seq) {
  const ext = { list: [], san: [], keyUsage: null, eku: null, ca: null, pathLen: null, ski: null, aki: null, ocsp: [], caIssuers: [], crl: [], policies: [], sct: false };
  for (const e of seq.kids || []) {
    const id = oid(e.kids[0]);
    const critical = e.kids.length === 3 && e.kids[1].tag === 0x01 && val(e.kids[1])[0] !== 0;
    const body = val(e.kids[e.kids.length - 1]);
    ext.list.push({ id, name: EXT_NAMES[id] || id, critical });
    try {
      const v = readNode(body);
      if (id === "2.5.29.17") ext.san = generalNames(v);
      else if (id === "2.5.29.15") { const b = bits(v); ext.keyUsage = KEY_USAGE.filter((_, i) => b[i >> 3] & (0x80 >> (i & 7))); }
      else if (id === "2.5.29.37") ext.eku = v.kids.map((k) => EKU[oid(k)] || oid(k));
      else if (id === "2.5.29.19") {
        ext.ca = !!(v.kids?.[0]?.tag === 0x01 && val(v.kids[0])[0]);
        const pl = v.kids?.find((k) => k.tag === 0x02);
        if (pl) ext.pathLen = val(pl).reduce((a, x) => a * 256 + x, 0);
      }
      else if (id === "2.5.29.14") ext.ski = hexColons(val(v));
      else if (id === "2.5.29.35") { const k = v.kids?.find((x) => x.tag === 0x80); if (k) ext.aki = hexColons(val(k)); }
      else if (id === "1.3.6.1.5.5.7.1.1") for (const ad of v.kids || []) {
        const m = oid(ad.kids[0]); const uri = findUris(ad.kids[1])[0];
        if (uri) (m === "1.3.6.1.5.5.7.48.1" ? ext.ocsp : ext.caIssuers).push(uri);
      }
      else if (id === "2.5.29.31") ext.crl = findUris(v);
      else if (id === "2.5.29.32") ext.policies = v.kids.map((p) => POLICIES[oid(p.kids[0])] || oid(p.kids[0]));
      else if (id === "1.3.6.1.4.1.11129.2.4.2") ext.sct = true;
    } catch { /* leave an extension we can't read as just its name */ }
  }
  return ext;
}

/* ---------- whole files ---------- */
// Pull every PEM block out of the text; bare Base64 (no BEGIN line) is treated as one DER blob.
export function pemBlocks(text) {
  const out = [];
  const re = /-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/g;
  let m;
  while ((m = re.exec(text))) out.push({ label: m[1], der: b64ToBytes(m[2].replace(/^[\w-]+:.*$/gm, "")) });
  if (!out.length) {
    const t = text.replace(/\s+/g, "");
    if (/^[A-Za-z0-9+/=_-]{40,}$/.test(t)) out.push({ label: "", der: b64ToBytes(t) });
  }
  return out;
}
export function b64ToBytes(s) {
  const clean = s.replace(/[\s]/g, "").replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(clean + "===".slice((clean.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
export function bytesToB64(bytes) { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); }
export const toPem = (label, der) => `-----BEGIN ${label}-----\n${bytesToB64(der).match(/.{1,64}/g).join("\n")}\n-----END ${label}-----\n`;

export function parseCertificate(der) {
  const root = readNode(der);
  const [tbsN, sigAlgN, sigN] = root.kids || [];
  if (!tbsN?.kids || !sigN) throw new Error("This doesn’t look like a certificate.");
  const k = tbsN.kids;
  let i = 0, version = 1;
  if (k[0].tag === 0xa0) { version = val(k[0].kids[0])[0] + 1; i = 1; }
  const serial = val(k[i]);
  const issuer = parseName(k[i + 2]);
  const [nb, na] = k[i + 3].kids;
  const subject = parseName(k[i + 4]);
  const key = parseKey(k[i + 5]);
  const extN = k.slice(i + 6).find((x) => x.tag === 0xa3);
  const ext = extN ? parseExtensions(extN.kids[0]) : parseExtensions({ kids: [] });
  const sigOid = oid(sigAlgN.kids[0]);
  return {
    kind: "certificate", der, version, serial: hexColons(stripZeros(serial)), serialDec: BigInt("0x" + ([...serial].map((x) => x.toString(16).padStart(2, "0")).join("") || "0")).toString(),
    issuer, subject, notBefore: time(nb), notAfter: time(na), key, ext,
    sigOid, sigName: SIG_ALGS[sigOid]?.[0] || sigOid, sig: bits(sigN), tbs: raw(tbsN),
    selfIssued: sameBytes(issuer.der, subject.der),
  };
}

export function parseCsr(der) {
  const root = readNode(der);
  const [infoN, sigAlgN, sigN] = root.kids || [];
  if (!infoN?.kids || !sigN) throw new Error("This doesn’t look like a signing request.");
  const [, subjN, spkiN, attrsN] = infoN.kids;
  let ext = parseExtensions({ kids: [] });
  for (const a of attrsN?.kids || []) if (oid(a.kids[0]) === "1.2.840.113549.1.9.14") ext = parseExtensions(a.kids[1].kids[0]);
  const sigOid = oid(sigAlgN.kids[0]);
  return { kind: "csr", der, subject: parseName(subjN), key: parseKey(spkiN), ext, sigOid, sigName: SIG_ALGS[sigOid]?.[0] || sigOid, sig: bits(sigN), tbs: raw(infoN) };
}

// Certificate or CSR? The PEM label says so; without one, look at the shape.
export function parseAny(block) {
  if (/REQUEST/.test(block.label)) return parseCsr(block.der);
  if (/CERTIFICATE/.test(block.label)) return parseCertificate(block.der);
  if (/KEY/.test(block.label)) return { kind: "key", label: block.label, der: block.der };
  try { return parseCertificate(block.der); } catch { return parseCsr(block.der); }
}

/* ---------- checks ---------- */
const subtle = () => (typeof crypto !== "undefined" && crypto.subtle) || null;

export async function fingerprint(der, algo = "SHA-256") {
  if (!subtle()) return "";
  return hexColons(new Uint8Array(await subtle().digest(algo, der)));
}

// ECDSA signatures in certificates are DER (two integers); Web Crypto wants them side by side.
function ecDerToRaw(sig, size) {
  const n = readNode(sig);
  const pad = (x) => { const s = stripZeros(val(x)); const out = new Uint8Array(size); out.set(s.subarray(Math.max(0, s.length - size)), Math.max(0, size - s.length)); return out; };
  const out = new Uint8Array(size * 2); out.set(pad(n.kids[0])); out.set(pad(n.kids[1]), size); return out;
}

// true / false when the signature could be checked, null when this browser can't check that kind.
export async function verifySignature(item, signerKey) {
  const s = subtle(); const info = SIG_ALGS[item.sigOid];
  if (!s || !info) return null;
  try {
    let keyAlg, alg, sig = item.sig;
    if (info[1] === "rsa") { if (signerKey.type !== "RSA") return false; keyAlg = alg = { name: "RSASSA-PKCS1-v1_5", hash: info[2] }; }
    else if (info[1] === "ec") { if (!signerKey.curveBytes) return null; keyAlg = { name: "ECDSA", namedCurve: signerKey.curve }; alg = { name: "ECDSA", hash: info[2] }; sig = ecDerToRaw(sig, signerKey.curveBytes); }
    else if (info[1] === "ed25519") keyAlg = alg = { name: "Ed25519" };
    else return null;
    const key = await s.importKey("spki", signerKey.spki, keyAlg, false, ["verify"]);
    return await s.verify(alg, key, sig, item.tbs);
  } catch { return null; }
}

// Does this private key belong to the certificate's public key? Compared by reading the key file.
export function keyMatches(certKey, text) {
  const blk = pemBlocks(text).find((b) => /PRIVATE KEY/.test(b.label));
  if (!blk) return { ok: null, note: "Paste a private key that starts with -----BEGIN … PRIVATE KEY-----." };
  if (/ENCRYPTED/.test(blk.label)) return { ok: null, note: "This key is password-protected. Remove the password first, e.g. openssl pkey -in key.pem -out plain.pem" };
  try {
    let n = readNode(blk.der), type = blk.label.startsWith("RSA") ? "RSA" : blk.label.startsWith("EC") ? "EC" : null;
    if (!type) { // PKCS#8: unwrap
      const alg = oid(n.kids[1].kids[0]);
      type = KEY_ALGS[alg];
      if (type === "RSA" || type === "EC") n = readNode(val(n.kids[2]));
      else return { ok: null, note: `${type || "This"} keys can’t be compared here yet.` };
    }
    if (type !== certKey.type) return { ok: false, note: `The key is ${type}, but the certificate uses ${certKey.type}.` };
    if (type === "RSA") return { ok: sameBytes(stripZeros(val(n.kids[1])), certKey.modulus), note: "" };
    const pub = n.kids.find((x) => x.tag === 0xa1);
    if (!pub) return { ok: null, note: "This key file doesn’t include its public half, so it can’t be compared." };
    return { ok: sameBytes(bits(pub.kids[0]), certKey.pub), note: "" };
  } catch { return { ok: null, note: "Couldn’t read this private key." }; }
}

/* ======================================================================
   Writing DER (for the generator)
   ====================================================================== */
const cat = (...parts) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };
function lenBytes(n) { if (n < 128) return [n]; const b = []; while (n) { b.unshift(n & 0xff); n >>>= 8; } return [0x80 | b.length, ...b]; }
export const tlv = (tag, ...content) => { const c = cat(...content); return cat(new Uint8Array([tag, ...lenBytes(c.length)]), c); };
const enc = (s) => new TextEncoder().encode(s);
export const seq = (...x) => tlv(0x30, ...x);
const set = (...x) => tlv(0x31, ...x);
const intBytes = (b) => { b = stripZeros(b); return tlv(0x02, b[0] & 0x80 ? cat(new Uint8Array([0]), b) : b); };
const int = (n) => intBytes(new Uint8Array(n < 256 ? [n] : [n >> 8, n & 0xff]));
const nul = () => new Uint8Array([0x05, 0x00]);
const bitStr = (b, unused = 0) => tlv(0x03, new Uint8Array([unused]), b);
const octet = (b) => tlv(0x04, b);
const bool = (v) => new Uint8Array([0x01, 0x01, v ? 0xff : 0]);
export function oidBytes(s) {
  const [a, b, ...rest] = s.split(".").map(Number);
  const out = [40 * a + b];
  for (const n of rest) { const g = []; let v = n; do { g.unshift(v & 0x7f); v = Math.floor(v / 128); } while (v); out.push(...g.map((x, i) => (i < g.length - 1 ? x | 0x80 : x))); }
  return tlv(0x06, new Uint8Array(out));
}
const timeBytes = (d) => {
  const p = (n) => String(n).padStart(2, "0");
  const y = d.getUTCFullYear(), rest = `${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
  return y < 2050 ? tlv(0x17, enc(String(y).slice(2) + rest)) : tlv(0x18, enc(y + rest));
};

const NAME_ORDER = [["C", "2.5.4.6", 0x13], ["ST", "2.5.4.8", 0x0c], ["L", "2.5.4.7", 0x0c], ["O", "2.5.4.10", 0x0c], ["OU", "2.5.4.11", 0x0c], ["CN", "2.5.4.3", 0x0c], ["email", "1.2.840.113549.1.9.1", 0x16]];
export const nameBytes = (f) => seq(...NAME_ORDER.filter(([k]) => f[k]?.trim()).map(([k, id, tag]) => set(seq(oidBytes(id), tlv(tag, enc(f[k].trim()))))));

function sanBytes(list) {
  return seq(...list.map((s) => {
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(s)) return tlv(0x87, new Uint8Array(s.split(".").map(Number)));
    if (s.includes("@")) return tlv(0x81, enc(s));
    return tlv(0x82, enc(s));
  }));
}
const ext = (id, critical, value) => seq(oidBytes(id), ...(critical ? [bool(true)] : []), octet(value));

function rawToEcDer(sig) {
  const h = sig.length / 2;
  return seq(intBytes(sig.subarray(0, h)), intBytes(sig.subarray(h)));
}

export const KEY_CHOICES = {
  "ec256": { label: "ECDSA P-256 (small, fast)", gen: { name: "ECDSA", namedCurve: "P-256" }, sign: { name: "ECDSA", hash: "SHA-256" }, sigOid: "1.2.840.10045.4.3.2", openssl: "-newkey ec -pkeyopt ec_paramgen_curve:P-256" },
  "rsa2048": { label: "RSA 2048", gen: { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, sign: { name: "RSASSA-PKCS1-v1_5" }, sigOid: "1.2.840.113549.1.1.11", openssl: "-newkey rsa:2048" },
  "rsa4096": { label: "RSA 4096 (slower)", gen: { name: "RSASSA-PKCS1-v1_5", modulusLength: 4096, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, sign: { name: "RSASSA-PKCS1-v1_5" }, sigOid: "1.2.840.113549.1.1.11", openssl: "-newkey rsa:4096" },
};

// Make a key pair, then a self-signed certificate or a signing request (CSR), all with Web Crypto.
// f: { CN, O, OU, L, ST, C, email, san: [..], days, ca }
export async function generate(kind, keyChoice, f) {
  const s = subtle();
  if (!s) throw new Error("This browser only allows making keys on secure (https) pages.");
  const kc = KEY_CHOICES[keyChoice];
  const pair = await s.generateKey(kc.gen, true, ["sign", "verify"]);
  const spki = new Uint8Array(await s.exportKey("spki", pair.publicKey));
  const pkcs8 = new Uint8Array(await s.exportKey("pkcs8", pair.privateKey));
  const isRsa = kc.gen.name.startsWith("RSA");
  const sigAlg = isRsa ? seq(oidBytes(kc.sigOid), nul()) : seq(oidBytes(kc.sigOid));
  const subject = nameBytes(f);
  const san = [...new Set([...(f.CN && !f.ca && !/\s/.test(f.CN) ? [f.CN.trim()] : []), ...(f.san || [])].map((x) => x.trim()).filter(Boolean))];
  const pubBits = bits(readNode(spki).kids[1]);
  const ski = new Uint8Array(await s.digest("SHA-1", pubBits));
  const exts = [
    ext("2.5.29.19", true, f.ca ? seq(bool(true)) : seq()),
    ext("2.5.29.15", true, f.ca ? bitStr(new Uint8Array([0x06]), 1) : isRsa ? bitStr(new Uint8Array([0xa0]), 5) : bitStr(new Uint8Array([0x80]), 7)),
    ...(f.ca ? [] : [ext("2.5.29.37", false, seq(oidBytes("1.3.6.1.5.5.7.3.1"), oidBytes("1.3.6.1.5.5.7.3.2")))]),
    ...(san.length ? [ext("2.5.29.17", false, sanBytes(san))] : []),
  ];
  const sign = async (tbs) => { const sig = new Uint8Array(await s.sign(kc.sign, pair.privateKey, tbs)); return isRsa ? sig : rawToEcDer(sig); };
  let out;
  if (kind === "csr") {
    // A request only asks for the names; the authority that signs it decides the rest.
    const attrs = tlv(0xa0, ...(san.length ? [seq(oidBytes("1.2.840.113549.1.9.14"), set(seq(ext("2.5.29.17", false, sanBytes(san)))))] : []));
    const info = seq(int(0), subject, spki, attrs);
    out = toPem("CERTIFICATE REQUEST", seq(info, sigAlg, bitStr(await sign(info))));
  } else {
    const serial = crypto.getRandomValues(new Uint8Array(16)); serial[0] &= 0x7f; serial[0] |= 0x01;
    const now = new Date(Math.floor(Date.now() / 1000) * 1000 - 60000);
    const until = new Date(now.getTime() + Math.max(1, f.days || 365) * 864e5);
    const tbs = seq(tlv(0xa0, int(2)), intBytes(serial), sigAlg, subject, seq(timeBytes(now), timeBytes(until)), subject, spki,
      tlv(0xa3, seq(...exts, ext("2.5.29.14", false, octet(ski)))));
    out = toPem("CERTIFICATE", seq(tbs, sigAlg, bitStr(await sign(tbs))));
  }
  return { pem: out, key: toPem("PRIVATE KEY", pkcs8), san };
}
