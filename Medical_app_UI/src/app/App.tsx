import { useState } from 'react';
import { PatientInfo } from './components/PatientInfo';
import { VitalsMonitor } from './components/VitalsMonitor';
import { VoiceAssistant } from './components/VoiceAssistant';
import { Activity } from 'lucide-react';

export default function App() {
  const [currentPatient, setCurrentPatient] = useState({
    name: '',
    age: 0,
    gender: '',
    height: '',
    weight: '',
    bloodType: '',
    conditions: [] as string[]
  });

  const [vitals, setVitals] = useState({
    heartRate: 0,
    bloodPressure: '',
    temperature: 0,
    oxygenSaturation: 0,
    respiratoryRate: 0
  });

  const updatePatientData = (data: { patient?: any; vitals?: any }) => {
    if (data.patient) {
      setCurrentPatient(data.patient);
    }
    if (data.vitals) {
      setVitals(data.vitals);
    }
  };

  return (
    <div className="size-full flex flex-col bg-accent/30">
      <header className="bg-white border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
            <Activity className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <h1>E-Protocol Voice Assistant</h1>
            <p className="text-sm text-muted-foreground">Speak to input patient data</p>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="lg:col-span-1">
            {currentPatient.name ? (
              <PatientInfo {...currentPatient} />
            ) : (
              <div className="bg-white rounded-lg border border-border p-6 h-full flex items-center justify-center">
                <p className="text-muted-foreground text-center">
                  No patient data yet. Use voice assistant to add patient information.
                </p>
              </div>
            )}
          </div>
          <div className="lg:col-span-2">
            {vitals.heartRate > 0 ? (
              <VitalsMonitor vitals={vitals} />
            ) : (
              <div className="bg-white rounded-lg border border-border p-6 h-full flex items-center justify-center">
                <p className="text-muted-foreground text-center">
                  No vital signs recorded. Use voice assistant to add vitals.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6">
          <VoiceAssistant onDataUpdate={updatePatientData} />
        </div>
      </main>

      <footer className="bg-white border-t border-border px-6 py-3 text-center">
        <p className="text-xs text-muted-foreground">
          © 2026 E-Protocol. All rights reserved.
        </p>
      </footer>
    </div>
  );
}