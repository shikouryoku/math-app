// questionTypes.js
// 形式ごとの「表示」と「回答取得」を登録する

window.QUESTION_TYPES = window.QUESTION_TYPES || {};

function registerType(type, impl) {
  QUESTION_TYPES[type] = impl;
}
window.registerType = registerType;

// ===== choice =====
registerType("choice", {
  render(p, area) {
    const wrap = document.createElement("div");
    wrap.className = "choice-list";

    const name = "choice_" + p.id;
    const shownChoices = (p.choices || []);

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
  },

  getAnswer(p, area) {
    const checked = area.querySelector(`input[name="choice_${p.id}"]:checked`);
    return checked ? checked.value : "";
  }
});

// ===== text =====
registerType("text", {
  render(p, area) {
    area.innerHTML = "";
    const input = document.createElement("input");
    input.type = "text";
    input.id = "answerInput"; // ★これが重要（getUserAnswerが読むID）
    input.placeholder = "答えを入力（例：ひろしさん）";
    input.autocomplete = "off";
    area.appendChild(input);
  }
});

// ===== number =====
registerType("number", {
  render(p, area) {
    area.innerHTML = "";

    const input = document.createElement("input");
    input.type = "text";           // ←numberでも文字入力でOK（分数/あまり対応のため）
    input.id = "answerInput";      // ★重要：getUserAnswerが読むID
    input.inputMode = "decimal";   // 任意：スマホで数字キーボード寄り
    input.placeholder = p.placeholder || "答えを入力（例：12 / 3/4 / 5あまり2）";
    input.autocomplete = "off";

    area.appendChild(input);
  }
});