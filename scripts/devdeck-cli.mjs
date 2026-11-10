#!/usr/bin/env node
// DevDeck on the command line: the everyday tools, offline, reading a file or piped input.
// Usage: npm run cli -- <command> [options] [file]     (or: node scripts/devdeck-cli.mjs …)
import { readFileSync } from "node:fs";
import { createHash, randomUUID, randomInt, getRandomValues } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import yaml from "js-yaml";
import { parse as tomlParse, stringify as tomlStringify } from "smol-toml";
import { pemBlocks, parseAny, fingerprint } from "../src/certs-core.js";

const HELP = `DevDeck CLI — friendly developer tools in your terminal

  json [--min] [file]            Format (or minify) JSON
  yaml2json | json2yaml [file]   Convert between YAML and JSON
  toml2json | json2toml [file]   Convert between TOML and JSON
  base64 [--decode] [file]       Base64 encode / decode
  url [--decode] [text]          URL encode / decode
  hash [md5|sha1|sha256|sha512] [file]   Hash a file or piped text (default sha256)
  uuid [count]                   Random UUIDs (version 4)
  ulid [count]                   Sortable ULIDs
  password [length]              A strong random password (default 20)
  jwt [token]                    Decode a JWT and show when it expires
  cert [file]                    Read a PEM certificate / chain / CSR
  gzip | gunzip [file]           Compress (output as Base64) or unpack

Input comes from the file you name, or from a pipe:  cat data.json | npm run cli -- json`;

const [cmd, ...args] = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const rest = args.filter((a) => !a.startsWith("--"));
const fail = (msg) => { console.error(`Error: ${msg}`); process.exit(1); };
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

// The named file (or the argument itself as text), otherwise everything piped in.
async function bytes(arg) {
  if (arg && arg !== "-") { try { return readFileSync(arg); } catch { return Buffer.from(arg); } }
  if (process.stdin.isTTY) { console.error("Give a file name or pipe some input in.\n"); console.error(HELP); process.exit(1); }
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks);
}
const text = async (arg) => (await bytes(arg)).toString("utf8");

try {
  switch (cmd) {
    case "json": console.log(JSON.stringify(JSON.parse(await text(rest[0])), null, flags.has("--min") ? 0 : 2)); break;
    case "yaml2json": console.log(JSON.stringify(yaml.load(await text(rest[0])), null, 2)); break;
    case "json2yaml": process.stdout.write(yaml.dump(JSON.parse(await text(rest[0])), { lineWidth: -1 })); break;
    case "toml2json": console.log(JSON.stringify(tomlParse(await text(rest[0])), null, 2)); break;
    case "json2toml": process.stdout.write(tomlStringify(JSON.parse(await text(rest[0])))); break;
    case "base64":
      if (flags.has("--decode")) console.log(Buffer.from((await text(rest[0])).trim(), "base64").toString("utf8"));
      else console.log((await bytes(rest[0])).toString("base64"));
      break;
    case "url": {
      const t = (rest.length ? rest.join(" ") : await text()).trim();
      console.log(flags.has("--decode") ? decodeURIComponent(t.replace(/\+/g, " ")) : encodeURIComponent(t));
      break;
    }
    case "hash": {
      const algos = ["md5", "sha1", "sha256", "sha384", "sha512"];
      const algo = algos.includes(rest[0]) ? rest.shift() : "sha256";
      console.log(`${createHash(algo).update(await bytes(rest[0])).digest("hex")}  ${rest[0] || "-"}`);
      break;
    }
    case "uuid": for (let i = 0; i < Math.min(1000, +(rest[0] || 1)); i++) console.log(randomUUID()); break;
    case "ulid":
      for (let i = 0; i < Math.min(1000, +(rest[0] || 1)); i++) {
        let t = Date.now(), s = "";
        for (let k = 0; k < 10; k++) { s = CROCKFORD[t % 32] + s; t = Math.floor(t / 32); }
        console.log(s + Array.from(getRandomValues(new Uint8Array(16)), (b) => CROCKFORD[b & 31]).join(""));
      }
      break;
    case "password": {
      const chars = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*-_=+";
      console.log(Array.from({ length: Math.max(8, +(rest[0] || 20)) }, () => chars[randomInt(chars.length)]).join(""));
      break;
    }
    case "jwt": {
      const tok = (rest[0] || await text()).trim().replace(/^bearer\s+/i, "");
      const [h, p] = tok.split(".");
      if (!p) fail("A JWT has three parts separated by dots.");
      const dec = (s) => JSON.parse(Buffer.from(s, "base64url").toString("utf8"));
      const body = dec(p);
      console.log("Header:", JSON.stringify(dec(h), null, 2));
      console.log("Payload:", JSON.stringify(body, null, 2));
      for (const k of ["iat", "nbf", "exp"]) if (typeof body[k] === "number") console.log(`${k}: ${new Date(body[k] * 1000).toISOString()}`);
      if (typeof body.exp === "number") console.log(body.exp * 1000 < Date.now() ? "Status: EXPIRED" : "Status: still valid");
      console.log("(The signature isn’t checked.)");
      break;
    }
    case "cert": {
      const items = pemBlocks(await text(rest[0])).map(parseAny).filter((x) => x.kind !== "key");
      if (!items.length) fail("No certificate found (expected -----BEGIN CERTIFICATE-----).");
      for (const [i, c] of items.entries()) {
        console.log(`#${i + 1} ${c.kind === "csr" ? "Signing request" : "Certificate"}: ${c.subject.text}`);
        if (c.kind === "certificate") {
          const days = Math.floor((c.notAfter - Date.now()) / 864e5);
          console.log(`   Issued by:   ${c.selfIssued ? "itself (self-signed)" : c.issuer.text}`);
          console.log(`   Valid:       ${c.notBefore.toISOString()} → ${c.notAfter.toISOString()} (${days < 0 ? "EXPIRED" : `${days} days left`})`);
          console.log(`   Serial:      ${c.serial}`);
        }
        if (c.ext.san.length) console.log(`   Names:       ${c.ext.san.map(([t, v]) => (t === "DNS" ? v : `${t}:${v}`)).join(", ")}`);
        console.log(`   Key:         ${c.key.summary}   Signed with: ${c.sigName}`);
        console.log(`   SHA-256:     ${await fingerprint(c.der)}`);
      }
      break;
    }
    case "gzip": console.log(gzipSync(await bytes(rest[0])).toString("base64")); break;
    case "gunzip": {
      const raw = await bytes(rest[0]);
      process.stdout.write(gunzipSync(raw[0] === 0x1f && raw[1] === 0x8b ? raw : Buffer.from(raw.toString().trim(), "base64")));
      break;
    }
    case undefined: case "help": case "--help": case "-h": console.log(HELP); break;
    default: fail(`Unknown command “${cmd}”.\n\n${HELP}`);
  }
} catch (e) { fail(e.message); }
