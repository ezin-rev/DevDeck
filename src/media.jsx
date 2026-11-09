import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Camera, CameraOff, ExternalLink, RotateCw, FlipHorizontal, FlipVertical } from "lucide-react";
import jsQR from "jsqr";
import { Options, Segmented, CopyButton } from "./tools.jsx";
import { sendTo } from "./handoff.js";
import { navigate } from "./router.jsx";
import { download, fmtBytes, FileDrop, Result } from "./shared.jsx";

/* ---------- shared image helpers ---------- */
// The image keeps its object URL so it can also be shown as a preview; the previous one is freed.
let lastUrl = null;
export async function loadImage(file) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  try { await img.decode(); } catch (e) { URL.revokeObjectURL(url); throw e; }
  if (lastUrl) URL.revokeObjectURL(lastUrl);
  lastUrl = url;
  return img;
}
const canvasOf = (w, h) => Object.assign(document.createElement("canvas"), { width: w, height: h });
const toBlob = (canvas, type, quality) => new Promise((res) => canvas.toBlob(res, type, quality));
const baseName = (n) => (n || "image").replace(/\.[^.]+$/, "");

// Is a canvas output format supported by this browser? (Unsupported types fall back to PNG.)
const canEncode = (type) => { try { return canvasOf(1, 1).toDataURL(type).startsWith(`data:${type}`); } catch { return false; } };

// 24-bit BMP, written by hand (browsers can't export BMP from a canvas).
function encodeBmp(canvas) {
  const { width: w, height: h } = canvas;
  const px = canvas.getContext("2d").getImageData(0, 0, w, h).data;
  const row = Math.ceil((w * 3) / 4) * 4, size = 54 + row * h;
  const buf = new ArrayBuffer(size), v = new DataView(buf);
  v.setUint16(0, 0x4d42, true); v.setUint32(2, size, true); v.setUint32(10, 54, true);
  v.setUint32(14, 40, true); v.setInt32(18, w, true); v.setInt32(22, h, true); v.setUint16(26, 1, true); v.setUint16(28, 24, true); v.setUint32(34, row * h, true);
  v.setInt32(38, 2835, true); v.setInt32(42, 2835, true);
  const out = new Uint8Array(buf);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = ((h - 1 - y) * w + x) * 4, d = 54 + y * row + x * 3;
    const a = px[s + 3] / 255; // flatten on white
    out[d] = px[s + 2] * a + 255 * (1 - a); out[d + 1] = px[s + 1] * a + 255 * (1 - a); out[d + 2] = px[s] * a + 255 * (1 - a);
  }
  return new Blob([out], { type: "image/bmp" });
}

/* ======================================================================
   Image converter
   ====================================================================== */
const FORMATS = [["image/png", "PNG", "png"], ["image/jpeg", "JPEG", "jpg"], ["image/webp", "WebP", "webp"], ["image/avif", "AVIF", "avif"], ["image/bmp", "BMP", "bmp"]];

