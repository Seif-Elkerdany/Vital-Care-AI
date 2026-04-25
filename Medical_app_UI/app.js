(function () {
  const STORAGE_KEY = "medapp-ui-state";
  const AUTH_STORAGE_KEY = "medapp-auth-session";
  const API = {
    status: "http://localhost:8000/recording/status",
    toggle: "http://localhost:8000/recording/toggle",
    latestTranscription: "http://localhost:8000/transcriptions/latest",
    latestResponse: "http://localhost:8000/responses/latest",
    pipelineText: "http://localhost:8000/pipeline/text",
    pipelineSteps: "http://localhost:8000/pipeline/steps",
    latestAudio: "http://localhost:8000/responses/latest/audio/mp3",
    authLogin: "http://localhost:8000/auth/login",
    authRegister: "http://localhost:8000/auth/register",
    authLogout: "http://localhost:8000/auth/logout"
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

  const VITAL_INTAKE_STEPS = [
    { key: "age", label: "Age", prompt: "Capture the patient's age.", placeholder: "e.g. 9 years old" },
    { key: "weight", label: "Weight", prompt: "Capture the patient's weight.", placeholder: "e.g. 60 pounds" },
    { key: "heartRate", label: "Heart Rate", prompt: "Capture heart rate.", placeholder: "e.g. 128 bpm" },
    { key: "bloodPressure", label: "Blood Pressure", prompt: "Capture blood pressure.", placeholder: "e.g. 92/58 mmHg" },
    { key: "temperature", label: "Temperature", prompt: "Capture temperature.", placeholder: "e.g. 101.3 F" },
    { key: "respiratoryRate", label: "Respiratory Rate", prompt: "Capture respiratory rate.", placeholder: "e.g. 24 breaths/min" },
    { key: "oxygen", label: "SpO2", prompt: "Capture oxygen saturation.", placeholder: "e.g. 93%" },
    { key: "fio2", label: "FiO2", prompt: "Capture FiO2.", placeholder: "e.g. 40%" },
    { key: "respiratorySupport", label: "Respiratory Support", prompt: "Capture respiratory support type.", placeholder: "e.g. nasal cannula, non-invasive ventilation" },
    { key: "additionalInfo", label: "Additional Info", prompt: "Capture any additional notes.", placeholder: "e.g. lactate, cultures drawn, delayed capillary refill, lethargic" }
  ];

  function createBlankIntakeEntries() {
    return VITAL_INTAKE_STEPS.reduce(function (entries, step) {
      entries[step.key] = "";
      return entries;
    }, {});
  }

  function createBlankProtocolRecord() {
    return {
      transcript: "",
      statusMessage: "Press Record Voice to capture the patient's vitals.",
      patient: createBlankPatient(),
      intakeEntries: createBlankIntakeEntries(),
      intakeStepIndex: 0
    };
  }

  const screens = {
    auth: document.getElementById("screen-auth"),
    home: document.getElementById("screen-home"),
    vitals: document.getElementById("screen-vitals"),
    patient: document.getElementById("screen-patient"),
    steps: document.getElementById("screen-steps"),
    voice: document.getElementById("screen-voice"),
    guidelines: document.getElementById("screen-guidelines"),
    settings: document.getElementById("screen-settings"),
    profile: document.getElementById("screen-profile"),
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
      fio2: "N/A",
      respiratorySupport: "N/A",
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
      "Sepsis": createBlankProtocolRecord(),
      "Septic Shock": createBlankProtocolRecord()
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
    },
    auth: {
      user: null,
      accessToken: "",
      refreshToken: ""
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
      "Sepsis": createBlankProtocolRecord(),
      "Septic Shock": createBlankProtocolRecord()
    };

    Object.keys(fallback).forEach(function (protocolName) {
      const savedRecord = protocolData && protocolData[protocolName];
      fallback[protocolName] = {
        transcript: savedRecord && typeof savedRecord.transcript === "string" ? savedRecord.transcript : fallback[protocolName].transcript,
        statusMessage: savedRecord && typeof savedRecord.statusMessage === "string" ? savedRecord.statusMessage : fallback[protocolName].statusMessage,
        patient: sanitizePatient(savedRecord && savedRecord.patient),
        intakeEntries: Object.assign(
          createBlankIntakeEntries(),
          savedRecord && savedRecord.intakeEntries && typeof savedRecord.intakeEntries === "object" ? savedRecord.intakeEntries : {}
        ),
        intakeStepIndex: savedRecord && Number.isFinite(Number(savedRecord.intakeStepIndex))
          ? Math.max(0, Math.min(VITAL_INTAKE_STEPS.length - 1, Number(savedRecord.intakeStepIndex)))
          : 0
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

  function saveAuthSession() {
    try {
      if (!state.auth || !state.auth.accessToken || !state.auth.refreshToken) {
        window.localStorage.removeItem(AUTH_STORAGE_KEY);
        return;
      }
      window.localStorage.setItem(
        AUTH_STORAGE_KEY,
        JSON.stringify({
          user: state.auth.user,
          accessToken: state.auth.accessToken,
          refreshToken: state.auth.refreshToken
        })
      );
    } catch (error) {
      // Ignore storage errors.
    }
  }

  function restoreAuthSession() {
    try {
      const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      state.auth.user = saved && saved.user && typeof saved.user === "object" ? saved.user : null;
      state.auth.accessToken = saved && typeof saved.accessToken === "string" ? saved.accessToken : "";
      state.auth.refreshToken = saved && typeof saved.refreshToken === "string" ? saved.refreshToken : "";
    } catch (error) {
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  }

  function clearAuthSession() {
    state.auth.user = null;
    state.auth.accessToken = "";
    state.auth.refreshToken = "";
    saveAuthSession();
  }

  function isAuthenticated() {
    return !!(state.auth && state.auth.accessToken && state.auth.refreshToken);
  }

  function getProfileStorageKey() {
    if (!state.auth || !state.auth.user) {
      return null;
    }
    var userId = state.auth.user.id || state.auth.user.email;
    return userId ? ("vitalcare_profile:" + String(userId).toLowerCase()) : null;
  }

  function applyProfileToUi(profile) {
    var safeProfile = profile || {};
    var name = safeProfile.name || "";
    var role = safeProfile.role || "";
    var institution = safeProfile.institution || "";
    var license = safeProfile.license || "";

    document.getElementById("profile-name-input").value = name;
    document.getElementById("profile-role-input").value = role;
    document.getElementById("profile-institution-input").value = institution;
    document.getElementById("profile-license-input").value = license;

    document.getElementById("profile-name-display").textContent = name || "Dr. User";
    document.getElementById("profile-role-display").textContent = role || "Emergency Medicine";
  }

  function loadProfileForCurrentUser() {
    var storageKey = getProfileStorageKey();
    if (!storageKey) {
      applyProfileToUi(null);
      return;
    }
    try {
      var saved = JSON.parse(localStorage.getItem(storageKey) || "null");
      applyProfileToUi(saved);
    } catch (e) {
      applyProfileToUi(null);
    }
  }

  const transcriptPreview = document.getElementById("transcript-preview");
  const transcriptToggle = document.getElementById("transcript-toggle");
  const intakeStepCounter = document.getElementById("intake-step-counter");
  const intakeStepPrompt = document.getElementById("intake-step-prompt");
  const intakeStepInput = document.getElementById("intake-step-input");
  const intakeSaveStepButton = document.getElementById("intake-save-step-button");
  const intakePrevStepButton = document.getElementById("intake-prev-step-button");
  const intakeNextStepButton = document.getElementById("intake-next-step-button");
  const intakeStepMicButton = document.getElementById("intake-step-mic-button");
  const intakeSummaryList = document.getElementById("intake-summary-list");
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
  const patientFio2 = document.getElementById("patient-fio2");
  const patientRespiratorySupport = document.getElementById("patient-respiratory-support");
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
  const speakerButtons = [voiceScreenButton, vitalsVoiceButton];
  const voiceTextInput = document.getElementById("voice-text-input");
  const bottomNav = document.getElementById("bottom-nav");
  const authTabLogin = document.getElementById("auth-tab-login");
  const authTabRegister = document.getElementById("auth-tab-register");
  const authSubtitle = document.getElementById("auth-subtitle");
  const authStatus = document.getElementById("auth-status");
  const authLoginForm = document.getElementById("auth-login-form");
  const authRegisterForm = document.getElementById("auth-register-form");
  const authLoginEmail = document.getElementById("auth-login-email");
  const authLoginPassword = document.getElementById("auth-login-password");
  const authRegisterName = document.getElementById("auth-register-name");
  const authRegisterEmail = document.getElementById("auth-register-email");
  const authRegisterPassword = document.getElementById("auth-register-password");
  const authRegisterConfirm = document.getElementById("auth-register-confirm");
  const profileLogoutButton = document.getElementById("profile-logout-btn");
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
    if (!isAuthenticated() && name !== "auth") {
      name = "auth";
    }
    if (name !== "settings") {
      stopMicThresholdTester();
    }
    Object.keys(screens).forEach(function (key) {
      screens[key].classList.toggle("screen--active", key === name);
    });
    document.querySelectorAll(".bottom-nav__btn[data-screen-target]").forEach(function (button) {
      const isActive = button.dataset.screenTarget === name;
      button.classList.toggle("bottom-nav__btn--active", isActive);
      button.setAttribute("aria-current", isActive ? "page" : "false");
    });
    state.currentScreen = name;
    if (screens[name]) {
      screens[name].scrollTop = 0;
    }
    if (bottomNav) {
      bottomNav.style.display = name === "auth" ? "none" : "flex";
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
      const latestResponse = await fetchJson(API.latestResponse, undefined, true);
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
    const savedScroll = screens.vitals.scrollTop;
    transcriptPreview.value = record.transcript;
    voiceStatusMessage.textContent = record.statusMessage;
    renderIntakeStep(record);
    renderPatientInfo();
    screens.vitals.scrollTop = savedScroll;
    saveState();
  }

  function buildTranscriptFromIntake(record) {
    const entries = (record && record.intakeEntries) || {};
    const lines = [];
    VITAL_INTAKE_STEPS.forEach(function (step) {
      const value = String(entries[step.key] || "").trim();
      if (value) {
        lines.push(step.label + ": " + value);
      }
    });
    return lines.join(". ");
  }

  function getCurrentIntakeStep(record) {
    const safeIndex = Math.max(0, Math.min(VITAL_INTAKE_STEPS.length - 1, Number(record.intakeStepIndex) || 0));
    record.intakeStepIndex = safeIndex;
    return VITAL_INTAKE_STEPS[safeIndex];
  }

  function mergeParsedPatient(targetPatient, parsedPatient) {
    const merged = sanitizePatient(targetPatient);
    Object.keys(parsedPatient || {}).forEach(function (key) {
      const value = parsedPatient[key];
      if (value && value !== "N/A") {
        merged[key] = value;
      }
    });
    return merged;
  }

  function extractIntakeStepValue(stepKey, text) {
    const parsed = parsePatientTranscript(text);
    if (stepKey === "additionalInfo") {
      const notes = (parsed.additionalInfo && parsed.additionalInfo !== "N/A" ? parsed.additionalInfo : text).trim();
      return notes;
    }
    const mapped = parsed[stepKey];
    if (mapped && mapped !== "N/A") {
      return mapped;
    }
    return String(text || "").trim();
  }

  function applyIntakeStepFromText(record, rawText) {
    const step = getCurrentIntakeStep(record);
    const source = String(rawText || "").trim();
    if (!source) {
      return false;
    }

    const value = extractIntakeStepValue(step.key, source);
    if (!value) {
      return false;
    }

    record.intakeEntries[step.key] = value;
    record.patient[step.key] = value;
    record.transcript = buildTranscriptFromIntake(record) || source;

    if (record.intakeStepIndex < VITAL_INTAKE_STEPS.length - 1) {
      record.intakeStepIndex += 1;
    }
    return true;
  }

  function hasCapturedValue(value) {
    const normalized = String(value || "").trim();
    return !!normalized && normalized.toUpperCase() !== "N/A";
  }

  function findNextMissingIntakeStepIndex(record) {
    for (let index = 0; index < VITAL_INTAKE_STEPS.length; index += 1) {
      const stepKey = VITAL_INTAKE_STEPS[index].key;
      if (!hasCapturedValue(record.intakeEntries[stepKey])) {
        return index;
      }
    }
    return VITAL_INTAKE_STEPS.length - 1;
  }

  function applyHybridIntakeFromTranscript(record, rawText) {
    const source = String(rawText || "").trim();
    if (!source) {
      return { updatedCount: 0, nextMissingStep: getCurrentIntakeStep(record) };
    }

    const parsed = parsePatientTranscript(source);
    const updatedLabels = [];

    VITAL_INTAKE_STEPS.forEach(function (step) {
      const value = parsed[step.key];
      if (hasCapturedValue(value)) {
        record.intakeEntries[step.key] = value;
        record.patient[step.key] = value;
        updatedLabels.push(step.label);
      }
    });

    if (!updatedLabels.length) {
      const fallbackSaved = applyIntakeStepFromText(record, source);
      return {
        updatedCount: fallbackSaved ? 1 : 0,
        nextMissingStep: getCurrentIntakeStep(record)
      };
    }

    record.intakeStepIndex = findNextMissingIntakeStepIndex(record);
    record.transcript = buildTranscriptFromIntake(record) || source;
    return {
      updatedCount: updatedLabels.length,
      nextMissingStep: getCurrentIntakeStep(record)
    };
  }

  function renderIntakeStep(record) {
    if (!record) {
      return;
    }
    const step = getCurrentIntakeStep(record);
    intakeStepCounter.textContent = "Step " + (record.intakeStepIndex + 1) + " of " + VITAL_INTAKE_STEPS.length;
    intakeStepPrompt.textContent = step.prompt;
    intakeStepInput.placeholder = step.placeholder;
    intakeStepInput.value = record.intakeEntries[step.key] || "";
    intakePrevStepButton.disabled = record.intakeStepIndex <= 0;
    intakeNextStepButton.disabled = record.intakeStepIndex >= VITAL_INTAKE_STEPS.length - 1;

    intakeSummaryList.innerHTML = "";
    VITAL_INTAKE_STEPS.forEach(function (item) {
      const row = document.createElement("div");
      row.className = "intake-summary__row";
      const label = document.createElement("span");
      label.className = "mini-label";
      label.textContent = item.label;
      const value = document.createElement("strong");
      const savedValue = String(record.intakeEntries[item.key] || "").trim();
      value.textContent = savedValue || "Pending";
      value.className = savedValue ? "intake-summary__value" : "intake-summary__value intake-summary__value--pending";
      row.appendChild(label);
      row.appendChild(value);
      intakeSummaryList.appendChild(row);
    });
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
    patientFio2.textContent = patient.fio2;
    patientRespiratorySupport.textContent = patient.respiratorySupport;
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
      "FiO2: " + patient.fio2,
      "Respiratory Support: " + patient.respiratorySupport,
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
    const fio2Match = getLastMatch(normalized, /(?:fio2|fi o2|fraction of inspired oxygen)\s+(?:is|of|at|:)?\s*(\d+(?:\.\d+)?)\s*%?/g);
    const supportMatch = getLastMatch(normalized, /(?:respiratory support|oxygen support|support type|airway support)\s+(?:is|of|at|:)?\s*([a-z0-9\- ]+)/g) ||
                         getLastMatch(normalized, /\b(nasal cannula|high[- ]flow nasal cannula|non[- ]invasive ventilation|cpap|bipap|non[- ]rebreather|simple face mask|room air|mechanical ventilation|intubated)\b/g);

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
    if (fio2Match) patient.fio2 = fio2Match[1] + "%";
    if (supportMatch) patient.respiratorySupport = (supportMatch[1] || supportMatch[0] || "").trim();

    // Extract additional clinical notes — anything that isn't a vital reading
    var vitalSegmentPatterns = [
      /heart rate|heart-rate|\bhr\b/,
      /blood pressure|\bbp\b/,
      /temperature|\btemp\b/,
      /respiratory rate|respiration rate|\brr\b/,
      /oxygen saturation|spo2|sp o2/,
      /fio2|fi o2|fraction of inspired oxygen/,
      /respiratory support|oxygen support|support type|nasal cannula|high[- ]flow|cpap|bipap|non[- ]rebreather|room air|mechanical ventilation|intubated/,
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

  async function fetchJson(url, options, requireAuth) {
    const baseOptions = options || {};
    const headers = Object.assign({}, baseOptions.headers || {});
    if (requireAuth && state.auth.accessToken) {
      headers.Authorization = "Bearer " + state.auth.accessToken;
    }
    const response = await fetch(url, Object.assign({}, baseOptions, { headers: headers }));
    if (!response.ok) {
      const payload = await response.json().catch(function () {
        return {};
      });
      throw new Error(payload.detail || "Request failed.");
    }
    return response.json();
  }

  function setAuthStatus(message, isError) {
    if (!authStatus) return;
    authStatus.textContent = message || "";
    authStatus.style.color = isError ? "#c53030" : "var(--text-muted)";
  }

  function setAuthMode(mode) {
    const loginMode = mode !== "register";
    authTabLogin.classList.toggle("auth-tab--active", loginMode);
    authTabRegister.classList.toggle("auth-tab--active", !loginMode);
    authLoginForm.classList.toggle("is-hidden", !loginMode);
    authRegisterForm.classList.toggle("is-hidden", loginMode);
    if (authSubtitle) {
      authSubtitle.textContent = loginMode
        ? "Sign in to access patient protocols and tools."
        : "Create your clinician account to continue.";
    }
    setAuthStatus("", false);
  }

  function resetAuthForms() {
    if (authLoginForm) authLoginForm.reset();
    if (authRegisterForm) authRegisterForm.reset();
  }

  async function handleLoginSubmit(event) {
    event.preventDefault();
    setAuthStatus("Signing in...", false);
    try {
      const payload = await fetchJson(
        API.authLogin,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: authLoginEmail.value.trim(),
            password: authLoginPassword.value
          })
        },
        false
      );
      state.auth.user = payload.user || null;
      state.auth.accessToken = payload.access_token || "";
      state.auth.refreshToken = payload.refresh_token || "";
      saveAuthSession();
      loadProfileForCurrentUser();
      ensureSyncLoops();
      setAuthStatus("", false);
      showScreen("home");
      refreshHomeDashboard();
    } catch (error) {
      setAuthStatus(error.message || "Login failed.", true);
    }
  }

  async function handleRegisterSubmit(event) {
    event.preventDefault();
    const password = authRegisterPassword.value;
    const confirm = authRegisterConfirm.value;
    if (password !== confirm) {
      setAuthStatus("Passwords do not match.", true);
      return;
    }
    setAuthStatus("Creating account...", false);
    try {
      const payload = await fetchJson(
        API.authRegister,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: authRegisterEmail.value.trim(),
            password: password,
            full_name: authRegisterName.value.trim() || null
          })
        },
        false
      );
      state.auth.user = payload.user || null;
      state.auth.accessToken = payload.access_token || "";
      state.auth.refreshToken = payload.refresh_token || "";
      saveAuthSession();
      loadProfileForCurrentUser();
      ensureSyncLoops();
      setAuthStatus("", false);
      showScreen("home");
      refreshHomeDashboard();
    } catch (error) {
      setAuthStatus(error.message || "Registration failed.", true);
    }
  }

  async function performLogout() {
    try {
      if (state.auth.accessToken) {
        await fetchJson(API.authLogout, { method: "POST" }, true);
      }
    } catch (error) {
      // Ignore backend logout errors and continue with local logout.
    }
    clearAuthSession();
    resetAuthForms();
    setAuthMode("login");
    showScreen("auth");
  }

  async function toggleRecording(target) {
    try {
      state.pendingRecordingTarget = target;
      const result = await fetchJson(API.toggle, { method: "POST" }, true);
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
      const status = await fetchJson(API.status, undefined, true);
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
      const latest = await fetchJson(API.latestTranscription, undefined, true);
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
        if (record.transcript) {
          const intakeResult = applyHybridIntakeFromTranscript(record, record.transcript);
          if (intakeResult.updatedCount > 1) {
            record.statusMessage = "Saved " + intakeResult.updatedCount + " fields from recording. Next: " + intakeResult.nextMissingStep.label + ".";
          } else if (intakeResult.updatedCount === 1) {
            record.statusMessage = "Saved one field from recording. Next: " + intakeResult.nextMissingStep.label + ".";
          } else {
            record.patient = mergeParsedPatient(record.patient, parsePatientTranscript(record.transcript));
            record.statusMessage = "Recording captured, but no structured fields were detected. Please type or retry this step.";
          }
        }

        if (latest.llm_response) {
          record.patient.additionalInfo = latest.llm_response;
          record.intakeEntries.additionalInfo = latest.llm_response;
          record.transcript = buildTranscriptFromIntake(record) || record.transcript;
          record.statusMessage = "Vitals captured. Review the transcript below.";
          state.lastHandledAt = latest.created_at;
          state.pendingRecordingTarget = null;
          renderMicButtons("idle");
        } else {
          state.pendingRecordingTarget = null;
          renderMicButtons("idle");
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

  var syncLoopsStarted = false;
  function ensureSyncLoops() {
    if (syncLoopsStarted) return;
    syncLoopsStarted = true;
    syncRecordingStatus();
    syncLatestResult();
    window.setInterval(syncRecordingStatus, 1500);
    window.setInterval(syncLatestResult, 1500);
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
      }, true);

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

  authTabLogin.addEventListener("click", function () {
    setAuthMode("login");
  });

  authTabRegister.addEventListener("click", function () {
    setAuthMode("register");
  });

  authLoginForm.addEventListener("submit", handleLoginSubmit);
  authRegisterForm.addEventListener("submit", handleRegisterSubmit);

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
    const consolidatedTranscript = buildTranscriptFromIntake(record);
    record.transcript = consolidatedTranscript || transcriptPreview.value;

    // use intake entries directly, don't re-parse transcript
    VITAL_INTAKE_STEPS.forEach(function (step) {
      const value = String(record.intakeEntries[step.key] || "").trim();
      if (value && value !== "N/A") {
        record.patient[step.key] = value;
      }
    });

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
      }, true);

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

  intakeSaveStepButton.addEventListener("click", function () {
    if (!isProtocolTarget(state.selectedProtocol)) {
      return;
    }
    const record = getProtocolRecord(state.selectedProtocol);
    const capturedStep = getCurrentIntakeStep(record);
    const saved = applyIntakeStepFromText(record, intakeStepInput.value);
    if (saved) {
      record.statusMessage = "Saved for " + capturedStep.label + ". Continue with the next vital.";
      transcriptPreview.value = buildTranscriptFromIntake(record);
      renderVitalsView();
    }
  });

  intakePrevStepButton.addEventListener("click", function () {
    if (!isProtocolTarget(state.selectedProtocol)) {
      return;
    }
    const record = getProtocolRecord(state.selectedProtocol);
    if (record.intakeStepIndex > 0) {
      record.intakeStepIndex -= 1;
      renderVitalsView();
    }
  });

  intakeNextStepButton.addEventListener("click", function () {
    if (!isProtocolTarget(state.selectedProtocol)) {
      return;
    }
    const record = getProtocolRecord(state.selectedProtocol);
    if (record.intakeStepIndex < VITAL_INTAKE_STEPS.length - 1) {
      record.intakeStepIndex += 1;
      renderVitalsView();
    }
  });

  intakeStepInput.addEventListener("keydown", function (event) {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    intakeSaveStepButton.click();
  });

  intakeStepMicButton.addEventListener("click", function () {
    // toggleRecording(state.selectedProtocol);
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      voiceStatusMessage.textContent = "Speech recognition not supported in this browser. Please use the text input instead.";
      return;
    }

    if (intakeStepMicButton.classList.contains("intake-step-mic-button--recording")) {
      return;
    }

    const rec = new SpeechRecognition();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = "en-US";

    intakeStepMicButton.classList.add("intake-step-mic-button--recording");
    intakeStepMicButton.innerHTML = '<i class="fa-solid fa-stop"></i>';
    voiceStatusMessage.textContent = "Listening for " + getCurrentIntakeStep(getProtocolRecord(state.selectedProtocol)).label + "...";

    rec.onresult = function (event) {
      const transcript = event.results[0][0].transcript;
      intakeStepInput.value = transcript;

      // also append to the main transcript preview so it stays as an audit log
      const record = getProtocolRecord(state.selectedProtocol);
      const stepLabel = getCurrentIntakeStep(record).label;
      voiceStatusMessage.textContent = "Heard: \"" + transcript + "\" — saving " + stepLabel + ".";

      intakeSaveStepButton.click();
    };

    rec.onerror = function (event) {
      voiceStatusMessage.textContent = "Could not hear anything. Please try again.";
      intakeStepMicButton.classList.remove("intake-step-mic-button--recording");
      intakeStepMicButton.innerHTML = '<i class="fa-solid fa-microphone"></i>';
    };

    rec.onend = function () {
      intakeStepMicButton.classList.remove("intake-step-mic-button--recording");
      intakeStepMicButton.innerHTML = '<i class="fa-solid fa-microphone"></i>';
    };

    rec.start();
  });

  transcriptToggle.addEventListener("click", function () {
    const isOpen = transcriptToggle.classList.toggle("transcript-toggle--open");
    transcriptPreview.classList.toggle("is-hidden", !isOpen);
    transcriptToggle.querySelector("span").textContent = isOpen ? "Hide transcript" : "View transcript";
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
    var storageKey = getProfileStorageKey();
    try {
      if (storageKey) {
        localStorage.setItem(storageKey, JSON.stringify({
          name: name,
          role: role,
          institution: document.getElementById("profile-institution-input").value.trim(),
          license: document.getElementById("profile-license-input").value.trim()
        }));
      }
    } catch(e) {}
    navigateTo("home");
  });

  profileLogoutButton.addEventListener("click", function () {
    performLogout();
  });

  loadProfileForCurrentUser();

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
      const record = getProtocolRecord(state.selectedProtocol);
      record.patient.additionalInfo = additionalInfo.value;
      record.intakeEntries.additionalInfo = additionalInfo.value;
      record.transcript = buildTranscriptFromIntake(record) || record.transcript;
    }
  });

  restoreAuthSession();
  restoreState();
  setAuthMode("login");
  renderPatientInfo();
  renderVitalsView();
  renderVoiceChat();
  renderMicThresholdTester(0);
  renderSteps();
  updateCalculatorLabels();
  applyTextScale(Number(textSizeSlider.value));
  renderMicButtons("idle");
  if (!isAuthenticated()) {
    showScreen("auth");
  } else {
    if (state.currentScreen === "auth") {
      state.currentScreen = "home";
    }
    showScreen(state.currentScreen);
    function isUserTyping() {
      return document.activeElement === intakeStepInput ||
        document.activeElement === additionalInfo ||
        document.activeElement === transcriptPreview ||
        document.activeElement === voiceTextInput;
    }
    if (!syncLoopsStarted) {
      syncLoopsStarted = true;
      syncRecordingStatus();
      syncLatestResult();
      window.setInterval(function () {
        if (!isUserTyping()) syncRecordingStatus();
      }, 1500);
      window.setInterval(function () {
        if (!isUserTyping()) syncLatestResult();
      }, 1500);
    }
  }
})();
