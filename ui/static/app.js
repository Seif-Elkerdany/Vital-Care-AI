const queryForm = document.getElementById("queryForm");
const queryInput = document.getElementById("queryInput");
const queryError = document.getElementById("queryError");
const queryResult = document.getElementById("queryResult");
const transcriptText = document.getElementById("transcriptText");
const structuredQuery = document.getElementById("structuredQuery");
const finalAnswer = document.getElementById("finalAnswer");
const retrievals = document.getElementById("retrievals");
const healthStatus = document.getElementById("healthStatus");
const recordBtn = document.getElementById("recordBtn");
const recordStatus = document.getElementById("recordStatus");
const ttsPlayer = document.getElementById("ttsPlayer");
const ttsStatus = document.getElementById("ttsStatus");

const uploadForm = document.getElementById("uploadForm");
const fileInput = document.getElementById("fileInput");
const selectedFiles = document.getElementById("selectedFiles");
const uploadResult = document.getElementById("uploadResult");
const refreshDocsBtn = document.getElementById("refreshDocsBtn");
const documentsList = document.getElementById("documentsList");
const documentsEmpty = document.getElementById("documentsEmpty");

let recorderState = null;

async function apiFetch(url, options = {}) {
  const response = await fetch(url, options);
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const detail = typeof payload === "string" ? payload : payload.detail || "Request failed.";
    throw new Error(detail);
  }

  return payload;
}

function setMessage(element, text, kind) {
  element.textContent = text;
  element.classList.remove("hidden", "message-error", "message-success");
  if (kind === "error") {
    element.classList.add("message-error");
  } else if (kind === "success") {
    element.classList.add("message-success");
  }
}

function clearMessage(element) {
  element.textContent = "";
  element.classList.add("hidden");
  element.classList.remove("message-error", "message-success");
}

function renderRetrievals(items) {
  retrievals.innerHTML = "";
  if (!items || items.length === 0) {
    retrievals.innerHTML = '<div class="retrieval-card"><div class="doc-meta">No retrieved context.</div></div>';
    return;
  }

  for (const [index, item] of items.entries()) {
    const metadata = item.metadata || {};
    const card = document.createElement("article");
    card.className = "retrieval-card";
    card.innerHTML = `
      <strong>[${index + 1}] ${metadata.document_name || metadata.title || "Source"}</strong>
      <div class="retrieval-meta">Page ${metadata.page_number ?? "?"} | Score ${(item.score ?? 0).toFixed(3)}</div>
      <div>${item.text || ""}</div>
    `;
    retrievals.appendChild(card);
  }
}

async function loadLatestAudio(autoPlay = true) {
  ttsPlayer.classList.add("hidden");
  ttsPlayer.removeAttribute("src");
  ttsPlayer.load();

  const candidates = [
    { url: `/responses/latest/audio/mp3?ts=${Date.now()}`, type: "audio/mpeg" },
    { url: `/responses/latest/audio?ts=${Date.now()}`, type: "audio/wav" },
  ];

  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate.url);
      if (!response.ok) {
        continue;
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      ttsPlayer.src = objectUrl;
      ttsPlayer.classList.remove("hidden");
      ttsStatus.textContent = "Generated audio ready.";

      if (autoPlay) {
        try {
          await ttsPlayer.play();
          ttsStatus.textContent = "Playing generated response.";
        } catch (error) {
          ttsStatus.textContent = "Audio is ready. Press play if autoplay is blocked.";
        }
      }
      return;
    } catch (error) {
      continue;
    }
  }

  ttsStatus.textContent = "No generated audio available for this response.";
}

function renderPipelineResult(data) {
  transcriptText.textContent = data.text || "";
  structuredQuery.textContent = data.structured_query || "No structured query returned.";
  finalAnswer.textContent = data.llm_response || "No LLM response returned.";
  renderRetrievals(data.retrievals || []);
  queryResult.classList.remove("hidden");

  if (data.tts_generated) {
    loadLatestAudio(true);
  } else if (data.tts_error) {
    ttsStatus.textContent = data.tts_error;
    ttsPlayer.classList.add("hidden");
  } else {
    ttsStatus.textContent = "No generated audio available for this response.";
    ttsPlayer.classList.add("hidden");
  }
}

function renderDocuments(items) {
  documentsList.innerHTML = "";
  const hasItems = Array.isArray(items) && items.length > 0;
  documentsEmpty.classList.toggle("hidden", hasItems);

  if (!hasItems) {
    return;
  }

  for (const item of items) {
    const card = document.createElement("article");
    card.className = "document-card";
    card.innerHTML = `
      <strong>${item.document_name || "Unnamed PDF"}</strong>
      <div class="doc-meta">Chunks: ${item.total_chunks ?? 0} | Pages: ${item.total_pages ?? 0}</div>
      <div class="doc-meta">ID: ${item.document_id}</div>
      <div class="doc-actions">
        <button class="button danger" type="button" data-document-id="${item.document_id}">Delete</button>
      </div>
    `;
    documentsList.appendChild(card);
  }
}

