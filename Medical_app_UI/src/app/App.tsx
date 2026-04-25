import { useEffect, useState } from 'react';
import { PatientInfo } from './components/PatientInfo';
import { VitalsMonitor } from './components/VitalsMonitor';
import { VoiceAssistant } from './components/VoiceAssistant';
import { Activity, Loader2, LogOut } from 'lucide-react';
import { LoginForm } from './components/LoginForm';
import {
  AuthTokens,
  AuthUser,
  authErrorMessage,
  getMe,
  loadStoredTokens,
  login,
  register,
  logout,
  refresh,
  storeTokens,
} from './lib/authClient';

export default function App() {
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authTokens, setAuthTokens] = useState<AuthTokens | null>(null);
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

  useEffect(() => {
    let cancelled = false;

    const initializeAuth = async () => {
      const stored = loadStoredTokens();
      if (!stored) {
        if (!cancelled) setAuthLoading(false);
        return;
      }

      try {
        const user = await getMe(stored.accessToken);
        if (cancelled) return;
        setAuthTokens(stored);
        setAuthUser(user);
      } catch {
        try {
          const refreshed = await refresh(stored.refreshToken);
          if (cancelled) return;
          setAuthTokens(refreshed.tokens);
          setAuthUser(refreshed.user);
          storeTokens(refreshed.tokens);
        } catch {
          if (cancelled) return;
          storeTokens(null);
          setAuthTokens(null);
          setAuthUser(null);
        }
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    };

    initializeAuth();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogin = async (email: string, password: string) => {
    setAuthError(null);
    try {
      const session = await login(email, password);
      setAuthUser(session.user);
      setAuthTokens(session.tokens);
      storeTokens(session.tokens);
    } catch (error) {
      setAuthError(authErrorMessage(error));
      throw error;
    }
  };

  const handleRegister = async (email: string, password: string, fullName?: string) => {
    setAuthError(null);
    try {
      const session = await register(email, password, fullName);
      setAuthUser(session.user);
      setAuthTokens(session.tokens);
      storeTokens(session.tokens);
    } catch (error) {
      setAuthError(authErrorMessage(error));
      throw error;
    }
  };

  const handleLogout = async () => {
    const current = authTokens;
    setAuthError(null);
    setAuthUser(null);
    setAuthTokens(null);
    storeTokens(null);
    if (!current) return;
    try {
      await logout(current.accessToken);
    } catch {
      // Local logout still succeeds even if backend logout fails.
    }
  };

  const updatePatientData = (data: { patient?: any; vitals?: any }) => {
    if (data.patient) {
      setCurrentPatient(data.patient);
    }
    if (data.vitals) {
      setVitals(data.vitals);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-accent/30 flex items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Checking session...</span>
        </div>
      </div>
    );
  }

  if (!authUser || !authTokens) {
    return <LoginForm onSubmit={handleLogin} onRegister={handleRegister} error={authError} />;
  }

  return (
    <div className="size-full flex flex-col bg-accent/30">
      <header className="bg-white border-b border-border px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
              <Activity className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h1>E-Protocol Voice Assistant</h1>
              <p className="text-sm text-muted-foreground">Speak to input patient data</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-medium">{authUser.full_name || authUser.email}</p>
              <p className="text-xs text-muted-foreground">{authUser.role}</p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
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
          <VoiceAssistant onDataUpdate={updatePatientData} accessToken={authTokens.accessToken} />
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