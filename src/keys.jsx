import { useState } from "react";
import { KeyRound, Download, ShieldAlert } from "lucide-react";
import { md5 } from "js-md5";
import { Panel, Options, Segmented } from "./tools.jsx";
import { takeHandoff } from "./handoff.js";
import { readNode, toPem, bytesToB64, b64ToBytes, hexColons } from "./certs-core.js";
import { Result, download } from "./shared.jsx";

/* ---------- OpenSSH wire format ---------- */
const enc = (s) => new TextEncoder().encode(s);
const cat = (...p) => { const o = new Uint8Array(p.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of p) { o.set(x, i); i += x.length; } return o; };
const u32 = (n) => new Uint8Array([n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
const sshStr = (b) => cat(u32(b.length), typeof b === "string" ? enc(b) : b);
const mpint = (b) => { let i = 0; while (i < b.length - 1 && b[i] === 0) i++; b = b.subarray(i); return sshStr(b[0] & 0x80 ? cat(new Uint8Array([0]), b) : b); };
const b64u = (s) => b64ToBytes(s);
const subtle = () => (typeof crypto !== "undefined" && crypto.subtle) || null;

export const SSH_TYPES = {
  ed25519: { label: "Ed25519 (recommended)", gen: { name: "Ed25519" }, type: "ssh-ed25519" },
  ecdsa256: { label: "ECDSA P-256", gen: { name: "ECDSA", namedCurve: "P-256" }, type: "ecdsa-sha2-nistp256", curve: "nistp256" },
  ecdsa384: { label: "ECDSA P-384", gen: { name: "ECDSA", namedCurve: "P-384" }, type: "ecdsa-sha2-nistp384", curve: "nistp384" },
  rsa3072: { label: "RSA 3072", gen: { name: "RSASSA-PKCS1-v1_5", modulusLength: 3072, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, type: "ssh-rsa" },
  rsa4096: { label: "RSA 4096", gen: { name: "RSASSA-PKCS1-v1_5", modulusLength: 4096, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, type: "ssh-rsa" },
};

function sshParts(kind, jwk) {
  const t = SSH_TYPES[kind];
  if (t.type === "ssh-ed25519") {
    const pub = b64u(jwk.x), priv = b64u(jwk.d);
    return { pub: cat(sshStr(t.type), sshStr(pub)), priv: cat(sshStr(t.type), sshStr(pub), sshStr(cat(priv, pub))) };
  }
  if (t.type === "ssh-rsa") {
    const [n, e, d, p, q, qi] = ["n", "e", "d", "p", "q", "qi"].map((k) => b64u(jwk[k]));
    return { pub: cat(sshStr(t.type), mpint(e), mpint(n)), priv: cat(sshStr(t.type), mpint(n), mpint(e), mpint(d), mpint(qi), mpint(p), mpint(q)) };
  }
  const Q = cat(new Uint8Array([4]), b64u(jwk.x), b64u(jwk.y));
  return { pub: cat(sshStr(t.type), sshStr(t.curve), sshStr(Q)), priv: cat(sshStr(t.type), sshStr(t.curve), sshStr(Q), mpint(b64u(jwk.d))) };
}

export async function sshFingerprint(blob) {
  const sha = subtle() ? bytesToB64(new Uint8Array(await subtle().digest("SHA-256", blob))).replace(/=+$/, "") : "";
  return { sha256: sha ? `SHA256:${sha}` : "", md5: `MD5:${md5(blob).match(/../g).join(":")}` };
}

export async function generateSsh(kind, comment = "") {
  const s = subtle();
  if (!s) throw new Error("This browser only allows making keys on secure (https) pages.");
  let pair;
  try { pair = await s.generateKey(SSH_TYPES[kind].gen, true, ["sign", "verify"]); }
  catch { throw new Error(kind === "ed25519" ? "This browser can’t make Ed25519 keys yet — choose ECDSA or RSA, or update the browser." : "Couldn’t make the key in this browser."); }
  const jwk = await s.exportKey("jwk", pair.privateKey);
  const { pub, priv } = sshParts(kind, jwk);
  const check = crypto.getRandomValues(new Uint8Array(4));
  let section = cat(check, check, priv, sshStr(comment));
  const pad = (8 - (section.length % 8)) % 8;
  section = cat(section, Uint8Array.from({ length: pad }, (_, i) => i + 1));
  const body = cat(enc("openssh-key-v1\0"), sshStr("none"), sshStr("none"), sshStr(new Uint8Array(0)), u32(1), sshStr(pub), sshStr(section));
  const privateKey = `-----BEGIN OPENSSH PRIVATE KEY-----\n${bytesToB64(body).match(/.{1,70}/g).join("\n")}\n-----END OPENSSH PRIVATE KEY-----\n`;
  const publicKey = `${SSH_TYPES[kind].type} ${bytesToB64(pub)}${comment ? ` ${comment}` : ""}`;
  return { privateKey, publicKey, ...(await sshFingerprint(pub)) };
}

// Read an OpenSSH public key line (also from authorized_keys, with options in front).
export async function inspectSshPublic(line) {
  const toks = line.trim().split(/\s+/);
  const i = toks.findIndex((t) => /^(ssh-|ecdsa-|sk-)/.test(t));
  if (i < 0 || !toks[i + 1]) throw new Error("Paste a public key line that starts with ssh-ed25519, ssh-rsa or ecdsa-sha2-….");
  const blob = b64ToBytes(toks[i + 1]);
  let p = 0;
  const next = () => { const n = (blob[p] << 24) | (blob[p + 1] << 16) | (blob[p + 2] << 8) | blob[p + 3]; const v = blob.subarray(p + 4, p + 4 + n); p += 4 + n; return v; };
  const type = new TextDecoder().decode(next());
  if (type !== toks[i]) throw new Error(`The key data says ${type}, but the line says ${toks[i]}.`);
  let bits = "";
  if (type === "ssh-rsa") { next(); const n = next(); let k = 0; while (n[k] === 0) k++; bits = (n.length - k) * 8 - Math.clz32(n[k]) + 24; }
  else if (type.includes("ed25519")) bits = 256;
  else { const curve = new TextDecoder().decode(next()); bits = { nistp256: 256, nistp384: 384, nistp521: 521 }[curve] || ""; }
  return { type, bits, comment: toks.slice(i + 2).join(" "), options: toks.slice(0, i).join(" "), ...(await sshFingerprint(blob)) };
}

export function SshKeyTool() {
  const [kind, setKind] = useState("ed25519");
  const [comment, setComment] = useState("me@laptop");
  const [out, setOut] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [line, setLine] = useState(() => takeHandoff(""));
  const [info, setInfo] = useState(null);
  const run = async () => { setBusy(true); setErr(""); try { setOut(await generateSsh(kind, comment.trim())); } catch (e) { setErr(e.message); } setBusy(false); };
  const inspect = async (v) => { setLine(v); if (!v.trim()) return setInfo(null); try { setInfo(await inspectSshPublic(v)); } catch (e) { setInfo({ err: e.message }); } };
  const file = kind === "ed25519" ? "id_ed25519" : kind.startsWith("ecdsa") ? "id_ecdsa" : "id_rsa";
  return (
    <>
      <Options>
        <Segmented label="Key type" value={kind} onChange={(k) => { setKind(k); setOut(null); }} options={Object.entries(SSH_TYPES).map(([k, v]) => [k, v.label])} />
        <label className="check">Comment <input className="field small wide-small" value={comment} onChange={(e) => setComment(e.target.value)} /></label>
        <button className="btn primary" onClick={run} disabled={busy}><KeyRound size={16} /> {busy ? "Making…" : out ? "Make a new pair" : "Make a key pair"}</button>
      </Options>
      {err && <p className="error">{err}</p>}
      {out && <>
        <div className="result-list">
          <Result label="Public key (share this)" value={out.publicKey} />
          <Result label="Fingerprint" value={out.sha256} />
        </div>
        <div className="split">
          <Panel label={`Public key — ${file}.pub`} value={out.publicKey + "\n"} readOnly rows={5} extra={<button className="btn ghost" onClick={() => download(`${file}.pub`, out.publicKey + "\n")}><Download size={16} /> Download</button>} />
          <Panel label={`Private key — ${file} (keep it secret)`} value={out.privateKey} readOnly rows={10} extra={<button className="btn ghost" onClick={() => download(file, out.privateKey)}><Download size={16} /> Download</button>} />
        </div>
        <div className="panel">
          <span className="panel-label"><ShieldAlert size={14} /> Next steps</span>
          <ol className="note-list">
            <li>Save both files in <code>~/.ssh/</code> and protect the private one: <code>chmod 600 ~/.ssh/{file}</code></li>
            <li>The private key has no passphrase. Add one with <code>ssh-keygen -p -f ~/.ssh/{file}</code></li>
            <li>Put the public key on the server: <code>ssh-copy-id -i ~/.ssh/{file}.pub user@server</code>, or paste it into GitHub/GitLab → SSH keys.</li>
          </ol>
          <Result label="Same with ssh-keygen" value={`ssh-keygen -t ${kind === "ed25519" ? "ed25519" : kind.startsWith("ecdsa") ? `ecdsa -b ${kind.slice(5)}` : `rsa -b ${kind.slice(3)}`} -C "${comment}" -f ~/.ssh/${file}`} />
        </div>
      </>}
      <div className="panel">
        <span className="panel-label">Check a public key (or an authorized_keys line)</span>
        <textarea className={`field mono ${info?.err ? "has-error" : ""}`} rows={3} value={line} onChange={(e) => inspect(e.target.value)} placeholder="ssh-ed25519 AAAAC3Nza… me@laptop" spellCheck={false} />
        {info?.err && <p className="error">{info.err}</p>}
        {info && !info.err && <div className="result-list">
          <Result label="Type" value={`${info.type}${info.bits ? ` · ${info.bits} bits` : ""}`} copy={false} />
          <Result label="Fingerprint" value={info.sha256} />
          <Result label="Old-style fingerprint" value={info.md5} />
          {info.comment && <Result label="Comment" value={info.comment} />}
          {info.options && <Result label="Options" value={info.options} />}
        </div>}
        {info?.type === "ssh-rsa" && info.bits < 2048 && <p className="error">RSA keys under 2048 bits are too weak — make a new Ed25519 key.</p>}
      </div>
    </>
  );
}

/* ======================================================================
   RSA key pair generator (PEM, PKCS#1, JWK, OpenSSH)
   ====================================================================== */
export function RsaTool() {
  const [bits, setBits] = useState(2048);
  const [use, setUse] = useState("sign");
  const [out, setOut] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [fmt, setFmt] = useState("pem");
  const run = async () => {
    setBusy(true); setErr("");
    try {
      const s = subtle();
      if (!s) throw new Error("This browser only allows making keys on secure (https) pages.");
      const alg = use === "sign" ? { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" } : { name: "RSA-OAEP", hash: "SHA-256" };
      const pair = await s.generateKey({ ...alg, modulusLength: bits, publicExponent: new Uint8Array([1, 0, 1]) }, true, use === "sign" ? ["sign", "verify"] : ["encrypt", "decrypt"]);
      const pkcs8 = new Uint8Array(await s.exportKey("pkcs8", pair.privateKey));
      const spki = new Uint8Array(await s.exportKey("spki", pair.publicKey));
      const p8 = readNode(pkcs8), sp = readNode(spki);
      const pkcs1 = pkcs8.subarray(p8.kids[2].body, p8.kids[2].end);
      const pub1 = spki.subarray(sp.kids[1].body + 1, sp.kids[1].end);
      const jwkPriv = await s.exportKey("jwk", pair.privateKey), jwkPub = await s.exportKey("jwk", pair.publicKey);
      const [n, e] = [b64u(jwkPub.n), b64u(jwkPub.e)];
      const sshPub = `ssh-rsa ${bytesToB64(cat(sshStr("ssh-rsa"), mpint(e), mpint(n)))}`;
      setOut({
        pem: [toPem("PRIVATE KEY", pkcs8), toPem("PUBLIC KEY", spki)],
        pkcs1: [toPem("RSA PRIVATE KEY", pkcs1), toPem("RSA PUBLIC KEY", pub1)],
        jwk: [JSON.stringify({ ...jwkPriv, kid: undefined }, null, 2), JSON.stringify(jwkPub, null, 2)],
        ssh: ["(OpenSSH private keys: use the SSH Key Generator)", sshPub],
        fp: hexColons(new Uint8Array(await s.digest("SHA-256", spki))),
      });
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const labels = { pem: ["Private key (PKCS#8 PEM)", "Public key (SPKI PEM)"], pkcs1: ["Private key (PKCS#1, “RSA PRIVATE KEY”)", "Public key (PKCS#1)"], jwk: ["Private key (JWK)", "Public key (JWK)"], ssh: ["Private key", "Public key (OpenSSH)"] };
  const names = { pem: ["private.pem", "public.pem"], pkcs1: ["private-rsa.pem", "public-rsa.pem"], jwk: ["private.jwk.json", "public.jwk.json"], ssh: ["", "id_rsa.pub"] };
  return (
    <>
      <Options>
        <Segmented label="Size" value={bits} onChange={(b) => { setBits(b); setOut(null); }} options={[[1024, "1024 (weak)"], [2048, "2048"], [3072, "3072"], [4096, "4096 (slow)"]]} />
        <Segmented label="Use" value={use} onChange={(u) => { setUse(u); setOut(null); }} options={[["sign", "Signing (RS256)"], ["encrypt", "Encryption (RSA-OAEP)"]]} />
        <button className="btn primary" onClick={run} disabled={busy}><KeyRound size={16} /> {busy ? "Making the key…" : out ? "Make a new pair" : "Make a key pair"}</button>
      </Options>
      {bits === 1024 && <p className="error">1024-bit RSA keys can be broken — only use them for old systems that need them.</p>}
      {err && <p className="error">{err}</p>}
      {out && <>
        <div className="options-row"><Segmented label="Format" value={fmt} onChange={setFmt} options={[["pem", "PEM (PKCS#8)"], ["pkcs1", "PEM (PKCS#1)"], ["jwk", "JWK"], ["ssh", "OpenSSH"]]} /><span className="muted small">Key fingerprint (SHA-256): <code>{out.fp}</code></span></div>
        <div className="split">
          <Panel label={labels[fmt][1]} value={out[fmt][1]} readOnly rows={10} extra={<button className="btn ghost" onClick={() => download(names[fmt][1], out[fmt][1])}><Download size={16} /> Download</button>} />
          <Panel label={`${labels[fmt][0]} — keep it secret`} value={out[fmt][0]} readOnly rows={10} extra={fmt !== "ssh" && <button className="btn ghost" onClick={() => download(names[fmt][0], out[fmt][0])}><Download size={16} /> Download</button>} />
        </div>
        <p className="muted small">Made in your browser with Web Crypto — nothing is sent anywhere. The private key isn’t password-protected; with openssl: <code>openssl pkey -in private.pem -aes256 -out private-locked.pem</code></p>
      </>}
    </>
  );
}

export const KEY_VIEWS = {
  "/generators/ssh-key": SshKeyTool,
  "/generators/rsa": RsaTool,
};

