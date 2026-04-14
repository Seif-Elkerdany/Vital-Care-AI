(function () {
  const STORAGE_KEY = "medapp-ui-state";
  const API = {
    status: "http://localhost:8000/recording/status",
    toggle: "http://localhost:8000/recording/toggle",
    latestTranscription: "http://localhost:8000/transcriptions/latest",
    latestResponse: "http://localhost:8000/responses/latest",
    pipelineText: "http://localhost:8000/pipeline/text",
    latestAudio: "http://localhost:8000/responses/latest/audio/mp3"
  };

  const protocols = {
    "Sepsis": {
      title: "Probable Sepsis",
      timing: "Immediate - within 3 hours",
      steps: [
        {
          title: "Measure serum lactate",
          body: "Obtain lactate to evaluate for tissue hypoperfusion. Repeat if initial lactate is 2 mmol/L or higher."
        },
        {
          title: "Collect blood cultures",
          body: "Collect cultures before antibiotics if possible, but do not delay antibiotics to wait on the cultures."
        },
        {
          title: "Start empiric broad-spectrum antibiotics",
          body: "Administer within 3 hours of initial sepsis suspicion and review based on likely source and resistance history."
        },
        {
          title: "Assess fluid resuscitation need",
          body: "Consider fluid bolus therapy if sepsis-associated hypotension is present and reassess continuously."
        }
      ]
    },
    "Septic Shock": {
      title: "Suspected Septic Shock",
      timing: "Immediate - within 1 hour of recognition",
      steps: [
        {
          title: "Measure serum lactate",
          body: "Obtain immediately. Elevated lactate confirms hypoperfusion even without overt hypotension."
        },
        {
          title: "Collect blood cultures",
          body: "Obtain before antibiotics if possible, but do not delay antimicrobial therapy to do so."
        },
        {
          title: "Start empiric broad-spectrum antibiotics",
          body: "Administer within 1 hour of septic shock recognition and prioritize immediate delivery."
        },
        {
          title: "Start vasopressors",
          body: "Initiate epinephrine or norepinephrine to target MAP above 65 mmHg. Peripheral start is acceptable if central access is unavailable."
        }
      ]
    },
    "Cardiac Arrest": {
      title: "Cardiac Arrest Protocol",
      timing: "Pediatric Cardiac Arrest (PALS)",
      steps: [
        {
          title: "Start high-quality CPR",
          body: "Begin compressions immediately. Push hard and fast and minimize interruptions."
        },
        {
          title: "Attach monitor and check rhythm",
          body: "Determine whether the rhythm is shockable or nonshockable."
        },
        {
          title: "Defibrillate if shockable",
          body: "Rapid defibrillation is a priority for initial shockable rhythms."
        },
        {
          title: "Give epinephrine if indicated",
          body: "For initial nonshockable rhythms, epinephrine should be given as soon as possible."
        },
        {
          title: "Airway and oxygen support",
          body: "Ventilation and oxygenation are important in pediatric arrest care."
        }
      ]
    }
  };

  const screens = {
    home: document.getElementById("screen-home"),
    vitals: document.getElementById("screen-vitals"),
    patient: document.getElementById("screen-patient"),
    steps: document.getElementById("screen-steps"),
    voice: document.getElementById("screen-voice"),
    guidelines: document.getElementById("screen-guidelines"),
    menu: document.getElementById("screen-menu"),
    settings: document.getElementById("screen-settings"),
    calculator: document.getElementById("screen-calculator"),
    notes: document.getElementById("screen-notes")
  };

  function createBlankPatient() {
    return {
      age: "N/A",
      weight: "N/A",
      bloodPressure: "N/A",
      heartRate: "N/A",
      temperature: "N/A",
      respiratoryRate: "N/A",
      oxygen: "N/A",
      additionalInfo: "N/A"
    };
  }

  function createBlankDebugSnapshot() {
    return {
      question: "",
      structuredQuery: "",
      ragError: "",
      pipelineElapsedSeconds: null,
      llmElapsedSeconds: null,
      ttsElapsedSeconds: null,
      createdAt: "",
      retrievals: []
    };
  }

  function parseFiniteNumber(value) {
    if (value === null || value === undefined || value === "") {
      return null;
    }
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function truncateDebugText(text, limit) {
    const cleaned = String(text || "").trim();
    if (!cleaned || cleaned.length <= limit) {
      return cleaned;
    }
    return cleaned.slice(0, Math.max(0, limit - 1)).trimEnd() + "…";
  }

  function sanitizeDebugSnapshot(snapshot) {
    const fallback = createBlankDebugSnapshot();
    const safeSnapshot = snapshot && typeof snapshot === "object" ? snapshot : {};

    return {
      question: typeof safeSnapshot.question === "string" ? safeSnapshot.question : fallback.question,
      structuredQuery: typeof safeSnapshot.structuredQuery === "string" ? safeSnapshot.structuredQuery : fallback.structuredQuery,
      ragError: typeof safeSnapshot.ragError === "string" ? safeSnapshot.ragError : fallback.ragError,
      pipelineElapsedSeconds: parseFiniteNumber(safeSnapshot.pipelineElapsedSeconds),
      llmElapsedSeconds: parseFiniteNumber(safeSnapshot.llmElapsedSeconds),
      ttsElapsedSeconds: parseFiniteNumber(safeSnapshot.ttsElapsedSeconds),
      createdAt: typeof safeSnapshot.createdAt === "string" ? safeSnapshot.createdAt : fallback.createdAt,
      retrievals: Array.isArray(safeSnapshot.retrievals)
        ? safeSnapshot.retrievals.map(function (item) {
            const meta = item && typeof item === "object" && item.metadata && typeof item.metadata === "object"
              ? item.metadata
              : {};
            const sources = Array.isArray(meta.query_sources)
              ? meta.query_sources.filter(function (value) {
                  return typeof value === "string" && value.trim();
                })
              : (typeof meta.query_source === "string" && meta.query_source.trim() ? [meta.query_source.trim()] : []);

            return {
              pageNumber: parseFiniteNumber(meta.page_number),
              score: parseFiniteNumber(item && item.score),
              sectionLabel: typeof meta.section_label === "string" ? meta.section_label : "",
              querySources: sources,
              text: truncateDebugText(item && typeof item.text === "string" ? item.text : "", 480)
            };
          }).filter(function (item) {
            return !!item.text;
          })
        : fallback.retrievals
    };
  }

  const state = {
    currentScreen: "home",
    screenHistory: [],
    selectedProtocol: "",
    stepCompletion: [],
    speakerEnabled: true,
    activeAudio: null,
    lastHandledAt: null,
    pendingRecordingTarget: null,
    protocolData: {
      "Sepsis": {
        transcript: "",
        statusMessage: "Press Record Voice to capture the patient's vitals.",
        patient: createBlankPatient()
      },
      "Septic Shock": {
        transcript: "",
        statusMessage: "Press Record Voice to capture the patient's vitals.",
        patient: createBlankPatient()
      }
    },
    chatData: {
      summary: "",
      response: "Summary and next steps will appear here after transcription or chatbot response.",
      input: "",
      statusMessage: "",
      history: [],
      debugVisible: false,
      debugSnapshot: createBlankDebugSnapshot()
    },
    settings: {
      micThreshold: 35
    }
  };

  function createChatMessage(role, text) {
    return {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      role: role,
      text: text
    };
  }

  function sanitizePatient(patient) {
    return Object.assign(createBlankPatient(), patient || {});
  }

  function sanitizeProtocolData(protocolData) {
    const fallback = {
      "Sepsis": {
        transcript: "",
        statusMessage: "Press Record Voice to capture the patient's vitals.",
        patient: createBlankPatient()
      },
      "Septic Shock": {
        transcript: "",
        statusMessage: "Press Record Voice to capture the patient's vitals.",
        patient: createBlankPatient()
      }
    };

    Object.keys(fallback).forEach(function (protocolName) {
      const savedRecord = protocolData && protocolData[protocolName];
      fallback[protocolName] = {
        transcript: savedRecord && typeof savedRecord.transcript === "string" ? savedRecord.transcript : fallback[protocolName].transcript,
        statusMessage: savedRecord && typeof savedRecord.statusMessage === "string" ? savedRecord.statusMessage : fallback[protocolName].statusMessage,
        patient: sanitizePatient(savedRecord && savedRecord.patient)
      };
    });

    return fallback;
  }

  function saveState() {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        currentScreen: state.currentScreen,
        screenHistory: state.screenHistory,
        selectedProtocol: state.selectedProtocol,
        lastHandledAt: state.lastHandledAt,
        protocolData: state.protocolData,
        chatData: state.chatData,
        settings: state.settings
      }));
    } catch (error) {
      // Ignore storage failures so the app still works in private browsing or strict environments.
    }
  }

  function restoreState() {
    try {
      const raw = window.sessionStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return;
      }

      const saved = JSON.parse(raw);
      state.currentScreen = screens[saved.currentScreen] ? saved.currentScreen : "home";
      state.screenHistory = Array.isArray(saved.screenHistory)
        ? saved.screenHistory.filter(function (screenName) {
            return !!screens[screenName];
          })
        : [];
      state.selectedProtocol = typeof saved.selectedProtocol === "string" ? saved.selectedProtocol : "";
      state.lastHandledAt = typeof saved.lastHandledAt === "string" ? saved.lastHandledAt : null;
      state.protocolData = sanitizeProtocolData(saved.protocolData);
      state.chatData = {
        summary: saved.chatData && typeof saved.chatData.summary === "string" ? saved.chatData.summary : "",
        response: saved.chatData && typeof saved.chatData.response === "string"
          ? saved.chatData.response
          : "Summary and next steps will appear here after transcription or chatbot response.",
        input: saved.chatData && typeof saved.chatData.input === "string" ? saved.chatData.input : "",
        statusMessage: saved.chatData && typeof saved.chatData.statusMessage === "string" ? saved.chatData.statusMessage : "",
        history: saved.chatData && Array.isArray(saved.chatData.history)
          ? saved.chatData.history.filter(function (item) {
              return item && (item.role === "user" || item.role === "assistant") && typeof item.text === "string" && item.text.trim();
            }).map(function (item) {
              return {
                id: typeof item.id === "string" ? item.id : createChatMessage(item.role, item.text).id,
                role: item.role,
                text: item.text
              };
            })
          : [],
        debugVisible: !!(saved.chatData && saved.chatData.debugVisible),
        debugSnapshot: sanitizeDebugSnapshot(saved.chatData && saved.chatData.debugSnapshot)
      };
      state.settings = {
        micThreshold: saved.settings && Number.isFinite(Number(saved.settings.micThreshold))
          ? Math.max(0, Math.min(100, Number(saved.settings.micThreshold)))
          : 35
      };
    } catch (error) {
      window.sessionStorage.removeItem(STORAGE_KEY);
    }
  }

  const transcriptPreview = document.getElementById("transcript-preview");
  const additionalInfo = document.getElementById("additional-info");
  const stepsList = document.getElementById("steps-list");
  const stepsProtocolTitle = document.getElementById("steps-protocol-title");
  const stepsProtocolTiming = document.getElementById("steps-protocol-timing");
  const stepsProgress = document.getElementById("steps-progress");
  const finishStepsButton = document.getElementById("finish-steps-button");
  const patientAge = document.getElementById("patient-age");
  const patientWeight = document.getElementById("patient-weight");
  const patientBp = document.getElementById("patient-bp");
  const patientHr = document.getElementById("patient-hr");
  const patientTemp = document.getElementById("patient-temp");
  const patientRr = document.getElementById("patient-rr");
  const patientSpo2 = document.getElementById("patient-spo2");
  const chatFeed = document.getElementById("chat-feed");
  const voiceStatusMessage = document.getElementById("voice-status-message");
  const guidelineImage = document.getElementById("guideline-image");
  const guidelineFallback = document.getElementById("guideline-fallback");
  const guidelineZoomTrigger = document.getElementById("guideline-zoom-trigger");
  const guidelineLightbox = document.getElementById("guideline-lightbox");
  const guidelineLightboxImage = document.getElementById("guideline-lightbox-image");
  const guidelineLightboxClose = document.getElementById("guideline-lightbox-close");
  const calculateButton = document.getElementById("calculate-button");
  const calculatorResult = document.getElementById("calculator-result");
  const weightInput = document.getElementById("weight-input");
  const weightInputLabel = document.getElementById("weight-input-label");
  const bolusInput = document.getElementById("bolus-input");
  const calculatorDisplay = document.getElementById("calculator-display");
  const textSizeSlider = document.getElementById("text-size-slider");
  const darkModeToggle = document.getElementById("dark-mode-toggle");
  const unitSystemSelect = document.getElementById("unit-system-select");
  const micThresholdSlider = document.getElementById("mic-threshold-slider");
  const micThresholdValue = document.getElementById("mic-threshold-value");
  const micThresholdMarker = document.getElementById("mic-threshold-marker");
  const micLevelFill = document.getElementById("mic-level-fill");
  const micLevelReadout = document.getElementById("mic-level-readout");
  const micThresholdState = document.getElementById("mic-threshold-state");
  const micThresholdTestButton = document.getElementById("mic-threshold-test-button");
  const vitalsVoiceButton = document.getElementById("vitals-voice-button");
  const voiceScreenButton = document.getElementById("voice-screen-button");
  const voiceSendButton = document.getElementById("voice-send-button");
  const voiceClearButton = document.getElementById("voice-clear-button");
  const voiceDebugToggle = document.getElementById("voice-debug-toggle");
  const voiceChatStatus = document.getElementById("voice-chat-status");
  const voiceDebugPanel = document.getElementById("voice-debug-panel");
  const voiceDebugMeta = document.getElementById("voice-debug-meta");
  const voiceDebugError = document.getElementById("voice-debug-error");
  const voiceDebugBody = document.getElementById("voice-debug-body");
  const speakerButtons = [voiceScreenButton, vitalsVoiceButton];
  const voiceTextInput = document.getElementById("voice-text-input");
  const scalableTextElements = Array.from(document.querySelectorAll(".phone-frame *")).filter(function (element) {
    return !element.matches("i, .fa-solid, .fa-regular, .fa-brands");
  });
  const baseTextSizes = new Map();
  let micThresholdStream = null;
  let micThresholdAudioContext = null;
  let micThresholdAnalyser = null;
  let micThresholdAnimationFrame = null;
  let micThresholdData = null;

  scalableTextElements.forEach(function (element) {
    const fontSize = parseFloat(window.getComputedStyle(element).fontSize);
    if (Number.isFinite(fontSize)) {
      baseTextSizes.set(element, fontSize);
    }
  });

  function setMicButtonState(button, state) {
    if (state === "recording") {
      button.innerHTML = '<i class="fa-solid fa-stop"></i><span class="voice-pad__label">Stop Recording</span>';
      button.setAttribute("aria-label", "Stop recording");
      button.classList.add("voice-pad--recording");
      button.classList.remove("voice-pad--working");
      button.disabled = false;
      return;
    }
    if (state === "transcribing") {
      button.innerHTML = '<i class="fa-solid fa-wave-square"></i><span class="voice-pad__label">Transcribing...</span>';
      button.setAttribute("aria-label", "Transcribing audio");
      button.classList.remove("voice-pad--recording");
      button.classList.add("voice-pad--working");
      button.disabled = true;
      return;
    }
    button.innerHTML = '<i class="fa-solid fa-microphone"></i><span class="voice-pad__label">Record Voice</span>';
    button.setAttribute("aria-label", "Start recording");
    button.classList.remove("voice-pad--recording");
    button.classList.remove("voice-pad--working");
    button.disabled = false;
  }

  function renderMicThresholdTester(level) {
    const threshold = state.settings.micThreshold;
    const safeLevel = Number.isFinite(level) ? Math.max(0, Math.min(100, level)) : 0;
    micThresholdSlider.value = String(threshold);
    micThresholdValue.textContent = String(threshold);
    micThresholdMarker.style.left = threshold + "%";
    micLevelFill.style.width = safeLevel + "%";
    micLevelReadout.textContent = "Current level: " + Math.round(safeLevel);

    if (micThresholdStream) {
      micThresholdState.textContent = safeLevel >= threshold ? "Threshold reached" : "Below threshold";
    } else {
      micThresholdState.textContent = "Waiting to start";
    }
  }

  function stopMicThresholdTester() {
    if (micThresholdAnimationFrame !== null) {
      window.cancelAnimationFrame(micThresholdAnimationFrame);
      micThresholdAnimationFrame = null;
    }
    if (micThresholdStream) {
      micThresholdStream.getTracks().forEach(function (track) {
        track.stop();
      });
      micThresholdStream = null;
    }
    if (micThresholdAudioContext) {
      micThresholdAudioContext.close().catch(function () {});
      micThresholdAudioContext = null;
    }
    micThresholdAnalyser = null;
    micThresholdData = null;
    micThresholdTestButton.textContent = "Start Tester";
    renderMicThresholdTester(0);
  }

  async function startMicThresholdTester() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        throw new Error("This browser does not support Web Audio.");
      }

      micThresholdStream = stream;
      micThresholdAudioContext = new AudioContextClass();
      const source = micThresholdAudioContext.createMediaStreamSource(stream);
      micThresholdAnalyser = micThresholdAudioContext.createAnalyser();
      micThresholdAnalyser.fftSize = 1024;
      micThresholdData = new Uint8Array(micThresholdAnalyser.fftSize);
      source.connect(micThresholdAnalyser);
      micThresholdTestButton.textContent = "Stop Tester";

      function updateLevel() {
        if (!micThresholdAnalyser || !micThresholdData) {
          return;
        }

        micThresholdAnalyser.getByteTimeDomainData(micThresholdData);
        let peak = 0;
        for (let index = 0; index < micThresholdData.length; index += 1) {
          const centered = Math.abs(micThresholdData[index] - 128) / 128;
          if (centered > peak) {
            peak = centered;
          }
        }

        renderMicThresholdTester(peak * 100);
        micThresholdAnimationFrame = window.requestAnimationFrame(updateLevel);
      }

      updateLevel();
    } catch (error) {
      stopMicThresholdTester();
      micThresholdState.textContent = error.message || "Microphone access failed.";
      micThresholdState.classList.add("is-visible");
    }
  }

  function showScreen(name) {
    if (name !== "settings") {
      stopMicThresholdTester();
    }
    Object.keys(screens).forEach(function (key) {
      screens[key].classList.toggle("screen--active", key === name);
    });
    state.currentScreen = name;
    if (screens[name]) {
      screens[name].scrollTop = 0;
    }
    saveState();
  }

  function isProtocolTarget(target) {
    return target === "Sepsis" || target === "Septic Shock";
  }

  function getProtocolRecord(protocolName) {
    return state.protocolData[protocolName] || state.protocolData.Sepsis;
  }

  function appendChatMessage(role, text) {
    const cleaned = String(text || "").trim();
    if (!cleaned) {
      return;
    }

    const lastMessage = state.chatData.history[state.chatData.history.length - 1];
    if (lastMessage && lastMessage.role === role && lastMessage.text === cleaned) {
      return;
    }

    state.chatData.history.push(createChatMessage(role, cleaned));
  }

  function setVoiceDebugSnapshot(result) {
    state.chatData.debugSnapshot = sanitizeDebugSnapshot({
      question: result && typeof result.text === "string" ? result.text : state.chatData.summary,
      structuredQuery: result && typeof result.structured_query === "string" ? result.structured_query : "",
      ragError: result && typeof result.rag_error === "string" ? result.rag_error : "",
      pipelineElapsedSeconds: result ? result.pipeline_elapsed_seconds : null,
      llmElapsedSeconds: result ? result.llm_elapsed_seconds : null,
      ttsElapsedSeconds: result ? result.tts_elapsed_seconds : null,
      createdAt: result && typeof result.created_at === "string" ? result.created_at : state.lastHandledAt,
      retrievals: result && Array.isArray(result.retrievals) ? result.retrievals : []
    });
  }

  function formatDebugSeconds(value) {
    return Number.isFinite(value) ? value.toFixed(2) + "s" : "n/a";
  }

  function renderVoiceDebugPanel() {
    const isVisible = !!state.chatData.debugVisible;
    const snapshot = sanitizeDebugSnapshot(state.chatData.debugSnapshot);

    voiceDebugToggle.classList.toggle("ghost-button--active", isVisible);
    voiceDebugToggle.setAttribute("aria-expanded", isVisible ? "true" : "false");
    voiceDebugPanel.classList.toggle("is-hidden", !isVisible);

    if (!isVisible) {
      return;
    }

    voiceDebugMeta.innerHTML = "";
    voiceDebugBody.innerHTML = "";

    [
      ["Question", snapshot.question || "Not available yet."],
      ["Structured Query", snapshot.structuredQuery || "Not available yet."],
      ["Pipeline Time", formatDebugSeconds(snapshot.pipelineElapsedSeconds)],
      ["LLM Time", formatDebugSeconds(snapshot.llmElapsedSeconds)],
      ["TTS Time", formatDebugSeconds(snapshot.ttsElapsedSeconds)]
    ].forEach(function (entry) {
      const row = document.createElement("div");
      row.className = "voice-debug-row";

      const label = document.createElement("div");
      label.className = "voice-debug-row__label";
      label.textContent = entry[0];

      const value = document.createElement("div");
      value.className = "voice-debug-row__value";
      value.textContent = entry[1];

      row.appendChild(label);
      row.appendChild(value);
      voiceDebugMeta.appendChild(row);
    });

    voiceDebugError.textContent = snapshot.ragError || "";
    voiceDebugError.classList.toggle("is-visible", !!snapshot.ragError);

    if (!snapshot.retrievals.length) {
      const empty = document.createElement("div");
      empty.className = "voice-debug-empty";
      empty.textContent = "No retrieval debug data has been captured yet.";
      voiceDebugBody.appendChild(empty);
      return;
    }

    snapshot.retrievals.forEach(function (retrieval, index) {
      const card = document.createElement("article");
      card.className = "voice-debug-hit";

      const title = document.createElement("div");
      title.className = "voice-debug-hit__title";
      title.textContent = [
        "Hit " + (index + 1),
        retrieval.pageNumber ? "p." + retrieval.pageNumber : null,
        Number.isFinite(retrieval.score) ? "score " + retrieval.score.toFixed(3) : null,
        retrieval.querySources.length ? retrieval.querySources.join(", ") : null,
        retrieval.sectionLabel || null
      ].filter(Boolean).join(" · ");

      const text = document.createElement("div");
      text.className = "voice-debug-hit__text";
      text.textContent = retrieval.text;

      card.appendChild(title);
      card.appendChild(text);
      voiceDebugBody.appendChild(card);
    });
  }

  function resetVoiceConversation() {
    state.chatData.summary = "";
    state.chatData.response = "Summary and next steps will appear here after transcription or chatbot response.";
    state.chatData.input = "";
    state.chatData.statusMessage = "";
    state.chatData.history = [];
    state.chatData.debugSnapshot = createBlankDebugSnapshot();
    state.lastHandledAt = null;
    state.pendingRecordingTarget = null;
    if (state.activeAudio) {
      state.activeAudio.pause();
      state.activeAudio = null;
    }
    renderMicButtons("idle");
    renderVoiceChat();
  }

  function renderMicButtons(uiState) {
    const target = state.pendingRecordingTarget;
    setMicButtonState(vitalsVoiceButton, isProtocolTarget(target) ? uiState : "idle");
    setMicButtonState(voiceScreenButton, target === "voice" ? uiState : "idle");
  }

  function renderVoiceChat() {
    chatFeed.innerHTML = "";

    if (!state.chatData.history.length) {
      appendChatMessage("assistant", state.chatData.response || "Summary and next steps will appear here after transcription or chatbot response.");
    }

    state.chatData.history.forEach(function (message) {
      const bubble = document.createElement("article");
      bubble.className = message.role === "user" ? "chat-bubble chat-bubble--user" : "chat-bubble";

      const text = document.createElement("p");
      text.className = "chat-bubble__text";
      text.textContent = message.text;

      bubble.appendChild(text);
      chatFeed.appendChild(bubble);
    });

    voiceTextInput.value = state.chatData.input;
    voiceChatStatus.textContent = state.chatData.statusMessage || "";
    voiceChatStatus.classList.toggle("is-visible", !!state.chatData.statusMessage);
    renderVoiceDebugPanel();
    chatFeed.scrollTop = chatFeed.scrollHeight;
    saveState();
  }

  async function syncLatestVoiceResponse() {
    try {
      const latestResponse = await fetchJson(API.latestResponse);
      if (!latestResponse.created_at || latestResponse.created_at !== state.lastHandledAt) {
        return;
      }

      state.chatData.summary = latestResponse.transcript || state.chatData.summary;
      state.chatData.input = "";
      state.chatData.response = latestResponse.response || state.chatData.response;
      state.chatData.statusMessage = "";
      appendChatMessage("user", state.chatData.summary);
      appendChatMessage("assistant", state.chatData.response);
      renderVoiceChat();
    } catch (error) {
      if (!/LLM response is not available/i.test(error.message)) {
        throw error;
      }
    }
  }

  function renderVitalsView() {
    if (!isProtocolTarget(state.selectedProtocol)) {
      transcriptPreview.value = "";
      voiceStatusMessage.textContent = "Press Record Voice to capture the patient's vitals.";
      return;
    }

    const record = getProtocolRecord(state.selectedProtocol);
    transcriptPreview.value = record.transcript;
    voiceStatusMessage.textContent = record.statusMessage;
    saveState();
  }

  function navigateTo(name) {
    if (state.currentScreen && state.currentScreen !== name) {
      state.screenHistory.push(state.currentScreen);
    }
    showScreen(name);
  }

  function goBack() {
    const previous = state.screenHistory.pop();
    showScreen(previous || "home");
  }

  function openGuidelineZoom() {
    if (guidelineImage.classList.contains("is-hidden")) {
      return;
    }
    guidelineLightbox.classList.remove("is-hidden");
    document.body.classList.add("lightbox-open");
  }

  function closeGuidelineZoom() {
    guidelineLightbox.classList.add("is-hidden");
    document.body.classList.remove("lightbox-open");
  }

  function applyTextScale(size) {
    const scale = size / 16;
    baseTextSizes.forEach(function (baseSize, element) {
      element.style.fontSize = baseSize * scale + "px";
    });
  }

  function poundsToKilograms(value) {
    return value / 2.20462;
  }

  function kilogramsToPounds(value) {
    return value * 2.20462;
  }

  function fahrenheitToCelsius(value) {
    return (value - 32) * 5 / 9;
  }

  function celsiusToFahrenheit(value) {
    return (value * 9 / 5) + 32;
  }

  function formatNumber(value) {
    const rounded = Math.round(value * 10) / 10;
    return Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1);
  }

  function formatWeightCanonical(weightText) {
    const match = String(weightText || "").match(/(\d+(?:\.\d+)?)/);
    if (!match) {
      return "N/A";
    }
    const pounds = Number(match[1]);
    if (unitSystemSelect.value === "metric") {
      return formatNumber(poundsToKilograms(pounds)) + " kg";
    }
    return formatNumber(pounds) + " lbs";
  }

  function formatTemperatureCanonical(tempText) {
    const match = String(tempText || "").match(/(\d+(?:\.\d+)?)/);
    if (!match) {
      return "N/A";
    }
    const fahrenheit = Number(match[1]);
    if (unitSystemSelect.value === "metric") {
      return formatNumber(fahrenheitToCelsius(fahrenheit)) + " C";
    }
    return formatNumber(fahrenheit) + " F";
  }

  function updateCalculatorLabels() {
    if (unitSystemSelect.value === "metric") {
      weightInputLabel.textContent = "Patient Weight (kg)";
      if (!weightInput.dataset.convertedToMetric) {
        weightInput.value = formatNumber(poundsToKilograms(Number(weightInput.value || 0)));
        weightInput.dataset.convertedToMetric = "true";
      }
    } else {
      weightInputLabel.textContent = "Patient Weight (lb)";
      if (weightInput.dataset.convertedToMetric === "true") {
        weightInput.value = formatNumber(kilogramsToPounds(Number(weightInput.value || 0)));
        weightInput.dataset.convertedToMetric = "false";
      }
    }
  }

  function renderPatientInfo() {
    const patient = getProtocolRecord(state.selectedProtocol).patient;
    patientAge.textContent = patient.age;
    patientWeight.textContent = formatWeightCanonical(patient.weight);
    patientBp.textContent = patient.bloodPressure;
    patientHr.textContent = patient.heartRate;
    patientTemp.textContent = formatTemperatureCanonical(patient.temperature);
    patientRr.textContent = patient.respiratoryRate;
    patientSpo2.textContent = patient.oxygen;
    additionalInfo.value = patient.additionalInfo;
    saveState();
  }

  function appendToCalculator(value) {
    if (calculatorDisplay.value === "0" || calculatorDisplay.value === "Error") {
      calculatorDisplay.value = value;
      return;
    }
    calculatorDisplay.value += value;
  }

  function clearCalculator() {
    calculatorDisplay.value = "0";
  }

  function evaluateCalculator() {
    try {
      const sanitized = calculatorDisplay.value.replace(/[^0-9+\-*/.() ]/g, "");
      const result = Function("return (" + sanitized + ")")();
      calculatorDisplay.value = Number.isFinite(result) ? String(result) : "Error";
    } catch (error) {
      calculatorDisplay.value = "Error";
    }
  }

  function updateStepsProgress() {
    const total = state.stepCompletion.length;
    const completed = state.stepCompletion.filter(Boolean).length;
    stepsProgress.textContent = completed + " of " + total + " steps completed";
    finishStepsButton.disabled = total === 0 || completed !== total;
  }

  function toggleStep(index) {
    state.stepCompletion[index] = !state.stepCompletion[index];
    const card = stepsList.querySelector('[data-step-index="' + index + '"]');
    if (card) {
      const complete = state.stepCompletion[index];
      card.classList.toggle("step-card--complete", complete);
      card.setAttribute("aria-pressed", complete ? "true" : "false");
      const indicator = card.querySelector(".step-number");
      if (indicator) {
        indicator.innerHTML = complete
          ? '<i class="fa-solid fa-check"></i>'
          : String(index + 1);
      }
    }
    updateStepsProgress();
  }

  function renderSteps() {
    const protocol = protocols[state.selectedProtocol] || protocols.Sepsis;
    stepsProtocolTitle.textContent = protocol.title;
    stepsProtocolTiming.textContent = protocol.timing;
    stepsList.innerHTML = "";
    state.stepCompletion = protocol.steps.map(function () {
      return false;
    });

    protocol.steps.forEach(function (step, index) {
      const wrapper = document.createElement("button");
      wrapper.className = "step-card";
      wrapper.type = "button";
      wrapper.dataset.stepIndex = String(index);
      wrapper.setAttribute("aria-pressed", "false");

      const number = document.createElement("div");
      number.className = "step-number";
      number.textContent = String(index + 1);

      const body = document.createElement("div");
      body.className = "step-body";

      const title = document.createElement("h3");
      title.textContent = step.title;

      const text = document.createElement("p");
      text.textContent = step.body;

      body.appendChild(title);
      body.appendChild(text);
      wrapper.appendChild(number);
      wrapper.appendChild(body);
      wrapper.addEventListener("click", function () {
        toggleStep(index);
      });
      stepsList.appendChild(wrapper);
    });

    updateStepsProgress();
  }

  function formatPounds(value) {
    return formatNumber(value) + " lbs";
  }

  function getLastMatch(text, pattern) {
    const matches = Array.from(text.matchAll(pattern));
    return matches.length ? matches[matches.length - 1] : null;
  }

  function parsePatientTranscript(text) {
    const normalized = text.toLowerCase();
    const patient = createBlankPatient();

    const NUM = "(?:is|of|at|:)?\\s*(\\d+(?:\\.\\d+)?)";
    const ageMatch = getLastMatch(normalized, /(\d+)\s*(?:years old|year old|years|year|yrs|yr|y\/o|yo|y\b)/g);
    const weightMatch = getLastMatch(normalized, /(?:weight|weighs?)\s+(?:is\s+|of\s+)?(\d+(?:\.\d+)?)\s*(lbs|pounds|kg|kilogram|kilograms)/g) ||
                        getLastMatch(normalized, /(\d+(?:\.\d+)?)\s*(lbs|pounds|kg|kilogram|kilograms)/g);
    const hrMatch = getLastMatch(normalized, new RegExp("(?:heart rate|heart-rate|hr)\\s+" + NUM, "g")) ||
                    getLastMatch(normalized, /(\d+)\s*bpm/g);
    const bpMatch = getLastMatch(normalized, /(?:blood pressure|bp)\s+(?:is\s+|of\s+|at\s+)?(\d+)\s*(?:\/|over)\s*(\d+)/g) ||
                    getLastMatch(normalized, /(\d+)\s*(?:\/|over)\s*(\d+)\s*(?:mmhg)?/g);
    const tempMatch = getLastMatch(normalized, /(?:temperature|temp)\s+(?:is|of|at|:)?\s*(\d+(?:\.\d+)?)\s*(f|fahrenheit|c|celsius)?/g) ||
                     getLastMatch(normalized, /(\d+(?:\.\d+)?)\s*(f|fahrenheit|c|celsius)\b/g);
    const rrMatch = getLastMatch(normalized, new RegExp("(?:respiration rate|respiratory rate|rr)\\s+" + NUM, "g"));
    const spo2Match = getLastMatch(normalized, new RegExp("(?:spo2|sp o2|oxygen saturation|oxygen)\\s+" + NUM, "g"));

    if (ageMatch) patient.age = ageMatch[1];
    if (weightMatch) {
      const numericWeight = Number(weightMatch[1]);
      const unit = (weightMatch[2] || "").toLowerCase();
      patient.weight = unit === "kg" || unit === "kilogram" || unit === "kilograms"
        ? formatPounds(kilogramsToPounds(numericWeight))
        : formatPounds(numericWeight);
    }
    if (hrMatch) patient.heartRate = (hrMatch[1] || hrMatch[2] || hrMatch[0].match(/\d+/)[0]) + " bpm";
    if (bpMatch) patient.bloodPressure = bpMatch[1] + "/" + bpMatch[2] + " mmHg";
    if (tempMatch) {
      const numericTemp = Number(tempMatch[1]);
      const tempUnit = (tempMatch[2] || "f").toLowerCase();
      const fahrenheit = tempUnit === "c" || tempUnit === "celsius"
        ? celsiusToFahrenheit(numericTemp)
        : numericTemp;
      patient.temperature = formatNumber(fahrenheit) + " F";
    }
    if (rrMatch) patient.respiratoryRate = rrMatch[1] + " breaths/min";
    if (spo2Match) patient.oxygen = spo2Match[1] + "%";

    return patient;
  }

  async function fetchJson(url, options) {
    const response = await fetch(url, options);
    if (!response.ok) {
      const payload = await response.json().catch(function () {
        return {};
      });
      throw new Error(payload.detail || "Request failed.");
    }
    return response.json();
  }

  async function toggleRecording(target) {
    try {
      state.pendingRecordingTarget = target;
      const result = await fetchJson(API.toggle, { method: "POST" });
      if (result.state === "recording_started") {
        renderMicButtons("recording");
        if (isProtocolTarget(target)) {
          getProtocolRecord(target).statusMessage = "Recording vitals now. Tap Stop Recording when the nurse finishes speaking.";
          renderVitalsView();
        } else {
          state.chatData.statusMessage = "Recording now. Tap Stop Recording when you're finished speaking.";
          renderVoiceChat();
        }
      }
      if (result.state === "transcribing") {
        renderMicButtons("transcribing");
        if (isProtocolTarget(target)) {
          getProtocolRecord(target).statusMessage = "Recording stopped. Transcribing and extracting vitals now.";
          renderVitalsView();
        } else {
          state.chatData.statusMessage = "Recording stopped. Backend is transcribing.";
          renderVoiceChat();
        }
      }
      if (result.state === "busy") {
        if (isProtocolTarget(target)) {
          getProtocolRecord(target).statusMessage = "The backend is still processing the previous recording.";
          renderVitalsView();
        } else {
          state.chatData.statusMessage = "The backend is still processing the previous recording.";
          renderVoiceChat();
        }
      }
      if (result.state === "no_audio") {
        state.pendingRecordingTarget = null;
        renderMicButtons("idle");
        if (isProtocolTarget(target)) {
          getProtocolRecord(target).statusMessage = "No audio captured. Please try again.";
          renderVitalsView();
        } else {
          state.chatData.statusMessage = "No audio captured. Please try again.";
          renderVoiceChat();
        }
      }
    } catch (error) {
      const failedTarget = target;
      state.pendingRecordingTarget = null;
      renderMicButtons("idle");
      if (isProtocolTarget(failedTarget)) {
        getProtocolRecord(failedTarget).statusMessage = error.message;
        renderVitalsView();
      } else {
        state.chatData.statusMessage = error.message;
        renderVoiceChat();
      }
    }
  }

  async function syncRecordingStatus() {
    try {
      const status = await fetchJson(API.status);
      const uiState = status.recording ? "recording" : (status.transcribing ? "transcribing" : "idle");
      renderMicButtons(uiState);

      if (isProtocolTarget(state.pendingRecordingTarget)) {
        const record = getProtocolRecord(state.pendingRecordingTarget);
        if (status.recording) {
          record.statusMessage = "Recording vitals now. Tap Stop Recording when the nurse finishes speaking.";
        } else if (status.transcribing) {
          record.statusMessage = "Transcribing audio and extracting the patient's vitals.";
        } else if (status.last_error) {
          record.statusMessage = status.last_error;
        } else if (status.latest_text) {
          record.statusMessage = "Vitals captured. Review the transcript below.";
        } else {
          record.statusMessage = "Press Record Voice to capture the patient's vitals.";
        }
        renderVitalsView();
      } else if (state.pendingRecordingTarget === "voice") {
        if (status.recording) {
          state.chatData.statusMessage = "Recording now. Tap Stop Recording when you're finished speaking.";
        } else if (status.transcribing) {
          state.chatData.statusMessage = "Transcribing your voice request.";
        } else if (status.last_error) {
          state.chatData.statusMessage = status.last_error;
        } else {
          state.chatData.statusMessage = "";
        }
        renderVoiceChat();
      }
    } catch (error) {
      renderMicButtons("idle");
      if (isProtocolTarget(state.selectedProtocol)) {
        getProtocolRecord(state.selectedProtocol).statusMessage = "Backend connection unavailable. Start the backend to use voice recording.";
        renderVitalsView();
      }
    }
  }

  async function syncLatestResult() {
    try {
      const latest = await fetchJson(API.latestTranscription);
      if (!latest.created_at || latest.created_at === state.lastHandledAt) {
        return;
      }

      state.lastHandledAt = latest.created_at;
      const target = state.pendingRecordingTarget;
      const shouldUpdateVoiceChat = target === "voice" || (state.currentScreen === "voice" && !!latest.llm_response);

      if (shouldUpdateVoiceChat) {
        state.chatData.summary = latest.text || state.chatData.summary;
        state.chatData.input = "";
        state.chatData.response = latest.llm_response || "Voice request captured.";
        state.chatData.statusMessage = "";
        setVoiceDebugSnapshot(latest);
        appendChatMessage("user", state.chatData.summary);
        appendChatMessage("assistant", state.chatData.response);
        renderVoiceChat();
        if (!latest.llm_response) {
          await syncLatestVoiceResponse();
        }
        if (latest.llm_response && state.speakerEnabled) {
          if (state.activeAudio) {
            state.activeAudio.pause();
          }
          state.activeAudio = new Audio(API.latestAudio + "?t=" + Date.now());
          state.activeAudio.play().catch(function () {});
        } 
      } else if (isProtocolTarget(target)) {
        const record = getProtocolRecord(target);
        record.transcript = latest.text || "";
        record.patient = parsePatientTranscript(record.transcript);
        record.statusMessage = "Vitals captured. Review the transcript below.";
        if (latest.llm_response) {
          record.patient.additionalInfo = latest.llm_response;
        }
        renderVitalsView();
        renderPatientInfo();
      }

      state.pendingRecordingTarget = null;
      renderMicButtons("idle");
    } catch (error) {
      if (!/No transcription has been published yet/i.test(error.message)) {
        if (state.pendingRecordingTarget === "voice") {
          state.chatData.statusMessage = error.message;
          renderVoiceChat();
        } else if (isProtocolTarget(state.pendingRecordingTarget || state.selectedProtocol)) {
          getProtocolRecord(state.pendingRecordingTarget || state.selectedProtocol).statusMessage = error.message;
          renderVitalsView();
        }
      }
    }
  }

  async function submitVoiceText() {
    const message = voiceTextInput.value.trim();
    if (!message) {
      return;
    }

    state.chatData.input = message;
    state.chatData.summary = message;
    state.chatData.statusMessage = "Sending your message...";
    appendChatMessage("user", message);
    renderVoiceChat();

    try {
      const result = await fetchJson(API.pipelineText, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ text: message })
      });

      state.lastHandledAt = result.created_at || state.lastHandledAt;
      state.chatData.summary = result.text || message;
      state.chatData.response = result.llm_response || "Voice request captured.";
      state.chatData.input = "";
      state.chatData.statusMessage = "";
      setVoiceDebugSnapshot(result);
      appendChatMessage("assistant", state.chatData.response);
      renderVoiceChat();

      if (result.llm_response && state.speakerEnabled) {
        if (state.activeAudio) {
          state.activeAudio.pause();
        }
        state.activeAudio = new Audio(API.latestAudio + "?t=" + Date.now());
        state.activeAudio.play().catch(function () {});
      }
    } catch (error) {
      state.chatData.statusMessage = error.message;
      state.chatData.input = message;
      renderVoiceChat();
    }
  }

  document.querySelectorAll("[data-protocol]").forEach(function (button) {
    button.addEventListener("click", function () {
      state.selectedProtocol = button.dataset.protocol;
      if (state.selectedProtocol === "Cardiac Arrest") {
        renderSteps();
        navigateTo("steps");
        return;
      }
      renderVitalsView();
      navigateTo("vitals");
    });
  });

  document.querySelectorAll("[data-screen-target]").forEach(function (button) {
    button.addEventListener("click", function () {
      if (button.dataset.screenTarget === "voice") {
        renderVoiceChat();
      }
      navigateTo(button.dataset.screenTarget);
    });
  });

  document.querySelectorAll("[data-open-menu]").forEach(function (button) {
    button.addEventListener("click", function () {
      navigateTo("menu");
    });
  });

  document.querySelectorAll("[data-back-button]").forEach(function (button) {
    button.addEventListener("click", function () {
      goBack();
    });
  });

  document.getElementById("open-menu-button").addEventListener("click", function () {
    navigateTo("menu");
  });

  document.getElementById("confirm-vitals-button").addEventListener("click", function () {
    const record = getProtocolRecord(state.selectedProtocol);
    record.transcript = transcriptPreview.value;
    record.patient = parsePatientTranscript(record.transcript);
    renderPatientInfo();
    navigateTo("patient");
  });

  document.getElementById("start-assessment-button").addEventListener("click", function () {
    renderSteps();
    navigateTo("steps");
  });

  finishStepsButton.addEventListener("click", function () {
    navigateTo("home");
  });

  vitalsVoiceButton.addEventListener("click", function () {
    if (isProtocolTarget(state.selectedProtocol)) {
      toggleRecording(state.selectedProtocol);
    }
  });
  voiceScreenButton.addEventListener("click", function () {
    toggleRecording("voice");
  });

  voiceSendButton.addEventListener("click", function () {
    submitVoiceText();
  });

  voiceClearButton.addEventListener("click", function () {
    resetVoiceConversation();
  });

  voiceDebugToggle.addEventListener("click", function () {
    state.chatData.debugVisible = !state.chatData.debugVisible;
    renderVoiceChat();
  });

  voiceTextInput.addEventListener("input", function (event) {
    state.chatData.input = event.target.value;
    saveState();
  });

  voiceTextInput.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      event.preventDefault();
      submitVoiceText();
    }
  });

  micThresholdSlider.addEventListener("input", function (event) {
    state.settings.micThreshold = Number(event.target.value);
    renderMicThresholdTester(Number(micLevelFill.style.width.replace("%", "")) || 0);
    saveState();
  });

  micThresholdTestButton.addEventListener("click", function () {
    if (micThresholdStream) {
      stopMicThresholdTester();
      return;
    }
    startMicThresholdTester();
  });

  guidelineImage.addEventListener("error", function () {
    guidelineImage.classList.add("is-hidden");
    guidelineZoomTrigger.classList.add("is-hidden");
    guidelineLightboxImage.classList.add("is-hidden");
    guidelineFallback.classList.remove("is-hidden");
    guidelineFallback.style.display = "block";
  });

  guidelineZoomTrigger.addEventListener("click", openGuidelineZoom);
  guidelineLightboxClose.addEventListener("click", closeGuidelineZoom);
  guidelineLightbox.addEventListener("click", function (event) {
    if (event.target === guidelineLightbox) {
      closeGuidelineZoom();
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !guidelineLightbox.classList.contains("is-hidden")) {
      closeGuidelineZoom();
    }
  });

  calculateButton.addEventListener("click", function () {
    const enteredWeight = Number(weightInput.value || 0);
    const bolus = Number(bolusInput.value || 0);
    const weightKg = unitSystemSelect.value === "metric" ? enteredWeight : poundsToKilograms(enteredWeight);
    const total = weightKg * bolus;
    const weightLabel = unitSystemSelect.value === "metric"
      ? formatNumber(enteredWeight) + " kg"
      : formatNumber(enteredWeight) + " lb";
    calculatorResult.textContent = "Recommended bolus: " + total.toFixed(0) + " mL for " + weightLabel + " at " + bolus.toFixed(0) + " mL/kg";
  });

  document.querySelectorAll("[data-calc-value]").forEach(function (button) {
    button.addEventListener("click", function () {
      appendToCalculator(button.dataset.calcValue);
    });
  });

  document.querySelectorAll("[data-calc-action]").forEach(function (button) {
    button.addEventListener("click", function () {
      if (button.dataset.calcAction === "clear") {
        clearCalculator();
      }
      if (button.dataset.calcAction === "equals") {
        evaluateCalculator();
      }
    });
  });

  textSizeSlider.addEventListener("input", function (event) {
    applyTextScale(Number(event.target.value));
  });

  unitSystemSelect.addEventListener("change", function () {
    updateCalculatorLabels();
    renderPatientInfo();
  });

  darkModeToggle.addEventListener("change", function (event) {
    document.body.classList.toggle("theme-dark", event.target.checked);
  });

  document.getElementById("volume-slider").addEventListener("input", function (event) {
    if (state.activeAudio) {
      state.activeAudio.volume = Number(event.target.value) / 100;
    }
  });

  additionalInfo.addEventListener("change", function () {
    if (isProtocolTarget(state.selectedProtocol)) {
      getProtocolRecord(state.selectedProtocol).patient.additionalInfo = additionalInfo.value;
    }
  });

  restoreState();
  renderPatientInfo();
  renderVitalsView();
  renderVoiceChat();
  renderMicThresholdTester(0);
  renderSteps();
  updateCalculatorLabels();
  applyTextScale(Number(textSizeSlider.value));
  renderMicButtons("idle");
  showScreen(state.currentScreen);
  syncRecordingStatus();
  syncLatestResult();
  window.setInterval(syncRecordingStatus, 1500);
  window.setInterval(syncLatestResult, 1500);
})();
