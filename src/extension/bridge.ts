import type { RealtimeEvent } from '@/types/realtime';

type ExtensionEventListener = (event: RealtimeEvent) => void;

const listeners = new Set<ExtensionEventListener>();

export function subscribeExtensionEvents(listener: ExtensionEventListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifyScratchRealtimeEvent(event: RealtimeEvent): void {
  for (const listener of listeners) {
    listener(event);
  }
}
