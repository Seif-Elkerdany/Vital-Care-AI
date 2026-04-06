import { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Volume2, VolumeX, Loader2 } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface VoiceAssistantProps {
  onDataUpdate: (data: { patient?: any; vitals?: any }) => void;
}

export function VoiceAssistant({ onDataUpdate }: VoiceAssistantProps) {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'Hello Doctor. I\'m ready to record patient information. Please tell me the patient\'s name, demographics, vital signs, and medical conditions.',
      timestamp: new Date()
    }
  ]);
  const [transcript, setTranscript] = useState('');

  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);

  useEffect(() => {
    // Initialize Speech Recognition
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((result: any) => result[0])
          .map((result) => result.transcript)
          .join('');

        setTranscript(transcript);

        if (event.results[0].isFinal) {
          handleUserSpeech(transcript);
        }
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }

    // Initialize Speech Synthesis
    synthRef.current = window.speechSynthesis;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (synthRef.current) {
        synthRef.current.cancel();
      }
    };
  }, []);

  const handleUserSpeech = async (text: string) => {
    const userMessage: Message = {
      role: 'user',
      content: text,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMessage]);
    setTranscript('');
    setIsProcessing(true);

    // Simulate LLM processing with medical context
    setTimeout(() => {
      const response = generateMedicalResponse(text);
      const assistantMessage: Message = {
        role: 'assistant',
        content: response,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, assistantMessage]);
      setIsProcessing(false);
      speakResponse(response);
    }, 1500);
  };

  const extractPatientData = (text: string) => {
    const lowerText = text.toLowerCase();
    const patientData: any = {};
    const vitalsData: any = {};

    // Extract patient name
    const nameMatch = text.match(/patient\s+(?:is\s+)?(?:named\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i) ||
                     text.match(/name\s+(?:is\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i);
    if (nameMatch) {
      patientData.name = nameMatch[1];
    }

    // Extract age
    const ageMatch = text.match(/(\d+)\s*(?:years?\s+old|year|yrs?)/i);
    if (ageMatch) {
      patientData.age = parseInt(ageMatch[1]);
    }

    // Extract gender
    if (lowerText.includes('male') && !lowerText.includes('female')) {
      patientData.gender = 'Male';
    } else if (lowerText.includes('female')) {
      patientData.gender = 'Female';
    }

    // Extract height
    const heightMatch = text.match(/(\d+['']?\s*\d*[""]?)\s*(?:tall|height)/i) ||
                       text.match(/height\s+(?:is\s+)?(\d+['']?\s*\d*[""]?)/i);
    if (heightMatch) {
      patientData.height = heightMatch[1];
    }

    // Extract weight
    const weightMatch = text.match(/(\d+)\s*(?:lbs?|pounds?|kg|kilograms?)/i);
    if (weightMatch) {
      patientData.weight = `${weightMatch[1]} ${lowerText.includes('kg') ? 'kg' : 'lbs'}`;
    }

    // Extract blood type
    const bloodTypeMatch = text.match(/blood\s+type\s+([ABO][+-]?)/i) ||
                          text.match(/type\s+([ABO][+-]?)\s+blood/i);
    if (bloodTypeMatch) {
      patientData.bloodType = bloodTypeMatch[1].toUpperCase();
    }

    // Extract conditions
    const conditions: string[] = [];
    if (lowerText.includes('sepsis')) {
      const sepsisMatch = text.match(/sepsis[,\s]+(?:stage\s+)?(\d+)/i);
      conditions.push(sepsisMatch ? `Sepsis - Stage ${sepsisMatch[1]} (Critical)` : 'Sepsis');
    }
    if (lowerText.includes('diabetes')) {
      conditions.push(lowerText.includes('type 2') || lowerText.includes('type two') ? 'Type 2 Diabetes Mellitus' : 'Diabetes');
    }
    if (lowerText.includes('hypertension') || lowerText.includes('high blood pressure')) {
      conditions.push('Hypertension');
    }
    if (lowerText.includes('kidney injury') || lowerText.includes('aki')) {
      conditions.push('Acute Kidney Injury (AKI)');
    }

    // Extract other mentioned conditions
    const conditionPatterns = [
      /(?:diagnosed with|has|suffering from)\s+([^.,]+?)(?:\.|,|$)/gi
    ];
    conditionPatterns.forEach(pattern => {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        const condition = match[1].trim();
        if (condition && condition.length > 3 && !conditions.some(c => c.toLowerCase().includes(condition.toLowerCase()))) {
          conditions.push(condition);
        }
      }
    });

    if (conditions.length > 0) {
      patientData.conditions = conditions;
    }

    // Extract vitals
    const hrMatch = text.match(/heart\s+rate\s+(?:is\s+)?(\d+)/i) ||
                   text.match(/(\d+)\s+(?:bpm|beats\s+per\s+minute)/i);
    if (hrMatch) {
      vitalsData.heartRate = parseInt(hrMatch[1]);
    }

    const bpMatch = text.match(/blood\s+pressure\s+(?:is\s+)?(\d+)\s*[\/over]+\s*(\d+)/i) ||
                   text.match(/(\d+)\s*[\/over]+\s*(\d+)\s*(?:mmhg)?/i);
    if (bpMatch) {
      vitalsData.bloodPressure = `${bpMatch[1]}/${bpMatch[2]}`;
    }

    const tempMatch = text.match(/temperature\s+(?:is\s+)?(\d+\.?\d*)/i) ||
                     text.match(/(\d+\.?\d*)\s*(?:degrees?|°)\s*(?:fahrenheit|f)/i);
    if (tempMatch) {
      vitalsData.temperature = parseFloat(tempMatch[1]);
    }

    const o2Match = text.match(/oxygen\s+(?:saturation\s+)?(?:is\s+)?(\d+)/i) ||
                   text.match(/(?:o2|spo2)\s+(?:is\s+)?(\d+)/i) ||
                   text.match(/(\d+)\s*percent\s+oxygen/i);
    if (o2Match) {
      vitalsData.oxygenSaturation = parseInt(o2Match[1]);
    }

    const rrMatch = text.match(/respiratory\s+rate\s+(?:is\s+)?(\d+)/i) ||
                   text.match(/respiration\s+(?:is\s+)?(\d+)/i) ||
                   text.match(/(\d+)\s+(?:breaths?\s+per\s+minute|respirations?)/i);
    if (rrMatch) {
      vitalsData.respiratoryRate = parseInt(rrMatch[1]);
    }

    return { patient: Object.keys(patientData).length > 0 ? patientData : null, vitals: Object.keys(vitalsData).length > 0 ? vitalsData : null };
  };

  const generateMedicalResponse = (query: string): string => {
    const extractedData = extractPatientData(query);

    if (extractedData.patient || extractedData.vitals) {
      onDataUpdate(extractedData);

      let response = 'Recorded: ';
      const details: string[] = [];

      if (extractedData.patient) {
        if (extractedData.patient.name) details.push(`Patient ${extractedData.patient.name}`);
        if (extractedData.patient.age) details.push(`${extractedData.patient.age} years old`);
        if (extractedData.patient.gender) details.push(extractedData.patient.gender);
        if (extractedData.patient.height) details.push(`height ${extractedData.patient.height}`);
        if (extractedData.patient.weight) details.push(`weight ${extractedData.patient.weight}`);
        if (extractedData.patient.bloodType) details.push(`blood type ${extractedData.patient.bloodType}`);
        if (extractedData.patient.conditions) details.push(`conditions: ${extractedData.patient.conditions.join(', ')}`);
      }

      if (extractedData.vitals) {
        if (extractedData.vitals.heartRate) details.push(`heart rate ${extractedData.vitals.heartRate} bpm`);
        if (extractedData.vitals.bloodPressure) details.push(`blood pressure ${extractedData.vitals.bloodPressure}`);
        if (extractedData.vitals.temperature) details.push(`temperature ${extractedData.vitals.temperature}°F`);
        if (extractedData.vitals.oxygenSaturation) details.push(`oxygen saturation ${extractedData.vitals.oxygenSaturation}%`);
        if (extractedData.vitals.respiratoryRate) details.push(`respiratory rate ${extractedData.vitals.respiratoryRate} per minute`);
      }

      response += details.join(', ') + '.';
      return response;
    }

    return 'Please provide patient information including name, age, gender, height, weight, blood type, medical conditions, and vital signs.';
  };

  const speakResponse = (text: string) => {
    if (synthRef.current) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      utterance.pitch = 1;
      utterance.volume = 1;

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);

      synthRef.current.speak(utterance);
    }
  };

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      recognitionRef.current?.start();
      setIsListening(true);
    }
  };

  const toggleSpeaking = () => {
    if (isSpeaking && synthRef.current) {
      synthRef.current.cancel();
      setIsSpeaking(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-border p-6 flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <h2>AI Medical Assistant</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleSpeaking}
            className={`p-2 rounded-lg transition-colors ${
              isSpeaking ? 'bg-primary text-primary-foreground' : 'bg-accent hover:bg-accent/80'
            }`}
            title={isSpeaking ? 'Stop speaking' : 'Speaking enabled'}
          >
            {isSpeaking ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto mb-4 space-y-3 min-h-[300px] max-h-[400px]">
        {messages.map((message, index) => (
          <div
            key={index}
            className={`p-3 rounded-lg ${
              message.role === 'user'
                ? 'bg-primary text-primary-foreground ml-8'
                : 'bg-accent mr-8'
            }`}
          >
            <p className="text-sm">{message.content}</p>
            <p className="text-xs opacity-70 mt-1">
              {message.timestamp.toLocaleTimeString()}
            </p>
          </div>
        ))}
        {isProcessing && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Processing...</span>
          </div>
        )}
      </div>

      {transcript && isListening && (
        <div className="mb-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
          <p className="text-sm text-blue-900">{transcript}</p>
        </div>
      )}

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
              <span>Stop Listening</span>
            </>
          ) : (
            <>
              <Mic className="w-5 h-5" />
              <span>Start Listening</span>
            </>
          )}
        </button>
      </div>

      {!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) && (
        <div className="mt-3 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
          <p className="text-sm text-yellow-900">
            Speech recognition is not supported in this browser. Please use Chrome or Edge.
          </p>
        </div>
      )}
    </div>
  );
}
