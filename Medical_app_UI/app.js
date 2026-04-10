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

  const state = {
    currentScreen: "home",
    screenHistory: [],
    selectedProtocol: "",
    stepCompletion: [],
    speakerEnabled: true,
    activeAudio: null,
    lastHandledAt: null,
    patient: {
      age: "N/A",
      weight: "N/A",
      bloodPressure: "N/A",
      heartRate: "N/A",
      temperature: "N/A",
      respiratoryRate: "N/A",
      oxygen: "N/A",
      additionalInfo: "N/A"
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
  const guidelineImage = document.getElementById("guideline-image");
  const guidelineFallback = document.getElementById("guideline-fallback");
  const guidelineZoomTrigger = document.getElementById("guideline-zoom-trigger");
  const guidelineLightbox = document.getElementById("guideline-lightbox");
  const guidelineLightboxImage = document.getElementById("guideline-lightbox-image");
  const guidelineLightboxClose = document.getElementById("guideline-lightbox-close");
  const calculateButton = document.getElementById("calculate-button");
  const calculatorResult = document.getElementById("calculator-result");
  const weightInput = document.getElementById("weight-input");
  const bolusInput = document.getElementById("bolus-input");
  const calculatorDisplay = document.getElementById("calculator-display");
  const textSizeSlider = document.getElementById("text-size-slider");
  const darkModeToggle = document.getElementById("dark-mode-toggle");
  const speakerButtons = [document.getElementById("voice-screen-button"), document.getElementById("vitals-voice-button")];
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

  function setMicButtonIcon(button, listening) {
    button.innerHTML = listening
      ? '<i class="fa-solid fa-stop"></i><span class="voice-pad__label">Stop Recording</span>'
      : '<i class="fa-solid fa-circle"></i><span class="voice-pad__label">Record Voice</span>';
    button.setAttribute("aria-label", listening ? "Stop recording" : "Start recording");
    button.classList.toggle("voice-pad--recording", listening);
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

  function renderPatientInfo() {
    patientAge.textContent = state.patient.age;
    patientWeight.textContent = state.patient.weight;
    patientBp.textContent = state.patient.bloodPressure;
    patientHr.textContent = state.patient.heartRate;
    patientTemp.textContent = state.patient.temperature;
    patientRr.textContent = state.patient.respiratoryRate;
    patientSpo2.textContent = state.patient.oxygen;
    additionalInfo.value = state.patient.additionalInfo;
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

  function parseTranscript(text) {
    const normalized = text.toLowerCase();

    // Reset all fields to N/A before filling in what was found
    state.patient.age = "N/A";
    state.patient.weight = "N/A";
    state.patient.heartRate = "N/A";
    state.patient.bloodPressure = "N/A";
    state.patient.temperature = "N/A";
    state.patient.respiratoryRate = "N/A";
    state.patient.oxygen = "N/A";
    state.patient.additionalInfo = "N/A";

    const NUM = "(?:is|of|at|:)?\\s*(\\d+(?:\\.\\d+)?)";
    const ageMatch = normalized.match(/(\d+)\s*(?:years old|year old|years|year|yrs|yr)/);
    const weightMatch = normalized.match(/(?:weight|weighs?)\s+(?:is\s+|of\s+)?(\d+)\s*(?:lbs|pounds|kg)/) ||
                        normalized.match(/(\d+)\s*(?:lbs|pounds|kg)/);
    const hrMatch = normalized.match(new RegExp("(?:heart rate|heart-rate|hr)\\s+" + NUM)) ||
                    normalized.match(/(\d+)\s*bpm/);
    const bpMatch = normalized.match(/(?:blood pressure|bp)\s+(?:is\s+|of\s+|at\s+)?(\d+)\s*(?:\/|over)\s*(\d+)/) ||
                    normalized.match(/(\d+)\s*(?:\/|over)\s*(\d+)\s*(?:mmhg)?/);
    const tempMatch = normalized.match(new RegExp("(?:temperature|temp)\\s+" + NUM));
    const rrMatch = normalized.match(new RegExp("(?:respiration rate|respiratory rate|rr)\\s+" + NUM));
    const spo2Match = normalized.match(new RegExp("(?:spo2|sp o2|oxygen saturation|oxygen)\\s+" + NUM));

    if (ageMatch) state.patient.age = ageMatch[1];
    if (weightMatch) state.patient.weight = weightMatch[1] + (normalized.includes("kg") ? " kg" : " lbs");
    if (hrMatch) state.patient.heartRate = (hrMatch[1] || hrMatch[2] || hrMatch[0].match(/\d+/)[0]) + " bpm";
    if (bpMatch) state.patient.bloodPressure = bpMatch[1] + "/" + bpMatch[2] + " mmHg";
    if (tempMatch) state.patient.temperature = tempMatch[1] + " F";
    if (rrMatch) state.patient.respiratoryRate = rrMatch[1] + " breaths/min";
    if (spo2Match) state.patient.oxygen = spo2Match[1] + "%";

    if (normalized.trim()) {
      voiceSummary.textContent = text.trim();
    }
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

  async function toggleRecording() {
    try {
      const result = await fetchJson(API.toggle, { method: "POST" });
      const listening = result.state === "recording_started";
      speakerButtons.forEach(function (button) {
        setMicButtonIcon(button, listening);
      });
      if (result.state === "transcribing") {
        assistantResponse.textContent = "Recording stopped. Backend is transcribing.";
      }
      if (result.state === "busy") {
        assistantResponse.textContent = "The backend is still processing the previous recording.";
      }
      if (result.state === "no_audio") {
        assistantResponse.textContent = "No audio captured. Please try again.";
      }
    } catch (error) {
      assistantResponse.textContent = error.message;
    }
  }

  async function syncLatestResult() {
    try {
      const latest = await fetchJson(API.latestTranscription);
      if (!latest.created_at || latest.created_at === state.lastHandledAt) {
        return;
      }

      state.lastHandledAt = latest.created_at;
      transcriptPreview.value = latest.text;
      parseTranscript(latest.text);
      renderPatientInfo();

      if (latest.llm_response) {
        assistantResponse.textContent = latest.llm_response;
        state.patient.additionalInfo = latest.llm_response;
        renderPatientInfo();
        if (state.speakerEnabled) {
          if (state.activeAudio) {
            state.activeAudio.pause();
          }
          state.activeAudio = new Audio(API.latestAudio + "?t=" + Date.now());
          state.activeAudio.play().catch(function () {});
        }
      } else {
        assistantResponse.textContent = "Patient update captured for the selected protocol.";
      }
    } catch (error) {
      if (!/No transcription has been published yet/i.test(error.message)) {
        assistantResponse.textContent = error.message;
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
      navigateTo("vitals");
    });
  });

  document.querySelectorAll("[data-screen-target]").forEach(function (button) {
    button.addEventListener("click", function () {
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
    parseTranscript(transcriptPreview.value);
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

  document.getElementById("vitals-voice-button").addEventListener("click", toggleRecording);
  document.getElementById("voice-screen-button").addEventListener("click", toggleRecording);

  document.getElementById("voice-text-input").addEventListener("change", function (event) {
    if (event.target.value.trim()) {
      voiceSummary.textContent = event.target.value.trim();
      assistantResponse.textContent = "Typed message captured. Use the microphone or backend transcription to continue.";
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
    const weight = Number(weightInput.value || 0);
    const bolus = Number(bolusInput.value || 0);
    const total = weight * bolus;
    calculatorResult.textContent = "Recommended bolus: " + total.toFixed(0) + " mL at " + bolus.toFixed(0) + " mL/kg";
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

  darkModeToggle.addEventListener("change", function (event) {
    document.body.classList.toggle("theme-dark", event.target.checked);
  });

  document.getElementById("volume-slider").addEventListener("input", function (event) {
    if (state.activeAudio) {
      state.activeAudio.volume = Number(event.target.value) / 100;
    }
  });

  additionalInfo.addEventListener("change", function () {
    state.patient.additionalInfo = additionalInfo.value;
  });

  renderPatientInfo();
  renderSteps();
  applyTextScale(Number(textSizeSlider.value));
  speakerButtons.forEach(function (button) {
    setMicButtonIcon(button, false);
  });
  syncLatestResult();
  window.setInterval(syncLatestResult, 1500);
})();
