/* =========================
  Render + Input (moved from app.js)
  - renderQuestion()
  - getUserAnswer(p)
========================= */

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
const showTopImage = hasImage && p.type !== "hotspot" && p.type !== "hotspotInput";

$("#qImageWrap").classList.toggle("hidden", !showTopImage);
if (showTopImage) $("#qImage").src = p.image;

  // Answer UI
  const area = $("#answerArea");
  area.innerHTML = "";

  // ★ここに移動（どの問題でも必ず「前の採点表示」を消す）
  $("#judgeArea").classList.add("hidden");
  $("#judgeArea").innerHTML = "";
  $("#checkBtn").disabled = false;
  $("#nextBtn").classList.add("hidden");

  const impl = window.QUESTION_TYPES?.[p.type];
  if (impl && typeof impl.render === "function") {
    impl.render(p, area);
    return;
  }
    else if (p.type === "rank") {
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
    
      } else if (p.type === "hotspotInput") {
    const vb = parseViewBox(p.viewBox || "0 0 2048 1285");
    const fields = p.fields || [];

    area.innerHTML = `
      <div class="hi-wrap">
        <img class="hi-img" src="${p.image}" alt="問題">
        <div class="hi-layer" id="hiLayer"></div>
      </div>
      <div class="hi-note">□の中に入力してください（数字キーボードが出ます）</div>
    `;

    const layer = area.querySelector("#hiLayer");

    fields.forEach(f => {
      const left = ((Number(f.x) - vb.x) / vb.w) * 100;
      const top = ((Number(f.y) - vb.y) / vb.h) * 100;
      const w = (Number(f.w) / vb.w) * 100;
      const h = (Number(f.h) / vb.h) * 100;

      const inp = document.createElement("input");
      inp.type = "text";
      inp.className = "hi-input";
      inp.id = `hi_${p.id}_${f.id}`;
      inp.autocomplete = "off";
      inp.style.left = `${left}%`;
      inp.style.top = `${top}%`;
      inp.style.width = `${w}%`;
      inp.style.height = `${h}%`;

      const kind = f.kind || "number";
      if (kind === "digit") {
        inp.inputMode = "numeric";
        inp.maxLength = 1;
        inp.placeholder = "";
        inp.addEventListener("input", () => {
          const v = normalizeDigit(inp.value).replace(/[^\d]/g, "");
          inp.value = v.slice(0, 1);
        });
      } else {
        // number（2桁以上など）
        inp.inputMode = "numeric";
        inp.addEventListener("input", () => {
          inp.value = normalizeDigit(inp.value).replace(/[^\d]/g, "");
        });
      }

      layer.appendChild(inp);
    });
    requestAnimationFrame(fitHotspotInputFont);
    if (!window.__hiResizeBound) {
      window.addEventListener("resize", () => requestAnimationFrame(fitHotspotInputFont));
      window.__hiResizeBound = true;
}

    // 追加：□サイズに合わせて文字を自動調整
    requestAnimationFrame(fitHotspotInputFont);
    if (!window.__hiResizeBound) {
      window.addEventListener("resize", fitHotspotInputFont);
      window.__hiResizeBound = true;
    }

    } else if (p.type === "hotspot") {

    // ===== 追加：hsMode による分岐 =====
    if (p.hsMode === "order") {
      // クリック順で並べる（画像なしでもOK）
      hotspotState = { mode: "order", order: [] };

      const targetLen = p.length ?? (p.answer?.order?.length ?? (p.choices?.length ?? 0));

      area.innerHTML = `
        <div class="order-panel">
          <div class="order-status" id="orderStatus"></div>
          <div class="order-chosen" id="orderChosen"></div>
          <div class="order-row">
            <button type="button" class="order-btn" data-act="undo">ひとつ戻す</button>
            <button type="button" class="order-btn" data-act="reset">全消去</button>
          </div>
        </div>
        <div class="order-choices" id="orderChoices"></div>
      `;

      const statusEl = area.querySelector("#orderStatus");
      const chosenEl = area.querySelector("#orderChosen");
      const choicesEl = area.querySelector("#orderChoices");

      const choices = p.choices || [];
      choicesEl.innerHTML = choices.map(c => `<button type="button" class="order-choice" data-val="${escapeHtml(String(c))}">${escapeHtml(String(c))}</button>`).join("");

      function update() {
        const cur = hotspotState.order;
        statusEl.textContent = `入力：${cur.length}/${targetLen}（クリック順が順位になります）`;
        chosenEl.innerHTML = cur.map((v, i) => `<span class="order-pill">${i + 1}位：${escapeHtml(String(v))}</span>`).join("");
      }

      area.onclick = (e) => {
        const t = e.target;

        if (t?.matches?.(".order-btn")) {
          const act = t.dataset.act;
          if (act === "undo") hotspotState.order.pop();
          if (act === "reset") hotspotState.order = [];
          update();
          return;
        }

        if (t?.matches?.(".order-choice")) {
          const val = t.dataset.val; // escape済み文字列
          // datasetから戻す時はそのまま使う（表示用なのでOK）
          if (hotspotState.order.length >= targetLen) return;
          if (hotspotState.order.includes(val)) return; // 同じものを二回入れない
          hotspotState.order.push(val);
          update();
          return;
        }
      };

      update();

      // judge area reset
      $("#judgeArea").classList.add("hidden");
      $("#judgeArea").innerHTML = "";
      $("#checkBtn").disabled = false;
      $("#nextBtn").classList.add("hidden");
      return;
    }

    if (p.hsMode === "pair") {
      // 2条件（例：花色＋葉色）
      hotspotState = { mode: "pair", values: {} };

      const pair = p.pair || [];
      area.innerHTML = `
        ${p.image ? `<div class="hs-wrap"><img class="hs-img" src="${p.image}" alt="問題図"></div>` : ``}
        <div class="pair-panel">
          <div class="pair-status" id="pairStatus"></div>
          <div class="pair-groups" id="pairGroups"></div>
          <div class="pair-row">
            <button type="button" class="pair-btn" data-act="reset">全消去</button>
          </div>
        </div>
      `;

      const statusEl = area.querySelector("#pairStatus");
      const groupsEl = area.querySelector("#pairGroups");

      groupsEl.innerHTML = pair.map(g => {
        const choices = g.choices || [];
        return `
          <div class="pair-group">
            <div class="pair-title">${escapeHtml(String(g.key || ""))}</div>
            <div class="pair-choices">
              ${choices.map(c => `<button type="button" class="pair-choice" data-key="${escapeHtml(String(g.key))}" data-val="${escapeHtml(String(c))}">${escapeHtml(String(c))}</button>`).join("")}
            </div>
          </div>
        `;
      }).join("");

      function update() {
        const keys = pair.map(g => g.key);
        const filled = keys.filter(k => hotspotState.values[k] != null).length;
        statusEl.textContent = `入力：${filled}/${keys.length}（両方そろうと採点できます）`;

        // 選択状態のハイライト
        area.querySelectorAll(".pair-choice").forEach(btn => {
          const k = btn.dataset.key;
          const v = btn.dataset.val;
          btn.classList.toggle("is-selected", hotspotState.values[k] === v);
        });
      }

      area.onclick = (e) => {
        const t = e.target;
        if (t?.matches?.(".pair-btn")) {
          hotspotState.values = {};
          update();
          return;
        }
        if (t?.matches?.(".pair-choice")) {
          const k = t.dataset.key;
          const v = t.dataset.val;
          hotspotState.values[k] = v;
          update();
          return;
        }
      };

      update();

      // judge area reset
      $("#judgeArea").classList.add("hidden");
      $("#judgeArea").innerHTML = "";
      $("#checkBtn").disabled = false;
      $("#nextBtn").classList.add("hidden");
      return;
    }

    // ===== ここから下は既存の ▲/矢印 hotspot（そのまま） =====
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
    
    // マークが面クリックを邪魔しないようにする（cycleのときは記号クリックが必要なので除外）
    if (p.hsDirMode !== "cycle") {
      gTri.setAttribute("pointer-events", "none");
      gArr.setAttribute("pointer-events", "none");
    }

    svg.appendChild(gTri);
    svg.appendChild(gArr);

    // === 追加：向きを「上→右→下→左→上」と循環させる ===
    const dirCycleEnabled = (p.hsDirMode === "cycle");
    
    function nextDir(cur) {
      const seq = ["up", "right", "down", "left"];
      const i = seq.indexOf(cur);
      // 念のため、想定外だったら "up" に戻す
      return seq[(i + 1 + seq.length) % seq.length] || "up";
    }
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
      
      // ★追加：見えないoverlayはクリックを受けない（透明でも当たり判定が残る対策）
      const triVisible = (hotspotState.triFace != null);
      const arrVisible = (hotspotState.arrowFace != null);
      
      if (!triVisible) {
        gTri.style.pointerEvents = "none";
      } else {
        gTri.style.pointerEvents = (p.hsDirMode === "cycle") ? "all" : "none";
      }
      
      if (!arrVisible) {
        gArr.style.pointerEvents = "none";
      } else {
        gArr.style.pointerEvents = (p.hsDirMode === "cycle") ? "all" : "none";
      }

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

    // === 追加：▲/矢印をクリックしたら向きが循環（hsDirMode:"cycle" の時だけ） ===
    [gTri, gArr].forEach(g => {
      g.style.cursor = "pointer";
      g.style.pointerEvents = "all";
      g.addEventListener("pointerdown", (e) => {
        if (p.hsDirMode !== "cycle") return;
    
        const isTri = (g === gTri);
    
        // single問題でも「いま選択中」を合わせておく
        active = isTri ? "tri" : "arrow";
        updateToggleUI();
    
        // ★重要：面が未選択なら、stopPropagationしない
        // → 下のrectクリック（面選択）を通す
        if (isTri) {
          if (hotspotState.triFace == null) return;
        } else {
          if (hotspotState.arrowFace == null) return;
        }
    
        // ★方向を回すときだけ、面クリックを潰す
        e.stopPropagation();
    
        if (isTri) {
          hotspotState.triDir = nextDir(hotspotState.triDir);
        } else {
          hotspotState.arrowDir = nextDir(hotspotState.arrowDir);
        }
    
        updateHighlight();
      });
    });
    
    // Face selection
    faceEls.forEach(el => {
      el.addEventListener("pointerdown", () => {
        const face = Number(el.getAttribute("data-face"));
    
        if (active === "tri") {
          hotspotState.triFace = face;
          // ★追加：面を選んだ瞬間に↑で開始（未をなくす）
          if (!hotspotState.triDir) hotspotState.triDir = "up";
        } else {
          hotspotState.arrowFace = face;
          // ★追加：面を選んだ瞬間に↑で開始（未をなくす）
          if (!hotspotState.arrowDir) hotspotState.arrowDir = "up";
        }
    
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
  const area = $("#answerArea");  // ←ここを修正

  
  const impl = window.QUESTION_TYPES?.[p.type];
  if (impl && typeof impl.getAnswer === "function") {
    return impl.getAnswer(p, area);
  }

  if (p.type === "hotspot") {
    // 追加：hsMode
    if (p.hsMode === "order") {
      const targetLen = p.length ?? (p.answer?.order?.length ?? (p.choices?.length ?? 0));
      const cur = hotspotState?.order || [];
      if (cur.length !== targetLen) return "";
      return JSON.stringify({ order: cur });
    }

    if (p.hsMode === "pair") {
      const pair = p.pair || [];
      const keys = pair.map(g => g.key);
      const vals = hotspotState?.values || {};
      if (!keys.every(k => vals[k] != null)) return "";
      return JSON.stringify(vals);
    }

    // 既存の ▲/矢印 hotspot（以下はそのまま）
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

  if (p.type === "hotspotInput") {
    const fields = p.fields || [];
    const out = {};
    for (const f of fields) {
      const el = document.querySelector(`#hi_${p.id}_${f.id}`);
      const v = el ? normalizeDigit(el.value) : "";
      if (!String(v).trim()) return "";
      out[f.id] = String(v).trim();
    }
    return JSON.stringify(out);
  }

  const input = $("#answerInput");
  return input ? input.value : "";
}