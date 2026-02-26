/* =========================
  Utils (moved from app.js)
========================= */

const $ = (sel) => document.querySelector(sel);

function parseViewBox(vb) {
  // "0 0 2048 1285"
  const parts = String(vb || "0 0 2048 1285").trim().split(/\s+/).map(Number);
  const [x, y, w, h] = (parts.length >= 4) ? parts : [0, 0, 2048, 1285];
  return { x, y, w, h };
}

function normalizeDigit(s) {
  // 全角数字 → 半角数字
  const t = String(s ?? "").trim().replace(/[０-９]/g, ch =>
    String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)
  );
  return t;
}

function fitHotspotInputFont() {
  document.querySelectorAll(".hi-input").forEach(inp => {
    const h = inp.getBoundingClientRect().height;
    if (!h) return;
    // □の高さの80%を目安（小さすぎ防止で下限16px）
    inp.style.fontSize = Math.max(16, Math.floor(h * 0.8)) + "px";
    inp.style.lineHeight = "1";
  });
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function normalizeText(s) {
  if (s == null) return "";
  return String(s)
    .trim()
    .replace(/\s+/g, "")   // 空白を詰める
    .replace(/　/g, "")    // 全角スペース除去
    .toLowerCase();
}

function isNumericLike(s) {
  return /^[\d\.\-\/\sあまり余り]+$/.test(String(s).trim());
}

/* =========================
  Number parsing
========================= */

function parseRemainder(s) {
  const t = normalizeText(s).replace(/余り/g, "あまり");
  const m = t.match(/^(-?\d+)(あまり)(-?\d+)$/);
  if (!m) return null;
  return { q: parseInt(m[1], 10), r: parseInt(m[3], 10) };
}

function parseNumberValue(s) {
  const t = String(s).trim();
  if (t === "") return null;

  // remainder?
  const rem = parseRemainder(t);
  if (rem) return { kind: "remainder", value: rem };

  // fraction?
  const frac = t.replace(/\s+/g, "").match(/^(-?\d+)\s*\/\s*(-?\d+)$/);
  if (frac) {
    const num = parseInt(frac[1], 10);
    const den = parseInt(frac[2], 10);
    if (den === 0) return null;
    return { kind: "number", value: num / den };
  }

  // decimal / integer
  const n = Number(t);
  if (Number.isFinite(n)) return { kind: "number", value: n };

  return null;
}

function nearlyEqual(a, b, eps = 1e-9) {
  return Math.abs(a - b) <= eps;
}

/* =========================
  HTML escaping
========================= */

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}