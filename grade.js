/* =========================
  Grading (moved from app.js)
========================= */

function gradeChoice(p, user) {
  const ok = normalizeText(user) === normalizeText(p.answer);
  return { ok, correct: p.answer };
}

function gradeText(p, user) {
  const u = normalizeText(user);

  // allow answer to be string or array of strings
  const answers = Array.isArray(p.answer) ? p.answer : [p.answer];

  // basic normalization matching
  const ok = answers.some(a => normalizeText(a) === u);

  return { ok, correct: answers[0] };
}

function gradeRank(p, user) {
  let u;
  try { u = JSON.parse(String(user)); } catch { u = []; }

  const a = Array.isArray(p.answer) ? p.answer : [];
  if (!Array.isArray(u) || u.length !== a.length) {
    return { ok: false, correct: formatRankCorrect(p) };
  }

  const ok = a.every((ans, i) => normalizeText(u[i]) === normalizeText(ans));
  return { ok, correct: formatRankCorrect(p) };
}

function formatRankCorrect(p) {
  const labels = p.rankLabels || ["1位","2位","3位","4位","5位"];
  const a = Array.isArray(p.answer) ? p.answer : [];
  return labels.map((lab, i) => `${lab}:${a[i] ?? ""}`).join(" / ");
}

function gradeNumber(p, user) {
  const uRaw = String(user ?? "").trim();
  const aRaw = String(p.answer ?? "").trim();

  // remainder form check first
  const uRem = parseRemainder(uRaw);
  const aRem = parseRemainder(aRaw);

  if (aRem) {
    if (!uRem) return { ok: false, correct: aRaw };
    const ok = (uRem.q === aRem.q) && (uRem.r === aRem.r);
    return { ok, correct: aRaw };
  }

  // numeric form
  const u = parseNumberValue(uRaw);
  const a = parseNumberValue(aRaw);

  if (!u || !a) return { ok: false, correct: aRaw };
  if (u.kind !== a.kind) return { ok: false, correct: aRaw };

  if (u.kind === "number") {
    const ok = nearlyEqual(u.value, a.value);
    return { ok, correct: aRaw };
  }

  return { ok: false, correct: aRaw };
}

function gradeHotspotInput(p, user) {
  let u;
  try { u = JSON.parse(String(user)); }
  catch { return { ok: false, correct: "" }; }

  const ans = p.answer || {};
  const fields = p.fields || [];

  const ok = fields.every(f => normalizeDigit(u[f.id]) === normalizeDigit(ans[f.id]));
  const correct = fields.map(f => (ans[f.id] ?? "")).join("");
  return { ok, correct };
}

function gradeHotspot(p, user) {
  let u;
  try { u = JSON.parse(String(user)); }
  catch { return { ok: false, correct: "" }; }

  const a = p.answer || {};

  // 追加：order
  if (p.hsMode === "order") {
    const ua = Array.isArray(u.order) ? u.order : [];
    const aa = Array.isArray(a.order) ? a.order : [];
    const ok = (ua.length === aa.length) && aa.every((v, i) => normalizeText(ua[i]) === normalizeText(v));
    return { ok, correct: aa.join(" → ") };
  }

  // 追加：pair
  if (p.hsMode === "pair") {
    const pair = p.pair || [];
    const keys = pair.map(g => g.key);
    const ok = keys.every(k => normalizeText(u[k]) === normalizeText(a[k]));
    return {
      ok,
      correct: keys.map(k => `${k}:${a[k]}`).join(" / ")
    };
  }

  // 既存：▲/矢印（single or dual）
  if (p.hotspotTarget === "tri") {
    const ok =
      Number(u.triFace) === Number(a.triFace) &&
      String(u.triDir) === String(a.triDir);
    return { ok, correct: formatAnswer(p, JSON.stringify(a)) };
  }

  if (p.hotspotTarget === "arrow") {
    const ok =
      Number(u.arrowFace) === Number(a.arrowFace) &&
      String(u.arrowDir) === String(a.arrowDir);
    return { ok, correct: formatAnswer(p, JSON.stringify(a)) };
  }

  // dual は4項目一致
  const ok =
    Number(u.triFace) === Number(a.triFace) &&
    String(u.triDir) === String(a.triDir) &&
    Number(u.arrowFace) === Number(a.arrowFace) &&
    String(u.arrowDir) === String(a.arrowDir);

  return { ok, correct: formatAnswer(p, JSON.stringify(a)) };
}

function grade(p, user) {
  if (p.type === "choice") return gradeChoice(p, user);
  if (p.type === "text") return gradeText(p, user);
  if (p.type === "number") return gradeNumber(p, user);
  if (p.type === "hotspot") return gradeHotspot(p, user);
  if (p.type === "rank") return gradeRank(p, user);
  if (p.type === "hotspotInput") return gradeHotspotInput(p, user);
  return { ok: false, correct: "" };
}

/* =========================
  Answer formatter (moved)
========================= */

function formatAnswer(p, user) {
  // rank（既存）
  if (p.type === "rank") {
    let u;
    try { u = JSON.parse(String(user)); } catch { u = []; }
    const labels = p.rankLabels || ["1位","2位","3位","4位","5位"];
    return labels.map((lab,i)=>`${lab}:${u[i] ?? ""}`).join(" / ");
  }

  // hotspotInput（追加）: d1,d2... を連結表示（例：71）
  if (p.type === "hotspotInput") {
    let u;
    try { u = JSON.parse(String(user)); } catch { return String(user); }
    const fields = p.fields || [];
    return fields.map(f => (u[f.id] ?? "")).join("");
  }

  // hotspot 以外
  if (p.type !== "hotspot") return String(user);

  // hotspot（JSON）
  let u;
  try { u = JSON.parse(String(user)); }
  catch { return String(user); }

  // order（追加）："A → B → C"
  if (p.hsMode === "order") {
    const arr = Array.isArray(u.order) ? u.order : [];
    return arr.join(" → ");
  }

  // pair（追加）："花:白 / 葉:黄緑"
  if (p.hsMode === "pair") {
    const keyLabel = { flower: "花", leaf: "葉" };
    const pair = p.pair || [];
    const keys = pair.map(g => g.key);
    return keys.map(k => `${keyLabel[k] ?? k}:${u[k] ?? ""}`).join(" / ");
  }

  // 旧：△/矢印（既存）
  const dirText = { up:"上向き", right:"右向き", down:"下向き", left:"左向き" };
  const showDir = (d) => (d ? (dirText[d] ?? d) : "未");

  if (p.hotspotTarget === "tri") {
    return `${showDir(u.triDir)}の△（面${u.triFace}）`;
  }
  if (p.hotspotTarget === "arrow") {
    return `${showDir(u.arrowDir)}の${arrowSymbol(u.arrowDir)}（面${u.arrowFace}）`;
  }
  return `△：面${u.triFace}(${showDir(u.triDir)}) / 矢印：面${u.arrowFace}(${showDir(u.arrowDir)})`;
}

function arrowSymbol(dir) {
  const map = {
    up: "⬆",
    right: "➡",
    down: "⬇",
    left: "⬅"
  };
  return map[dir] || "➡";
}