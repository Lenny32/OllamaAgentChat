const OLLAMA_CHAT_URL = "http://localhost:11434/api/chat";
const OLLAMA_TAGS_URL = "http://localhost:11434/api/tags";

const DEFAULT_LEFT_MODEL = "gemma3:1b";
const DEFAULT_RIGHT_MODEL = "gemma3:1b";

const els = {
  theme: document.getElementById("themeInput"),
  interactionMode: document.getElementById("interactionMode"),
  leftDisplayName: document.getElementById("leftDisplayName"),
  rightDisplayName: document.getElementById("rightDisplayName"),
  leftAgentPrompt: document.getElementById("leftAgentPrompt"),
  rightAgentPrompt: document.getElementById("rightAgentPrompt"),
  reviewAgentPrompt: document.getElementById("reviewAgentPrompt"),
  reviewEnabled: document.getElementById("reviewEnabled"),
  reviewAgentRow: document.getElementById("reviewAgentRow"),
  leftModel: document.getElementById("leftModel"),
  rightModel: document.getElementById("rightModel"),
  reviewModel: document.getElementById("reviewModel"),
  refreshModelsBtn: document.getElementById("refreshModelsBtn"),
  downloadJsonBtn: document.getElementById("downloadJsonBtn"),
  initialTurns: document.getElementById("initialTurns"),
  maxExtensions: document.getElementById("maxExtensions"),
  start: document.getElementById("startBtn"),
  stop: document.getElementById("stopBtn"),
  chat: document.getElementById("chat"),
  msgTpl: document.getElementById("msgTpl"),
  status: document.getElementById("status"),
  blockTurns: document.getElementById("blockTurns"),
  totalTurns: document.getElementById("totalTurns"),
  extensionCount: document.getElementById("extensionCount"),
  lastOutcome: document.getElementById("lastOutcome"),
  finalReview: document.getElementById("finalReview"),
  log: document.getElementById("log"),
};

let runToken = 0;
let autoScrollEnabled = true;
let lastRunExport = null;

els.start.addEventListener("click", () => runDebate());
els.stop.addEventListener("click", () => {
  runToken += 1;
  setStatus("Stopping...");
});
els.refreshModelsBtn.addEventListener("click", () => loadModels());
els.downloadJsonBtn.addEventListener("click", () => downloadRunJson());
els.reviewEnabled.addEventListener("change", () => syncReviewControls());

els.theme.addEventListener("focus", () => resizeThemeInput(true));
els.theme.addEventListener("input", () => resizeThemeInput(true));
els.theme.addEventListener("blur", () => resizeThemeInput(false));
els.chat.addEventListener("scroll", () => {
  autoScrollEnabled = isChatNearBottom();
});

function setStatus(value) {
  els.status.textContent = value;
}

function isChatNearBottom(thresholdPx = 24) {
  return els.chat.scrollHeight - (els.chat.scrollTop + els.chat.clientHeight) <= thresholdPx;
}

function scrollChatToBottom(force = false) {
  if (!force && !autoScrollEnabled) {
    return;
  }

  requestAnimationFrame(() => {
    if (!force && !autoScrollEnabled) {
      return;
    }

    const last = els.chat.lastElementChild;
    if (last) {
      last.scrollIntoView({ block: "end", behavior: "smooth" });
    }
    els.chat.scrollTop = els.chat.scrollHeight;
  });
}

function addMessage(side, author, text = "") {
  const node = els.msgTpl.content.firstElementChild.cloneNode(true);
  node.classList.add(side);
  node.querySelector(".meta").textContent = author;
  node.querySelector(".bubble").textContent = text;
  els.chat.appendChild(node);
  scrollChatToBottom();
  return node;
}

function updateMessage(node, text) {
  node.querySelector(".bubble").textContent = text;
  scrollChatToBottom();
}

function log(text) {
  els.log.textContent += `${new Date().toLocaleTimeString()} | ${text}\n`;
  els.log.scrollTop = els.log.scrollHeight;
}

function resizeThemeInput(expanded) {
  const collapsedHeight = 40;
  const expandedCap = 220;

  els.theme.style.height = "auto";
  if (expanded) {
    const nextHeight = Math.min(expandedCap, Math.max(collapsedHeight, els.theme.scrollHeight));
    els.theme.style.height = `${nextHeight}px`;
  } else {
    els.theme.style.height = `${collapsedHeight}px`;
  }
}