export function ImageConvertTool() {
  const [file, setFile] = useState(null);
  const [img, setImg] = useState(null);
  const [type, setType] = useState("image/webp");
  const [quality, setQuality] = useState(85);
  const [w, setW] = useState(0);
  const [h, setH] = useState(0);
  const [lock, setLock] = useState(true);
  const [rot, setRot] = useState(0);
  const [flip, setFlip] = useState([false, false]);
  const [bg, setBg] = useState("#ffffff");
  const [out, setOut] = useState(null);
  const [err, setErr] = useState("");
  const supported = useMemo(() => FORMATS.filter(([t]) => t === "image/bmp" || canEncode(t)), []);

  const open = async ([f]) => {
    setErr("");
    try { const i = await loadImage(f); setFile(f); setImg(i); setW(i.naturalWidth); setH(i.naturalHeight); setRot(0); setFlip([false, false]); }
    catch { setErr("This file couldn’t be opened as an image (HEIC/TIFF/RAW only open in some browsers)."); }
  };
  // Make the converted image whenever a setting changes.
  useEffect(() => {
    if (!img || !w || !h) return;
    let live = true;
    const t = setTimeout(async () => {
      const turned = rot % 180 !== 0;
      const c = canvasOf(turned ? h : w, turned ? w : h);
      const ctx = c.getContext("2d");
      if (type === "image/jpeg" || type === "image/bmp") { ctx.fillStyle = bg; ctx.fillRect(0, 0, c.width, c.height); }
      ctx.imageSmoothingQuality = "high";
      ctx.translate(c.width / 2, c.height / 2);
      ctx.rotate((rot * Math.PI) / 180);
      ctx.scale(flip[0] ? -1 : 1, flip[1] ? -1 : 1);
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
      const blob = type === "image/bmp" ? encodeBmp(c) : await toBlob(c, type, quality / 100);
      if (!live || !blob) return;
      setOut((old) => { if (old) URL.revokeObjectURL(old.url); return { blob, url: URL.createObjectURL(blob), w: c.width, h: c.height }; });
    }, 150);
    return () => { live = false; clearTimeout(t); };
  }, [img, type, quality, w, h, rot, flip, bg]);

  const setWidth = (v) => { setW(v); if (lock && img) setH(Math.max(1, Math.round((v * img.naturalHeight) / img.naturalWidth))); };
  const setHeight = (v) => { setH(v); if (lock && img) setW(Math.max(1, Math.round((v * img.naturalWidth) / img.naturalHeight))); };
  const ext = FORMATS.find(([t]) => t === type)[2];
  const lossy = ["image/jpeg", "image/webp", "image/avif"].includes(type);
  return (
    <>
      <FileDrop accept="image/*" onFiles={open} title={file ? `${file.name} — ${img?.naturalWidth}×${img?.naturalHeight}, ${fmtBytes(file.size)}` : "Drop an image here, or click to choose one"} hint="PNG, JPEG, WebP, GIF, SVG, AVIF, BMP, ICO — it never leaves your device" />
      {err && <p className="error">{err}</p>}
      {img && <>
        <Options>
          <Segmented label="Convert to" value={type} onChange={setType} options={supported.map(([t, l]) => [t, l])} />
          {lossy && <label className="check">Quality <input type="range" min="10" max="100" value={quality} onChange={(e) => setQuality(+e.target.value)} /> {quality}%</label>}
          {(type === "image/jpeg" || type === "image/bmp") && <label className="check">Background <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} /></label>}
        </Options>
        <div className="options-row">
          <label className="check">Width <input className="field small" type="number" min="1" value={w} onChange={(e) => setWidth(+e.target.value || 1)} /></label>
          <label className="check">Height <input className="field small" type="number" min="1" value={h} onChange={(e) => setHeight(+e.target.value || 1)} /></label>
          <label className="check"><input type="checkbox" checked={lock} onChange={(e) => setLock(e.target.checked)} /> Keep proportions</label>
          {[25, 50, 75, 100].map((p) => <button key={p} className="chip" onClick={() => { setW(Math.round((img.naturalWidth * p) / 100)); setH(Math.round((img.naturalHeight * p) / 100)); }}>{p}%</button>)}
          <button className="btn" onClick={() => setRot((r) => (r + 90) % 360)}><RotateCw size={16} /> Rotate</button>
          <button className={`btn ${flip[0] ? "pressed" : ""}`} onClick={() => setFlip(([a, b]) => [!a, b])}><FlipHorizontal size={16} /> Flip</button>
          <button className={`btn ${flip[1] ? "pressed" : ""}`} onClick={() => setFlip(([a, b]) => [a, !b])}><FlipVertical size={16} /> Flip</button>
        </div>
        {out && (
          <div className="split">
            <div className="panel img-preview"><span className="panel-label">Original · {fmtBytes(file.size)}</span><img src={img.src} alt="Original" /></div>
            <div className="panel img-preview">
              <div className="panel-head">
                <span className="panel-label">{FORMATS.find(([t]) => t === type)[1]} · {out.w}×{out.h} · {fmtBytes(out.blob.size)} {file.size ? `(${Math.round((out.blob.size / file.size) * 100)}%)` : ""}</span>
                <button className="btn primary" onClick={() => download(`${baseName(file.name)}.${ext}`, out.blob)}><Download size={16} /> Download</button>
              </div>
              <img src={out.url} alt="Converted" />
            </div>
          </div>
        )}
      </>}
    </>
  );
}

