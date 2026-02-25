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
  return String(s).trim().replace(/\s+/g, "").replace(/　/g, "").toLowerCase();
}

/* =========================
  Hotspot State
========================= */
let hotspotState = null;

/* =========================
  App State
========================= */
let DB = null;

let quiz = {
  mode: "normal",
  list: [],
  idx: 0,
  correct: 0,
  answered: 0,
  wrong: [],
  details: []
};

/* =========================
  Init
========================= */
async function init() {
  DB = await fetch("./data/index.json").then(r => r.json());

  $("#startBtn").addEventListener("click", startQuiz);
  $("#checkBtn").addEventListener("click", checkAnswer);
  $("#nextBtn").addEventListener("click", nextQuestion);
}

function currentProblem() {
  return quiz.list[quiz.idx];
}

/* =========================
  Render
========================= */
function renderQuestion() {
  const p = currentProblem();
  const area = $("#answerArea");
  area.innerHTML = "";

  $("#qPrompt").textContent = p.prompt ?? "";

  if (p.type === "hotspot") {
    renderHotspot(p, area);
    return;
  }

  if (p.type === "choice") {
    const name = "choice_" + p.id;
    shuffle(p.choices || []).forEach(c => {
      const label = document.createElement("label");
      label.innerHTML = `<input type="radio" name="${name}" value="${c}">${c}`;
      area.appendChild(label);
      area.appendChild(document.createElement("br"));
    });
  }
}

function renderHotspot(p, area) {
  hotspotState = {
    triFace: null,
    triDir: null,
    arrowFace: null,
    arrowDir: null
  };

  let active = "tri";

  area.innerHTML = `
    <div>
      <button data-active="tri">▲</button>
      <button data-active="arrow">矢印</button>
      <button data-reset="all">全消去</button>
    </div>

    <div>
      向き：
      <button data-dir="up">上</button>
      <button data-dir="right">右</button>
      <button data-dir="down">下</button>
      <button data-dir="left">左</button>
    </div>

    <div class="hs-wrap">
      <img src="${p.image}" class="hs-img">
      <svg class="hs-svg" viewBox="${p.viewBox}" preserveAspectRatio="none"></svg>
    </div>
  `;

  const svg = area.querySelector(".hs-svg");

  (p.faces || []).forEach(f => {
    const r = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    r.setAttribute("data-face", f.id);
    r.setAttribute("x", f.x);
    r.setAttribute("y", f.y);
    r.setAttribute("width", f.w);
    r.setAttribute("height", f.h);
    r.style.fill = "transparent";
    r.style.cursor = "pointer";
    svg.appendChild(r);
  });

  area.addEventListener("click", (e) => {
    const t = e.target;

    if (t.dataset.active) {
      active = t.dataset.active;
      return;
    }

    if (t.dataset.dir) {
      if (active === "tri") hotspotState.triDir = t.dataset.dir;
      else hotspotState.arrowDir = t.dataset.dir;
      return;
    }

    if (t.dataset.reset === "all") {
      hotspotState = { triFace: null, triDir: null, arrowFace: null, arrowDir: null };
      return;
    }
  });

  svg.addEventListener("pointerdown", (e) => {
    const face = e.target.getAttribute("data-face");
    if (!face) return;
    if (active === "tri") hotspotState.triFace = Number(face);
    else hotspotState.arrowFace = Number(face);
  });
}

/* =========================
  Get Answer
========================= */
function getUserAnswer(p) {
  if (p.type === "hotspot") {
    if (!hotspotState) return "";
    const { triFace, triDir, arrowFace, arrowDir } = hotspotState;
    if (!triFace || !triDir || !arrowFace || !arrowDir) return "";
    return JSON.stringify(hotspotState);
  }

  if (p.type === "choice") {
    const checked = document.querySelector(`input[name="choice_${p.id}"]:checked`);
    return checked ? checked.value : "";
  }

  return "";
}

/* =========================
  Grading
========================= */
function gradeHotspot(p, user) {
  const u = JSON.parse(user);
  const a = p.answer;

  const ok =
    u.triFace === a.triFace &&
    u.triDir === a.triDir &&
    u.arrowFace === a.arrowFace &&
    u.arrowDir === a.arrowDir;

  return { ok, correct: JSON.stringify(a) };
}

function grade(p, user) {
  if (p.type === "hotspot") return gradeHotspot(p, user);
  if (p.type === "choice") {
    return { ok: normalizeText(user) === normalizeText(p.answer), correct: p.answer };
  }
  return { ok: false, correct: "" };
}

/* =========================
  Actions
========================= */
function checkAnswer() {
  const p = currentProblem();
  const user = getUserAnswer(p);
  if (!user) {
    alert("未入力があります");
    return;
  }

  const { ok } = grade(p, user);
  alert(ok ? "正解！" : "不正解");
}

function nextQuestion() {
  quiz.idx++;
  renderQuestion();
}

init();