import { AxiosError } from 'axios';

interface BackendErrorBody {
  error?: { code?: string; message?: string };
}

/** Reads the backend's { error: { code, message } } shape (see app/core/exceptions.py). */
export function extractErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof AxiosError) {
    if (err.response?.status === 429) return 'Too many attempts. Try again in a few minutes.';
    const message = (err.response?.data as BackendErrorBody | undefined)?.error?.message;
    if (typeof message === 'string') return message;
  }
  return fallback;
}