/* ======================================================================
   PNG compressor: reduce to a colour palette (like TinyPNG) and write an indexed PNG
   ====================================================================== */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (bytes) => { let c = 0xffffffff; for (const b of bytes) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function pngChunk(type, data) {
  const out = new Uint8Array(12 + data.length), v = new DataView(out.buffer);
  v.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  v.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}
const zlib = async (bytes) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate"))).arrayBuffer());

export async function encodeIndexedPng(w, h, idx, palette) {
  const depth = palette.length <= 2 ? 1 : palette.length <= 4 ? 2 : palette.length <= 16 ? 4 : 8;
  const rowBytes = Math.ceil((w * depth) / 8);
  const raw = new Uint8Array((rowBytes + 1) * h);
  for (let y = 0; y < h; y++) {
    const o = y * (rowBytes + 1) + 1; // filter byte 0 (none) works best for palette images
    for (let x = 0; x < w; x++) { const v = idx[y * w + x], bit = x * depth; raw[o + (bit >> 3)] |= v << (8 - depth - (bit & 7)); }
  }
  const ihdr = new Uint8Array(13), dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w); dv.setUint32(4, h); ihdr[8] = depth; ihdr[9] = 3;
  const plte = new Uint8Array(palette.length * 3);
  palette.forEach((c, i) => plte.set(c.slice(0, 3), i * 3));
  let lastAlpha = -1; palette.forEach((c, i) => { if (c[3] < 255) lastAlpha = i; });
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk("IHDR", ihdr), pngChunk("PLTE", plte)];
  if (lastAlpha >= 0) parts.push(pngChunk("tRNS", Uint8Array.from(palette.slice(0, lastAlpha + 1), (c) => c[3])));
  parts.push(pngChunk("IDAT", await zlib(raw)), pngChunk("IEND", new Uint8Array(0)));
  return new Blob(parts, { type: "image/png" });
}

// Median-cut colour reduction on RGBA pixels.
function medianCut(px, maxColors) {
  const total = px.length / 4, step = Math.max(1, Math.floor(total / 200000));
  const samples = [];
  for (let i = 0; i < total; i += step) { const o = i * 4; samples.push(px[o + 3] === 0 ? [0, 0, 0, 0] : [px[o], px[o + 1], px[o + 2], px[o + 3]]); }
  let boxes = [samples];
  const range = (box) => { let best = [0, -1]; for (let ch = 0; ch < 4; ch++) { let lo = 255, hi = 0; for (const s of box) { if (s[ch] < lo) lo = s[ch]; if (s[ch] > hi) hi = s[ch]; } if (hi - lo > best[1]) best = [ch, hi - lo]; } return best; };
  while (boxes.length < maxColors) {
    let pick = -1, score = 0, ch = 0;
    boxes.forEach((b, i) => { if (b.length < 2) return; const [c, r] = range(b); const sc = r * Math.sqrt(b.length); if (sc > score) { score = sc; pick = i; ch = c; } });
    if (pick < 0 || score === 0) break;
    const b = boxes[pick].sort((x, y) => x[ch] - y[ch]);
    const mid = b.length >> 1;
    boxes.splice(pick, 1, b.slice(0, mid), b.slice(mid));
  }
  return boxes.map((b) => { const s = [0, 0, 0, 0]; for (const p of b) for (let k = 0; k < 4; k++) s[k] += p[k]; return s.map((v) => Math.round(v / b.length)); });
}