function interactionModeGuidance(mode) {
  if (mode === "debate") {
    return "Debate mode: respectfully challenge weak assumptions and compare alternatives.";
  }

  if (mode === "collaboration") {
    return "Collaboration mode: align, combine ideas, and converge on practical next steps.";
  }

  return "Open mode: explore the topic freely while still responding directly to each other.";
}

function syncReviewControls() {
  const enabled = els.reviewEnabled.checked;
  els.reviewModel.disabled = !enabled;
  els.reviewAgentPrompt.disabled = !enabled;
  if (els.reviewAgentRow) {
    els.reviewAgentRow.style.opacity = enabled ? "1" : "0.65";
  }
}
function downloadRunJson() {
  if (!lastRunExport) return;

  const json = JSON.stringify(lastRunExport, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const ts = new Date().toISOString().replace(/[:.]/g, "-");

  const a = document.createElement("a");
  a.href = url;
  a.download = `ollama-debate-${ts}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function fetchAvailableModels() {
  const res = await fetch(OLLAMA_TAGS_URL);
  if (!res.ok) {
    throw new Error(`Could not fetch models (${res.status})`);
  }

  const data = await res.json();
  const models = Array.isArray(data.models) ? data.models : [];
  const names = models
    .map((m) => m.name || m.model)
    .filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .sort((a, b) => a.localeCompare(b));

  return names;
}

function setSelectOptions(selectEl, modelNames, preferredName, fallbackName) {
  const previous = selectEl.value;
  selectEl.innerHTML = "";

  modelNames.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    selectEl.appendChild(opt);
  });

  const best =
    [previous, preferredName, fallbackName, modelNames[0]].find((name) => name && modelNames.includes(name)) ||
    modelNames[0];

  selectEl.value = best;
}

async function loadModels() {
  const prevStatus = els.status.textContent;
  els.refreshModelsBtn.disabled = true;
  setStatus("Loading models...");

  try {
    const names = await fetchAvailableModels();
    if (!names.length) {
      const help = "No Ollama models found. Download at least one model with: ollama pull gemma3:1b";
      setStatus("Error");
      addMessage("system", "Error", help);
      log(help);
      return;
    }

    setSelectOptions(els.leftModel, names, DEFAULT_LEFT_MODEL, names[0]);
    setSelectOptions(els.rightModel, names, DEFAULT_RIGHT_MODEL, names[0]);
    setSelectOptions(els.reviewModel, names, DEFAULT_LEFT_MODEL, names[0]);
    setStatus(prevStatus === "Idle" ? "Idle" : prevStatus);
    log(`Loaded ${names.length} models from Ollama.`);
  } catch (err) {
    setStatus("Error");
    addMessage("system", "Error", `Model list load failed: ${err.message || err}`);
    log(`Model list load failed: ${err.message || err}`);
  } finally {
    els.refreshModelsBtn.disabled = false;
  }
}

async function ollamaChat(model, messages) {
  const res = await fetch(OLLAMA_CHAT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, stream: false }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Ollama error (${res.status}): ${errorText}`);
  }

  const data = await res.json();
  return (data.message?.content || "").trim();
}

