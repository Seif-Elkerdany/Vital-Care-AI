export interface AuthUser {
  id: string;
  email: string;
  full_name?: string | null;
  role: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

interface AuthTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: AuthUser;
}

interface RefreshResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: AuthUser;
}

const API_BASE = '/api';
const STORAGE_KEY = 'medapp-auth-tokens';

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Unexpected authentication error.';
}

async function parseError(response: Response): Promise<Error> {
  try {
    const data = await response.json();
    const detail = typeof data?.detail === 'string' ? data.detail : `Request failed (${response.status})`;
    return new Error(detail);
  } catch {
    return new Error(`Request failed (${response.status})`);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  return response.json() as Promise<T>;
}

export function loadStoredTokens(): AuthTokens | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AuthTokens;
    if (!parsed.accessToken || !parsed.refreshToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function storeTokens(tokens: AuthTokens | null): void {
  if (!tokens) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
}

export async function login(email: string, password: string): Promise<{ user: AuthUser; tokens: AuthTokens }> {
  const payload = await request<AuthTokenResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  return {
    user: payload.user,
    tokens: {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token,
    },
  };
}

export async function register(
  email: string,
  password: string,
  fullName?: string,
): Promise<{ user: AuthUser; tokens: AuthTokens }> {
  const payload = await request<AuthTokenResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password,
      full_name: fullName?.trim() || undefined,
    }),
  });
  return {
    user: payload.user,
    tokens: {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token,
    },
  };
}

export async function getMe(accessToken: string): Promise<AuthUser> {
  const response = await fetch(`${API_BASE}/auth/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!response.ok) throw await parseError(response);
  return response.json() as Promise<AuthUser>;
}

export async function refresh(refreshToken: string): Promise<{ user: AuthUser; tokens: AuthTokens }> {
  const payload = await request<RefreshResponse>('/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  return {
    user: payload.user,
    tokens: {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token,
    },
  };
}

export async function logout(accessToken: string): Promise<void> {
  const response = await fetch(`${API_BASE}/auth/logout`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!response.ok) {
    throw await parseError(response);
  }
}

export function authErrorMessage(error: unknown): string {
  return toErrorMessage(error);
}

export async function authFetch(path: string, accessToken: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${accessToken}`,
    },
  });
}
