import { registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import { fetchLatestRelease } from '@/api/releases';
import { MOBILE_UPDATE_METADATA_URL } from '@/config';
import { isNativeMobileApp } from '@/utils/appMode';

/**
 * Current mobile (Android) app version. This is the source of truth compared
 * against the server's `mobile_version`. Bump it together with the packaged
 * APK's versionName in `android/app/build.gradle` (and the server metadata)
 * whenever a new mobile release ships.
 */
export const MOBILE_APP_VERSION = '1.3.1';

export interface MobileUpdateInfo {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  downloadUrl: string | null;
  /** 以下几项只有发版服务给得出；走旧的元数据时为空 / false */
  changelog: string | null;
  publishedAt: string | null;
  size: number | null;
  sha256: string | null;
  /** 当前版本低于 min_supported_version：弹窗关不掉 */
  forced: boolean;
}

export interface DownloadProgress {
  downloaded: number;
  total: number;
  progress: number;
}

interface KukeUpdaterPlugin {
  getCurrentVersion(): Promise<{ versionName: string; versionCode: number }>;
  downloadApk(options: { url: string; sha256?: string | null }): Promise<{ path: string }>;
  installApk(options: { path: string }): Promise<void>;
  addListener(
    eventName: 'downloadProgress',
    listenerFunc: (progress: DownloadProgress) => void
  ): Promise<PluginListenerHandle> & PluginListenerHandle;
}

const KukeUpdater = registerPlugin<KukeUpdaterPlugin>('KukeUpdater');

function normalizeVersion(value: string | null | undefined): string {
  return (value ?? '').trim().replace(/^v/i, '');
}

/**
 * Semver-ish comparison. Returns 1 if `a` > `b`, -1 if `a` < `b`, 0 if equal.
 * Non-numeric / missing segments are treated as 0.
 */
export function compareVersions(a: string, b: string): number {
  const pa = normalizeVersion(a).split('.').map((part) => Number.parseInt(part, 10) || 0);
  const pb = normalizeVersion(b).split('.').map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(pa.length, pb.length);
  for (let index = 0; index < length; index += 1) {
    const left = pa[index] ?? 0;
    const right = pb[index] ?? 0;
    if (left > right) {
      return 1;
    }
    if (left < right) {
      return -1;
    }
  }
  return 0;
}

interface UpdateMetadata {
  mobile_version?: string;
  android_url?: string;
  version?: string;
  url?: string;
}

/**
 * 先问发版服务（GET /releases/latest?platform=android，KukeChat-Server/docs/releases.md），拿更新日志、强制更新、
 * 大小和 sha256。接口不可用（旧后端 404、网络）或还没有任何 android 发布时，退回旧的元数据。
 */
export async function checkMobileUpdate(): Promise<MobileUpdateInfo> {
  try {
    const result = await fetchLatestRelease({ platform: 'android', current: MOBILE_APP_VERSION });
    const latest = result.latest;
    if (latest) {
      const artifact = latest.artifact;
      const hasUpdate = result.updateAvailable && artifact !== null;
      return {
        hasUpdate,
        currentVersion: MOBILE_APP_VERSION,
        latestVersion: latest.version,
        downloadUrl: artifact?.url ?? null,
        changelog: latest.changelog.trim() || null,
        publishedAt: latest.publishedAt,
        size: artifact?.size ?? null,
        sha256: artifact?.sha256 ?? null,
        forced: hasUpdate && result.forced
      };
    }
  } catch {
    /* 退回旧的元数据 */
  }
  return checkLegacyMobileUpdate();
}

/**
 * Fetch the legacy release metadata and decide whether a newer mobile build exists.
 * The metadata is served from the API host root (not under /api/v1).
 */
async function checkLegacyMobileUpdate(): Promise<MobileUpdateInfo> {
  const response = await fetch(MOBILE_UPDATE_METADATA_URL, {
    method: 'GET',
    cache: 'no-store'
  });
  if (!response.ok) {
    throw new Error(`更新检查失败：HTTP ${response.status}`);
  }
  const metadata = (await response.json()) as UpdateMetadata;
  const latestVersion = normalizeVersion(metadata.mobile_version ?? metadata.version);
  const downloadUrl = metadata.android_url ?? null;
  const hasUpdate = Boolean(latestVersion) && compareVersions(latestVersion, MOBILE_APP_VERSION) > 0 && Boolean(downloadUrl);
  return {
    hasUpdate,
    currentVersion: MOBILE_APP_VERSION,
    latestVersion: latestVersion || MOBILE_APP_VERSION,
    downloadUrl,
    changelog: null,
    publishedAt: null,
    size: null,
    sha256: null,
    forced: false
  };
}

export async function onDownloadProgress(listener: (progress: DownloadProgress) => void): Promise<PluginListenerHandle> {
  return KukeUpdater.addListener('downloadProgress', listener);
}

/**
 * Download the APK to app cache. Resolves with the local file path. With a sha256 the native plugin verifies the
 * file and rejects with code CHECKSUM_MISMATCH (older APKs ignore the option and skip the check).
 */
export async function downloadUpdateApk(url: string, sha256?: string | null): Promise<string> {
  const result = await KukeUpdater.downloadApk({ url, sha256: sha256 ?? null });
  return result.path;
}

/**
 * Request the system package installer for the downloaded APK. Throws with
 * code `PERMISSION_REQUIRED` when the user must first grant "install unknown
 * apps" (the settings screen is opened automatically in that case).
 */
export async function installUpdateApk(path: string): Promise<void> {
  await KukeUpdater.installApk({ path });
}

export function isMobileUpdateSupported(): boolean {
  return isNativeMobileApp();
}
