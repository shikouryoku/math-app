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