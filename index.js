/**
 * AIChatContextQuestions SillyTavern Extension
 *
 * Intercepts user messages, sends them to the currently configured LLM to obtain
 * three contextual follow‑up questions, displays them in a modal, stores the
 * answers, and injects the answers into the final prompt for the character.
 */

// ---------- Configuration ---------- //
// Fallback questions used when the hidden LLM call fails or times out.
const FALLBACK_QUESTIONS = [
  "Что должно произойти дальше?",
  "Какое настроение у сцены?",
  "Что сделать персонажу?",
];

// Key used in sessionStorage for temporary answer storage.
const ANSWER_STORAGE_KEY = "ai_chat_context_answers";

/**
 * Show a non‑blocking overlay indicating that the message is being analysed.
 */
function showProcessingOverlay() {
  const overlay = document.createElement("div");
  overlay.id = "ai-analysis-overlay";
  overlay.style.position = "fixed";
  overlay.style.top = "0";
  overlay.style.left = "0";
  overlay.style.width = "100%";
  overlay.style.height = "100%";
  overlay.style.backgroundColor = "rgba(0,0,0,0.3)";
  overlay.style.display = "flex";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.style.zIndex = "9999";
  overlay.style.color = "var(--text-color, #fff)";
  overlay.style.fontSize = "1.2rem";
  overlay.style.fontFamily = "var(--font-family, sans-serif)";
  overlay.innerText = "ИИ анализирует сообщение…";
  document.body.appendChild(overlay);
  return overlay;
}

/**
 * Remove the processing overlay if it exists.
 */
function hideProcessingOverlay() {
  const el = document.getElementById("ai-analysis-overlay");
  if (el) el.remove();
}

/**
 * Generate three contextual questions using the currently active LLM.
 * Returns a Promise that resolves to an array of three strings.
 * Falls back to static questions on any error/timeout.
 */
async function generateQuestionsViaLLM(userMessage) {
  // Verify SillyTavern API is available.
  if (!window.sillytavern || typeof window.sillytavern.generateRaw !== "function") {
    console.warn("SillyTavern generateRaw not available – using fallback questions.");
    return FALLBACK_QUESTIONS;
  }

  const systemPrompt = `Проанализируй последнее сообщение пользователя в ролевой игре.
Придумай ровно 3 коротких уточняющих вопроса к пользователю, которые помогут сделать следующий ответ персонажа более точным, интересным и глубоким.
Формат вывода: выведи ТОЛЬКО 3 вопроса, каждый с новой строки, без нумерации, точек в начале и лишнего текста.`;

  const payload = {
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    max_tokens: 200,
    temperature: 0.7,
    skip_history: true,
  };

  try {
    const raw = await window.sillytavern.generateRaw(payload);
    const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length >= 3) return lines.slice(0, 3);
    console.warn("LLM returned insufficient questions – using fallback.");
    return FALLBACK_QUESTIONS;
  } catch (err) {
    console.error("Error during hidden LLM call:", err);
    return FALLBACK_QUESTIONS;
  } finally {
    hideProcessingOverlay();
  }
}

/**
 * Build and display a modal containing the supplied questions.
 * Returns a Promise that resolves to an object {question: answer, ...}.
 */
function showQuestionsModal(questions) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.id = "ai-questions-modal-overlay";
    overlay.style.position = "fixed";
    overlay.style.top = "0";
    overlay.style.left = "0";
    overlay.style.width = "100%";
    overlay.style.height = "100%";
    overlay.style.backgroundColor = "rgba(0,0,0,0.6)";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.zIndex = "10000";

    const modal = document.createElement("div");
    modal.style.background = "var(--bg-color, #2c2c2c)";
    modal.style.color = "var(--text-color, #e0e0e0)";
    modal.style.borderRadius = "8px";
    modal.style.padding = "20px";
    modal.style.maxWidth = "540px";
    modal.style.width = "90%";
    modal.style.boxShadow = "0 4px 12px rgba(0,0,0,0.4)";

    const title = document.createElement("h3");
    title.textContent = "Дополнительные вопросы";
    title.style.marginTop = "0";
    modal.appendChild(title);

    const form = document.createElement("form");
    const answers = {};

    questions.forEach((q) => {
      const label = document.createElement("label");
      label.textContent = q;
      label.style.display = "block";
      label.style.marginTop = "12px";

      const input = document.createElement("input");
      input.type = "text";
      input.style.width = "100%";
      input.style.padding = "6px";
      input.style.marginTop = "4px";
      input.required = true;

      input.addEventListener("input", (e) => {
        answers[q] = e.target.value;
      });

      form.appendChild(label);
      form.appendChild(input);
    });

    const submitBtn = document.createElement("button");
    submitBtn.type = "submit";
    submitBtn.textContent = "Сохранить ответы";
    submitBtn.style.marginTop = "16px";
    submitBtn.style.padding = "8px 16px";
    submitBtn.style.background = "var(--main-color, #4a90e2)";
    submitBtn.style.border = "none";
    submitBtn.style.borderRadius = "4px";
    submitBtn.style.color = "#fff";
    submitBtn.style.cursor = "pointer";
    form.appendChild(submitBtn);

    modal.appendChild(form);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      sessionStorage.setItem(ANSWER_STORAGE_KEY, JSON.stringify(answers));
      overlay.remove();
      resolve(answers);
    });
  });
}

/**
 * Hook: runs after the user sends a message.
 */
async function onUserMessage(message) {
  if (!message || !message.text) return;
  const overlay = showProcessingOverlay();
  const questions = await generateQuestionsViaLLM(message.text);
  hideProcessingOverlay();
  await showQuestionsModal(questions);
}

/**
 * Hook: runs before the bot generates a reply.
 */
function onPromptGeneration(prompt) {
  const stored = sessionStorage.getItem(ANSWER_STORAGE_KEY);
  if (!stored) return prompt;
  const answers = JSON.parse(stored);
  const summary = Object.entries(answers)
    .map(([q, a]) => `${q}: ${a}`)
    .join('\n');
  const injection = `\n---\n[User Answers to Contextual Questions]\n${summary}\n---\n`;
  sessionStorage.removeItem(ANSWER_STORAGE_KEY);
  return prompt + injection;
}

// ---------- Register Hooks ---------- //
if (window.sillytavern && sillytavern.hooks) {
  sillytavern.hooks.onUserMessage.push(onUserMessage);
  sillytavern.hooks.onPromptGeneration.push(onPromptGeneration);
} else {
  console.warn("SillyTavern hook API not detected – extension will not function.");
}
