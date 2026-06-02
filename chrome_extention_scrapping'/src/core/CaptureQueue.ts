/**
 * CaptureQueue — durable upload queue backed by chrome.storage.local.
 *
 * Survives extension reload, SW termination, and browser crashes.
 * Each entry is never removed until the backend returns 2xx or max attempts exceeded.
 *
 * Retry strategy: exponential backoff with jitter.
 *   delay = min(BASE * 2^attempt, MAX_DELAY) * (0.5 + rand * 0.5)
 */

import { BackendClient } from '../api/BackendClient';
import type { CapturePayload, CaptureResponse } from '../api/BackendClient';

const QUEUE_KEY     = 'cw_capture_queue_v1';
const MAX_ATTEMPTS  = 5;
const BASE_DELAY_MS = 1_000;
const MAX_DELAY_MS  = 30_000;
const TTL_DONE_MS   = 24 * 60 * 60 * 1_000;  // 1 day
const TTL_FAIL_MS   =  7 * 24 * 60 * 60 * 1_000; // 7 days

type QueueStatus = 'pending' | 'uploading' | 'done' | 'failed';

export interface QueueEntry {
  id:          string;
  projectId:   string;
  payload:     CapturePayload;
  status:      QueueStatus;
  attempts:    number;
  lastAttempt: number;
  result?:     CaptureResponse;
  error?:      string;
  createdAt:   number;
}

export class CaptureQueue {
  private _client: BackendClient;
  private _flushing = false;

  constructor(client: BackendClient) {
    this._client = client;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  async enqueue(projectId: string, payload: CapturePayload): Promise<string> {
    const entry: QueueEntry = {
      id:          payload.idempotency_key,
      projectId,
      payload,
      status:      'pending',
      attempts:    0,
      lastAttempt: 0,
      createdAt:   Date.now(),
    };
    const queue = await this._load();
    // Replace if same key already exists (re-queue a failed entry)
    const idx = queue.findIndex(e => e.id === entry.id);
    if (idx >= 0) queue[idx] = entry;
    else queue.push(entry);
    await this._save(queue);
    return entry.id;
  }

  async flush(): Promise<void> {
    if (this._flushing) return;
    this._flushing = true;
    try {
      await this._processQueue();
    } finally {
      this._flushing = false;
    }
  }

  async getEntry(id: string): Promise<QueueEntry | null> {
    const queue = await this._load();
    return queue.find(e => e.id === id) ?? null;
  }

  async purgeExpired(): Promise<void> {
    const now = Date.now();
    const queue = await this._load();
    const filtered = queue.filter(e => {
      if (e.status === 'done')   return now - e.lastAttempt < TTL_DONE_MS;
      if (e.status === 'failed') return now - e.lastAttempt < TTL_FAIL_MS;
      return true;
    });
    await this._save(filtered);
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private async _processQueue(): Promise<void> {
    const queue = await this._load();
    let dirty = false;

    for (const entry of queue) {
      if (entry.status !== 'pending') continue;
      if (entry.attempts >= MAX_ATTEMPTS) {
        entry.status = 'failed';
        dirty = true;
        continue;
      }

      // Respect backoff
      const delay = this._backoffDelay(entry.attempts);
      if (entry.lastAttempt > 0 && Date.now() - entry.lastAttempt < delay) continue;

      entry.status      = 'uploading';
      entry.attempts   += 1;
      entry.lastAttempt = Date.now();
      dirty = true;
      await this._save(queue); // persist uploading state before network call

      try {
        const result = await this._client.captureConversation(entry.projectId, entry.payload);
        entry.status = 'done';
        entry.result = result;
      } catch (err) {
        entry.status = entry.attempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
        entry.error  = err instanceof Error ? err.message : String(err);
      }
      dirty = true;
    }

    if (dirty) await this._save(queue);
  }

  private _backoffDelay(attempt: number): number {
    const base = Math.min(BASE_DELAY_MS * Math.pow(2, attempt), MAX_DELAY_MS);
    return base * (0.5 + Math.random() * 0.5);
  }

  private async _load(): Promise<QueueEntry[]> {
    const data = await chrome.storage.local.get(QUEUE_KEY);
    return (data[QUEUE_KEY] as QueueEntry[] | undefined) ?? [];
  }

  private async _save(queue: QueueEntry[]): Promise<void> {
    await chrome.storage.local.set({ [QUEUE_KEY]: queue });
  }
}
