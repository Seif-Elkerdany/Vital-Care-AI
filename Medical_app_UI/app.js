(function () {
  const API = {
    status: "http://localhost:8000/recording/status",
    toggle: "http://localhost:8000/recording/toggle",
    latestTranscription: "http://localhost:8000/transcriptions/latest",
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
      input: ""
    }
  };

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
  const voiceSummary = document.getElementById("voice-summary");
  const assistantResponse = document.getElementById("assistant-response");
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
  const vitalsVoiceButton = document.getElementById("vitals-voice-button");
  const voiceScreenButton = document.getElementById("voice-screen-button");
  const speakerButtons = [voiceScreenButton, vitalsVoiceButton];
  const voiceTextInput = document.getElementById("voice-text-input");
  const scalableTextElements = Array.from(document.querySelectorAll(".phone-frame *")).filter(function (element) {
    return !element.matches("i, .fa-solid, .fa-regular, .fa-brands");
  });
  const baseTextSizes = new Map();

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

  function showScreen(name) {
    Object.keys(screens).forEach(function (key) {
      screens[key].classList.toggle("screen--active", key === name);
    });
    state.currentScreen = name;
    if (screens[name]) {
      screens[name].scrollTop = 0;
    }
  }

  function isProtocolTarget(target) {
    return target === "Sepsis" || target === "Septic Shock";
  }

  function getProtocolRecord(protocolName) {
    return state.protocolData[protocolName] || state.protocolData.Sepsis;
  }

  function renderMicButtons(uiState) {
    const target = state.pendingRecordingTarget;
    setMicButtonState(vitalsVoiceButton, isProtocolTarget(target) ? uiState : "idle");
    setMicButtonState(voiceScreenButton, target === "voice" ? uiState : "idle");
  }

  function renderVoiceChat() {
    voiceSummary.textContent = state.chatData.summary || "Start typing or record a question to begin.";
    assistantResponse.textContent = state.chatData.response;
    voiceTextInput.value = state.chatData.input;
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
          state.chatData.response = "Recording now. Tap Stop Recording when you're finished speaking.";
          renderVoiceChat();
        }
      }
      if (result.state === "transcribing") {
        renderMicButtons("transcribing");
        if (isProtocolTarget(target)) {
          getProtocolRecord(target).statusMessage = "Recording stopped. Transcribing and extracting vitals now.";
          renderVitalsView();
        } else {
          state.chatData.response = "Recording stopped. Backend is transcribing.";
          renderVoiceChat();
        }
      }
      if (result.state === "busy") {
        if (isProtocolTarget(target)) {
          getProtocolRecord(target).statusMessage = "The backend is still processing the previous recording.";
          renderVitalsView();
        } else {
          state.chatData.response = "The backend is still processing the previous recording.";
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
          state.chatData.response = "No audio captured. Please try again.";
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
        state.chatData.response = error.message;
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
          state.chatData.response = "Recording now. Tap Stop Recording when you're finished speaking.";
        } else if (status.transcribing) {
          state.chatData.response = "Transcribing your voice request.";
        } else if (status.last_error) {
          state.chatData.response = status.last_error;
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

      if (target === "voice") {
        state.chatData.summary = latest.text || state.chatData.summary;
        state.chatData.input = state.chatData.summary;
        state.chatData.response = latest.llm_response || "Voice request captured.";
        renderVoiceChat();
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
          state.chatData.response = error.message;
          renderVoiceChat();
        } else if (isProtocolTarget(state.pendingRecordingTarget || state.selectedProtocol)) {
          getProtocolRecord(state.pendingRecordingTarget || state.selectedProtocol).statusMessage = error.message;
          renderVitalsView();
        }
      }
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

  voiceTextInput.addEventListener("change", function (event) {
    if (event.target.value.trim()) {
      state.chatData.input = event.target.value.trim();
      state.chatData.summary = event.target.value.trim();
      state.chatData.response = "Typed message captured. Use the microphone or backend transcription to continue.";
      renderVoiceChat();
    }
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

  state.chatData.summary = voiceSummary.textContent.trim();
  renderPatientInfo();
  renderVitalsView();
  renderVoiceChat();
  renderSteps();
  updateCalculatorLabels();
  applyTextScale(Number(textSizeSlider.value));
  renderMicButtons("idle");
  syncRecordingStatus();
  syncLatestResult();
  window.setInterval(syncRecordingStatus, 1500);
  window.setInterval(syncLatestResult, 1500);
})();
