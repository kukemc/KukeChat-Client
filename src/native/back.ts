type NativeBackHandler = () => boolean;

interface NativeBackHandlerEntry {
  id: number;
  priority: number;
  handler: NativeBackHandler;
}

let nextNativeBackHandlerId = 1;
const nativeBackHandlers: NativeBackHandlerEntry[] = [];

export function registerNativeBackHandler(handler: NativeBackHandler, priority = 0): () => void {
  const entry: NativeBackHandlerEntry = {
    id: nextNativeBackHandlerId,
    priority,
    handler
  };
  nextNativeBackHandlerId += 1;
  nativeBackHandlers.push(entry);

  return () => {
    const index = nativeBackHandlers.findIndex((item) => item.id === entry.id);
    if (index >= 0) {
      nativeBackHandlers.splice(index, 1);
    }
  };
}

export function runNativeBackHandlers(): boolean {
  const handlers = [...nativeBackHandlers].sort((left, right) => {
    if (left.priority !== right.priority) {
      return right.priority - left.priority;
    }
    return right.id - left.id;
  });

  for (const entry of handlers) {
    if (!nativeBackHandlers.some((item) => item.id === entry.id)) {
      continue;
    }
    if (entry.handler()) {
      return true;
    }
  }

  return false;
}

export function requestNativeBack(): boolean {
  return runNativeBackHandlers();
}