function formatFileSize(size) {
  if (!Number.isFinite(size) || size <= 0) {
    return "0 KB";
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

function renderSelectedFiles() {
  selectedFiles.innerHTML = "";

  if (!fileInput.files || fileInput.files.length === 0) {
    selectedFiles.classList.add("hidden");
    return;
  }

  selectedFiles.classList.remove("hidden");

  for (const file of fileInput.files) {
    const item = document.createElement("div");
    item.className = "selected-file";
    item.innerHTML = `
      <div class="selected-file-name">${file.name}</div>
      <div class="doc-meta">${formatFileSize(file.size)}</div>
    `;
    selectedFiles.appendChild(item);
  }
}

async function refreshHealth() {
  try {
    const data = await apiFetch("/health");
    healthStatus.textContent = data.status === "ok" ? "Online" : data.status;
  } catch (error) {
    healthStatus.textContent = "Offline";
  }
}

async function refreshDocuments() {
  try {
    const data = await apiFetch("/rag/documents");
    renderDocuments(data.items || []);
  } catch (error) {
    setMessage(uploadResult, error.message, "error");
  }
}

function mergeFloat32Chunks(chunks) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Float32Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

function encodeWav(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  function writeString(offset, value) {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  }

  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

async function startRecording() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("This browser does not support microphone recording.");
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
  const source = audioContext.createMediaStreamSource(stream);
  const processor = audioContext.createScriptProcessor(4096, 1, 1);
  const silentGain = audioContext.createGain();
  silentGain.gain.value = 0;
  const chunks = [];

  processor.onaudioprocess = (event) => {
    const channelData = event.inputBuffer.getChannelData(0);
    chunks.push(new Float32Array(channelData));
  };

  source.connect(processor);
  processor.connect(silentGain);
  silentGain.connect(audioContext.destination);

  recorderState = { stream, audioContext, source, processor, silentGain, chunks };
  recordStatus.textContent = "Recording from microphone...";
  recordBtn.textContent = "Stop Recording";
}

async function stopRecording() {
  if (!recorderState) {
    return null;
  }

  const { stream, audioContext, source, processor, silentGain, chunks } = recorderState;
  processor.disconnect();
  source.disconnect();
  silentGain.disconnect();
  stream.getTracks().forEach((track) => track.stop());
  await audioContext.close();
  recorderState = null;

  const merged = mergeFloat32Chunks(chunks);
  if (merged.length === 0) {
    throw new Error("No audio was captured.");
  }

  return encodeWav(merged, 16000);
}

async function submitAudioBlob(blob) {
  const formData = new FormData();
  formData.append("file", blob, "recording.wav");

  const data = await apiFetch("/pipeline/audio", {
    method: "POST",
    body: formData,
  });

  return data;
}

queryForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(queryError);
  queryResult.classList.add("hidden");

  const question = queryInput.value.trim();
  if (!question) {
    setMessage(queryError, "Please enter a question first.", "error");
    return;
  }

  const submitButton = queryForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  submitButton.textContent = "Running...";

  try {
    const data = await apiFetch("/pipeline/text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: question,
      }),
    });

    renderPipelineResult(data);

    if (data.rag_error) {
      setMessage(queryError, `RAG warning: ${data.rag_error}`, "error");
    }
  } catch (error) {
    setMessage(queryError, error.message, "error");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Run Pipeline";
  }
});

recordBtn.addEventListener("click", async () => {
  clearMessage(queryError);

  if (!recorderState) {
    try {
      recordBtn.disabled = true;
      await startRecording();
    } catch (error) {
      setMessage(queryError, error.message, "error");
      recordStatus.textContent = "Microphone idle";
    } finally {
      recordBtn.disabled = false;
    }
    return;
  }

  try {
    recordBtn.disabled = true;
    recordStatus.textContent = "Uploading audio and running pipeline...";
    const wavBlob = await stopRecording();
    const data = await submitAudioBlob(wavBlob);
    renderPipelineResult(data);
    recordStatus.textContent = "Voice request completed.";
  } catch (error) {
    setMessage(queryError, error.message, "error");
    recordStatus.textContent = "Microphone idle";
  } finally {
    recordBtn.disabled = false;
    recordBtn.textContent = "Start Talking";
  }
});

uploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(uploadResult);

  if (!fileInput.files || fileInput.files.length === 0) {
    setMessage(uploadResult, "Choose at least one PDF to ingest.", "error");
    return;
  }

  const submitButton = uploadForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  submitButton.textContent = "Uploading...";

  try {
    const formData = new FormData();
    for (const file of fileInput.files) {
      formData.append("files", file);
    }

    const data = await apiFetch("/rag/documents/upload", {
      method: "POST",
      body: formData,
    });

    const successCount = (data.items || []).filter((item) => item.success).length;
    const failures = (data.items || []).filter((item) => !item.success);

    if (failures.length === 0) {
      setMessage(uploadResult, `Indexed ${successCount} PDF${successCount === 1 ? "" : "s"} successfully.`, "success");
    } else {
      const summary = failures.map((item) => `${item.filename}: ${item.detail}`).join(" | ");
      setMessage(uploadResult, summary, successCount > 0 ? "success" : "error");
    }

    fileInput.value = "";
    renderSelectedFiles();
    await refreshDocuments();
  } catch (error) {
    setMessage(uploadResult, error.message, "error");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Ingest Selected PDFs";
  }
});

fileInput.addEventListener("change", renderSelectedFiles);

refreshDocsBtn.addEventListener("click", refreshDocuments);

documentsList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-document-id]");
  if (!button) {
    return;
  }

  const { documentId } = button.dataset;
  if (!documentId) {
    return;
  }

  button.disabled = true;
  button.textContent = "Deleting...";

  try {
    await apiFetch(`/rag/documents/${encodeURIComponent(documentId)}`, {
      method: "DELETE",
    });
    setMessage(uploadResult, "Document deleted from the RAG index.", "success");
    await refreshDocuments();
  } catch (error) {
    setMessage(uploadResult, error.message, "error");
  } finally {
    button.disabled = false;
    button.textContent = "Delete";
  }
});

refreshHealth();
refreshDocuments();
