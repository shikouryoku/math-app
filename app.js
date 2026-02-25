/* =========================
  Utility
========================= */
const $ = (sel) => document.querySelector(sel);

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
    .replace(/\s+/g, "")          // 空白を詰める
    .replace(/　/g, "")           // 全角スペース除去
    .toLowerCase();
}

function isNumericLike(s) {
  return /^[\d\.\-\/\sあまり余り]+$/.test(String(s).trim());
}

/* =========================
  Number parsing:
  - supports integer/decimal:  "12", "-3.5"
  - fraction: "3/4"
  - remainder: "8あまり3" / "8 余り 3"
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
  State / Storage
========================= */

const STORAGE_KEY = "math_app_history_v1";

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {
      sessions: 0,
      totalAnswered: 0,
      totalCorrect: 0
    };
  } catch {
    return { sessions: 0, totalAnswered: 0, totalCorrect: 0 };
  }
}

function saveHistory(h) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(h));
}

function resetHistory() {
  localStorage.removeItem(STORAGE_KEY);
}

// Hotspot answer temp (current question only)
let hotspotState = null;
// { triFace:null|number, triDir:null|"up"|"right"|"down"|"left", arrowFace:null|number, arrowDir:null|"up"|"right"|"down"|"left" }
/* =========================
  App
========================= */
let DB = null;

let quiz = {
  mode: "normal", // normal or review
  list: [],
  idx: 0,
  correct: 0,
  answered: 0,
  wrong: [], // store problem ids
  details: [] // {id, ok, user, correct}
};

async function init() {
  // Load problems
  DB = await fetch("./data/index.json").then(r => r.json());

  // Populate selects
  const levelSelect = $("#levelSelect");
  const topicSelect = $("#topicSelect");

  levelSelect.innerHTML = DB.levels.map(l => `<option value="${l.id}">${l.name}</option>`).join("");

  topicSelect.innerHTML =
    `<option value="__all__">すべて</option>` +
    DB.topics.map(t => `<option value="${t.id}">${t.name}</option>`).join("");

  // History box
  refreshHistoryBox();

  // Buttons
  $("#startBtn").addEventListener("click", startQuiz);
  $("#resetHistoryBtn").addEventListener("click", () => {
    if (confirm("履歴をリセットしますか？")) {
      resetHistory();
      refreshHistoryBox();
    }
  });

  $("#checkBtn").addEventListener("click", checkAnswer);
  $("#nextBtn").addEventListener("click", nextQuestion);
  $("#quitBtn").addEventListener("click", quitQuiz);

  $("#backToSetupBtn").addEventListener("click", () => {
    showScreen("setup");
  });

  $("#reviewBtn").addEventListener("click", startReview);

  // PWA register
  registerSW();
  setPwaStatus();
}

function refreshHistoryBox() {
  const h = loadHistory();
  const rate = h.totalAnswered ? Math.round((h.totalCorrect / h.totalAnswered) * 100) : 0;
  $("#historyBox").textContent =
    `累計：${h.sessions}回 / 解答：${h.totalAnswered}問 / 正解：${h.totalCorrect}問（正答率 ${rate}%）`;
}

function showScreen(name) {
  $("#screen-setup").classList.toggle("hidden", name !== "setup");
  $("#screen-quiz").classList.toggle("hidden", name !== "quiz");
  $("#screen-result").classList.toggle("hidden", name !== "result");
}

