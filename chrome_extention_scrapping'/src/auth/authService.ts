import { setSession, clearSession, getRefreshToken } from './tokenStorage';

const BASE = 'http://localhost:8000/api/v1';

interface BackendErrorBody {
  error?: { message?: string };
}

export async function login(email: string, password: string): Promise<void> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    if (res.status === 429) throw new Error('Too many attempts. Try again in a few minutes.');
    const body = (await res.json().catch(() => null)) as BackendErrorBody | null;
    throw new Error(body?.error?.message ?? 'Invalid email or password.');
  }

  await setSession(await res.json());
}

export async function logout(): Promise<void> {
  const refreshToken = await getRefreshToken();
  await clearSession();
  if (refreshToken) {
    // Best-effort server-side revoke — local session is already cleared regardless.
    fetch(`${BASE}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    }).catch(() => {});
  }
}
