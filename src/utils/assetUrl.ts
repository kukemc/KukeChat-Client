import { getApiBaseUrl } from '@/api/client';

function getAssetBase(): string | undefined {
  const assetBase = getApiBaseUrl().replace(/\/api\/v1\/?$/, '').replace(/\/$/, '');
  try {
    getAssetOrigin(assetBase);
    return assetBase;
  } catch {
    return undefined;
  }
}

function getAssetOrigin(assetBase: string): string {
  const fallbackOrigin = typeof window === 'undefined' ? 'http://localhost' : window.location.origin;
  return new URL(assetBase, fallbackOrigin).origin;
}

function normalizeUploadPath(pathname: string): string {
  return pathname.replace(/^\/api\/v1\/uploads\//, '/uploads/');
}

function isLocalUploadHost(hostname: string): boolean {
  return /^(localhost|127\.0\.0\.1)$/i.test(hostname);
}

function isResolvableLocalPath(pathname: string): boolean {
  return pathname.startsWith('/uploads/');
}

export function resolveAssetUrl(value?: string | null): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const assetBase = getAssetBase();
  if (!assetBase) {
    return undefined;
  }

  const normalized = normalizeUploadPath(trimmed);
  const localPreviewAllowed = normalized.startsWith('blob:');
  if (localPreviewAllowed) {
    return normalized;
  }

  const assetOrigin = getAssetOrigin(assetBase);

  try {
    const parsed = new URL(normalized);
    if (!/^https?:$/.test(parsed.protocol)) {
      return undefined;
    }

    parsed.pathname = normalizeUploadPath(parsed.pathname);
    if (isLocalUploadHost(parsed.hostname) && isResolvableLocalPath(parsed.pathname)) {
      return `${assetBase}${parsed.pathname}${parsed.search}${parsed.hash}`;
    }

    if (parsed.protocol === 'https:') {
      return parsed.toString();
    }

    if (parsed.origin !== assetOrigin || !isResolvableLocalPath(parsed.pathname)) {
      return undefined;
    }
    return parsed.toString();
  } catch {
    if (isResolvableLocalPath(normalized)) {
      return `${assetBase}${normalized}`;
    }
    return undefined;
  }
}

function thumbnailPathname(value: string): string | undefined {
  const normalized = normalizeUploadPath(value.trim());
  if (!normalized || normalized.startsWith('blob:')) {
    return undefined;
  }

  let pathname: string;
  try {
    pathname = normalizeUploadPath(new URL(normalized).pathname);
  } catch {
    try {
      pathname = normalizeUploadPath(new URL(normalized, 'https://kukechat.local').pathname);
    } catch {
      return undefined;
    }
  }

  let key = '';
  const uploadIndex = pathname.indexOf('/uploads/');
  if (uploadIndex < 0) {
    return undefined;
  }

  key = pathname.slice(uploadIndex + '/uploads/'.length);

  const parts = key.split('/').filter(Boolean);
  if (parts.length < 2 || parts[1] === 'thumbs') {
    return undefined;
  }

  const filename = parts[parts.length - 1];
  if (!filename) {
    return undefined;
  }

  const folder = parts[0];
  const stem = filename.replace(/\.[^.]*$/, '');
  return `/${folder}/thumbs/${stem}.jpg`;
}

export function resolveThumbnailUrl(value?: string | null, thumbnailUrl?: string | null): string | undefined {
  const explicitThumbnail = resolveAssetUrl(thumbnailUrl);
  if (explicitThumbnail) {
    return explicitThumbnail;
  }

  const original = resolveAssetUrl(value);
  if (!original) {
    return undefined;
  }

  if (original.startsWith('blob:')) {
    return original;
  }

  const thumbnailPath = value ? thumbnailPathname(value) : undefined;
  if (!thumbnailPath) {
    return original;
  }

  try {
    const parsed = new URL(original);
    const uploadIndex = parsed.pathname.indexOf('/uploads/');
    parsed.pathname = uploadIndex >= 0
      ? `${parsed.pathname.slice(0, uploadIndex)}/uploads${thumbnailPath}`
      : thumbnailPath;
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    const assetBase = getAssetBase();
    return assetBase ? `${assetBase}/uploads${thumbnailPath}` : original;
  }
}