async function ollamaChatStream(model, messages, onUpdate) {
  const res = await fetch(OLLAMA_CHAT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, stream: true }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Ollama error (${res.status}): ${errorText}`);
  }

  if (!res.body) {
    throw new Error("Streaming not supported by this browser/runtime.");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      let obj;
      try {
        obj = JSON.parse(line);
      } catch {
        continue;
      }

      if (obj.error) {
        throw new Error(String(obj.error));
      }

      const piece = obj.message?.content || "";
      if (piece) {
        full += piece;
        if (onUpdate) onUpdate(full, piece);
      }
    }
  }

  const tail = buffer.trim();
  if (tail) {
    try {
      const obj = JSON.parse(tail);
      const piece = obj.message?.content || "";
      if (piece) {
        full += piece;
        if (onUpdate) onUpdate(full, piece);
      }
    } catch {
      // Ignore trailing incomplete JSON.
    }
  }

  return full.trim();
}

function transcriptText(transcript) {
  return transcript.map((m, i) => `${i + 1}. ${m.author}: ${m.text}`).join("\n");
}

function transcriptWindowText(transcript, maxItems = 6) {
  return transcript
    .slice(-maxItems)
    .map((m, i) => `${i + 1}. ${m.author}: ${m.text}`)
    .join("\n");
}

function lastMessageByAuthor(transcript, author) {
  for (let i = transcript.length - 1; i >= 0; i -= 1) {
    if (transcript[i].author === author) {
      return transcript[i].text;
    }
  }
  return "";
}

function normalizeForComparison(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseAgentPromptTags(agentPrompt) {
  return agentPrompt
    .split(/[;,\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 5);
}

function isLowValueTurn(text) {
  const t = normalizeForComparison(text);
  if (!t) return true;

  const boilerplatePatterns = [/ready to be/, /lets begin/, /okay.*begin/, /i m ready/, /let s proceed/];
  const hasBoilerplate = boilerplatePatterns.some((re) => re.test(t));

  return hasBoilerplate && t.length < 260;
}

function isNearDuplicate(text, transcript, speakerName) {
  const current = normalizeForComparison(text);
  if (!current) return false;

  const recentSameSpeaker = transcript
    .filter((m) => m.author === speakerName)
    .slice(-2)
    .map((m) => normalizeForComparison(m.text));

  return recentSameSpeaker.some((prev) => prev && (prev === current || prev.includes(current) || current.includes(prev)));
}

function extractKeywords(text, minLength = 5, maxKeywords = 12) {
  const stopwords = new Set([
    "about", "after", "again", "because", "between", "could", "first", "there", "their", "would", "these",
    "those", "which", "where", "while", "should", "through", "being", "under", "over", "using", "topic",
    "theme", "question", "answer", "maybe", "might", "other", "great", "agree", "discuss"
  ]);

  return normalizeForComparison(text)
    .split(" ")
    .filter((w) => w.length >= minLength && !stopwords.has(w))
    .filter((w, i, arr) => arr.indexOf(w) === i)
    .slice(0, maxKeywords);
}

function hasOtherMessageReference(text, otherLast) {
  const otherKeywords = extractKeywords(otherLast);
  if (!otherKeywords.length) return true;
  const lower = normalizeForComparison(text);
  let hits = 0;

  for (const kw of otherKeywords) {
    if (lower.includes(kw)) hits += 1;
    if (hits >= 1) return true;
  }

  return false;
}

function hasAgentPromptSignal(text, agentPrompt) {
  const tags = parseAgentPromptTags(agentPrompt);
  if (!tags.length) return true;

  const lower = normalizeForComparison(text);
  for (const tag of tags) {
    const kws = extractKeywords(tag, 4, 6);
    if (kws.some((kw) => lower.includes(kw))) {
      return true;
    }
  }

  return false;
}

function validateTurnOutput(text, speakerName, otherSpeakerName, agentPrompt, otherLast) {
  const blocking = [];
  const warnings = [];
  const trimmed = text.trim();

  if (!trimmed) {
    blocking.push("empty reply");
    return { blocking, warnings };
  }

  if (trimmed.length < 50) {
    blocking.push("too short");
  }

  if (isLowValueTurn(trimmed)) {
    blocking.push("low-value boilerplate");
  }

  if (otherLast && otherLast.length > 40 && !hasOtherMessageReference(trimmed, otherLast)) {
    warnings.push(`weak reference to ${otherSpeakerName}'s latest point`);
  }

  if (agentPrompt && !hasAgentPromptSignal(trimmed, agentPrompt)) {
    warnings.push("agent prompt signal not obvious in this turn");
  }

  return { blocking, warnings };
}

function buildTurnPrompt(theme, interactionMode, agentPrompt, speakerName, otherSpeakerName, transcript, turnIndex) {
  const agentPromptTags = parseAgentPromptTags(agentPrompt);
  const agentPromptBlock = agentPromptTags.length
    ? `\nAgent prompt instructions: ${agentPromptTags.join(" | ")}`
    : "";
  const modeBlock = `\nInteraction mode: ${interactionModeGuidance(interactionMode)}`;
  const otherLast = lastMessageByAuthor(transcript, otherSpeakerName) || "(No prior message yet)";
  const myLast = lastMessageByAuthor(transcript, speakerName) || "(No prior message yet)";

  return [
    {
      role: "system",
      content:
        `You are ${speakerName} in a live discussion with ${otherSpeakerName}. ` +
        "Write like a natural conversation, not a template. " +
        "Avoid generic agreement and avoid setup phrases like 'let\'s begin'." +
        modeBlock +
        agentPromptBlock,
    },
    {
      role: "user",
      content:
        `Theme: ${theme}\n` +
        `Mode: ${interactionMode}\n` +
        `Turn number: ${turnIndex}\n` +
        `Latest message from ${otherSpeakerName}: ${otherLast}\n` +
        `Your previous message: ${myLast}\n` +
        "Recent transcript (last turns):\n" +
        `${transcriptWindowText(transcript) || "(No prior messages)"}\n\n` +
        `Reply directly to ${otherSpeakerName}. ` +
        "Use 2-5 sentences, add a new angle, and end with a question to keep the discussion moving.",
    },
  ];
}

