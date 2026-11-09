import { useEffect, useMemo, useRef, useState } from "react";
import { Upload, Download, KeySquare, ShieldCheck, ShieldAlert, ExternalLink, Link2, RefreshCw } from "lucide-react";
import { Panel, Options, Segmented, CopyButton, relTime } from "./tools.jsx";
import { takeHandoff, sendTo } from "./handoff.js";
import { navigate } from "./router.jsx";
import { pemBlocks, parseAny, fingerprint, verifySignature, keyMatches, toPem, generate, KEY_CHOICES } from "./certs-core.js";

const SAMPLE = `-----BEGIN CERTIFICATE-----
MIICQDCCAeagAwIBAgIJALzcOV+NoyvRMAoGCCqGSM49BAMCMEYxCzAJBgNVBAYT
Ak5MMRgwFgYDVQQKDA9TYW1wbGUgVHJ1c3QgQ28xHTAbBgNVBAMMFFNhbXBsZSBU
cnVzdCBSb290IENBMB4XDTI2MTEwOTEzMDMxNloXDTM2MDkxNzEzMDMxNlowLjEV
MBMGA1UEAwwMc2hvcC5leGFtcGxlMRUwEwYDVQQKDAxFeGFtcGxlIFNob3AwWTAT
BgcqhkjOPQIBBggqhkjOPQMBBwNCAAQrz4XzLoD97HA8KLxs3EE5rPgA4PdTcs2p
oNYgAbgjpum7gofJ4V5j7v9IuR/IsVum4a+BcU5zcBIDS2LT6z+Qo4HUMIHRMCkG
A1UdEQQiMCCCDHNob3AuZXhhbXBsZYIQd3d3LnNob3AuZXhhbXBsZTATBgNVHSUE
DDAKBggrBgEFBQcDATAOBgNVHQ8BAf8EBAMCB4AwCQYDVR0TBAIwADB0BggrBgEF
BQcBAQRoMGYwLAYIKwYBBQUHMAGGIGh0dHA6Ly9vY3NwLnNhbXBsZS10cnVzdC5l
eGFtcGxlMDYGCCsGAQUFBzAChipodHRwOi8vY2VydHMuc2FtcGxlLXRydXN0LmV4
YW1wbGUvcm9vdC5jcnQwCgYIKoZIzj0EAwIDSAAwRQIhAIqgcQTWzwb3OaemF/9D
maEqtYlqhhfTVn+tojtvXVqwAiBfm04Rb9UBmyHkupEyqV0or+DrC9ZOB7ZIaWIj
ZxwEdQ==
-----END CERTIFICATE-----
-----BEGIN CERTIFICATE-----
MIIBpzCCAUygAwIBAgIJAKasis8oSXErMAoGCCqGSM49BAMCMEYxCzAJBgNVBAYT
Ak5MMRgwFgYDVQQKDA9TYW1wbGUgVHJ1c3QgQ28xHTAbBgNVBAMMFFNhbXBsZSBU
cnVzdCBSb290IENBMB4XDTI2MTEwOTEzMDMxNloXDTM2MTEwNjEzMDMxNlowRjEL
MAkGA1UEBhMCTkwxGDAWBgNVBAoMD1NhbXBsZSBUcnVzdCBDbzEdMBsGA1UEAwwU
U2FtcGxlIFRydXN0IFJvb3QgQ0EwWTATBgcqhkjOPQIBBggqhkjOPQMBBwNCAASn
q93zHuG4KuGlTC6tC025F/Zfpl6zyDxrrz1RPecsHhoIVJxLYhmO/DcFaFlN+Nvt
CEyFWoqyDWpKlFTySCGVoyMwITAPBgNVHRMBAf8EBTADAQH/MA4GA1UdDwEB/wQE
AwIBBjAKBggqhkjOPQQDAgNJADBGAiEApbBzf6gqD94S6Ep1bF1mhTCd9az9/hfx
uu7pdEAH7XsCIQCXZZ7D4PRZFGNEVRnMFV30p8cusQ/Wxa6FPhlDyJc+9A==
-----END CERTIFICATE-----`;

