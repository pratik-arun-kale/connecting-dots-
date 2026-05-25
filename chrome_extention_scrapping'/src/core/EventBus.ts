import type { UiReadyEvent, UrlDetectedEvent, SessionFailedEvent } from '../types/messages';

type EventMap = {
  UI_READY:       UiReadyEvent;
  URL_DETECTED:   UrlDetectedEvent;
  SESSION_FAILED: SessionFailedEvent;
};

type AnyHandler = (event: EventMap[keyof EventMap]) => void | Promise<void>;

export class EventBus {
  private readonly _handlers = new Map<string, Set<AnyHandler>>();

  on<K extends keyof EventMap>(type: K, handler: (event: EventMap[K]) => void | Promise<void>): void {
    if (!this._handlers.has(type)) this._handlers.set(type, new Set());
    this._handlers.get(type)!.add(handler as AnyHandler);
  }

  off<K extends keyof EventMap>(type: K, handler: (event: EventMap[K]) => void | Promise<void>): void {
    this._handlers.get(type)?.delete(handler as AnyHandler);
  }

  emit<K extends keyof EventMap>(event: EventMap[K]): void {
    const set = this._handlers.get(event.type);
    if (!set) return;
    for (const h of set) void h(event);
  }
}