export function quantize(px, w, h, maxColors, dither) {
  // Exact palette when the image already has few colours (no quality loss).
  const exact = new Map();
  for (let i = 0; i < px.length; i += 4) {
    const k = px[i + 3] === 0 ? 0 : ((px[i] << 24) | (px[i + 1] << 16) | (px[i + 2] << 8) | px[i + 3]) >>> 0;
    if (!exact.has(k)) { if (exact.size >= maxColors) break; exact.set(k, exact.size); }
  }
  const idx = new Uint8Array(w * h);
  if (exact.size <= maxColors && exact.size > 0 && [...exact.keys()].length === exact.size && px.length / 4 === w * h) {
    let complete = true;
    for (let i = 0, p = 0; i < px.length; i += 4, p++) {
      const k = px[i + 3] === 0 ? 0 : ((px[i] << 24) | (px[i + 1] << 16) | (px[i + 2] << 8) | px[i + 3]) >>> 0;
      const v = exact.get(k); if (v === undefined) { complete = false; break; } idx[p] = v;
    }
    if (complete) return { idx, palette: [...exact.keys()].map((k) => (k === 0 ? [0, 0, 0, 0] : [k >>> 24, (k >>> 16) & 255, (k >>> 8) & 255, k & 255])), lossless: true };
  }
  const palette = medianCut(px, maxColors);
  const cache = new Int16Array(1 << 22).fill(-1);
  const nearest = (r, g, b, a) => {
    const key = ((r >> 2) << 16) | ((g >> 2) << 10) | ((b >> 2) << 4) | (a >> 4);
    if (cache[key] >= 0) return cache[key];
    let best = 0, bd = Infinity;
    for (let i = 0; i < palette.length; i++) { const c = palette[i]; const d = (c[0] - r) ** 2 * 2 + (c[1] - g) ** 2 * 4 + (c[2] - b) ** 2 * 3 + (c[3] - a) ** 2 * 3; if (d < bd) { bd = d; best = i; } }
    return (cache[key] = best);
  };
  const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
  if (!dither) { for (let i = 0, p = 0; i < px.length; i += 4, p++) idx[p] = px[i + 3] === 0 ? nearest(0, 0, 0, 0) : nearest(px[i], px[i + 1], px[i + 2], px[i + 3]); }
  else {
    const err = new Float32Array(px.length);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = y * w + x, i = p * 4;
      if (px[i + 3] === 0) { idx[p] = nearest(0, 0, 0, 0); continue; }
      const r = clamp(px[i] + err[i]), g = clamp(px[i + 1] + err[i + 1]), b = clamp(px[i + 2] + err[i + 2]), a = clamp(px[i + 3] + err[i + 3]);
      const n = nearest(r, g, b, a); idx[p] = n;
      const c = palette[n], e = [r - c[0], g - c[1], b - c[2], a - c[3]];
      const spread = (dx, dy, f) => { const xx = x + dx, yy = y + dy; if (xx < 0 || xx >= w || yy >= h) return; const j = (yy * w + xx) * 4; for (let k = 0; k < 4; k++) err[j + k] += e[k] * f * 0.85; };
      spread(1, 0, 7 / 16); spread(-1, 1, 3 / 16); spread(0, 1, 5 / 16); spread(1, 1, 1 / 16);
    }
  }
  return { idx, palette, lossless: false };
}

