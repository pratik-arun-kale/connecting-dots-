import type { SourcePlatform, FailureReason } from './session';

// ── External messages (Frontend → Extension via chrome.runtime.sendMessage) ──

export interface CreateProviderSessionRequest {
  type: 'CREATE_PROVIDER_SESSION';
  sessionId: string;
  projectId: string;
  platform: SourcePlatform;
  bootstrapMessage: string | null;
}

export type ExternalRequest = CreateProviderSessionRequest;

export interface ExternalResponse {
  success: boolean;
  error?: string;
}

// ── Content Script → Background (via chrome.runtime.sendMessage) ─────────────

export interface CsUiReadyEvent {
  type: 'CS_UI_READY';
}

export interface CsAuthRequiredEvent {
  type: 'CS_AUTH_REQUIRED';
}

export type ContentScriptMessage = CsUiReadyEvent | CsAuthRequiredEvent;

// ── Internal EventBus events ──────────────────────────────────────────────────

export interface UiReadyEvent {
  type: 'UI_READY';
  sessionId: string;
}

export interface UrlDetectedEvent {
  type: 'URL_DETECTED';
  sessionId: string;
  url: string;
}

export interface SessionFailedEvent {
  type: 'SESSION_FAILED';
  sessionId: string;
  reason: FailureReason;
  detail?: string;
}

export type SessionEvent = UiReadyEvent | UrlDetectedEvent | SessionFailedEvent;