const Result = ({ label, value, copy = true }) => (
  <div className="result"><span className="panel-label">{label}</span><code>{value === "" || value == null ? "—" : value}</code>{copy ? <CopyButton value={String(value ?? "")} /> : <span />}</div>
);
const fmt = (d) => (isNaN(d) ? "—" : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }));
const DAY = 864e5;

function download(name, data, type = "application/x-pem-file") {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const fileBase = (item) => (item.subject.parts.find((p) => p.short === "CN")?.value || "certificate").replace(/[^\w.-]+/g, "_").replace(/^\*/, "wildcard");

// "Valid · 87 days left" style status for a certificate's dates.
export function certStatus(c, now = Date.now()) {
  if (c.kind !== "certificate") return null;
  if (c.notBefore > now) return ["no-badge", `Not valid yet · starts ${relTime(c.notBefore - now)}`];
  if (c.notAfter < now) return ["no-badge", `Expired ${relTime(c.notAfter - now)}`];
  const days = Math.floor((c.notAfter - now) / DAY);
  return [days < 30 ? "warn-badge" : "ok-badge", `Valid · ${days} ${days === 1 ? "day" : "days"} left`];
}
const cn = (name) => name.parts.find((p) => p.short === "CN")?.value || name.parts.find((p) => p.short === "O")?.value || name.text;

/* ======================================================================
   Certificate decoder
   ====================================================================== */
export function CertDecoder() {
  const [text, setText] = useState(() => takeHandoff(SAMPLE));
  const [keyText, setKeyText] = useState("");
  const [host, setHost] = useState("example.com");
  const [extra, setExtra] = useState({});
  const fileRef = useRef(null);

  const { items, err } = useMemo(() => {
    if (!text.trim()) return { items: [], err: "" };
    try {
      const blocks = pemBlocks(text);
      if (!blocks.length) return { items: [], err: "No certificate found. Paste text that starts with -----BEGIN CERTIFICATE----- (or open a .pem / .crt / .cer file)." };
      const items = blocks.map(parseAny).filter((x) => x.kind !== "key");
      if (!items.length) return { items: [], err: "That’s a private key, not a certificate. Paste it in “Does my private key match?” below instead." };
      return { items, err: "" };
    } catch (e) { return { items: [], err: `Couldn’t read this: ${e.message}` }; }
  }, [text]);

  // Fingerprints and signature checks run in the background (they use the browser's crypto).
  useEffect(() => {
    let live = true;
    setExtra({});
    (async () => {
      const out = {};
      for (let i = 0; i < items.length; i++) {
        const c = items[i];
        const next = items[i + 1];
        const signer = c.kind === "csr" ? c : next && next.kind === "certificate" && sameName(c.issuer, next.subject) ? next : c.selfIssued ? c : null;
        out[i] = {
          sha256: await fingerprint(c.der, "SHA-256"),
          sha1: await fingerprint(c.der, "SHA-1"),
          signer: signer === c ? "self" : signer ? i + 1 : null,
          verified: signer ? await verifySignature(c, signer.key) : null,
        };
      }
      if (live) setExtra(out);
    })();
    return () => { live = false; };
  }, [items]);

  const loadFile = async (file) => {
    if (!file) return;
    const buf = new Uint8Array(await file.arrayBuffer());
    // Binary (DER) files start with 0x30; turn them into text so they show up like a pasted certificate.
    if (buf[0] === 0x30) setText(toPem(/csr|req/i.test(file.name) ? "CERTIFICATE REQUEST" : "CERTIFICATE", buf));
    else setText(new TextDecoder().decode(buf));
  };

  const first = items[0];
  const match = first && keyText.trim() ? keyMatches(first.key, keyText) : null;
  const chainOk = items.length > 1 && items.every((c, i) => i === items.length - 1 || c.kind !== "certificate" || sameName(c.issuer, items[i + 1].subject));

  return (
    <>
      <Panel label="Certificate, chain or signing request (PEM)" value={text} onChange={setText} error={err} rows={8}
        extra={<button className="btn ghost" onClick={() => fileRef.current?.click()}><Upload size={16} /> Open file</button>} />
      <input ref={fileRef} type="file" accept=".pem,.crt,.cer,.der,.csr,.req,.txt" hidden onChange={(e) => { loadFile(e.target.files[0]); e.target.value = ""; }} />
      <div className="options-row">
        <span className="muted small">Try:</span>
        <button className="chip" onClick={() => setText(SAMPLE)}>A sample website chain</button>
        <button className="chip" onClick={() => setText(SAMPLE.split(/(?<=-----END CERTIFICATE-----)/)[0].trim())}>Just one certificate</button>
      </div>

      {first && (
        <div className="big-answer cert-answer">
          {first.kind === "csr"
            ? <>Signing request for <strong>{cn(first.subject)}</strong> <span className="muted">· {first.key.summary}</span></>
            : <>
                <strong>{cn(first.subject)}</strong> <span className="muted">· issued by</span> {first.selfIssued ? "itself (self-signed)" : cn(first.issuer)}
                {certStatus(first) && <span className={`badge ${certStatus(first)[0]}`}>{certStatus(first)[1]}</span>}
              </>}
        </div>
      )}

      {items.length > 1 && (
        <div className="panel">
          <div className="panel-head">
            <span className="panel-label">Chain of trust ({items.length} certificates)</span>
            <div className="panel-actions">
              <span className={`badge ${chainOk ? "ok-badge" : "no-badge"}`}>{chainOk ? "Linked up in the right order" : "Out of order or a link is missing"}</span>
            </div>
          </div>
          <ol className="cert-chain">
            {items.map((c, i) => {
              const x = extra[i];
              return (
                <li key={i}>
                  <a href={`#cert-${i}`} className="inline-link">{cn(c.subject)}</a>
                  <span className="muted small"> {i === 0 ? "· your certificate" : c.selfIssued ? "· root" : "· intermediate"}</span>
                  {c.kind === "certificate" && certStatus(c) && <span className={`badge ${certStatus(c)[0]}`}>{certStatus(c)[1]}</span>}
                  {x && x.verified === true && <span className="badge ok-badge">{x.signer === "self" ? "Signed itself" : `Signed by #${x.signer + 1}`} ✓</span>}
                  {x && x.verified === false && <span className="badge no-badge">Signature doesn’t match</span>}
                  {x && x.signer === null && !c.selfIssued && <span className="badge">Issuer not included</span>}
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {items.map((c, i) => <CertCard key={i} c={c} i={i} extra={extra[i]} many={items.length > 1} />)}

      {first && first.kind === "certificate" && (
        <div className="panel">
          <div className="panel-head">
            <span className="panel-label"><KeySquare size={14} /> Does my private key match this certificate?</span>
            <div className="panel-actions">
              {match?.ok === true && <span className="badge ok-badge">Yes, they belong together</span>}
              {match?.ok === false && <span className="badge no-badge">No, a different key</span>}
            </div>
          </div>
          <textarea className="field mono" rows={4} value={keyText} spellCheck={false} onChange={(e) => setKeyText(e.target.value)}
            placeholder="Paste the private key (-----BEGIN PRIVATE KEY----- …). It’s compared right here and never leaves your device." />
          {match?.note && <p className={match.ok === false ? "error" : "muted small"}>{match.note}</p>}
        </div>
      )}

      <div className="panel">
        <span className="panel-label"><Link2 size={14} /> Get a website’s certificate</span>
        <p className="muted small">Browsers don’t let web pages fetch another site’s certificate, so run this in a terminal and paste the result above:</p>
        <div className="options-row">
          <input className="field mono grow-field" value={host} onChange={(e) => setHost(e.target.value.replace(/^https?:\/\//, "").replace(/\/.*$/, ""))} aria-label="Website address" />
        </div>
        <Result label="Command" value={`openssl s_client -connect ${host || "example.com"}:443 -servername ${(host || "example.com").replace(/:\d+$/, "")} -showcerts </dev/null`} />
      </div>
    </>
  );
}

const sameName = (a, b) => a.der.length === b.der.length && a.der.every((x, i) => x === b.der[i]);

function CertCard({ c, i, extra, many }) {
  const isCert = c.kind === "certificate";
  const status = certStatus(c);
  const e = c.ext;
  const label = isCert ? "certificate" : "signing request";
  const pemLabel = isCert ? "CERTIFICATE" : "CERTIFICATE REQUEST";
  return (
    <div className="panel cert-card" id={`cert-${i}`}>
      <div className="panel-head">
        <span className="panel-label">{many ? `#${i + 1} · ` : ""}{isCert ? (c.ext.ca ? "Authority (CA) certificate" : "Certificate") : "Signing request (CSR)"} — {cn(c.subject)}</span>
        <div className="panel-actions">
          {status && <span className={`badge ${status[0]}`}>{status[1]}</span>}
          {isCert && c.selfIssued && <span className="badge">Self-signed</span>}
          <button className="btn ghost" onClick={() => download(`${fileBase(c)}.${isCert ? "pem" : "csr"}`, toPem(pemLabel, c.der))}><Download size={16} /> PEM</button>
          <button className="btn ghost" onClick={() => download(`${fileBase(c)}.${isCert ? "cer" : "der"}`, c.der, "application/pkix-cert")} title={`Binary (DER) ${label}, as used by Windows and Java`}><Download size={16} /> DER</button>
        </div>
      </div>

      {e.san.length > 0 && (
        <div className="cert-names">
          <span className="panel-label">{isCert ? "Works for" : "Asks for"}</span>
          <div className="options-row">{e.san.map(([t, v], k) => <span key={k} className="chip mono-chip" title={t}>{t === "DNS" ? v : `${t}: ${v}`}</span>)}</div>
        </div>
      )}

      <div className="result-list">
        {c.subject.parts.map((p, k) => <Result key={`s${k}`} label={p.label} value={p.value} />)}
        {isCert && <Result label="Issued by" value={c.issuer.text} />}
        {isCert && <Result label="Valid from" value={`${fmt(c.notBefore)} (${relTime(c.notBefore - Date.now())})`} copy={false} />}
        {isCert && <Result label="Valid until" value={`${fmt(c.notAfter)} (${relTime(c.notAfter - Date.now())})`} copy={false} />}
        {isCert && <Result label="Lifetime" value={`${Math.round((c.notAfter - c.notBefore) / DAY)} days`} copy={false} />}
        <Result label="Public key" value={c.key.summary + (c.key.exponent ? ` · exponent ${c.key.exponent}` : "")} copy={false} />
        <Result label="Signed with" value={c.sigName} copy={false} />
        {extra && extra.verified !== null && <Result label="Signature check" value={extra.verified ? `Checks out — signed by ${extra.signer === "self" ? "its own key" : `#${extra.signer + 1} below`}` : "Doesn’t match the issuer’s key"} copy={false} />}
        {isCert && <Result label="Serial number" value={c.serial} />}
        {extra?.sha256 && <Result label="SHA-256 fingerprint" value={extra.sha256} />}
        {extra?.sha1 && <Result label="SHA-1 fingerprint" value={extra.sha1} />}
        {e.keyUsage && <Result label="Key usage" value={e.keyUsage.join(", ")} copy={false} />}
        {e.eku && <Result label="Used for" value={e.eku.join(", ")} copy={false} />}
        {e.ca !== null && <Result label="Can sign other certs" value={e.ca ? `Yes (it’s an authority)${e.pathLen != null ? `, up to ${e.pathLen} level${e.pathLen === 1 ? "" : "s"} below` : ""}` : "No"} copy={false} />}
        {e.policies.length > 0 && <Result label="Policies" value={e.policies.join(", ")} copy={false} />}
        {e.ocsp.length > 0 && <Result label="Revocation check (OCSP)" value={e.ocsp.join("  ")} />}
        {e.crl.length > 0 && <Result label="Revocation list (CRL)" value={e.crl.join("  ")} />}
        {e.caIssuers.length > 0 && <Result label="Issuer’s certificate" value={e.caIssuers.join("  ")} />}
        {e.ski && <Result label="Subject key ID" value={e.ski} />}
        {e.aki && <Result label="Authority key ID" value={e.aki} />}
      </div>
      {isCert && c.version < 3 && <p className="muted small">This is an old-style (version {c.version}) certificate without extensions; modern browsers expect version 3 with “Works for” names.</p>}
      {isCert && !c.ext.ca && e.san.length === 0 && <p className="error">No “Works for” names (SAN): browsers will reject this certificate for a website, even if the common name is right.</p>}
      {/SHA-1 with/.test(c.sigName) && <p className="error">Signed with SHA-1, which browsers no longer trust.</p>}
      {c.key.type === "RSA" && c.key.size < 2048 && <p className="error">RSA keys under 2048 bits are considered too weak.</p>}
      {e.list.length > 0 && (
        <details className="cert-ext">
          <summary className="muted small">All extensions ({e.list.length})</summary>
          <ul className="note-list">{e.list.map((x, k) => <li key={k}>{x.name}{x.critical ? " — critical" : ""}{x.name === x.id ? "" : <span className="muted"> ({x.id})</span>}</li>)}</ul>
        </details>
      )}
    </div>
  );
}

/* ======================================================================
   Certificate / CSR generator
   ====================================================================== */
export function CertGenerator() {
  const [kind, setKind] = useState("self");
  const [keyType, setKeyType] = useState("ec256");
  const [f, setF] = useState({ CN: "localhost", san: "127.0.0.1\n*.localhost", O: "", OU: "", L: "", ST: "", C: "", email: "", days: 365 });
  const [out, setOut] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF((o) => ({ ...o, [k]: k === "days" ? Number(e.target.value) : e.target.value }));
  const sanList = f.san.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
  const problem = !f.CN.trim() ? "Fill in the main name (a domain such as shop.example, or a name for an authority)."
    : f.C && !/^[A-Za-z]{2}$/.test(f.C.trim()) ? "Country must be a two-letter code, such as US, GB or TH."
    : kind !== "csr" && !(f.days >= 1 && f.days <= 36500) ? "Days valid should be between 1 and 36500." : "";

  const run = async () => {
    setBusy(true); setErr("");
    try {
      const r = await generate(kind === "csr" ? "csr" : "self", keyType, { ...f, C: f.C.trim().toUpperCase(), san: kind === "ca" ? [] : sanList, ca: kind === "ca" });
      setOut({ ...r, kind });
    } catch (e) { setErr(e.message || "Couldn’t make the certificate."); }
    setBusy(false);
  };
  // Clear old results when the choices change, so a key never sits next to a certificate it doesn't belong to.
  useEffect(() => { setOut(null); }, [kind, keyType, f]);

  const subj = [["C", f.C.trim().toUpperCase()], ["ST", f.ST], ["L", f.L], ["O", f.O], ["OU", f.OU], ["CN", f.CN]].filter(([, v]) => v?.trim()).map(([k, v]) => `/${k}=${v.trim()}`).join("");
  const sanArg = kind !== "ca" && (sanList.length || f.CN) ? ` -addext "subjectAltName=${[...new Set([f.CN.trim(), ...sanList])].filter(Boolean).map((s) => (/^\d+(\.\d+){3}$/.test(s) ? `IP:${s}` : `DNS:${s}`)).join(",")}"` : "";
  const cmd = kind === "csr"
    ? `openssl req -new ${KEY_CHOICES[keyType].openssl} -nodes -keyout private.key -out request.csr -subj "${subj}"${sanArg}`
    : `openssl req -x509 ${KEY_CHOICES[keyType].openssl} -nodes -keyout private.key -out certificate.pem -days ${f.days} -subj "${subj}"${kind === "ca" ? ` -addext "basicConstraints=critical,CA:TRUE" -addext "keyUsage=critical,keyCertSign,cRLSign"` : sanArg}`;
  const base = (f.CN.trim() || "certificate").replace(/[^\w.-]+/g, "_").replace(/^_+/, "");

  return (
    <>
      <Options>
        <Segmented label="What to make" value={kind} onChange={setKind} options={[["self", "Self-signed certificate"], ["csr", "Signing request (CSR)"], ["ca", "My own authority (CA)"]]} />
        <Segmented label="Key type" value={keyType} onChange={setKeyType} options={Object.entries(KEY_CHOICES).map(([k, v]) => [k, v.label])} />
      </Options>
      <p className="muted small cert-help">
        {kind === "self" && "For testing and local development. Browsers will warn that it isn’t trusted, unless you add it to your computer’s trusted certificates."}
        {kind === "csr" && "Send the signing request to a certificate authority (or your company’s IT) to get a real certificate. Keep the private key: you’ll need it with the certificate they send back."}
        {kind === "ca" && "A private authority for signing your own internal certificates. Anyone holding its key can create certificates your devices trust — keep it safe."}
      </p>
      <div className="panel">
        <span className="panel-label">Details</span>
        <div className="form-grid">
          <label className="form-field"><span>{kind === "ca" ? "Authority name" : "Main domain (common name)"}</span><input className="field mono" value={f.CN} onChange={set("CN")} placeholder={kind === "ca" ? "My Company Root CA" : "shop.example"} /></label>
          {kind !== "ca" && <label className="form-field"><span>Other names it should work for (one per line; domains or IPs)</span><textarea className="field mono" rows={2} value={f.san} onChange={set("san")} placeholder="www.shop.example" /></label>}
          <label className="form-field"><span>Organisation (optional)</span><input className="field" value={f.O} onChange={set("O")} /></label>
          <label className="form-field"><span>Department (optional)</span><input className="field" value={f.OU} onChange={set("OU")} /></label>
          <label className="form-field"><span>City (optional)</span><input className="field" value={f.L} onChange={set("L")} /></label>
          <label className="form-field"><span>State / province (optional)</span><input className="field" value={f.ST} onChange={set("ST")} /></label>
          <label className="form-field"><span>Country code (optional)</span><input className="field" maxLength={2} value={f.C} onChange={set("C")} placeholder="US" /></label>
          {kind !== "csr" && <label className="form-field"><span>Days valid</span><input className="field" type="number" min="1" max="36500" value={f.days} onChange={set("days")} /></label>}
        </div>
        {problem && <p className="error">{problem}</p>}
        <div className="options-row">
          <button className="btn primary" onClick={run} disabled={busy || !!problem}>{busy ? <RefreshCw size={16} className="spin" /> : <ShieldCheck size={16} />} {busy ? "Making the key…" : out ? "Make a new one" : "Make it"}</button>
          <span className="muted small">Made in your browser; nothing is sent anywhere.</span>
        </div>
        {err && <p className="error">{err}</p>}
      </div>
      {out && (
        <>
          <div className="split">
            <Panel label={out.kind === "csr" ? "Signing request (CSR)" : "Certificate"} value={out.pem} readOnly rows={12}
              extra={<>
                <button className="btn ghost" onClick={() => download(`${base}.${out.kind === "csr" ? "csr" : "crt"}`, out.pem)}><Download size={16} /> Download</button>
                <button className="btn ghost" onClick={() => { sendTo("/devops/cert-decoder", out.pem); navigate("/devops/cert-decoder"); }}><ExternalLink size={16} /> Inspect</button>
              </>} />
            <Panel label="Private key — keep this secret" value={out.key} readOnly rows={12}
              extra={<button className="btn ghost" onClick={() => download(`${base}.key`, out.key)}><Download size={16} /> Download</button>} />
          </div>
          <p className="muted small"><ShieldAlert size={14} /> The private key is shown only here. Save it now — it can’t be recovered later.</p>
        </>
      )}
      <div className="panel">
        <span className="panel-label">The same thing with openssl</span>
        <Result label="Command" value={cmd} />
      </div>
    </>
  );
}

// Short summary for Smart Paste.
export function certPreview(text) {
  const c = parseAny(pemBlocks(text)[0]);
  if (c.kind === "csr") return `Signing request for ${cn(c.subject)}\nKey: ${c.key.summary}${c.ext.san.length ? `\nAsks for: ${c.ext.san.map(([, v]) => v).join(", ")}` : ""}`;
  if (c.kind !== "certificate") throw new Error("not a certificate");
  const st = certStatus(c);
  return `${cn(c.subject)} — issued by ${c.selfIssued ? "itself (self-signed)" : cn(c.issuer)}\n${st[1]} (until ${fmt(c.notAfter)})${c.ext.san.length ? `\nWorks for: ${c.ext.san.map(([, v]) => v).join(", ")}` : ""}\nKey: ${c.key.summary}`;
}

export const CERT_VIEWS = {
  "/devops/cert-decoder": CertDecoder,
  "/devops/cert-generator": CertGenerator,
};

