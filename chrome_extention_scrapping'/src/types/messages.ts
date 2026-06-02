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

// ── Context Capture (Popup → Background → Content Script) ────────────────────

export interface CaptureContextRequest {
  type:            'CAPTURE_CONTEXT_REQUEST';
  projectId:       string;
  tabId:           number;
  platform:        string;
  idempotencyKey:  string;
}

export interface CaptureContextResult {
  type: 'CAPTURE_CONTEXT_RESULT';
  ok:   true;
  contextId:     string;
  sessionId:     string;
  title:         string;
  messageCount:  number;
  platform:      string;
  capturedAt:    string;
} | {
  type: 'CAPTURE_CONTEXT_RESULT';
  ok:   false;
  error: 'LOCK_HELD' | 'TAB_DEAD' | 'EXTRACT_FAILED' | 'UPLOAD_FAILED' | 'DUPLICATE' | 'PROJECT_MISMATCH';
  detail?: string;
}

export interface ExtractConversationMessage {
  type: 'EXTRACT_CONVERSATION';
}

export interface ExtractConversationResult {
  ok:   true;
  payload: {
    title:    string;
    messages: Array<{ role: string; content: string; timestamp: string | null; index: number }>;
    metadata: { model: string | null; messageCount: number; charCount: number; extractorVersion: string };
  };
} | {
  ok:    false;
  error: 'NO_MESSAGES' | 'DOM_CHANGED' | 'EXTRACTION_FAILED';
  detail: string;
}

export type InternalMessage =
  | ContentScriptMessage
  | CaptureContextRequest;
