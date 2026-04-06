(function () {
  const API = {
    status: "/recording/status",
    toggle: "/recording/toggle",
    latestTranscription: "/transcriptions/latest",
    latestAudio: "/responses/latest/audio/mp3"
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
    speakerEnabled: true,
    activeAudio: null,
    lastHandledAt: null,
    patient: {
      age: "9",
      weight: "60 lbs",
      bloodPressure: "120/80 mmHg",
      heartRate: "75 bpm",
      temperature: "98.6 F",
      respiratoryRate: "16 breaths/min",
      oxygen: "99%",
      additionalInfo: "Lactate 4.2\nCultures drawn"
    }
  };

  const transcriptPreview = document.getElementById("transcript-preview");
  const additionalInfo = document.getElementById("additional-info");
  const stepsList = document.getElementById("steps-list");
  const stepsProtocolTitle = document.getElementById("steps-protocol-title");
  const stepsProtocolTiming = document.getElementById("steps-protocol-timing");
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
  const calculateButton = document.getElementById("calculate-button");
  const calculatorResult = document.getElementById("calculator-result");
  const weightInput = document.getElementById("weight-input");
  const bolusInput = document.getElementById("bolus-input");
  const calculatorDisplay = document.getElementById("calculator-display");
  const textSizeSlider = document.getElementById("text-size-slider");
  const darkModeToggle = document.getElementById("dark-mode-toggle");
  const speakerButtons = [document.getElementById("voice-screen-button"), document.getElementById("vitals-voice-button")];

  function setMicButtonIcon(button, listening) {
    button.innerHTML = listening
      ? '<i class="fa-solid fa-microphone-slash"></i>'
      : '<i class="fa-solid fa-microphone"></i>';
    button.setAttribute("aria-label", listening ? "Stop microphone" : "Start microphone");
  }

  function showScreen(name) {
    Object.keys(screens).forEach(function (key) {
      screens[key].classList.toggle("screen--active", key === name);
    });
    state.currentScreen = name;
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

  function renderSteps() {
    const protocol = protocols[state.selectedProtocol] || protocols.Sepsis;
    stepsProtocolTitle.textContent = protocol.title;
    stepsProtocolTiming.textContent = protocol.timing;
    stepsList.innerHTML = "";

    protocol.steps.forEach(function (step, index) {
      const wrapper = document.createElement("article");
      wrapper.className = "step-card";

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
      stepsList.appendChild(wrapper);
    });
  }

  function parseTranscript(text) {
    const normalized = text.toLowerCase();
    const ageMatch = normalized.match(/(\d+)\s*(?:years old|year old|years|year|yrs|yr)/);
    const weightMatch = normalized.match(/(\d+)\s*(?:lbs|pounds|kg)/);
    const hrMatch = normalized.match(/heart rate\s+(?:is\s+)?(\d+)/) || normalized.match(/(\d+)\s*bpm/);
    const bpMatch = normalized.match(/blood pressure\s+(?:is\s+)?(\d+)\s*(?:\/|over)\s*(\d+)/) || normalized.match(/(\d+)\s*(?:\/|over)\s*(\d+)/);
    const tempMatch = normalized.match(/temperature\s+(?:is\s+)?(\d+(?:\.\d+)?)/);
    const rrMatch = normalized.match(/(?:respiration rate|respiratory rate|rr)\s+(?:is\s+)?(\d+)/);
    const spo2Match = normalized.match(/(?:spo2|oxygen|oxygen saturation)\s+(?:is\s+)?(\d+)/);

    if (ageMatch) state.patient.age = ageMatch[1];
    if (weightMatch) state.patient.weight = weightMatch[1] + (normalized.includes("kg") ? " kg" : " lbs");
    if (hrMatch) state.patient.heartRate = hrMatch[1] + " bpm";
    if (bpMatch) state.patient.bloodPressure = bpMatch[1] + "/" + bpMatch[2] + " mmHg";
    if (tempMatch) state.patient.temperature = tempMatch[1] + " F";
    if (rrMatch) state.patient.respiratoryRate = rrMatch[1] + " breaths/min";
    if (spo2Match) state.patient.oxygen = spo2Match[1] + "%";

    if (normalized.trim()) {
      state.patient.additionalInfo = text.trim();
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
    guidelineFallback.classList.remove("is-hidden");
    guidelineFallback.style.display = "block";
  });

  calculateButton.addEventListener("click", function () {
    const weight = Number(weightInput.value || 0);
    const bolus = Number(bolusInput.value || 0);
    const total = weight * bolus;
    calculatorResult.textContent = "Recommended bolus: " + total.toFixed(0) + " mL";
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
    document.documentElement.style.fontSize = event.target.value + "px";
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
  speakerButtons.forEach(function (button) {
    setMicButtonIcon(button, false);
  });
  syncLatestResult();
  window.setInterval(syncLatestResult, 1500);
})();