async function startQuiz() {
  const level = $("#levelSelect").value;
  const topic = $("#topicSelect").value;
  const countMajors = parseInt($("#countSelect").value, 10); // 大問数

  const files = DB.majorFiles || [];
  if (!files.length) {
    alert("問題ファイル一覧（data/index.json の majorFiles）が空です。");
    return;
  }

  // いったん全ファイルのメタ（level/topic）を見る必要があるので、
  // 最初は“全読み”してフィルタします（将来はメタだけ index.json に持たせて高速化可）
  const allMajors = [];
  for (const path of files) {
    try {
      const m = await fetch("./" + path.replace(/^\.\//, "")).then(r => r.json());
      m.__path = path; // デバッグ用
      allMajors.push(m);
    } catch (e) {
      console.error("Failed to load:", path, e);
    }
  }

  const pool = allMajors.filter(m => {
    if (m.level !== level) return false;
    if (topic !== "__all__" && m.topic !== topic) return false;
    return (m.items || []).length > 0;
  });

  if (!pool.length) {
    alert("条件に合う大問がありません（level/topic）。");
    return;
  }

  const pickedMajors = shuffle(pool).slice(0, Math.min(countMajors, pool.length));

  const flat = [];
  pickedMajors.forEach((m, majorPos) => {
    (m.items || []).forEach((it, subIdx) => {
      flat.push({
        ...it,
        majorId: m.id,
        majorTitle: m.title,
        majorIntro: m.intro || "",
        majorPos: majorPos + 1,
        majorCount: pickedMajors.length,
        subPos: subIdx + 1,
        subCount: m.items.length,
        level: m.level,
        topic: m.topic,
        image: it.image ?? m.image ?? null
      });
    });
  });

  quiz = {
    mode: "normal",
    majors: pickedMajors.map(m => ({ id: m.id, title: m.title })),
    list: flat,
    idx: 0,
    correct: 0,
    answered: 0,
    wrong: [],
    details: []
  };

  showScreen("quiz");
  renderQuestion();
}

function startReview() {
  if (!quiz.wrong.length) return;
  const pool = quiz.wrong
    .map(id => quiz.list.find(p => p.id === id))
    .filter(Boolean);

  quiz = {
    mode: "review",
    list: shuffle(pool),
    idx: 0,
    correct: 0,
    answered: 0,
    wrong: [],
    details: []
  };

  showScreen("quiz");
  renderQuestion();
}

function quitQuiz() {
  if (confirm("中断して設定画面へ戻りますか？")) {
    showScreen("setup");
  }
}

function currentProblem() {
  return quiz.list[quiz.idx];
}

function renderQuestion() {
  const p = currentProblem();

  // Top
  $("#progressText").textContent =  `大問 ${p.majorPos}/${p.majorCount} ${p.majorTitle}  小問 ${p.subPos}/${p.subCount}` +  (quiz.mode === "review" ? "（復習）" : "");
  $("#scoreText").textContent = `正解 ${quiz.correct} / 解答 ${quiz.answered}`;
// Major intro (大問リード文を常に表示)
const introEl = $("#majorIntro");
const introText = p.majorIntro || "";
introEl.classList.toggle("hidden", !introText);
introEl.textContent = introText;
  // Meta
  const levelName = DB.levels.find(l => l.id === p.level)?.name ?? p.level;
  const topicName = DB.topics.find(t => t.id === p.topic)?.name ?? p.topic;
  $("#qMeta").textContent = `${levelName} / ${topicName} / ${p.majorTitle} ${p.label || ""} / ${p.type}`;

  // Prompt
  $("#qPrompt").textContent = p.prompt ?? "";

// Image
const hasImage = !!p.image;

// hotspot の場合は上部画像を表示しない
const showTopImage = hasImage && p.type !== "hotspot";

$("#qImageWrap").classList.toggle("hidden", !showTopImage);
if (showTopImage) $("#qImage").src = p.image;

  // Answer UI
  const area = $("#answerArea");
  area.innerHTML = "";

  if (p.type === "choice") {
    const wrap = document.createElement("div");
    wrap.className = "choice-list";
    const name = "choice_" + p.id;
    const shownChoices = shuffle(p.choices || []);
shownChoices.forEach((c) => {
  const label = document.createElement("label");
  label.className = "choice-item";
  label.innerHTML = `
    <input type="radio" name="${name}" value="${c}">
    <div>${c}</div>
  `;
  wrap.appendChild(label);
});
    area.appendChild(wrap);
  } else if (p.type === "number") {
    const input = document.createElement("input");
    input.type = "text";
    input.id = "answerInput";
    input.placeholder = "答えを入力（例：12 / 0.75 / 3/4 / 8あまり3）";
    input.autocomplete = "off";
    input.inputMode = "decimal";
    area.appendChild(input);
  } else if (p.type === "text") {
    const input = document.createElement("input");
    input.type = "text";
    input.id = "answerInput";
    input.placeholder = "答えを入力（例：ひろしさん）";
    input.autocomplete = "off";
    area.appendChild(input);
  } else if (p.type === "rank") {
    const labels = p.rankLabels || ["1位","2位","3位","4位","5位"];

    const wrap = document.createElement("div");
    wrap.className = "rank-wrap";

    labels.forEach((lab, i) => {
      const row = document.createElement("div");
      row.className = "rank-row";
      row.innerHTML = `
        <label class="rank-label">${lab}</label>
        <input type="text" class="rank-input" id="rank_${p.id}_${i}" autocomplete="off" placeholder="名前">
      `;
      wrap.appendChild(row);
    });

    area.appendChild(wrap);
  } else if (p.type === "hotspot") {
    // Supports:
    //  - dual (▲ + 矢印): p.answer has triFace/triDir + arrowFace/arrowDir
    //  - single: set p.hotspotTarget = "tri" or "arrow" and p.answer has only that pair
    const target = p.hotspotTarget || "dual"; // "tri" | "arrow" | "dual"
    const isDual = target === "dual";

    // state (current question only)
    hotspotState = {
      triFace: null, triDir: null,
      arrowFace: null, arrowDir: null
    };

    let active = (target === "arrow") ? "arrow" : "tri"; // which symbol the UI is currently editing

    // UI
    area.innerHTML = `
      <div class="hs-panel">
        <div class="hs-row">
          <span class="hs-label">いま選択中：</span>
          <button type="button" class="hs-toggle ${active === "tri" ? "is-active" : ""}" data-active="tri">▲</button>
          <button type="button" class="hs-toggle ${active === "arrow" ? "is-active" : ""}" data-active="arrow">矢印</button>
          <button type="button" class="hs-reset" data-action="resetAll">全消去</button>
        </div>
        <div class="hs-status" id="hsStatus"></div>
      </div>

      <div class="hs-wrap">
        <img class="hs-img" src="${p.image}" alt="展開図">
        <svg class="hs-svg" viewBox="${p.viewBox || "0 0 2048 1285"}" preserveAspectRatio="none"></svg>
      </div>

      <div class="hs-panel">
        <div class="hs-row">
          <span class="hs-label">向き：</span>
          <button type="button" class="hs-dir" data-dir="up">上</button>
          <button type="button" class="hs-dir" data-dir="right">右</button>
          <button type="button" class="hs-dir" data-dir="down">下</button>
          <button type="button" class="hs-dir" data-dir="left">左</button>
          <button type="button" class="hs-reset" data-action="resetActive">選択中だけ消去</button>
        </div>
      </div>
    `;

    // If single-target question, hide toggles and lock active
    if (!isDual) {
      const other = active === "tri" ? "arrow" : "tri";
      area.querySelectorAll(`.hs-toggle[data-active="${other}"]`).forEach(b => b.classList.add("hidden"));
      // Also hide the label "いま選択中" to reduce clutter
      const lbl = area.querySelector(".hs-label");
      if (lbl) lbl.textContent = "入力：";
    }

    const svg = area.querySelector(".hs-svg");
    const statusEl = area.querySelector("#hsStatus");

    // face map for overlay placement
    const faceMap = new Map();
    (p.faces || []).forEach(f => faceMap.set(Number(f.id), f));

    // Draw face rects + labels
    (p.faces || []).forEach(f => {
      const r = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      r.setAttribute("data-face", String(f.id));
      r.setAttribute("x", String(f.x));
      r.setAttribute("y", String(f.y));
      r.setAttribute("width", String(f.w));
      r.setAttribute("height", String(f.h));
      r.setAttribute("rx", "6");
      svg.appendChild(r);

      if (f.label) {
        const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
        t.setAttribute("x", String(f.x + 14));
        t.setAttribute("y", String(f.y + 28));
        t.setAttribute("class", "hs-label-on");
        t.textContent = f.label;
        svg.appendChild(t);
      }
    });

    // Overlay symbols (triangle + arrow) — drawn on top of selected faces
    const gTri = document.createElementNS("http://www.w3.org/2000/svg", "g");
    gTri.setAttribute("class", "hs-ov hs-ov-tri");
    const triPoly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    triPoly.setAttribute("points", "0,-1 0.866,0.5 -0.866,0.5"); // unit triangle (up)
    gTri.appendChild(triPoly);

    const gArr = document.createElementNS("http://www.w3.org/2000/svg", "g");
    gArr.setAttribute("class", "hs-ov hs-ov-arrow");
    const arrPoly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    // unit arrow (up): head at top, tail down
    arrPoly.setAttribute("points", "0,-1 0.55,-0.15 0.2,-0.15 0.2,1 -0.2,1 -0.2,-0.15 -0.55,-0.15");
    gArr.appendChild(arrPoly);

    svg.appendChild(gTri);
    svg.appendChild(gArr);

    function dirToAngle(d) {
      if (d === "right") return 90;
      if (d === "down") return 180;
      if (d === "left") return 270;
      return 0; // up / default
    }

    function placeOverlay(kind, faceId, dir) {
      const g = (kind === "tri") ? gTri : gArr;
      if (faceId == null) {
        g.setAttribute("visibility", "hidden");
        return;
      }
      const f = faceMap.get(Number(faceId));
      if (!f) {
        g.setAttribute("visibility", "hidden");
        return;
      }
      const cx = Number(f.x) + Number(f.w) / 2;
      const cy = Number(f.y) + Number(f.h) / 2;
      const scale = Math.min(Number(f.w), Number(f.h)) * 0.32; // visual size
      const ang = dirToAngle(dir);
      g.setAttribute("visibility", "visible");
      g.setAttribute("transform", `translate(${cx} ${cy}) rotate(${ang}) scale(${scale})`);
    }

    const faceEls = [...svg.querySelectorAll("[data-face]")];

    function updateToggleUI() {
      if (!isDual) return;
      area.querySelectorAll(".hs-toggle").forEach(b => {
        b.classList.toggle("is-active", b.dataset.active === active);
      });
    }

    function updateHighlight() {
      // Face highlight
      faceEls.forEach(el => el.classList.remove("hs-tri", "hs-arrow"));
      if (hotspotState.triFace != null) svg.querySelector(`[data-face="${hotspotState.triFace}"]`)?.classList.add("hs-tri");
      if (hotspotState.arrowFace != null) svg.querySelector(`[data-face="${hotspotState.arrowFace}"]`)?.classList.add("hs-arrow");

      // Direction button highlight (active target only)
      const curDir = (active === "tri") ? hotspotState.triDir : hotspotState.arrowDir;
      area.querySelectorAll(".hs-dir").forEach(b => {
        b.classList.toggle("is-selected", b.dataset.dir === curDir);
      });

      // Overlay drawing
      placeOverlay("tri", hotspotState.triFace, hotspotState.triDir);
      placeOverlay("arrow", hotspotState.arrowFace, hotspotState.arrowDir);

      // Status text
      if (isDual) {
        const triOk = hotspotState.triFace != null && hotspotState.triDir != null;
        const arrOk = hotspotState.arrowFace != null && hotspotState.arrowDir != null;
        statusEl.textContent =
          `▲：面=${hotspotState.triFace ?? "未"} / 向き=${hotspotState.triDir ?? "未"}　` +
          `矢印：面=${hotspotState.arrowFace ?? "未"} / 向き=${hotspotState.arrowDir ?? "未"}　` +
          `（${(triOk && arrOk) ? "採点できます" : "まだ未入力があります"}）`;
      } else if (active === "tri") {
        const ok = hotspotState.triFace != null && hotspotState.triDir != null;
        statusEl.textContent =
          `▲：面=${hotspotState.triFace ?? "未"} / 向き=${hotspotState.triDir ?? "未"}（${ok ? "採点できます" : "まだ未入力があります"}）`;
      } else {
        const ok = hotspotState.arrowFace != null && hotspotState.arrowDir != null;
        statusEl.textContent =
          `矢印：面=${hotspotState.arrowFace ?? "未"} / 向き=${hotspotState.arrowDir ?? "未"}（${ok ? "採点できます" : "まだ未入力があります"}）`;
      }
    }

    // Click delegation (buttons)
    area.onclick = (e) => {
      const t = e.target;

      // toggle active (dual only)
      if (t?.matches?.(".hs-toggle") && isDual) {
        active = t.dataset.active;
        updateToggleUI();
        updateHighlight();
        return;
      }

      // direction
      if (t?.matches?.(".hs-dir")) {
        const dir = t.dataset.dir;
        if (active === "tri") hotspotState.triDir = dir;
        else hotspotState.arrowDir = dir;
        updateHighlight();
        return;
      }

      // reset
      if (t?.matches?.(".hs-reset")) {
        const act = t.dataset.action;
        if (act === "resetAll") {
          hotspotState = { triFace: null, triDir: null, arrowFace: null, arrowDir: null };
        } else if (act === "resetActive") {
          if (active === "tri") { hotspotState.triFace = null; hotspotState.triDir = null; }
          else { hotspotState.arrowFace = null; hotspotState.arrowDir = null; }
        }
        updateHighlight();
        return;
      }
    };

    // Face selection
    faceEls.forEach(el => {
      el.addEventListener("pointerdown", () => {
        const face = Number(el.getAttribute("data-face"));
        if (active === "tri") hotspotState.triFace = face;
        else hotspotState.arrowFace = face;
        updateHighlight();
      });
    });

    updateToggleUI();
    updateHighlight();
  }

  // Reset judge area + buttons
  $("#judgeArea").classList.add("hidden");
  $("#judgeArea").innerHTML = "";
  $("#checkBtn").disabled = false;
  $("#nextBtn").classList.add("hidden");
}

function getUserAnswer(p) {
  if (p.type === "hotspot") {
    if (!hotspotState) return "";
    if (p.hotspotTarget === "tri") {
      const { triFace, triDir } = hotspotState;
      if (!triFace || !triDir) return "";
      return JSON.stringify({ triFace, triDir });
    }
    if (p.hotspotTarget === "arrow") {
      const { arrowFace, arrowDir } = hotspotState;
      if (!arrowFace || !arrowDir) return "";
      return JSON.stringify({ arrowFace, arrowDir });
    }
    const { triFace, triDir, arrowFace, arrowDir } = hotspotState;
    if (!triFace || !triDir || !arrowFace || !arrowDir) return "";
    return JSON.stringify({ triFace, triDir, arrowFace, arrowDir });
  }

  if (p.type === "rank") {
    const labels = p.rankLabels || ["1位", "2位", "3位", "4位", "5位"];
    const vals = labels.map((_, i) => {
      const el = document.querySelector(`#rank_${p.id}_${i}`);
      return el ? el.value : "";
    });
    if (vals.some(v => !String(v).trim())) return "";
    return JSON.stringify(vals);
  }

  if (p.type === "choice") {
    const checked = document.querySelector(`input[name="choice_${p.id}"]:checked`);
    return checked ? checked.value : "";
  }

  const input = $("#answerInput");
  return input ? input.value : "";
}
/* =========================
  Grading
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

  // (optional) slightly tolerant: remove common suffix like "さん" if not provided in answer list
  // keep it conservative to avoid false positives

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

function gradeHotspot(p, user) {
  let u;
  try { u = JSON.parse(String(user)); }
  catch { return { ok: false, correct: "" }; }

  const a = p.answer || {};

  const ok =
    (p.hotspotTarget === "tri"
      ? Number(u.triFace) === Number(a.triFace) &&
        String(u.triDir) === String(a.triDir)
      : Number(u.arrowFace) === Number(a.arrowFace) &&
        String(u.arrowDir) === String(a.arrowDir)
    );

  // ★ ここが重要
  return {
    ok,
    correct: formatAnswer(p, JSON.stringify(a))
  };
}


function grade(p, user) {
  if (p.type === "choice") return gradeChoice(p, user);
  if (p.type === "text") return gradeText(p, user);
  if (p.type === "number") return gradeNumber(p, user);
  if (p.type === "hotspot") return gradeHotspot(p, user);
  if (p.type === "rank") return gradeRank(p, user);
  return { ok: false, correct: "" };
}

/* =========================
  Actions
========================= */
function checkAnswer() {
  const p = currentProblem();
  const user = getUserAnswer(p);

  if (!String(user).trim()) {
    alert("答えを入力（または選択）してください。");
    return;
  }

  const { ok, correct } = grade(p, user);

  quiz.answered += 1;
  if (ok) quiz.correct += 1;
  else quiz.wrong.push(p.id);

  quiz.details.push({
    id: p.id,
    ok,
    user,
    correct
  });

  // update history (only in normal mode)
  if (quiz.mode === "normal") {
    const h = loadHistory();
    h.totalAnswered += 1;
    if (ok) h.totalCorrect += 1;
    saveHistory(h);
  }

  // UI feedback
  const judge = $("#judgeArea");
  judge.classList.remove("hidden");
  judge.innerHTML = `
    <div class="${ok ? "judge-ok" : "judge-ng"}">${ok ? "正解！" : "不正解"}</div>
    <div>あなたの答え：<b>${escapeHtml(formatAnswer(p, user))}</b></div>
    <div>正しい答え：<b>${escapeHtml(String(correct))}</b></div>
    ${p.note ? `<div class="hint">メモ：${escapeHtml(p.note)}</div>` : ""}
  `;

  $("#checkBtn").disabled = true;
  $("#nextBtn").classList.remove("hidden");
  $("#scoreText").textContent = `正解 ${quiz.correct} / 解答 ${quiz.answered}`;
}

function nextQuestion() {
  if (quiz.idx + 1 >= quiz.list.length) {
    finishQuiz();
    return;
  }
  quiz.idx += 1;
  renderQuestion();
}


function finishQuiz() {
  // session count only in normal mode
  if (quiz.mode === "normal") {
    const h = loadHistory();
    h.sessions += 1;
    saveHistory(h);
  }
  refreshHistoryBox();

  showScreen("result");

  const total = quiz.list.length;
  const correct = quiz.correct;
  const rate = Math.round((correct / total) * 100);

  $("#resultSummary").innerHTML = `
    <div>出題：<b>${total}</b>問</div>
    <div>正解：<b>${correct}</b>問（<b>${rate}%</b>）</div>
    <div>まちがい：<b>${total - correct}</b>問</div>
  `;

  $("#reviewBtn").classList.toggle("hidden", quiz.wrong.length === 0);

  // Details
  // Details
  const lines = quiz.details.map(d => {
    const p = quiz.list.find(x => x.id === d.id);
    const title = p ? p.prompt : d.id;

    const userText = (p && p.type === "hotspot")
      ? formatAnswer(p, String(d.user))
      : String(d.user);

    const correctText = (p && p.type === "hotspot")
      ? formatAnswer(p, JSON.stringify(p.answer || {}))
      : String(d.correct);

    return `・${d.ok ? "〇" : "×"} ${title}（あなた：${userText} / 正：${correctText}）`;
  });

  $("#resultDetails").textContent = lines.join("\n");
}

function escapeHtml(s) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatAnswer(p, user) {
  if (p.type === "rank") {
    let u;
    try { u = JSON.parse(String(user)); } catch { u = []; }
    const labels = p.rankLabels || ["1位","2位","3位","4位","5位"];
    return labels.map((lab,i)=>`${lab}:${u[i] ?? ""}`).join(" / ");
  }
  if (p.type !== "hotspot") return String(user);

  let u;
  try { u = JSON.parse(user); }
  catch { return String(user); }

  const dirText = {
    up: "上向き",
    right: "右向き",
    down: "下向き",
    left: "左向き"
  };

  if (p.hotspotTarget === "tri") {
    return `${dirText[u.triDir]}の△（面${u.triFace}）`;
  }

  if (p.hotspotTarget === "arrow") {
    return `${dirText[u.arrowDir]}の${arrowSymbol(u.arrowDir)}（面${u.arrowFace}）`;
  }

  // 両方型（念のため）
  return `△：面${u.triFace}(${dirText[u.triDir]}) / 矢印：面${u.arrowFace}(${dirText[u.arrowDir]})`;
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

/* =========================
  PWA
========================= */
function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", async () => {
    try {
      await navigator.serviceWorker.register("./sw.js");
      setPwaStatus(true);
    } catch {
      setPwaStatus(false);
    }
  });
}

