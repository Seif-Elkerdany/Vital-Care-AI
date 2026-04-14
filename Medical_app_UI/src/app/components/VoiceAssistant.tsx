import { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, MicOff, Volume2, VolumeX, Loader2 } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface VoiceAssistantProps {
  onDataUpdate: (data: { patient?: any; vitals?: any }) => void;
}

const API = '/api';
const POLL_INTERVAL_MS = 600;

export function VoiceAssistant({ onDataUpdate }: VoiceAssistantProps) {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: "Hello Doctor. I'm ready to record patient information. Press the mic button and speak.",
      timestamp: new Date(),
    },
  ]);
  const [backendError, setBackendError] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Track which transcription was last processed so we don't duplicate messages
  const lastProcessedText = useRef<string | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  // ── Extract patient/vitals data from transcript ──────────────────────────
  const extractPatientData = (text: string) => {
    const lower = text.toLowerCase();
    const patient: any = {};
    const vitals: any = {};

    const nameMatch =
      text.match(/patient\s+(?:is\s+)?(?:named\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i) ||
      text.match(/name\s+(?:is\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i);
    if (nameMatch) patient.name = nameMatch[1];

    const ageMatch = text.match(/(\d+)\s*(?:years?\s+old|year|yrs?)/i);
    if (ageMatch) patient.age = parseInt(ageMatch[1]);

    if (lower.includes('male') && !lower.includes('female')) patient.gender = 'Male';
    else if (lower.includes('female')) patient.gender = 'Female';

    const heightMatch =
      text.match(/(\d+['']?\s*\d*[""]?)\s*(?:tall|height)/i) ||
      text.match(/height\s+(?:is\s+)?(\d+['']?\s*\d*[""]?)/i);
    if (heightMatch) patient.height = heightMatch[1];

    const weightMatch = text.match(/(\d+)\s*(?:lbs?|pounds?|kg|kilograms?)/i);
    if (weightMatch) patient.weight = `${weightMatch[1]} ${lower.includes('kg') ? 'kg' : 'lbs'}`;

    const bloodTypeMatch =
      text.match(/blood\s+type\s+([ABO][+-]?)/i) ||
      text.match(/type\s+([ABO][+-]?)\s+blood/i);
    if (bloodTypeMatch) patient.bloodType = bloodTypeMatch[1].toUpperCase();

    const conditions: string[] = [];
    if (lower.includes('sepsis')) {
      const m = text.match(/sepsis[,\s]+(?:stage\s+)?(\d+)/i);
      conditions.push(m ? `Sepsis - Stage ${m[1]} (Critical)` : 'Sepsis');
    }
    if (lower.includes('diabetes'))
      conditions.push(lower.includes('type 2') || lower.includes('type two') ? 'Type 2 Diabetes Mellitus' : 'Diabetes');
    if (lower.includes('hypertension') || lower.includes('high blood pressure')) conditions.push('Hypertension');
    if (lower.includes('kidney injury') || lower.includes('aki')) conditions.push('Acute Kidney Injury (AKI)');
    for (const m of text.matchAll(/(?:diagnosed with|has|suffering from)\s+([^.,]+?)(?:\.|,|$)/gi)) {
      const c = m[1].trim();
      if (c.length > 3 && !conditions.some((x) => x.toLowerCase().includes(c.toLowerCase()))) conditions.push(c);
    }
    if (conditions.length) patient.conditions = conditions;

    const hrMatch = text.match(/heart\s+rate\s+(?:is\s+)?(\d+)/i) || text.match(/(\d+)\s+(?:bpm|beats\s+per\s+minute)/i);
    if (hrMatch) vitals.heartRate = parseInt(hrMatch[1]);

    const bpMatch =
      text.match(/blood\s+pressure\s+(?:is\s+)?(\d+)\s*[/over]+\s*(\d+)/i) ||
      text.match(/(\d+)\s*[/over]+\s*(\d+)\s*(?:mmhg)?/i);
    if (bpMatch) vitals.bloodPressure = `${bpMatch[1]}/${bpMatch[2]}`;

    const tempMatch =
      text.match(/temperature\s+(?:is\s+)?(\d+\.?\d*)/i) ||
      text.match(/(\d+\.?\d*)\s*(?:degrees?|°)\s*(?:fahrenheit|f)/i);
    if (tempMatch) vitals.temperature = parseFloat(tempMatch[1]);

    const o2Match =
      text.match(/oxygen\s+(?:saturation\s+)?(?:is\s+)?(\d+)/i) ||
      text.match(/(?:o2|spo2)\s+(?:is\s+)?(\d+)/i) ||
      text.match(/(\d+)\s*percent\s+oxygen/i);
    if (o2Match) vitals.oxygenSaturation = parseInt(o2Match[1]);

    const rrMatch =
      text.match(/respiratory\s+rate\s+(?:is\s+)?(\d+)/i) ||
      text.match(/respiration\s+(?:is\s+)?(\d+)/i) ||
      text.match(/(\d+)\s+(?:breaths?\s+per\s+minute|respirations?)/i);
    if (rrMatch) vitals.respiratoryRate = parseInt(rrMatch[1]);

    return {
      patient: Object.keys(patient).length ? patient : null,
      vitals: Object.keys(vitals).length ? vitals : null,
    };
  };

  // ── Play TTS audio from backend ───────────────────────────────────────────
  const playBackendAudio = async () => {
    try {
      const res = await fetch(`${API}/responses/latest/audio/mp3`);
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (audioRef.current) {
        audioRef.current.pause();
        URL.revokeObjectURL(audioRef.current.src);
      }
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onplay = () => setIsSpeaking(true);
      audio.onended = () => { setIsSpeaking(false); URL.revokeObjectURL(url); };
      audio.onerror = () => setIsSpeaking(false);
      audio.play();
    } catch {
      // TTS not available — silently skip
    }
  };

  // ── Handle a completed transcription ─────────────────────────────────────
  const handleTranscriptionDone = useCallback(
    async (transcriptText: string) => {
      if (transcriptText === lastProcessedText.current) return;
      lastProcessedText.current = transcriptText;

      // Show user message
      setMessages((prev: Message[]) => [
        ...prev,
        { role: 'user', content: transcriptText, timestamp: new Date() },
      ]);

      // Extract and propagate patient data
      const extracted = extractPatientData(transcriptText);
      if (extracted.patient || extracted.vitals) onDataUpdate(extracted);

      // Fetch LLM response
      try {
        const res = await fetch(`${API}/transcriptions/latest`);
        if (res.ok) {
          const data = await res.json();
          if (data.llm_response) {
            setMessages((prev: Message[]) => [
              ...prev,
              { role: 'assistant', content: data.llm_response, timestamp: new Date() },
            ]);
            playBackendAudio();
          }
        }
      } catch {
        // backend unreachable — ignore
      }
    },
    [onDataUpdate],
  );

  // ── Poll recording/status ─────────────────────────────────────────────────
  const startPolling = useCallback(() => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API}/recording/status`);
        if (!res.ok) return;
        const status = await res.json();

        // Mirror live partial transcript while still recording
        if (status.latest_text) setLiveTranscript(status.latest_text);

        if (!status.recording && !status.transcribing) {
          // Done
          stopPolling();
          setIsListening(false);
          setIsProcessing(false);
          setLiveTranscript('');
          if (status.latest_text) {
            await handleTranscriptionDone(status.latest_text);
          }
        } else if (!status.recording && status.transcribing) {
          setIsListening(false);
          setIsProcessing(true);
        }
      } catch {
        // backend unreachable during poll — keep trying
      }
    }, POLL_INTERVAL_MS);
  }, [stopPolling, handleTranscriptionDone]);

  // ── Mic button ────────────────────────────────────────────────────────────
  const toggleListening = async () => {
    setBackendError(null);
    try {
      const res = await fetch(`${API}/recording/toggle`, { method: 'POST' });
      if (!res.ok) {
        setBackendError(`Backend returned ${res.status}`);
        return;
      }
      const { state } = await res.json();

      if (state === 'recording_started') {
        setIsListening(true);
        setIsProcessing(false);
        setLiveTranscript('');
        lastProcessedText.current = null;
        startPolling();
      } else if (state === 'transcribing') {
        // Already recording; backend stopped and is now transcribing
        setIsListening(false);
        setIsProcessing(true);
        startPolling();
      } else if (state === 'busy') {
        setBackendError('Backend is busy. Please wait.');
      } else if (state === 'no_audio') {
        setBackendError('No audio captured. Please try again.');
        setIsListening(false);
        setIsProcessing(false);
        stopPolling();
      } else if (state === 'error') {
        setBackendError('Recording error. Check backend logs.');
        setIsListening(false);
        setIsProcessing(false);
        stopPolling();
      }
    } catch {
      setBackendError('Cannot reach backend at http://localhost:8000. Is the server running?');
    }
  };

  const stopSpeaking = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsSpeaking(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-border p-6 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2>AI Medical Assistant</h2>
        <button
          onClick={stopSpeaking}
          className={`p-2 rounded-lg transition-colors ${
            isSpeaking ? 'bg-primary text-primary-foreground' : 'bg-accent hover:bg-accent/80'
          }`}
          title={isSpeaking ? 'Stop speaking' : 'Speaking enabled'}
        >
          {isSpeaking ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
        </button>
      </div>

      {/* Message history */}
      <div className="flex-1 overflow-y-auto mb-4 space-y-3 min-h-[300px] max-h-[400px]">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`p-3 rounded-lg ${
              msg.role === 'user'
                ? 'bg-primary text-primary-foreground ml-8'
                : 'bg-accent mr-8'
            }`}
          >
            <p className="text-sm">{msg.content}</p>
            <p className="text-xs opacity-70 mt-1">{msg.timestamp.toLocaleTimeString()}</p>
          </div>
        ))}
        {isProcessing && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Transcribing…</span>
          </div>
        )}
      </div>

      {/* Live transcript */}
      {(liveTranscript || isListening) && (
        <div className="mb-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
          <p className="text-sm text-blue-900">
            {liveTranscript || <span className="italic opacity-60">Listening…</span>}
          </p>
        </div>
      )}

      {/* Backend error */}
      {backendError && (
        <div className="mb-3 p-3 bg-red-50 rounded-lg border border-red-200">
          <p className="text-sm text-red-800">{backendError}</p>
        </div>
      )}

      {/* Mic button */}
      <div className="flex items-center gap-3">
        <button
          onClick={toggleListening}
          disabled={isProcessing}
          className={`flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-lg transition-all ${
            isListening
              ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse'
              : 'bg-primary hover:bg-primary/90 text-primary-foreground'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {isListening ? (
            <>
              <MicOff className="w-5 h-5" />
              <span>Stop Recording</span>
            </>
          ) : (
            <>
              <Mic className="w-5 h-5" />
              <span>Start Recording</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
