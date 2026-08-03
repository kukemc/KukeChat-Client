export const CCW_CREATION_URL_PATTERN = /https?:\/\/(?:www\.)?ccw\.site\/detail\/([0-9a-fA-F]{24})(?:[/?#][^\s]*)?/g;

export interface CcwCreationRef {
  oid: string;
  accessKey?: string;
}

const TRAILING_PUNCTUATION = /[，。！？；：,.!?;:)\]}）】》]+$/;

export function extractCcwCreationRefs(text: string, limit = 3): CcwCreationRef[] {
  const refs: CcwCreationRef[] = [];
  const seen = new Set<string>();
  CCW_CREATION_URL_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(CCW_CREATION_URL_PATTERN)) {
    const oid = match[1]?.toLowerCase();
    if (!oid) {
      continue;
    }
    let accessKey = '';
    try {
      const url = new URL(match[0].replace(TRAILING_PUNCTUATION, ''));
      accessKey = url.searchParams.get('accessKey')?.trim() ?? '';
    } catch {
      accessKey = '';
    }
    const key = `${oid}:${accessKey}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    refs.push(accessKey ? { oid, accessKey } : { oid });
    if (refs.length >= limit) {
      break;
    }
  }
  CCW_CREATION_URL_PATTERN.lastIndex = 0;
  return refs;
}

export function extractCcwCreationOids(text: string, limit = 3): string[] {
  return extractCcwCreationRefs(text, limit).map((ref) => ref.oid);
}