export function PngCompressTool() {
  const [file, setFile] = useState(null);
  const [img, setImg] = useState(null);
  const [colors, setColors] = useState(128);
  const [dither, setDither] = useState(true);
  const [out, setOut] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const open = async ([f]) => { setErr(""); setOut(null); try { setImg(await loadImage(f)); setFile(f); } catch { setErr("This file couldn’t be opened as an image."); } };
  useEffect(() => {
    if (!img) return;
    let live = true;
    setBusy(true);
    const t = setTimeout(async () => {
      try {
        const w = img.naturalWidth, h = img.naturalHeight;
        if (w * h > 16e6) throw new Error("That image is too big to compress here (over 16 megapixels).");
        const c = canvasOf(w, h), ctx = c.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        const px = ctx.getImageData(0, 0, w, h).data;
        const q = quantize(px, w, h, colors, dither);
        const blob = await encodeIndexedPng(w, h, q.idx, q.palette);
        if (!live) return;
        setOut((old) => { if (old) URL.revokeObjectURL(old.url); return { blob, url: URL.createObjectURL(blob), n: q.palette.length, lossless: q.lossless }; });
      } catch (e) { if (live) setErr(e.message || "Couldn’t compress this image."); }
      if (live) setBusy(false);
    }, 200);
    return () => { live = false; clearTimeout(t); };
  }, [img, colors, dither]);
  const saved = out && file ? 1 - out.blob.size / file.size : 0;
  return (
    <>
      <FileDrop accept="image/png,image/*" onFiles={open} title={file ? `${file.name} — ${img?.naturalWidth}×${img?.naturalHeight}, ${fmtBytes(file.size)}` : "Drop a PNG here, or click to choose one"} hint="Works best for screenshots, icons, logos and illustrations; transparency is kept" />
      {err && <p className="error">{err}</p>}
      {img && <>
        <Options>
          <label className="check">Colours <input type="range" min="2" max="256" value={colors} onChange={(e) => setColors(+e.target.value)} /> <strong>{colors}</strong></label>
          {[16, 64, 128, 256].map((n) => <button key={n} className="chip" onClick={() => setColors(n)}>{n}</button>)}
          <label className="check" title="Mixes nearby colours to hide banding in gradients and photos"><input type="checkbox" checked={dither} onChange={(e) => setDither(e.target.checked)} /> Smooth gradients (dithering)</label>
          {busy && <span className="muted small">Compressing…</span>}
        </Options>
        {out && (
          <>
            <div className="big-answer">
              {saved > 0 ? <>{Math.round(saved * 100)}% smaller</> : <>No smaller — the original is already well compressed</>}
              <span className="muted"> · {fmtBytes(file.size)} → {fmtBytes(out.blob.size)} · {out.n} colours{out.lossless ? " (no quality lost)" : ""}</span>
            </div>
            <div className="split">
              <div className="panel img-preview checker"><span className="panel-label">Original</span><img src={img.src} alt="Original" /></div>
              <div className="panel img-preview checker">
                <div className="panel-head"><span className="panel-label">Compressed</span><button className="btn primary" onClick={() => download(`${baseName(file.name)}-min.png`, out.blob)} title={saved <= 0 ? "Not smaller than the original" : undefined}><Download size={16} /> Download</button></div>
                <img src={out.url} alt="Compressed" />
              </div>
            </div>
          </>
        )}
      </>}
    </>
  );
}

/* ======================================================================
   Colour-blind simulator (Machado, Oliveira & Fernandes 2009 matrices, in linear RGB)
   ====================================================================== */
