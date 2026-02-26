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
  $("#precacheBtn")?.addEventListener("click", precacheAll);

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


init();