function setPwaStatus(registered) {
  const el = $("#pwaStatus");
  if (!el) return;
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
  if (isStandalone) {
    el.textContent = "PWAで実行中（ホーム画面から起動）";
  } else {
    el.textContent = registered ? "PWA対応：ホーム画面に追加できます" : "PWA：Service Worker未登録（環境によります）";
  }
}

async function precacheAll() {
  const statusEl = document.querySelector("#precacheStatus");
  const setStatus = (t) => { if (statusEl) statusEl.textContent = t; };

  setStatus("オフライン準備中…");

  // 1) index.json
  const index = await fetch("./data/index.json", { cache: "no-store" }).then(r => r.json());

  // 2) majorFiles（m1..m6など）を全部取得
  const files = index.majorFiles || [];
  let done = 0;

  // 画像URLも集める
  const imageUrls = new Set();

  for (const path of files) {
    const major = await fetch("./" + path.replace(/^\.\//, ""), { cache: "no-store" }).then(r => r.json());
    done++;
    setStatus(`問題データ：${done}/${files.length}`);

    // 大問画像 & 小問画像
    if (major.image) imageUrls.add(major.image);
    (major.items || []).forEach(it => {
      if (it.image) imageUrls.add(it.image);
    });
  }

  // 3) 画像も全部取得（SWがキャッシュする）
  const imgs = [...imageUrls];
  for (let i = 0; i < imgs.length; i++) {
    await fetch(imgs[i], { cache: "no-store" }).catch(() => {});
    setStatus(`画像：${i+1}/${imgs.length}`);
  }

  setStatus("オフライン準備完了（機内モードでも動作します）");
}

document.querySelector("#precacheBtn")?.addEventListener("click", precacheAll);

init();