function buildRetryTurnPrompt(
  theme,
  interactionMode,
  agentPrompt,
  speakerName,
  otherSpeakerName,
  transcript,
  badReply,
  turnIndex,
  issues
) {
  const agentPromptTags = parseAgentPromptTags(agentPrompt);
  const agentPromptBlock = agentPromptTags.length
    ? `\nAgent prompt instructions: ${agentPromptTags.join(" | ")}`
    : "";
  const modeBlock = `\nInteraction mode: ${interactionModeGuidance(interactionMode)}`;
  const otherLast = lastMessageByAuthor(transcript, otherSpeakerName) || "(No prior message yet)";

  return [
    {
      role: "system",
      content:
        `You are ${speakerName}. Rewrite your previous answer as a better conversational reply to ${otherSpeakerName}. ` +
        "No rigid headings, no setup phrases, no generic agreement-only text." +
        modeBlock +
        agentPromptBlock,
    },
    {
      role: "user",
      content:
        `Theme: ${theme}\n` +
        `Mode: ${interactionMode}\n` +
        `Turn number: ${turnIndex}\n` +
        `Validation failures: ${issues.join("; ")}\n` +
        `Your previous answer: ${badReply}\n` +
        `Latest message from ${otherSpeakerName}: ${otherLast}\n` +
        "Recent transcript:\n" +
        `${transcriptWindowText(transcript) || "(No prior messages)"}\n\n` +
        `Now reply naturally to ${otherSpeakerName} in 2-5 sentences, reference a specific point, add new reasoning, and end with a question.`,
    },
  ];
}

function parseProposedTurns(text) {
  const n = Number((text.match(/-?\d+/) || ["0"])[0]);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(10, Math.floor(n)));
}

async function decideNextTurns(theme, interactionMode, leftCfg, rightCfg, transcript) {
  const ask = (speakerName, agentPrompt) => {
    const agentPromptTags = parseAgentPromptTags(agentPrompt);
    const agentPromptBlock = agentPromptTags.length
      ? `\nAgent prompt instructions: ${agentPromptTags.join(" | ")}`
      : "";

    return [
      {
        role: "system",
        content:
          `You are ${speakerName}. Decide whether the brainstorm needs extra turns. ` +
          "Return only an integer from 0 to 10." +
          `\nInteraction mode: ${interactionModeGuidance(interactionMode)}` +
          agentPromptBlock,
      },
      {
        role: "user",
        content:
          `Theme: ${theme}\n` +
          `Mode: ${interactionMode}\n` +
          "Transcript:\n" +
          `${transcriptText(transcript)}\n\n` +
          "How many additional turns are needed? Return only an integer.",
      },
    ];
  };

  const [leftRaw, rightRaw] = await Promise.all([
    ollamaChat(leftCfg.modelId, ask(leftCfg.name, leftCfg.agentPrompt)),
    ollamaChat(rightCfg.modelId, ask(rightCfg.name, rightCfg.agentPrompt)),
  ]);

  const left = parseProposedTurns(leftRaw);
  const right = parseProposedTurns(rightRaw);
  const decided = Math.ceil((left + right) / 2);

  return { left, right, decided };
}

function buildFinalReviewMessages(theme, interactionMode, reviewCfg, transcript) {
  const agentPromptTags = parseAgentPromptTags(reviewCfg.agentPrompt);
  const agentPromptBlock = agentPromptTags.length
    ? `\nAgent prompt instructions: ${agentPromptTags.join(" | ")}`
    : "";

  return [
    {
      role: "system",
      content:
        `You are ${reviewCfg.name}, an expert facilitator. ` +
        "Produce one structured, comprehensive review from the full discussion." +
        `\nInteraction mode: ${interactionModeGuidance(interactionMode)}` +
        agentPromptBlock,
    },
    {
      role: "user",
      content:
        `Theme: ${theme}\n` +
        `Mode: ${interactionMode}\n\n` +
        "Discussion transcript:\n" +
        `${transcriptText(transcript)}\n\n` +
        "Create a final review with sections: Summary, Key Agreements, Key Disagreements, Risks, Actionable Plan.",
    },
  ];
}

