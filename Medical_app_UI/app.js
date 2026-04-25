(function () {
  const STORAGE_KEY = "medapp-ui-state";
  const API = {
    status: "http://localhost:8000/recording/status",
    toggle: "http://localhost:8000/recording/toggle",
    latestTranscription: "http://localhost:8000/transcriptions/latest",
    latestResponse: "http://localhost:8000/responses/latest",
    pipelineText: "http://localhost:8000/pipeline/text",
    pipelineSteps: "http://localhost:8000/pipeline/steps",
    latestAudio: "http://localhost:8000/responses/latest/audio/mp3",
    authLogin: "http://localhost:8000/auth/login",
    adminGuidelines: "http://localhost:8000/admin/guidelines",
    adminGuidelineUpload: "http://localhost:8000/admin/guidelines/upload",
    adminGuidelineDownload: function (documentId) {
      return "http://localhost:8000/admin/guidelines/" + encodeURIComponent(documentId) + "/download";
    }
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
    settings: document.getElementById("screen-settings"),
    profile: document.getElementById("screen-profile"),
    login: document.getElementById("screen-login"),
    admin: document.getElementById("screen-admin"),
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
    teamAssignments: [],
    protocolStartTime: null,
    protocolTimerInterval: null,
    abxCountdownInterval: null,
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
  const profileLoginStatus = document.getElementById("profile-login-status");
  const loginNameDisplay = document.getElementById("login-name-display");
  const loginRoleDisplay = document.getElementById("login-role-display");
  const loginEmailInput = document.getElementById("login-email-input");
  const loginPasswordInput = document.getElementById("login-password-input");
  const loginRememberToggle = document.getElementById("login-remember-toggle");
  const loginStatusMessage = document.getElementById("login-status-message");
  const loginSubmitButton = document.getElementById("login-submit-btn");
  const loginSignoutButton = document.getElementById("login-signout-btn");
  const adminNameDisplay = document.getElementById("admin-name-display");
  const adminAccessDisplay = document.getElementById("admin-access-display");
  const adminUsersCount = document.getElementById("admin-users-count");
  const adminInstitutionInput = document.getElementById("admin-institution-input");
  const adminRoleSelect = document.getElementById("admin-role-select");
  const adminProtocolReviewToggle = document.getElementById("admin-protocol-review-toggle");
  const adminAuditToggle = document.getElementById("admin-audit-toggle");
  const adminSaveButton = document.getElementById("admin-save-btn");
  const adminGuidelineFileInput = document.getElementById("admin-guideline-file");
  const adminGuidelineFileName = document.getElementById("admin-guideline-file-name");
  const adminGuidelineUploadButton = document.getElementById("admin-guideline-upload-btn");
  const adminGuidelineClearButton = document.getElementById("admin-guideline-clear-btn");
  const adminGuidelineRefreshButton = document.getElementById("admin-guideline-refresh-btn");
  const adminGuidelineStatus = document.getElementById("admin-guideline-status");
  const adminGuidelineList = document.getElementById("admin-guideline-list");
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
    var isBox = button && button.classList.contains("chat-mic-box");
    if (state === "recording") {
      button.innerHTML = isBox
        ? '<i class="fa-solid fa-stop"></i><span>Stop Recording</span>'
        : '<i class="fa-solid fa-stop"></i><span class="voice-pad__label">Stop Recording</span>';
      button.setAttribute("aria-label", "Stop recording");
      button.classList.add("voice-pad--recording");
      button.classList.remove("voice-pad--working");
      button.disabled = false;
      return;
    }
    if (state === "transcribing") {
      button.innerHTML = isBox
        ? '<i class="fa-solid fa-wave-square"></i><span>Transcribing...</span>'
        : '<i class="fa-solid fa-wave-square"></i><span class="voice-pad__label">Transcribing...</span>';
      button.setAttribute("aria-label", "Transcribing audio");
      button.classList.remove("voice-pad--recording");
      button.classList.add("voice-pad--working");
      button.disabled = true;
      return;
    }
    button.innerHTML = isBox
      ? '<i class="fa-solid fa-microphone"></i><span>Record Voice</span>'
      : '<i class="fa-solid fa-microphone"></i><span class="voice-pad__label">Record Voice</span>';
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
    document.querySelectorAll(".bottom-nav__btn[data-screen-target]").forEach(function (button) {
      button.classList.toggle("bottom-nav__btn--active", button.dataset.screenTarget === name);
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

    if (name === "steps") {
      startProtocolTimer();
      var patient = getProtocolRecord(state.selectedProtocol).patient;
      updateVitalsBar(patient || {});
    } else {
      stopProtocolTimer();
    }
    if (name === "home") {
      refreshHomeDashboard();
    }
    if (name === "calculator") {
      var calcScreen = document.getElementById("screen-calculator");
      if (calcScreen) calcScreen.dispatchEvent(new CustomEvent("calc-enter"));
    }
    if (name === "admin") {
      loadAdminGuidelines();
    }
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

  function updateCalculatorLabels() { /* replaced by guided dosing calculator */ }

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

  function updateStepsProgress(steps) {
    var total = state.stepCompletion.length;
    var completed = state.stepCompletion.filter(Boolean).length;
    var pct = total > 0 ? Math.round((completed / total) * 100) : 0;

    var fill = document.getElementById("steps-progress-fill");
    if (fill) fill.style.width = pct + "%";

    if (total > 0 && completed === total) {
      stepsProgress.textContent = "Initial Bundle Complete";
      stepsProgress.style.color = "#2f855a";
      stepsProgress.style.fontWeight = "700";
    } else {
      stepsProgress.textContent = completed + " of " + total + " steps completed";
      stepsProgress.style.color = "";
      stepsProgress.style.fontWeight = "";
    }
    finishStepsButton.disabled = total === 0 || completed !== total;
  }

  var _currentStepsRef = [];

  function toggleStep(index, steps) {
    state.stepCompletion[index] = !state.stepCompletion[index];
    var stepsData = steps || _currentStepsRef;
    var card = stepsList.querySelector('[data-step-index="' + index + '"]');
    if (card) {
      var complete = state.stepCompletion[index];
      card.classList.toggle("step-card--complete", complete);
      card.setAttribute("aria-pressed", complete ? "true" : "false");
      var indicator = card.querySelector(".step-number");
      if (indicator) {
        indicator.innerHTML = complete ? '<i class="fa-solid fa-check"></i>' : String(index + 1);
      }
      // Flash animation
      if (complete) {
        card.classList.add("step-card--just-completed");
        setTimeout(function () { card.classList.remove("step-card--just-completed"); }, 700);
      }
      // Team assignment
      if (complete) {
        var nextRole = (state.stepCompletion.filter(Boolean).length - 1) % TEAM_ROLES.length;
        state.teamAssignments[index] = nextRole;
      } else {
        state.teamAssignments[index] = -1;
      }
      renderTeamGrid(stepsData);
    }
    updateStepsProgress(stepsData);
  }

  function renderStepsFromData(title, timing, steps, preCompleted) {
    stepsProtocolTitle.textContent = title;
    stepsProtocolTiming.textContent = timing;
    stepsList.innerHTML = "";
    state.stepCompletion = steps.map(function (_, i) {
      return Array.isArray(preCompleted) ? !!preCompleted[i] : false;
    });
    // Init team assignments: pre-completed steps auto-assign to team members
    state.teamAssignments = [];
    var roleIndex = 0;
    state.stepCompletion.forEach(function (done, i) {
      if (done) { state.teamAssignments[i] = roleIndex % TEAM_ROLES.length; roleIndex++; }
      else { state.teamAssignments[i] = -1; }
    });

    steps.forEach(function (step, index) {
      var complete = state.stepCompletion[index];
      var wrapper = document.createElement("button");
      wrapper.className = "step-card" + (complete ? " step-card--complete" : "");
      wrapper.type = "button";
      wrapper.dataset.stepIndex = String(index);
      wrapper.setAttribute("aria-pressed", complete ? "true" : "false");

      var number = document.createElement("div");
      number.className = "step-number";
      number.innerHTML = complete ? '<i class="fa-solid fa-check"></i>' : String(index + 1);

      var body = document.createElement("div");
      body.className = "step-body";

      var titleEl = document.createElement("h3");
      titleEl.textContent = step.title;
      body.appendChild(titleEl);

      if (step.body) {
        var why = document.createElement("p");
        why.className = "step-why";
        why.textContent = step.body;
        body.appendChild(why);
      }


      wrapper.appendChild(number);
      wrapper.appendChild(body);
      wrapper.addEventListener("click", function () { toggleStep(index, steps); });
      stepsList.appendChild(wrapper);
    });

    renderTeamGrid(steps);
    updateStepsProgress(steps);
    startAbxCountdown(steps);
  }

  function renderSteps() {
    const protocol = protocols[state.selectedProtocol] || protocols.Sepsis;
    _currentStepsRef = protocol.steps;
    renderStepsFromData(protocol.title, protocol.timing, protocol.steps);
  }

  function renderStepsLoading() {
    const protocol = protocols[state.selectedProtocol] || protocols.Sepsis;
    stepsProtocolTitle.textContent = protocol.title;
    stepsProtocolTiming.textContent = "Generating personalised steps...";
    stepsList.innerHTML = '<p style="padding:12px;color:var(--muted);font-size:14px;">Analysing patient vitals and generating steps\u2026</p>';
    state.stepCompletion = [];
    updateStepsProgress();
  }

  function buildStepsPrompt(patient) {
    const protocol = state.selectedProtocol || "Sepsis";
    return [
      "You are a clinical decision support AI. Based on the patient vitals below, list exactly 5 to 7 numbered action steps a medical team should take within the first 3 hours for " + protocol + ".",
      "Format EACH step exactly as: [number]. [Short title]: [One or two sentence description].",
      "Output ONLY the numbered steps. No intro, no conclusion, no extra text.",
      "",
      "Patient:",
      "Age: " + patient.age,
      "Weight: " + patient.weight,
      "Heart Rate: " + patient.heartRate,
      "Blood Pressure: " + patient.bloodPressure,
      "Temperature: " + patient.temperature,
      "Respiratory Rate: " + patient.respiratoryRate,
      "SpO2: " + patient.oxygen,
      "Additional Notes: " + patient.additionalInfo
    ].join("\n");
  }

  // Keywords that indicate a step has already been completed based on patient data
  var STEP_COMPLETION_SIGNALS = [
    { keywords: ["lactate", "serum lactate", "lactic acid"],        stepPatterns: [/lactate/i] },
    { keywords: ["blood culture", "cultures drawn", "culture"],     stepPatterns: [/blood culture/i, /cultures/i] },
    { keywords: ["antibiotic", "abx", "vanc", "pip", "mero"],      stepPatterns: [/antibiotic/i, /antimicrobial/i] },
    { keywords: ["fluid bolus", "bolus given", "litre", "liter", "iv fluid", "normal saline", "ns bolus", "lactated"],
                                                                    stepPatterns: [/fluid/i, /resuscitat/i, /bolus/i] },
    { keywords: ["iv access", "iv line", "peripheral iv", "central line", "piv"],
                                                                    stepPatterns: [/iv access/i, /vascular access/i, /access/i] },
    { keywords: ["ecg", "ekg", "12-lead", "twelve lead"],           stepPatterns: [/ecg/i, /ekg/i, /cardiac monitor/i] },
    { keywords: ["chest x-ray", "chest xray", "cxr"],              stepPatterns: [/chest x.ray/i, /cxr/i, /imaging/i] },
    { keywords: ["urine output", "foley", "catheter", "uop"],       stepPatterns: [/urine/i, /foley/i, /output monitor/i] },
    { keywords: ["o2", "oxygen", "nasal cannula", "face mask", "non-rebreather", "high flow"],
                                                                    stepPatterns: [/oxygen/i, /o2/i, /supplemental/i] },
  ];

  function detectCompletedSteps(patient, steps) {
    var transcript = (getProtocolRecord(state.selectedProtocol).transcript || "").toLowerCase();
    var notes = (patient.additionalInfo || "").toLowerCase();
    var combined = transcript + " " + notes;

    return steps.map(function (step) {
      var stepText = (step.title + " " + step.body).toLowerCase();
      return STEP_COMPLETION_SIGNALS.some(function (signal) {
        // Does the step match this signal?
        var stepMatches = signal.stepPatterns.some(function (p) { return p.test(stepText); });
        if (!stepMatches) return false;
        // Was this already reported in the patient data?
        return signal.keywords.some(function (kw) { return combined.indexOf(kw) !== -1; });
      });
    });
  }

  function parseLLMSteps(text) {
    // If the response has a STEPS: section, extract only that part
    var stepsMatch = text.match(/STEPS:\s*\n([\s\S]*)/i);
    var source = stepsMatch ? stepsMatch[1] : text;

    var lines = source.split("\n").map(function (l) { return l.trim(); }).filter(Boolean);
    var steps = [];
    var current = null;

    lines.forEach(function (line) {
      // Match "1. Title: body" or "1. **Title**: body" or "1. Title"
      var m = line.match(/^\d+[.)]\s+(?:\*{1,2})?([^*\n]+?)(?:\*{1,2})?\s*(?::\s*(.+))?$/);
      if (m) {
        if (current) { steps.push(current); }
        var title = m[1].trim().replace(/\s*\[\d+\]\s*$/, ""); // strip trailing citations
        var body = m[2] ? m[2].trim().replace(/\s*\[\d+\]\s*/g, "") : "";
        current = { title: title, body: body };
      } else if (current && !/^(SUMMARY|CONDITION|SUPPORTED_CONCERN|STEPS):/i.test(line)) {
        current.body = (current.body ? current.body + " " : "") + line;
      }
    });

    if (current) { steps.push(current); }
    return steps.length ? steps : null;
  }

  function formatPounds(value) {
    return formatNumber(value) + " lbs";
  }

  // ── Protocol timer ──────────────────────────────────────────────────────
  function startProtocolTimer() {
    stopProtocolTimer();
    state.protocolStartTime = Date.now();
    var timerEl = document.getElementById("protocol-timer");
    state.protocolTimerInterval = setInterval(function () {
      var elapsed = Math.floor((Date.now() - state.protocolStartTime) / 1000);
      var m = String(Math.floor(elapsed / 60)).padStart(2, "0");
      var s = String(elapsed % 60).padStart(2, "0");
      if (timerEl) timerEl.textContent = m + ":" + s;
    }, 1000);
  }

  function stopProtocolTimer() {
    if (state.protocolTimerInterval) {
      clearInterval(state.protocolTimerInterval);
      state.protocolTimerInterval = null;
    }
    if (state.abxCountdownInterval) {
      clearInterval(state.abxCountdownInterval);
      state.abxCountdownInterval = null;
    }
  }

  // ── Antibiotic countdown (3-hour window from protocol start) ─────────────
  function startAbxCountdown(steps) {
    var hasAbxStep = steps.some(function (s, i) {
      return /antibiotic|antimicrobial|abx/i.test(s.title + " " + s.body) && !state.stepCompletion[i];
    });
    var card = document.getElementById("abx-deadline-card");
    if (!card) return;
    if (!hasAbxStep) { card.classList.add("is-hidden"); return; }
    card.classList.remove("is-hidden");

    var THREE_HOURS = 3 * 60 * 60 * 1000;
    if (state.abxCountdownInterval) clearInterval(state.abxCountdownInterval);
    state.abxCountdownInterval = setInterval(function () {
      var elapsed = Date.now() - (state.protocolStartTime || Date.now());
      var remaining = Math.max(0, THREE_HOURS - elapsed);
      var totalSec = Math.floor(remaining / 1000);
      var h = Math.floor(totalSec / 3600);
      var m = Math.floor((totalSec % 3600) / 60);
      var s = totalSec % 60;
      var display = h + "h " + String(m).padStart(2, "0") + "m " + String(s).padStart(2, "0") + "s";
      var el = document.getElementById("abx-countdown");
      if (el) el.textContent = display;
      if (remaining === 0) {
        clearInterval(state.abxCountdownInterval);
        if (el) el.textContent = "OVERDUE";
        if (el) el.style.color = "#c53030";
      }
    }, 1000);
  }

  // ── Vitals bar ────────────────────────────────────────────────────────────
  var VITAL_THRESHOLDS = {
    hr:   { critical: [0, 50, 130, 999], warning: [50, 60, 110, 130] },
    bp:   { critical: [0, 70],            warning: [70, 90] },   // systolic
    temp: { critical: [0, 95, 104.5, 999], warning: [95, 97.5, 101, 104.5] },
    spo2: { critical: [0, 90],            warning: [90, 95] },
  };

  function vitalStatus(type, rawValue) {
    var n = parseFloat(String(rawValue).replace(/[^\d.]/g, ""));
    if (isNaN(n)) return "";
    var t = VITAL_THRESHOLDS[type];
    if (!t) return "";
    if (type === "hr" || type === "temp") {
      if (n < t.critical[1] || n > t.critical[2]) return "critical";
      if (n < t.warning[1] || n > t.warning[2]) return "warning";
      return "normal";
    }
    // bp and spo2: critical below threshold, warning in middle
    if (n < t.critical[1]) return "critical";
    if (n < t.warning[1])  return "warning";
    return "normal";
  }

  function updateVitalsBar(patient) {
    var fields = [
      { id: "bar-hr",   value: patient.heartRate,    type: "hr" },
      { id: "bar-bp",   value: patient.bloodPressure, type: "bp" },
      { id: "bar-temp", value: patient.temperature,   type: "temp" },
      { id: "bar-spo2", value: patient.oxygen,        type: "spo2" },
    ];
    fields.forEach(function (f) {
      var el = document.getElementById(f.id);
      if (!el) return;
      var display = (f.value && f.value !== "N/A") ? f.value : "—";
      el.textContent = display;
      el.className = "vitals-bar__value";
      if (display !== "—") {
        var status = vitalStatus(f.type, f.value);
        if (status) el.classList.add("vitals-bar__value--" + status);
      }
    });
    // Set urgency banner protocol name
    var nameEl = document.getElementById("urgency-protocol-name");
    if (nameEl) nameEl.textContent = (state.selectedProtocol || "PROTOCOL").toUpperCase() + " ACTIVE";
  }

  // ── Step sub-actions ──────────────────────────────────────────────────────
  var STEP_SUB_ACTIONS = [
    { pattern: /lactate|lactic acid/i,            actions: ["Order lab", "Receive result"] },
    { pattern: /blood culture|culture/i,           actions: ["Collect sample", "Sent to lab"] },
    { pattern: /antibiotic|antimicrobial|abx/i,    actions: ["Order", "Administer"] },
    { pattern: /fluid|bolus|resuscitat/i,          actions: ["Order bolus", "Running"] },
    { pattern: /iv access|vascular access|access/i, actions: ["Establish IV"] },
    { pattern: /oxygen|o2|supplemental/i,          actions: ["Apply O2", "Confirm SpO2 improving"] },
    { pattern: /picu|icu|escalat/i,                actions: ["Page team", "Team en route"] },
    { pattern: /vasopressor|norepinephrine|epi/i,  actions: ["Order", "Infusing"] },
  ];

  function getSubActions(stepTitle, stepBody) {
    var text = (stepTitle + " " + stepBody).toLowerCase();
    for (var i = 0; i < STEP_SUB_ACTIONS.length; i++) {
      if (STEP_SUB_ACTIONS[i].pattern.test(text)) return STEP_SUB_ACTIONS[i].actions;
    }
    return ["Done"];
  }

  // ── Team assignments ──────────────────────────────────────────────────────
  var TEAM_ROLES = ["Attending", "Resident", "Nurse 1", "Nurse 2"];

  function renderTeamGrid(steps) {
    var grid = document.getElementById("team-grid");
    if (!grid) return;
    grid.innerHTML = "";
    TEAM_ROLES.forEach(function (role, i) {
      var assignedIndex = state.teamAssignments.indexOf(i);
      var member = document.createElement("div");
      member.className = "team-member" + (assignedIndex !== -1 ? " team-member--active" : "");
      var roleEl = document.createElement("span");
      roleEl.className = "team-member__role";
      roleEl.textContent = role;
      var taskEl = document.createElement("span");
      taskEl.className = "team-member__task";
      if (assignedIndex !== -1 && steps[assignedIndex]) {
        taskEl.textContent = steps[assignedIndex].title;
      } else {
        taskEl.textContent = "Ready";
        taskEl.style.color = "var(--muted)";
        taskEl.style.fontWeight = "400";
      }
      member.appendChild(roleEl);
      member.appendChild(taskEl);
      grid.appendChild(member);
    });
  }

  function getLastMatch(text, pattern) {
    const matches = Array.from(text.matchAll(pattern));
    return matches.length ? matches[matches.length - 1] : null;
  }

  function normalizeNumbers(text) {
    var ones = {
      zero:0, one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8,
      nine:9, ten:10, eleven:11, twelve:12, thirteen:13, fourteen:14, fifteen:15,
      sixteen:16, seventeen:17, eighteen:18, nineteen:19, twenty:20,
      thirty:30, forty:40, fifty:50, sixty:60, seventy:70, eighty:80, ninety:90
    };
    // "102 point 4" / "98 decimal 6"
    text = text.replace(/\b(\w+)\s+(?:point|decimal)\s+(\w+)\b/gi, function(m, a, b) {
      var na = ones[a.toLowerCase()], nb = ones[b.toLowerCase()];
      return (na !== undefined && nb !== undefined) ? na + "." + nb : m;
    });
    // replace individual word numbers
    Object.keys(ones).forEach(function(word) {
      text = text.replace(new RegExp("\\b" + word + "\\b", "gi"), String(ones[word]));
    });
    // combine tens+ones written as two tokens: "80 5" → "85"
    text = text.replace(/\b([2-9]0)\s+([1-9])\b/g, function(m, t, u) { return String(+t + +u); });
    // hundreds: "1 100" → "100"
    text = text.replace(/\b([1-9])\s+100\b/g, function(m, n) { return String(+n * 100); });
    return text;
  }

  function parsePatientTranscript(text) {
    const normalized = normalizeNumbers(text.toLowerCase());
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

    // Extract additional clinical notes — anything that isn't a vital reading
    var vitalSegmentPatterns = [
      /heart rate|heart-rate|\bhr\b/,
      /blood pressure|\bbp\b/,
      /temperature|\btemp\b/,
      /respiratory rate|respiration rate|\brr\b/,
      /oxygen saturation|spo2|sp o2/,
      /\d+\s*bpm/,
      /\d+\s*(?:\/|over)\s*\d+/,
      /\d+(?:\.\d+)?\s*(?:degrees?|fahrenheit|celsius)/,
      /\byears?\s*old\b|\byrs?\b|\by\/o\b/,
      /\d+\s*(?:lbs?|pounds?|kg)/,
      /weighs?/,
    ];
    var segments = text.split(/[.,]+/).map(function(s) { return s.trim(); }).filter(function(s) { return s.length > 4; });
    var notesSegments = segments.filter(function(seg) {
      var segLower = seg.toLowerCase();
      return !vitalSegmentPatterns.some(function(p) { return p.test(segLower); });
    });
    if (notesSegments.length) {
      patient.additionalInfo = notesSegments.join(". ").replace(/\.\s*\./g, ".").trim();
    }

    return patient;
  }

  // ── Live browser transcription (interim display only) ────────────────────
  var liveRecognition = null;
  var liveRecognitionTarget = null;
  var liveRecognitionFinal = "";

  function stopLiveTranscript() {
    if (liveRecognition) {
      liveRecognition.onresult = null;
      liveRecognition.onend = null;
      liveRecognition.onerror = null;
      try { liveRecognition.stop(); } catch (e) {}
      liveRecognition = null;
    }
    liveRecognitionTarget = null;
    liveRecognitionFinal = "";
  }

  function startLiveTranscript(target) {
    var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { return; }

    stopLiveTranscript();
    liveRecognitionTarget = target;
    liveRecognitionFinal = "";

    liveRecognition = new SpeechRecognition();
    liveRecognition.continuous = true;
    liveRecognition.interimResults = true;
    liveRecognition.lang = "en-US";

    liveRecognition.onresult = function (event) {
      var finalParts = "";
      var interimPart = "";
      for (var i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalParts += event.results[i][0].transcript;
        } else {
          interimPart += event.results[i][0].transcript;
        }
      }
      liveRecognitionFinal = finalParts;
      var display = (finalParts + (interimPart ? " " + interimPart : "")).trim();
      if (isProtocolTarget(liveRecognitionTarget)) {
        transcriptPreview.value = display;
      }
    };

    liveRecognition.onerror = function () { stopLiveTranscript(); };
    liveRecognition.onend = function () {
      // Auto-restart while we're still recording so it doesn't time out
      if (liveRecognition) {
        try { liveRecognition.start(); } catch (e) {}
      }
    };

    try { liveRecognition.start(); } catch (e) { stopLiveTranscript(); }
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

  function getAdminAuthHeaders() {
    var session = getLoginSession();
    var token = session && (session.token || session.access_token || session.accessToken);
    return token ? { Authorization: "Bearer " + token } : {};
  }

  async function loginWithBackend(email, password) {
    var response = await fetch(API.authLogin, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email, password: password })
    });

    if (response.status === 404 || response.status === 405) {
      return null;
    }
    if (!response.ok) {
      var payload = await response.json().catch(function () {
        return {};
      });
      throw new Error(payload.detail || "Login failed.");
    }
    return response.json();
  }

  function renderGuidelineStatus(message, isSuccess) {
    adminGuidelineStatus.textContent = message;
    adminGuidelineStatus.classList.toggle("login-status-panel--success", !!isSuccess);
  }

  function formatGuidelineDate(value) {
    if (!value) {
      return "No upload date";
    }
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return String(value);
    }
    return date.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
  }

  function renderAdminGuidelines(items) {
    adminGuidelineList.innerHTML = "";
    if (!items || !items.length) {
      var empty = document.createElement("div");
      empty.className = "admin-guideline-empty";
      empty.textContent = "No indexed guideline PDFs yet.";
      adminGuidelineList.appendChild(empty);
      return;
    }

    items.forEach(function (item) {
      var row = document.createElement("article");
      row.className = "admin-guideline-row";

      var copy = document.createElement("div");
      copy.className = "admin-guideline-row__copy";

      var title = document.createElement("strong");
      title.textContent = item.document_name || item.title || "Guideline PDF";

      var meta = document.createElement("small");
      meta.textContent = [
        item.protocol_version ? "v" + item.protocol_version : null,
        item.status || null,
        item.total_chunks ? item.total_chunks + " chunks" : null,
        formatGuidelineDate(item.uploaded_at)
      ].filter(Boolean).join(" · ");

      copy.appendChild(title);
      copy.appendChild(meta);

      if (item.notification_message) {
        var alert = document.createElement("small");
        alert.className = "admin-guideline-row__alert";
        alert.textContent = item.notification_message;
        copy.appendChild(alert);
      }

      var download = document.createElement("button");
      download.className = "admin-guideline-download";
      download.type = "button";
      download.setAttribute("aria-label", "Download " + (item.document_name || "guideline PDF"));
      download.innerHTML = '<i class="fa-solid fa-download"></i>';
      download.addEventListener("click", function () {
        downloadAdminGuideline(item);
      });

      row.appendChild(copy);
      row.appendChild(download);
      adminGuidelineList.appendChild(row);
    });
  }

  async function downloadAdminGuideline(item) {
    renderGuidelineStatus("Preparing " + (item.document_name || "guideline PDF") + " for download...", false);
    try {
      var response = await fetch(API.adminGuidelineDownload(item.document_id), {
        headers: getAdminAuthHeaders()
      });
      if (!response.ok) {
        var payload = await response.json().catch(function () {
          return {};
        });
        throw new Error(payload.detail || "Download failed.");
      }
      var blob = await response.blob();
      var url = URL.createObjectURL(blob);
      var link = document.createElement("a");
      link.href = url;
      link.download = item.document_name || "guideline.pdf";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      renderGuidelineStatus("Downloaded " + (item.document_name || "guideline PDF") + ".", true);
    } catch (error) {
      renderGuidelineStatus(error.message || "Download failed.", false);
    }
  }

  async function loadAdminGuidelines() {
    renderGuidelineStatus("Loading indexed guideline PDFs...", false);
    try {
      var result = await fetchJson(API.adminGuidelines, {
        headers: getAdminAuthHeaders()
      });
      renderAdminGuidelines(result.items || []);
      renderGuidelineStatus("Guideline list is up to date.", true);
    } catch (error) {
      renderAdminGuidelines([]);
      renderGuidelineStatus(error.message || "Could not load guidelines.", false);
    }
  }

  function clearAdminGuidelineFile() {
    adminGuidelineFileInput.value = "";
    adminGuidelineFileName.textContent = "Select PDF guideline";
    renderGuidelineStatus("No PDF selected.", false);
  }

  async function uploadAdminGuideline() {
    var file = adminGuidelineFileInput.files && adminGuidelineFileInput.files[0];
    if (!file) {
      renderGuidelineStatus("Choose a PDF guideline before uploading.", false);
      return;
    }
    if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
      renderGuidelineStatus("Only PDF guideline files can be uploaded.", false);
      return;
    }

    var formData = new FormData();
    formData.append("file", file);
    adminGuidelineUploadButton.disabled = true;
    renderGuidelineStatus("Uploading and indexing " + file.name + " into RAG...", false);

    try {
      var result = await fetchJson(API.adminGuidelineUpload, {
        method: "POST",
        headers: getAdminAuthHeaders(),
        body: formData
      });
      clearAdminGuidelineFile();
      renderGuidelineStatus(
        "Uploaded " + (result.document_name || file.name) + " as guideline version " + (result.protocol_version || "new") + ".",
        true
      );
      await loadAdminGuidelines();
    } catch (error) {
      renderGuidelineStatus(error.message || "Guideline upload failed.", false);
    } finally {
      adminGuidelineUploadButton.disabled = false;
    }
  }

  async function toggleRecording(target) {
    try {
      state.pendingRecordingTarget = target;
      const result = await fetchJson(API.toggle, { method: "POST" });
      if (result.state === "recording_started") {
        startLiveTranscript(target);
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
        stopLiveTranscript();
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
        stopLiveTranscript();
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
      stopLiveTranscript();
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

        if (latest.llm_response) {
          record.patient.additionalInfo = latest.llm_response;
          record.statusMessage = "Vitals captured. Review the transcript below.";
          state.lastHandledAt = latest.created_at;
          state.pendingRecordingTarget = null;
          renderMicButtons("idle");
        } else {
          // LLM still processing — don't stamp lastHandledAt yet, keep polling
          record.statusMessage = "Transcript captured. Generating AI summary\u2026";
          state.lastHandledAt = null;
        }
        renderVitalsView();
        renderPatientInfo();
        return;
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


  document.querySelectorAll("[data-back-button]").forEach(function (button) {
    button.addEventListener("click", function () {
      goBack();
    });
  });

  document.getElementById("open-menu-button").addEventListener("click", function () {
    navigateTo("profile");
  });

  // ── Home dashboard ────────────────────────────────────────────────────────
  // Live clock
  function startHomeClock() {
    var clockEl = document.getElementById("home-live-clock");
    function tick() {
      if (clockEl) {
        var now = new Date();
        clockEl.textContent = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      }
    }
    tick();
    setInterval(tick, 1000);
  }
  startHomeClock();


  // Populate home vitals from last patient record
  function refreshHomeDashboard() {
    // Find most recent protocol with patient data
    var latestProtocol = null;
    var latestPatient = null;
    Object.keys(state.protocolData).forEach(function (name) {
      var record = state.protocolData[name];
      if (record.patient && record.patient.heartRate && record.patient.heartRate !== "N/A") {
        latestProtocol = name;
        latestPatient = record.patient;
      }
    });

    if (latestPatient) {
      var vitals = [
        { id: "home-hr",   labelId: "home-hr-label",   value: latestPatient.heartRate,    type: "hr" },
        { id: "home-bp",   labelId: "home-bp-label",   value: latestPatient.bloodPressure, type: "bp" },
        { id: "home-temp", labelId: "home-temp-label", value: latestPatient.temperature,   type: "temp" },
        { id: "home-spo2", labelId: "home-spo2-label", value: latestPatient.oxygen,        type: "spo2" },
      ];
      var VITAL_LABELS = {
        hr:   function (s) { return s === "critical" ? "High" : s === "warning" ? "Elevated" : "Normal"; },
        bp:   function (s) { return s === "critical" ? "Low"  : s === "warning" ? "Low"      : "Normal"; },
        temp: function (s) { return s === "critical" ? "Fever" : s === "warning" ? "Fever"   : "Normal"; },
        spo2: function (s) { return s === "critical" ? "Low"  : s === "warning" ? "Low"      : "Normal"; },
      };
      vitals.forEach(function (v) {
        var el = document.getElementById(v.id);
        var lbl = document.getElementById(v.labelId);
        if (!el) return;
        var raw = v.value && v.value !== "N/A" ? v.value : "";
        var display = raw ? raw.replace(/[^0-9./]/g, "").trim() || "—" : "—";
        el.textContent = display;
        if (lbl && display !== "—") {
          var status = vitalStatus(v.type, v.value);
          lbl.textContent = VITAL_LABELS[v.type] ? VITAL_LABELS[v.type](status) : "";
          lbl.className = "hv-label" + (status ? " hv-label--" + status : "");
        }
      });
    }

    // Active case card — always visible
    var caseTitleEl  = document.getElementById("home-case-title");
    var caseMetaEl   = document.getElementById("home-case-meta");
    var caseBadgeEl  = document.getElementById("home-case-badge");
    var continueBtn  = document.getElementById("home-continue-button");
    if (latestProtocol) {
      var completed = state.stepCompletion.filter(Boolean).length;
      var total     = state.stepCompletion.length;
      if (caseTitleEl) caseTitleEl.textContent = "Probable " + latestProtocol;
      if (caseMetaEl)  caseMetaEl.textContent  = total > 0
        ? completed + " of " + total + " steps completed · Tap to resume"
        : "Vitals captured — tap to start steps";
      if (caseBadgeEl) caseBadgeEl.textContent = latestProtocol === "Septic Shock" ? "Critical" : "Active";
      if (continueBtn) continueBtn.style.display = "";
    } else {
      if (caseTitleEl) caseTitleEl.textContent = "No active case";
      if (caseMetaEl)  caseMetaEl.textContent  = "Select an emergency below to begin";
      if (caseBadgeEl) caseBadgeEl.textContent = "";
      if (continueBtn) continueBtn.style.display = "none";
    }
  }
  refreshHomeDashboard();

  // Home — Continue button
  document.getElementById("home-continue-button").addEventListener("click", function () {
    navigateTo("steps");
  });


  // Home — Quick emergency cards
  document.querySelectorAll(".home-emg-card[data-protocol]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var protocol = btn.dataset.protocol;
      state.selectedProtocol = protocol;
      if (protocol === "Cardiac Arrest") {
        renderSteps();
        navigateTo("steps");
        return;
      }
      navigateTo("vitals");
    });
  });

  // Home — Tool cards
  document.querySelectorAll(".home-tool-card[data-screen-target]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      navigateTo(btn.dataset.screenTarget);
    });
  });

  // Home — View All
  document.querySelector(".home-view-all[data-screen-target]")?.addEventListener("click", function (e) {
    navigateTo(e.currentTarget.dataset.screenTarget);
  });


  document.getElementById("confirm-vitals-button").addEventListener("click", function () {
    const record = getProtocolRecord(state.selectedProtocol);
    record.transcript = transcriptPreview.value;
    const prevAdditionalInfo = record.patient.additionalInfo;
    record.patient = parsePatientTranscript(record.transcript);
    if (prevAdditionalInfo && prevAdditionalInfo !== "N/A") {
      record.patient.additionalInfo = prevAdditionalInfo;
    }
    renderPatientInfo();
    navigateTo("patient");
  });

  document.getElementById("start-assessment-button").addEventListener("click", async function () {
    renderStepsLoading();
    navigateTo("steps");

    var patient = getProtocolRecord(state.selectedProtocol).patient;
    var prompt = buildStepsPrompt(patient);

    try {
      var result = await fetchJson(API.pipelineSteps, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: prompt })
      });

      console.log("[Steps] Pipeline response:", result.llm_response);
      var llmSteps = result.llm_response ? parseLLMSteps(result.llm_response) : null;
      console.log("[Steps] Parsed steps:", llmSteps);
      if (llmSteps && llmSteps.length > 0) {
        var protocol = protocols[state.selectedProtocol] || protocols.Sepsis;
        var preCompleted = detectCompletedSteps(patient, llmSteps);
        console.log("[Steps] Pre-completed:", preCompleted);
        _currentStepsRef = llmSteps;
        renderStepsFromData(protocol.title, "Immediate - within 3 hours", llmSteps, preCompleted);
      } else {
        console.warn("[Steps] Could not parse LLM steps — falling back to hardcoded.");
        renderSteps();
      }
    } catch (error) {
      console.error("[Steps] Pipeline fetch failed:", error.message);
      // Backend unavailable — fall back to hardcoded steps
      renderSteps();
    }
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

  // ── Dosing Calculator ────────────────────────────────────────────────────
  (function () {
    var calcCondition = "sepsis";

    function calcWeightKg() {
      var raw = parseFloat(document.getElementById("calc-weight").value) || 0;
      var unit = document.getElementById("calc-weight-unit").value;
      return unit === "lb" ? raw * 0.453592 : raw;
    }

    function resetResults() {
      var resultCard  = document.getElementById("calc-result-card");
      var pressorCard = document.getElementById("calc-pressor-card");
      var cardiacDiv  = document.getElementById("calc-results-cardiac");
      if (resultCard)  resultCard.classList.add("is-hidden");
      if (pressorCard) pressorCard.classList.add("is-hidden");
      if (cardiacDiv)  cardiacDiv.classList.add("is-hidden");
    }

    function doCalculate() {
      var wKg = calcWeightKg();
      if (wKg <= 0) return;

      resetResults();

      if (calcCondition === "cardiac-arrest") {
        var epiEl    = document.getElementById("calc-epi-value");
        var epiSub   = document.getElementById("calc-epi-sub");
        var defibEl  = document.getElementById("calc-defib-value");
        var defibSub = document.getElementById("calc-defib-sub");
        var cardiacDiv = document.getElementById("calc-results-cardiac");

        var epiDose = (wKg * 0.01).toFixed(2);
        var epiVol  = ((wKg * 0.01) / 0.1).toFixed(1);
        var defib1  = Math.round(wKg * 2);
        var defib2  = Math.round(wKg * 4);

        if (epiEl)    epiEl.textContent    = "Epinephrine: " + epiDose + " mg (" + epiVol + " mL of 0.1 mg/mL)";
        if (epiSub)   epiSub.textContent   = "Every 3–5 min during arrest";
        if (defibEl)  defibEl.textContent  = "Defibrillation: " + defib1 + " J → " + defib2 + " J";
        if (defibSub) defibSub.textContent = "Initial " + defib1 + " J · Subsequent " + defib2 + " J";
        if (cardiacDiv) cardiacDiv.classList.remove("is-hidden");
      } else {
        var dose    = parseFloat(document.getElementById("calc-dose-input").value) || 20;
        var vol     = Math.round(wKg * dose);
        var fluidEl = document.getElementById("calc-fluid-value");
        var resultCard  = document.getElementById("calc-result-card");
        var pressorCard = document.getElementById("calc-pressor-card");

        if (fluidEl)   fluidEl.textContent = "Recommended bolus: " + vol + " mL";
        if (resultCard) resultCard.classList.remove("is-hidden");
        if (pressorCard) pressorCard.classList.toggle("is-hidden", calcCondition !== "septic-shock");
      }
    }

    function switchCondition(cond) {
      calcCondition = cond;
      document.querySelectorAll(".calc-cond-btn").forEach(function (b) {
        b.classList.toggle("calc-cond-btn--active", b.dataset.condition === cond);
      });
      var doseField = document.getElementById("calc-dose-field");
      if (doseField) doseField.classList.toggle("is-hidden", cond === "cardiac-arrest");
      resetResults();
    }

    // Condition buttons
    document.querySelectorAll(".calc-cond-btn").forEach(function (btn) {
      btn.addEventListener("click", function () { switchCondition(btn.dataset.condition); });
    });

    // Calculate button
    document.getElementById("calc-calculate-btn").addEventListener("click", doCalculate);

    // Auto-select condition from active protocol when navigating to calculator
    document.getElementById("screen-calculator").addEventListener("calc-enter", function () {
      if (state.selectedProtocol) {
        var p = state.selectedProtocol.toLowerCase();
        if (p.includes("cardiac")) switchCondition("cardiac-arrest");
        else if (p.includes("shock")) switchCondition("septic-shock");
        else switchCondition("sepsis");
      }
      var rec = state.selectedProtocol && state.protocolData[state.selectedProtocol];
      if (rec && rec.patient && rec.patient.weight) {
        document.getElementById("calc-weight").value = rec.patient.weight;
      }
      resetResults();
    });

    switchCondition("sepsis");

    // Standalone handheld calculator
    (function () {
      var display = document.getElementById("hh-display");
      var current = "0", stored = null, op = null, fresh = false;

      function show(val) {
        var s = String(val);
        if (s.length > 12) s = parseFloat(parseFloat(s).toPrecision(10)).toString();
        display.textContent = s;
      }

      document.querySelectorAll(".hh-key").forEach(function (key) {
        key.addEventListener("click", function () {
          var k = key.dataset.hh;

          if (k === "clear") {
            current = "0"; stored = null; op = null; fresh = false; show("0"); return;
          }
          if (k === "sign") {
            current = String(parseFloat(current) * -1); show(current); return;
          }
          if (k === "percent") {
            current = String(parseFloat(current) / 100); show(current); return;
          }
          if (k === "+" || k === "-" || k === "*" || k === "/") {
            stored = parseFloat(current); op = k; fresh = true; return;
          }
          if (k === "=") {
            if (op === null || stored === null) return;
            var a = stored, b = parseFloat(current), res;
            if (op === "+") res = a + b;
            else if (op === "-") res = a - b;
            else if (op === "*") res = a * b;
            else if (op === "/") res = b !== 0 ? a / b : "Error";
            current = String(res); op = null; stored = null; fresh = false; show(current); return;
          }
          if (k === ".") {
            if (fresh) { current = "0."; fresh = false; show(current); return; }
            if (!current.includes(".")) current += ".";
            show(current); return;
          }
          if (fresh) { current = k; fresh = false; }
          else current = current === "0" ? k : current + k;
          show(current);
        });
      });
    }());
  }());

  // ── Notes ────────────────────────────────────────────────────────────────
  (function () {
    var notes = JSON.parse(localStorage.getItem("vc_notes") || "[]");
    var editingId = null;

    function saveToStorage() { localStorage.setItem("vc_notes", JSON.stringify(notes)); }

    function renderNotes() {
      var list  = document.getElementById("notes-list");
      var empty = document.getElementById("notes-empty");
      var cards = list.querySelectorAll(".note-card");
      cards.forEach(function (c) { c.remove(); });
      if (notes.length === 0) { empty.classList.remove("is-hidden"); return; }
      empty.classList.add("is-hidden");
      notes.slice().reverse().forEach(function (n) {
        var card = document.createElement("div");
        card.className = "note-card";
        card.innerHTML =
          '<button class="note-card__delete" data-id="' + n.id + '" aria-label="Delete note"><i class="fa-solid fa-trash"></i></button>' +
          '<div class="note-card__title">' + (n.title || "Untitled") + "</div>" +
          '<div class="note-card__preview">' + (n.body || "") + "</div>" +
          '<div class="note-card__date">' + new Date(n.updatedAt).toLocaleDateString() + "</div>";
        card.querySelector(".note-card__delete").addEventListener("click", function (e) {
          e.stopPropagation();
          notes = notes.filter(function (x) { return x.id !== n.id; });
          saveToStorage(); renderNotes();
        });
        card.addEventListener("click", function () { openEditor(n); });
        list.appendChild(card);
      });
    }

    function openEditor(note) {
      editingId = note ? note.id : null;
      document.getElementById("notes-editor-title").value = note ? note.title : "";
      document.getElementById("notes-editor-body").value  = note ? note.body  : "";
      document.getElementById("notes-list").classList.add("is-hidden");
      document.getElementById("notes-add-btn").classList.add("is-hidden");
      document.getElementById("notes-editor").classList.remove("is-hidden");
    }

    function closeEditor() {
      document.getElementById("notes-editor").classList.add("is-hidden");
      document.getElementById("notes-list").classList.remove("is-hidden");
      document.getElementById("notes-add-btn").classList.remove("is-hidden");
      editingId = null;
    }

    document.getElementById("notes-add-btn").addEventListener("click", function () { openEditor(null); });

    document.getElementById("notes-save-btn").addEventListener("click", function () {
      var title = document.getElementById("notes-editor-title").value.trim();
      var body  = document.getElementById("notes-editor-body").value.trim();
      if (!title && !body) { closeEditor(); return; }
      if (editingId) {
        var n = notes.find(function (x) { return x.id === editingId; });
        if (n) { n.title = title; n.body = body; n.updatedAt = Date.now(); }
      } else {
        notes.push({ id: Date.now().toString(), title: title, body: body, updatedAt: Date.now() });
      }
      saveToStorage(); renderNotes(); closeEditor();
    });

    document.getElementById("notes-cancel-btn").addEventListener("click", closeEditor);

    renderNotes();
  }());

  // Profile save
  document.getElementById("profile-save-btn").addEventListener("click", function () {
    var name = document.getElementById("profile-name-input").value.trim();
    var role = document.getElementById("profile-role-input").value.trim();
    var nameDisplay = document.getElementById("profile-name-display");
    var roleDisplay = document.getElementById("profile-role-display");
    if (nameDisplay && name) nameDisplay.textContent = name;
    if (roleDisplay && role) roleDisplay.textContent = role;
    try { localStorage.setItem("vitalcare_profile", JSON.stringify({ name: name, role: role,
      institution: document.getElementById("profile-institution-input").value.trim(),
      license: document.getElementById("profile-license-input").value.trim() })); } catch(e) {}
    restoreAdminSettings();
    renderLoginState();
    navigateTo("home");
  });

  // Restore saved profile
  (function () {
    try {
      var saved = JSON.parse(localStorage.getItem("vitalcare_profile") || "null");
      if (!saved) return;
      if (saved.name) { document.getElementById("profile-name-input").value = saved.name;
        document.getElementById("profile-name-display").textContent = saved.name; }
      if (saved.role) { document.getElementById("profile-role-input").value = saved.role;
        document.getElementById("profile-role-display").textContent = saved.role; }
      if (saved.institution) document.getElementById("profile-institution-input").value = saved.institution;
      if (saved.license) document.getElementById("profile-license-input").value = saved.license;
    } catch(e) {}
  }());

  function getProfileDetails() {
    var saved = null;
    try {
      saved = JSON.parse(localStorage.getItem("vitalcare_profile") || "null");
    } catch (error) {}

    return {
      name: document.getElementById("profile-name-input").value.trim() || (saved && saved.name) || "Dr. User",
      role: document.getElementById("profile-role-input").value.trim() || (saved && saved.role) || "Emergency Medicine",
      institution: document.getElementById("profile-institution-input").value.trim() || (saved && saved.institution) || "",
      license: document.getElementById("profile-license-input").value.trim() || (saved && saved.license) || ""
    };
  }

  function getLoginSession() {
    try {
      return JSON.parse(localStorage.getItem("vitalcare_login") || "null");
    } catch (error) {
      return null;
    }
  }

  function renderLoginState() {
    var session = getLoginSession();
    var profile = getProfileDetails();
    var signedIn = !!(session && session.email);
    var user = session && session.user;
    var displayName = (user && user.full_name) || profile.name;
    var displayRole = (user && user.role) || profile.role;

    if (profileLoginStatus) {
      profileLoginStatus.textContent = signedIn ? "Signed in as " + session.email : "Not signed in";
    }
    if (loginNameDisplay) {
      loginNameDisplay.textContent = signedIn ? displayName : "Vital Care AI";
    }
    if (loginRoleDisplay) {
      loginRoleDisplay.textContent = signedIn ? displayRole + (profile.institution ? " · " + profile.institution : "") : "Clinical workspace access";
    }
    if (loginEmailInput && signedIn) {
      loginEmailInput.value = session.email;
    }
    if (loginStatusMessage) {
      loginStatusMessage.textContent = signedIn
        ? "Signed in locally. Profile and admin preferences are available on this device."
        : "Sign in to sync your profile and admin tools.";
      loginStatusMessage.classList.toggle("login-status-panel--success", signedIn);
    }
    if (adminNameDisplay) {
      adminNameDisplay.textContent = signedIn ? displayName : "Admin Console";
    }
    if (adminAccessDisplay) {
      adminAccessDisplay.textContent = signedIn ? "Signed in as " + session.email : "Local configuration";
    }
  }

  function restoreAdminSettings() {
    var profile = getProfileDetails();
    try {
      var saved = JSON.parse(localStorage.getItem("vitalcare_admin") || "null") || {};
      adminInstitutionInput.value = saved.institution || profile.institution || "";
      adminRoleSelect.value = saved.defaultRole || "Clinician";
      adminProtocolReviewToggle.checked = saved.requireProtocolReview !== false;
      adminAuditToggle.checked = saved.auditVoiceRequests !== false;
      adminUsersCount.textContent = saved.usersCount || "12";
    } catch (error) {
      adminInstitutionInput.value = profile.institution || "";
    }
  }

  loginSubmitButton.addEventListener("click", async function () {
    var email = loginEmailInput.value.trim();
    var password = loginPasswordInput.value.trim();
    if (!email || !password) {
      loginStatusMessage.textContent = "Enter an email and password to sign in.";
      loginStatusMessage.classList.remove("login-status-panel--success");
      return;
    }

    loginSubmitButton.disabled = true;
    loginStatusMessage.textContent = "Signing in...";
    loginStatusMessage.classList.remove("login-status-panel--success");

    try {
      var authPayload = null;
      try {
        authPayload = await loginWithBackend(email, password);
      } catch (error) {
        if (!/Failed to fetch|NetworkError|Load failed/i.test(error.message)) {
          throw error;
        }
      }

      localStorage.setItem("vitalcare_login", JSON.stringify({
        email: email,
        token: authPayload && authPayload.access_token,
        access_token: authPayload && authPayload.access_token,
        refresh_token: authPayload && authPayload.refresh_token,
        user: authPayload && authPayload.user,
        remember: !!loginRememberToggle.checked,
        signedInAt: new Date().toISOString()
      }));
    } catch (error) {
      loginStatusMessage.textContent = error.message || "Login failed.";
      loginStatusMessage.classList.remove("login-status-panel--success");
      loginSubmitButton.disabled = false;
      return;
    }

    loginPasswordInput.value = "";
    renderLoginState();
    loginSubmitButton.disabled = false;
  });

  loginSignoutButton.addEventListener("click", function () {
    try {
      localStorage.removeItem("vitalcare_login");
    } catch (error) {}
    loginPasswordInput.value = "";
    renderLoginState();
  });

  adminGuidelineFileInput.addEventListener("change", function () {
    var file = adminGuidelineFileInput.files && adminGuidelineFileInput.files[0];
    if (!file) {
      clearAdminGuidelineFile();
      return;
    }
    adminGuidelineFileName.textContent = file.name;
    renderGuidelineStatus(file.name + " is ready to upload.", false);
  });

  adminGuidelineClearButton.addEventListener("click", clearAdminGuidelineFile);
  adminGuidelineUploadButton.addEventListener("click", uploadAdminGuideline);
  adminGuidelineRefreshButton.addEventListener("click", loadAdminGuidelines);

  adminSaveButton.addEventListener("click", function () {
    try {
      localStorage.setItem("vitalcare_admin", JSON.stringify({
        institution: adminInstitutionInput.value.trim(),
        defaultRole: adminRoleSelect.value,
        requireProtocolReview: !!adminProtocolReviewToggle.checked,
        auditVoiceRequests: !!adminAuditToggle.checked,
        usersCount: adminUsersCount.textContent
      }));
    } catch (error) {}

    var profileInstitutionInput = document.getElementById("profile-institution-input");
    if (!profileInstitutionInput.value.trim() && adminInstitutionInput.value.trim()) {
      profileInstitutionInput.value = adminInstitutionInput.value.trim();
    }
    renderLoginState();
    navigateTo("profile");
  });

  restoreAdminSettings();
  renderLoginState();

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
  if (state.currentScreen === "admin") {
    loadAdminGuidelines();
  }
  syncRecordingStatus();
  syncLatestResult();
  window.setInterval(syncRecordingStatus, 1500);
  window.setInterval(syncLatestResult, 1500);
})();
