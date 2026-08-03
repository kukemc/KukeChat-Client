export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function asList<T>(value: unknown): T[] {
  if (Array.isArray(value)) {
    return value as T[];
  }

  if (isRecord(value)) {
    if (Array.isArray(value.items)) {
      return value.items as T[];
    }

    if (Array.isArray(value.data)) {
      return value.data as T[];
    }

    if (Array.isArray(value.results)) {
      return value.results as T[];
    }
  }

  return [];
}

export function pickToken(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }

  return typeof value.access_token === 'string' ? value.access_token : null;
}

export function pickNumber(value: unknown, key: string): number | null {
  if (!isRecord(value)) {
    return null;
  }

  const candidate = value[key];
  return typeof candidate === 'number' ? candidate : null;
}
