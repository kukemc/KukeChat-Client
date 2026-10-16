import type { AppRelease, LatestReleaseResult, ReleaseArtifact, ReleaseChannel, ReleasePage, ReleasePlatform } from '@/types/release';
import { apiRequest } from './client';
import { isRecord } from './normalizers';

/**
 * 发版服务的公开接口（KukeChat-Server/docs/releases.md 第 2 节）。不需要登录：显式不带令牌，
 * 没登录、令牌过期时检查更新也照常工作；客户端证明头由 apiRequest 照常附上。
 */

const PLATFORMS: readonly ReleasePlatform[] = ['android', 'windows', 'macos', 'linux'];

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function nullableText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function nullableCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
}

function httpUrl(value: unknown): string | null {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim()) ? value.trim() : null;
}

function normalizeArtifact(raw: unknown): ReleaseArtifact | null {
  if (!isRecord(raw)) return null;
  const url = httpUrl(raw.url);
  if (!url) return null;
  const sha = nullableText(raw.sha256)?.toLowerCase() ?? null;
  return {
    id: nullableCount(raw.id) ?? 0,
    source: raw.source === 'external' ? 'external' : 'upload',
    fileName: text(raw.file_name, url.split('/').pop() ?? 'download'),
    url,
    size: nullableCount(raw.size),
    sha256: sha && /^[0-9a-f]{64}$/.test(sha) ? sha : null,
    arch: nullableText(raw.arch)
  };
}

function normalizeRelease(raw: unknown): AppRelease | null {
  if (!isRecord(raw)) return null;
  const version = text(raw.version).trim().replace(/^v/i, '');
  if (!version) return null;
  const artifacts = Array.isArray(raw.artifacts) ? raw.artifacts.map(normalizeArtifact).filter((item): item is ReleaseArtifact => item !== null) : [];
  const platform = PLATFORMS.includes(raw.platform as ReleasePlatform) ? (raw.platform as ReleasePlatform) : 'windows';
  return {
    id: nullableCount(raw.id) ?? 0,
    platform,
    channel: raw.channel === 'beta' ? 'beta' : 'stable',
    version,
    build: nullableCount(raw.build) ?? 0,
    changelog: text(raw.changelog),
    minSupportedVersion: nullableText(raw.min_supported_version),
    publishedAt: nullableText(raw.published_at),
    artifacts,
    artifact: normalizeArtifact(raw.artifact) ?? artifacts[0] ?? null
  };
}

function query(params: Record<string, string | number | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== '') search.set(key, String(value));
  }
  return search.toString();
}

export async function fetchLatestRelease(options: {
  platform: ReleasePlatform;
  channel?: ReleaseChannel;
  current?: string | null;
  arch?: string | null;
  signal?: AbortSignal;
}): Promise<LatestReleaseResult> {
  const raw = await apiRequest<unknown>(`/releases/latest?${query({ platform: options.platform, channel: options.channel ?? 'stable', current: options.current, arch: options.arch })}`, {
    token: null,
    cache: 'no-store',
    signal: options.signal
  });
  const body = isRecord(raw) ? raw : {};
  const latest = normalizeRelease(body.latest);
  return {
    platform: options.platform,
    channel: body.channel === 'beta' ? 'beta' : 'stable',
    current: nullableText(body.current),
    updateAvailable: latest !== null && body.update_available === true,
    forced: latest !== null && body.update_available === true && body.forced === true,
    latest
  };
}

export async function fetchReleaseHistory(options: { platform: ReleasePlatform; channel?: ReleaseChannel; limit?: number; offset?: number }): Promise<ReleasePage> {
  const raw = await apiRequest<unknown>(`/releases?${query({ platform: options.platform, channel: options.channel ?? 'stable', limit: options.limit ?? 20, offset: options.offset ?? 0 })}`, {
    token: null,
    cache: 'no-store'
  });
  const body = isRecord(raw) ? raw : {};
  const items = Array.isArray(body.items) ? body.items.map(normalizeRelease).filter((item): item is AppRelease => item !== null) : [];
  return { items, total: nullableCount(body.total) ?? items.length };
}