export const VISION = [
  ["normal", "Typical vision", null, ""],
  ["protanopia", "Protanopia", [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998], "No red cones · about 1% of men"],
  ["deuteranopia", "Deuteranopia", [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881], "No green cones · about 1% of men"],
  ["tritanopia", "Tritanopia", [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039], "No blue cones · rare"],
  ["protanomaly", "Protanomaly", [0.38545, 0.769005, -0.154455, 0.100526, 0.829802, 0.069673, -0.007442, -0.02219, 1.029632], "Weak red · about 1% of men"],
  ["deuteranomaly", "Deuteranomaly", [0.547494, 0.607765, -0.155259, 0.181692, 0.781742, 0.036566, -0.01041, 0.027275, 0.983136], "Weak green · the most common, about 5% of men"],
  ["tritanomaly", "Tritanomaly", [1.104996, -0.046633, -0.058363, -0.032137, 0.971635, 0.060503, 0.001336, 0.317922, 0.680742], "Weak blue · rare"],
  ["achromatopsia", "Achromatopsia", [0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722], "No colour at all · very rare"],
];
const TO_LIN = Float32Array.from({ length: 256 }, (_, i) => { const c = i / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
const toSrgb = (l) => { const v = l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055; return v <= 0 ? 0 : v >= 1 ? 255 : Math.round(v * 255); };
export function simulate([r, g, b], m) {
  if (!m) return [r, g, b];
  const R = TO_LIN[r], G = TO_LIN[g], B = TO_LIN[b];
  return [toSrgb(m[0] * R + m[1] * G + m[2] * B), toSrgb(m[3] * R + m[4] * G + m[5] * B), toSrgb(m[6] * R + m[7] * G + m[8] * B)];
}
const hex = (c) => "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
const parseHex = (s) => { const m = s.trim().replace(/^#/, "").match(/^([0-9a-f]{3}|[0-9a-f]{6})$/i); if (!m) return null; const h = m[1].length === 3 ? m[1].replace(/./g, "$&$&") : m[1]; return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
// Rough perceptual distance (redmean); under ~40 two colours are easy to confuse.
const distance = (a, b) => { const rm = (a[0] + b[0]) / 2; return Math.sqrt((2 + rm / 256) * (a[0] - b[0]) ** 2 + 4 * (a[1] - b[1]) ** 2 + (2 + (255 - rm) / 256) * (a[2] - b[2]) ** 2); };

function drawSample(canvas) {
  const w = 480, h = 300, ctx = canvas.getContext("2d");
  canvas.width = w; canvas.height = h;
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h);
  const cols = ["#e63946", "#2a9d8f", "#f4a261", "#457b9d", "#8ac926", "#9b5de5"];
  const vals = [80, 140, 60, 170, 110, 90];
  ctx.font = "600 14px system-ui, sans-serif"; ctx.fillStyle = "#222"; ctx.fillText("Sales by region (sample chart)", 16, 26);
  vals.forEach((v, i) => { ctx.fillStyle = cols[i]; ctx.fillRect(24 + i * 42, 260 - v, 30, v); });
  let a = -Math.PI / 2; const tot = vals.reduce((s, x) => s + x, 0);
  vals.forEach((v, i) => { ctx.beginPath(); ctx.moveTo(380, 150); ctx.arc(380, 150, 80, a, (a += (v / tot) * Math.PI * 2)); ctx.fillStyle = cols[i]; ctx.fill(); });
  ctx.fillStyle = "#d62828"; ctx.fillText("● Error", 300, 270); ctx.fillStyle = "#2b9348"; ctx.fillText("● Success", 380, 270);
}

export function ColorBlindTool() {
  const [mode, setMode] = useState("image");
  const [src, setSrc] = useState(null);
  const [palette, setPalette] = useState("#d62828, #2b9348, #f77f00, #1d4ed8, #9b5de5, #6c757d");
  const [kind, setKind] = useState("all");
  const base = useRef(null);
  const outs = useRef({});
  const [ready, setReady] = useState(0);
  const open = async ([f]) => { try { const img = await loadImage(f); setSrc(img); } catch { /* not an image */ } };
  useEffect(() => {
    if (mode !== "image") return;
    const c = canvasOf(1, 1);
    if (src) { const scale = Math.min(1, 900 / Math.max(src.naturalWidth, src.naturalHeight)); c.width = Math.round(src.naturalWidth * scale); c.height = Math.round(src.naturalHeight * scale); c.getContext("2d").drawImage(src, 0, 0, c.width, c.height); }
    else drawSample(c);
    base.current = c;
    setReady((n) => n + 1);
  }, [src, mode]);
  useEffect(() => {
    const c = base.current;
    if (!c || mode !== "image") return;
    const data = c.getContext("2d").getImageData(0, 0, c.width, c.height);
    for (const [id, , m] of VISION) {
      const target = outs.current[id];
      if (!target) continue;
      target.width = c.width; target.height = c.height;
      const copy = new ImageData(new Uint8ClampedArray(data.data), c.width, c.height);
      if (m) { const d = copy.data; const memo = new Map(); for (let i = 0; i < d.length; i += 4) { const k = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2]; let v = memo.get(k); if (!v) { v = simulate([d[i], d[i + 1], d[i + 2]], m); if (memo.size < 200000) memo.set(k, v); } d[i] = v[0]; d[i + 1] = v[1]; d[i + 2] = v[2]; } }
      target.getContext("2d").putImageData(copy, 0, 0);
    }
  }, [ready, kind, mode]);
  const shown = VISION.filter(([id]) => kind === "all" ? true : id === "normal" || id === kind);
  const colors = palette.split(/[\s,;]+/).map(parseHex).filter(Boolean);
  return (
    <>
      <Options>
        <Segmented label="Check" value={mode} onChange={setMode} options={[["image", "An image or screenshot"], ["palette", "A set of colours"]]} />
        <label className="check">Show <select className="field small-select" value={kind} onChange={(e) => setKind(e.target.value)}><option value="all">All types</option>{VISION.slice(1).map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select></label>
      </Options>
      {mode === "image" ? <>
        <FileDrop accept="image/*" onFiles={open} title={src ? "Drop another image to check it" : "Drop a screenshot or image (a sample chart is shown until then)"} />
        <div className="vision-grid">
          {shown.map(([id, label, , note]) => (
            <figure key={id} className="panel vision-card">
              <canvas ref={(el) => { outs.current[id] = el; }} />
              <figcaption><strong>{label}</strong>{note && <span className="muted small"> · {note}</span>}</figcaption>
            </figure>
          ))}
        </div>
      </> : <>
        <div className="panel">
          <span className="panel-label">Colours (hex, separated by commas or spaces)</span>
          <input className="field mono" value={palette} onChange={(e) => setPalette(e.target.value)} />
        </div>
        <div className="panel">
          <Table2 colors={colors} shown={shown} />
        </div>
      </>}
      <p className="muted small">Simulations are approximate — everyone’s vision differs. Don’t rely on colour alone: add labels, patterns or icons.</p>
    </>
  );
}
function Table2({ colors, shown }) {
  return (
    <div className="palette-sim">
      {shown.map(([id, label, m]) => {
        const sim = colors.map((c) => simulate(c, m));
        const clashes = [];
        for (let i = 0; i < sim.length; i++) for (let j = i + 1; j < sim.length; j++) if (distance(sim[i], sim[j]) < 40) clashes.push(`${hex(colors[i])} & ${hex(colors[j])}`);
        return (
          <div key={id} className="palette-row">
            <span className="palette-name"><strong>{label}</strong>{clashes.length > 0 && id !== "normal" && <span className="badge warn-badge" title={clashes.join(", ")}>{clashes.length} hard to tell apart</span>}</span>
            <span className="swatches">{sim.map((c, i) => <span key={i} className="swatch" style={{ background: hex(c) }} title={`${hex(colors[i])} looks like ${hex(c)}`} />)}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ======================================================================
   QR code reader (image, pasted screenshot or camera)
   ====================================================================== */
export function describeQr(text) {
  if (/^https?:\/\//i.test(text)) return ["Web link", [["Link", text]]];
  const wifi = text.match(/^WIFI:(.*);;?$/i);
  if (wifi) { const f = Object.fromEntries([...wifi[1].matchAll(/([TSPH]):((?:\\.|[^;])*)/g)].map(([, k, v]) => [k, v.replace(/\\(.)/g, "$1")])); return ["Wi-Fi login", [["Network", f.S], ["Password", f.P || "(none)"], ["Security", f.T || "open"], ["Hidden", f.H === "true" ? "yes" : "no"]]]; }
  if (/^mailto:/i.test(text)) return ["Email", [["To", text.slice(7).split("?")[0]]]];
  if (/^tel:/i.test(text)) return ["Phone number", [["Number", text.slice(4)]]];
  if (/^smsto?:/i.test(text)) return ["Text message", [["To / text", text.replace(/^smsto?:/i, "")]]];
  if (/^BEGIN:VCARD/i.test(text)) { const get = (k) => (text.match(new RegExp(`^${k}[^:]*:(.*)$`, "mi")) || [])[1]; return ["Contact card", [["Name", get("FN")], ["Phone", get("TEL")], ["Email", get("EMAIL")], ["Organisation", get("ORG")]].filter(([, v]) => v)]; }
  if (/^otpauth:\/\//i.test(text)) { try { const u = new URL(text); return ["2-step login (authenticator) setup", [["Account", decodeURIComponent(u.pathname.slice(1))], ["Issuer", u.searchParams.get("issuer")], ["Secret", "hidden — keep it private"]].filter(([, v]) => v)]; } catch { /* fall through */ } }
  if (/^geo:/i.test(text)) return ["Map location", [["Coordinates", text.slice(4)]]];
  return ["Text", []];
}

export function QrReaderTool() {
  const [result, setResult] = useState(null);
  const [err, setErr] = useState("");
  const [cam, setCam] = useState(false);
  const video = useRef(null);
  const readFrom = (source, w, h) => {
    const c = canvasOf(w, h), ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(source, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h);
    return jsQR(d.data, w, h, { inversionAttempts: "attemptBoth" });
  };
  const scanFile = async (f) => {
    setErr(""); setResult(null);
    try {
      const img = await loadImage(f);
      const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
      const code = readFrom(img, Math.round(img.naturalWidth * scale), Math.round(img.naturalHeight * scale)) || (scale < 1 ? null : readFrom(img, img.naturalWidth * 2, img.naturalHeight * 2));
      if (code) setResult(code.data); else setErr("No QR code found in this image. Try a sharper or closer picture.");
    } catch { setErr("That file couldn’t be opened as an image."); }
  };
  // Paste a screenshot anywhere on the page.
  useEffect(() => {
    const onPaste = (e) => { const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/")); if (item) { e.preventDefault(); scanFile(item.getAsFile()); } };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);
  // Camera: look at every frame until a code shows up.
  useEffect(() => {
    if (!cam) return;
    let stream, raf, live = true;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (!live) return stream.getTracks().forEach((t) => t.stop());
        video.current.srcObject = stream; await video.current.play();
        const tick = () => {
          const v = video.current;
          if (!live || !v) return;
          if (v.videoWidth) { const code = readFrom(v, v.videoWidth, v.videoHeight); if (code) { setResult(code.data); setCam(false); return; } }
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch { setErr("The camera couldn’t be opened. Allow camera access, or use a picture instead."); setCam(false); }
    })();
    return () => { live = false; cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); };
  }, [cam]);
  const [kind, fields] = result ? describeQr(result) : [null, []];
  return (
    <>
      <div className="split">
        <FileDrop accept="image/*" onFiles={([f]) => scanFile(f)} title="Drop a picture of a QR code, or click to choose one" hint="You can also paste a screenshot (Ctrl/⌘ + V)" />
        <div className="panel qr-cam">
          {cam ? <video ref={video} muted playsInline /> : <p className="muted small">Point your camera at a QR code.</p>}
          {navigator.mediaDevices?.getUserMedia && <button className="btn" onClick={() => { setErr(""); setCam((c) => !c); }}>{cam ? <><CameraOff size={16} /> Stop camera</> : <><Camera size={16} /> Use camera</>}</button>}
        </div>
      </div>
      {err && <p className="error">{err}</p>}
      {result != null && (
        <div className="panel">
          <div className="panel-head">
            <span className="panel-label">Found: {kind}</span>
            <div className="panel-actions">
              <CopyButton value={result} />
              {/^https?:\/\//i.test(result) && <a className="btn ghost" href={result} target="_blank" rel="noreferrer noopener"><ExternalLink size={16} /> Open link</a>}
              <button className="btn ghost" onClick={() => { sendTo("/power/smart-paste", result); navigate("/power/smart-paste"); }}>Smart Paste</button>
            </div>
          </div>
          <pre className="field mono finding-body">{result}</pre>
          {fields.length > 0 && <div className="result-list">{fields.map(([k, v]) => <Result key={k} label={k} value={v} />)}</div>}
          {/^https?:\/\//i.test(result) && <p className="muted small">Check the address before opening links from QR codes.</p>}
        </div>
      )}
    </>
  );
}

export const MEDIA_VIEWS = {
  "/files/image-convert": ImageConvertTool,
  "/files/png-compress": PngCompressTool,
  "/files/color-blind": ColorBlindTool,
  "/encoders-decoders/qr-reader": QrReaderTool,
};
