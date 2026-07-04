/**
 * AIChatContextQuestions SillyTavern Extension
 *
 * Intercepts user messages, generates three contextual follow‑up questions via a hidden LLM call,
 * displays them in a modal, stores the answers, and injects them into the next bot prompt.
 */

(() => {
  // ---------- Configuration ---------- //
  const FALLBACK_QUESTIONS = [
    "Что должно произойти дальше?",
    "Какое настроение у сцены?",
    "Что сделать персонажу?",
  ];

  const ANSWER_STORAGE_KEY = "ai_chat_context_answers";

  /** Show a processing overlay while the hidden LLM call runs */
  function showOverlay() {
    const el = document.createElement("div");
    el.id = "ai-chat-context-overlay";
    Object.assign(el.style, {
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.3)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 10000,
      color: "var(--text-primary, #fff)",
      fontSize: "1.2rem",
    });
    el.innerText = "ИИ анализирует сообщение…";
    document.body.appendChild(el);
    return el;
  }

  function hideOverlay(el) { if (el) el.remove(); }

  /** Generate three questions using the hidden LLM */
  async function generateQuestions(userMessage) {
    if (!window.sillytavern?.generateRaw) {
      console.warn("sillytavern.generateRaw not available – using fallback");
      return FALLBACK_QUESTIONS;
    }
    const systemPrompt = `Проанализируй последнее сообщение пользователя в ролевой игре.
Придумай ровно 3 коротких уточняющих вопроса к пользователю, которые помогут сделать следующий ответ персонажа более точным, интересным и глубоким.
Формат вывода: выведи ТОЛЬКО 3 вопроса, каждый с новой строки, без нумерации, точек в начале и лишнего текста.`;
    const payload = {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userMessage },
      ],
      max_tokens: 200,
      temperature: 0.7,
      skip_history: true,
    };
    try {
      const raw = await window.sillytavern.generateRaw(payload);
      const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      if (lines.length >= 3) return lines.slice(0, 3);
      console.warn("LLM returned insufficient questions – fallback used");
      return FALLBACK_QUESTIONS;
    } catch (e) {
      console.error("Hidden LLM call failed", e);
      return FALLBACK_QUESTIONS;
    }
  }

  /** Render modal with questions and collect answers */
  function showQuestionsModal(questions) {
    return new Promise(resolve => {
      const overlay = document.createElement("div");
      overlay.id = "ai-chat-questions-modal";
      Object.assign(overlay.style, {
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10000,
      });

      const modal = document.createElement("div");
      Object.assign(modal.style, {
        background: "var(--bg-color, #2c2c2c)",
        color: "var(--text-primary, #e0e0e0)",
        borderRadius: "8px",
        padding: "20px",
        maxWidth: "500px",
        width: "90%",
        boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
      });

      const title = document.createElement("h3");
      title.textContent = "Дополнительные вопросы";
      title.style.marginTop = "0";
      modal.appendChild(title);

      const form = document.createElement("form");
      const answers = {};

      questions.forEach(q => {
        const label = document.createElement("label");
        label.textContent = q;
        label.style.display = "block";
        label.style.marginTop = "12px";
        const input = document.createElement("input");
        input.type = "text";
        input.required = true;
        input.style.width = "100%";
        input.style.marginTop = "4px";
        input.addEventListener("input", e => answers[q] = e.target.value);
        label.appendChild(input);
        form.appendChild(label);
      });

      const btn = document.createElement("button");
      btn.type = "submit";
      btn.textContent = "Сохранить ответы";
      btn.style.marginTop = "16px";
      btn.style.padding = "8px 16px";
      btn.style.background = "var(--main-color, #4a90e2)";
      btn.style.border = "none";
      btn.style.borderRadius = "4px";
      btn.style.color = "#fff";
      btn.style.cursor = "pointer";
      form.appendChild(btn);

      form.addEventListener("submit", e => {
        e.preventDefault();
        sessionStorage.setItem(ANSWER_STORAGE_KEY, JSON.stringify(answers));
        overlay.remove();
        resolve(answers);
      });

      modal.appendChild(form);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);
    });
  }

  /** Hook: after the user sends a message */
  window.sillytavern?.hooks?.add?.("onUserMessage", async msg => {
    // `msg` can be a plain string or an object with .text – handle both
    const userText = typeof msg === "string" ? msg : msg?.text;
    if (!userText) return true;
    const overlay = showOverlay();
    const questions = await generateQuestions(userText);
    hideOverlay(overlay);
    await showQuestionsModal(questions);
    return true; // allow original processing to continue
  });

  /** Hook: before the AI generates its reply */
  window.sillytavern?.hooks?.add?.("onPromptGenerate", prompt => {
    const stored = sessionStorage.getItem(ANSWER_STORAGE_KEY);
    if (!stored) return prompt;
    const answers = JSON.parse(stored);
    const summary = Object.entries(answers)
      .map(([q, a]) => `${q}: ${a}`)
      .join("\n");
    sessionStorage.removeItem(ANSWER_STORAGE_KEY);
    return `${summary}\n\n${prompt}`;
  });
})();