async function generateTurnWithValidation(token, theme, interactionMode, active, other, transcript, turnNumber, msgNode) {
  const otherLast = lastMessageByAuthor(transcript, other.name) || "";

  let messages = buildTurnPrompt(
    theme,
    interactionMode,
    active.agentPrompt,
    active.name,
    other.name,
    transcript,
    turnNumber
  );

  let text = await ollamaChatStream(active.modelId, messages, (full) => {
    if (token !== runToken) return;
    updateMessage(msgNode, full);
  });

  let validation = validateTurnOutput(text, active.name, other.name, active.agentPrompt, otherLast);
  if (isNearDuplicate(text, transcript, active.name)) {
    validation.blocking.push("near-duplicate of recent turn");
  }

  if (validation.warnings.length > 0) {
    log(`${active.name} advisory: ${validation.warnings.join(", ")}`);
  }

  let retries = 0;
  while (validation.blocking.length > 0 && retries < 2) {
    retries += 1;
    log(`${active.name} failed validation, retry ${retries}: ${validation.blocking.join(", ")}`);
    updateMessage(msgNode, `[Retry ${retries}/2: improving response quality]\n`);

    messages = buildRetryTurnPrompt(
      theme,
      interactionMode,
      active.agentPrompt,
      active.name,
      other.name,
      transcript,
      text,
      turnNumber,
      validation.blocking
    );

    text = await ollamaChatStream(active.modelId, messages, (full) => {
      if (token !== runToken) return;
      updateMessage(msgNode, full);
    });

    validation = validateTurnOutput(text, active.name, other.name, active.agentPrompt, otherLast);
    if (isNearDuplicate(text, transcript, active.name)) {
      validation.blocking.push("near-duplicate of recent turn");
    }

    if (validation.warnings.length > 0) {
      log(`${active.name} advisory: ${validation.warnings.join(", ")}`);
    }
  }

  if (validation.blocking.length > 0) {
    log(`${active.name} still weak after retries: ${validation.blocking.join(", ")}`);
  }

  return text;
}

