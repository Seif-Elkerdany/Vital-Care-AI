import React, { FormEvent, useState } from 'react';
import { Activity, Loader2 } from 'lucide-react';

interface LoginFormProps {
  onSubmit: (email: string, password: string) => Promise<void>;
  onRegister: (email: string, password: string, fullName?: string) => Promise<void>;
  error: string | null;
}

type AuthMode = 'login' | 'register';

export function LoginForm({ onSubmit, onRegister, error }: LoginFormProps) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalError(null);

    if (mode === 'register' && password !== confirmPassword) {
      setLocalError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'login') {
        await onSubmit(email.trim(), password);
      } else {
        await onRegister(email.trim(), password, fullName);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-accent/30 flex flex-col">
      <header className="bg-white border-b border-border px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
            <Activity className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">E-Protocol Voice Assistant</h1>
            <p className="text-sm text-muted-foreground">Secure clinician access</p>
          </div>
        </div>
      </header>

      <main className="flex-1 p-6 flex items-center justify-center">
        <div className="w-full max-w-md bg-white border border-border rounded-xl p-8 shadow-sm">
          <div className="mb-6">
            <div className="grid grid-cols-2 gap-2 rounded-lg bg-accent/40 p-1">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setLocalError(null);
                }}
                className={`rounded-md px-3 py-2 text-sm ${mode === 'login' ? 'bg-white border border-border' : 'text-muted-foreground'}`}
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setLocalError(null);
                }}
                className={`rounded-md px-3 py-2 text-sm ${mode === 'register' ? 'bg-white border border-border' : 'text-muted-foreground'}`}
              >
                Create account
              </button>
            </div>
          </div>

          <h2 className="text-lg font-semibold mb-1">{mode === 'login' ? 'Welcome back' : 'Create doctor account'}</h2>
          <p className="text-sm text-muted-foreground mb-6">
            {mode === 'login'
              ? 'Sign in to access the E-Protocol dashboard.'
              : 'Register with your hospital email to get started.'}
          </p>

          <form className="space-y-4" onSubmit={handleSubmit}>
            {mode === 'register' ? (
              <div>
                <label className="text-sm block mb-1" htmlFor="full-name">
                  Full name
                </label>
                <input
                  id="full-name"
                  type="text"
                  autoComplete="name"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="Dr. Jane Smith"
                />
              </div>
            ) : null}

            <div>
              <label className="text-sm block mb-1" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="doctor@hospital.org"
              />
            </div>

            <div>
              <label className="text-sm block mb-1" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={8}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="At least 8 characters"
              />
            </div>

            {mode === 'register' ? (
              <div>
                <label className="text-sm block mb-1" htmlFor="confirm-password">
                  Confirm password
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="Re-enter password"
                />
              </div>
            ) : null}

            {localError ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{localError}</div>
            ) : null}
            {error ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
            ) : null}

            <button
              type="submit"
              disabled={submitting}
              className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm disabled:opacity-60"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {submitting
                ? mode === 'login'
                  ? 'Signing in...'
                  : 'Creating account...'
                : mode === 'login'
                  ? 'Sign in'
                  : 'Create account'}
            </button>
          </form>
        </div>
      </main>

      <footer className="bg-white border-t border-border px-6 py-3 text-center">
        <p className="text-xs text-muted-foreground">© 2026 E-Protocol. All rights reserved.</p>
      </footer>
    </div>
  );
}