async function runDebate() {
  const theme = els.theme.value.trim();
  const interactionMode = els.interactionMode.value;
  const reviewEnabled = els.reviewEnabled.checked;

  const leftCfg = {
    name: els.leftDisplayName.value.trim() || "Left Analyst",
    agentPrompt: els.leftAgentPrompt.value.trim(),
    modelId: els.leftModel.value,
  };
  const rightCfg = {
    name: els.rightDisplayName.value.trim() || "Right Analyst",
    agentPrompt: els.rightAgentPrompt.value.trim(),
    modelId: els.rightModel.value,
  };
  const reviewCfg = {
    name: "Reviewer",
    agentPrompt: els.reviewAgentPrompt.value.trim(),
    modelId: els.reviewModel.value || leftCfg.modelId,
  };

  const initialTurns = Number(els.initialTurns.value);
  const maxExtensions = Number(els.maxExtensions.value);

  if (!theme) {
    alert("Please enter a theme first.");
    return;
  }

  if (!leftCfg.modelId || !rightCfg.modelId || (reviewEnabled && !reviewCfg.modelId)) {
    alert("Please load/select models first.");
    return;
  }

  const token = ++runToken;
  let finalReviewText = "";
  lastRunExport = null;
  els.chat.innerHTML = "";
  autoScrollEnabled = true;
  els.log.textContent = "";
  els.finalReview.value = "";
  els.totalTurns.textContent = "0";
  els.extensionCount.textContent = "0";
  els.lastOutcome.textContent = "-";
  els.blockTurns.textContent = String(initialTurns);

  els.start.disabled = true;
  els.stop.disabled = false;
  els.downloadJsonBtn.disabled = true;

  setStatus("Running");
  addMessage("system", "System", `Theme: ${theme}`);
  addMessage("system", "System", `Mode: ${interactionMode}`);
  addMessage("system", "System", `Participants: ${leftCfg.name} vs ${rightCfg.name}`);
  addMessage(
    "system",
    "System",
    `Underlying models selected (local only): left=${leftCfg.modelId}, right=${rightCfg.modelId}, review=${reviewEnabled ? reviewCfg.modelId : "disabled"}`
  );
  if (leftCfg.agentPrompt) addMessage("system", "System", `${leftCfg.name} agent prompt: ${leftCfg.agentPrompt}`);
  if (rightCfg.agentPrompt) addMessage("system", "System", `${rightCfg.name} agent prompt: ${rightCfg.agentPrompt}`);
  if (reviewEnabled && reviewCfg.agentPrompt) addMessage("system", "System", `Review agent prompt: ${reviewCfg.agentPrompt}`);

  const transcript = [];
  let turnsThisBlock = Math.max(1, Math.floor(initialTurns));
  let totalTurns = 0;
  let extensionsUsed = 0;
  let completed = false;

  try {
    while (true) {
      log(`Starting block with ${turnsThisBlock} turns`);
      els.blockTurns.textContent = String(turnsThisBlock);

      for (let i = 0; i < turnsThisBlock; i += 1) {
        if (token !== runToken) {
          throw new Error("Run stopped");
        }

        const isLeft = totalTurns % 2 === 0;
        const active = isLeft ? leftCfg : rightCfg;
        const other = isLeft ? rightCfg : leftCfg;
        const side = isLeft ? "left" : "right";

        setStatus(`Streaming ${active.name}`);
        const turnNumber = totalTurns + 1;
        const msgNode = addMessage(side, active.name, "");

        const text = await generateTurnWithValidation(token, theme, interactionMode, active, other, transcript, turnNumber, msgNode);

        if (token !== runToken) {
          throw new Error("Run stopped");
        }

        transcript.push({ author: active.name, text });

        totalTurns += 1;
        els.totalTurns.textContent = String(totalTurns);
        log(`${active.name} completed turn ${totalTurns}`);
      }

      if (token !== runToken) {
        throw new Error("Run stopped");
      }

      if (extensionsUsed >= maxExtensions) {
        log("Max extensions reached. Ending.");
        completed = true;
        break;
      }

      setStatus("Evaluating outcome");
      const outcome = await decideNextTurns(theme, interactionMode, leftCfg, rightCfg, transcript);
      els.lastOutcome.textContent = `left=${outcome.left}, right=${outcome.right}, decided=${outcome.decided}`;

      addMessage(
        "system",
        "Outcome",
        `Next turns decision -> ${outcome.decided} (${leftCfg.name} proposed ${outcome.left}, ${rightCfg.name} proposed ${outcome.right})`
      );

      log(`Outcome decided: ${outcome.decided}`);

      if (outcome.decided <= 0) {
        log("Outcome is 0. Ending.");
        completed = true;
        break;
      }

      extensionsUsed += 1;
      turnsThisBlock = outcome.decided;
      els.extensionCount.textContent = String(extensionsUsed);
    }

    if (reviewEnabled && completed && token === runToken && transcript.length > 0) {
      setStatus("Streaming final review");
      log(`Compiling final review with ${reviewCfg.modelId}`);
      const reviewNode = addMessage("system", "Final Review", "");
      const reviewMessages = buildFinalReviewMessages(theme, interactionMode, reviewCfg, transcript);

      const review = await ollamaChatStream(reviewCfg.modelId, reviewMessages, (full) => {
        if (token !== runToken) return;
        els.finalReview.value = full;
        updateMessage(reviewNode, full);
      });

      els.finalReview.value = review;
      finalReviewText = review;
      log("Final review completed.");
    }

    if (!reviewEnabled && completed) {
      addMessage("system", "System", "Review Agent is disabled. Skipping final review.");
    }
    setStatus("Completed");
  } catch (err) {
    if (String(err.message) === "Run stopped") {
      setStatus("Stopped");
      addMessage("system", "System", "Run stopped by user.");
    } else {
      setStatus("Error");
      addMessage("system", "Error", String(err.message || err));
      log(`Error: ${err.message || err}`);
    }
  } finally {
    if (transcript.length > 0) {
      lastRunExport = {
        exportedAt: new Date().toISOString(),
        theme,
        interactionMode,
        initialTurns,
        maxExtensions,
        totalTurns,
        extensionsUsed,
        lastOutcome: els.lastOutcome.textContent,
        leftAgent: leftCfg,
        rightAgent: rightCfg,
        reviewEnabled,
        reviewAgent: reviewCfg,
        transcript,
        finalReview: finalReviewText || els.finalReview.value,
      };
      els.downloadJsonBtn.disabled = false;
    }

    els.start.disabled = false;
    els.stop.disabled = true;
  }
}

resizeThemeInput(false);
syncReviewControls();
scrollChatToBottom(true);
loadModels();






























