import { create } from 'zustand';
import { fetchLatestRelease } from '@/api/releases';
import { API_BASE_URL } from '@/config';
import type { ReleaseChannel } from '@/types/release';
import { toast } from '@/components/ui/toast';
import { isTauriDesktopApp } from '@/utils/appMode';
import { isMacPlatform } from '@/utils/platform';
import packageJson from '../../package.json';

/**
 * Desktop self-update state machine. The Rust side (src-tauri/src/updater.rs) does the download / install
 * work; this store decides when to check, when to show the dialog, and remembers user choices.
 *
 * 检查更新先问发版服务（GET /releases/latest，KukeChat-Server/docs/releases.md），拿到更新日志、强制更新、
 * 大小和 sha256；接口不可用（旧后端 404、网络问题）或还没有任何发布时，退回 Rust 的 desktop_update_check
 * （读 /desktop-update.json，后台「下载配置」手填的地址仍然有效）。
 *
 * idle → checking → (upToDate | available | error)
 * available → downloading → (ready | error | available on cancel)
 * ready → installing (app exits; the installer relaunches the new version)
 */
export type UpdatePhase = 'idle' | 'checking' | 'upToDate' | 'available' | 'downloading' | 'ready' | 'installing' | 'error';

interface UpdateCheck {
  current_version: string;
  latest_version: string | null;
  available: boolean;
  installer_url: string | null;
  message: string;
}

interface DesktopUpdateState {
  phase: UpdatePhase;
  currentVersion: string;
  latestVersion: string | null;
  installerUrl: string | null;
  /** 发版服务给的文件名，Rust 靠它（没有就看地址）分辨 exe / dmg / .app.tar.gz */
  installerFileName: string | null;
  /** 以下几项只有发版服务给得出；走旧的元数据时为空 */
  changelog: string | null;
  publishedAt: string | null;
  installerSize: number | null;
  installerSha256: string | null;
  /** 当前版本低于最新版本的 min_supported_version：对话框关不掉，挡住整个应用 */
  forced: boolean;
  channel: ReleaseChannel;
  message: string | null;
  error: string | null;
  downloaded: number;
  total: number | null;
  installerPath: string | null;
  lastCheckedAt: number | null;
  dialogOpen: boolean;
  autoCheck: boolean;
  skippedVersion: string | null;
  /** Set on the first launch after an update, for the "已更新到 vX" notice. */
  justUpdatedTo: string | null;
}

const PREFS_KEY = 'kukechat-desktop-update';
const PENDING_KEY = 'kukechat-desktop-updating-to';
const AUTO_CHECK_DELAY_MS = 8_000;
const AUTO_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
export const DESKTOP_UPDATE_METADATA_URL = import.meta.env.VITE_DESKTOP_UPDATE_URL?.trim() || `${API_BASE_URL}/desktop-update.json`;

interface Prefs { autoCheck: boolean; skippedVersion: string | null; channel: ReleaseChannel }

const DEFAULT_PREFS: Prefs = { autoCheck: true, skippedVersion: null, channel: 'stable' };

function readPrefs(): Prefs {
  try {
    const raw = JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? '{}') as { autoCheck?: unknown; skippedVersion?: unknown; channel?: unknown };
    return {
      autoCheck: raw.autoCheck !== false,
      skippedVersion: typeof raw.skippedVersion === 'string' ? raw.skippedVersion : null,
      channel: raw.channel === 'beta' ? 'beta' : 'stable'
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function consumeJustUpdated(current: string): string | null {
  try {
    const pending = window.localStorage.getItem(PENDING_KEY);
    if (!pending) return null;
    window.localStorage.removeItem(PENDING_KEY);
    return pending === current ? current : null;
  } catch {
    return null;
  }
}

function errorText(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  return '未知错误';
}

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke: tauriInvoke } = await import('@tauri-apps/api/core');
  return tauriInvoke<T>(command, args);
}

const prefs = typeof window !== 'undefined' ? readPrefs() : DEFAULT_PREFS;

export const useDesktopUpdate = create<DesktopUpdateState>(() => ({
  phase: 'idle',
  currentVersion: packageJson.version,
  latestVersion: null,
  installerUrl: null,
  installerFileName: null,
  changelog: null,
  publishedAt: null,
  installerSize: null,
  installerSha256: null,
  forced: false,
  channel: prefs.channel,
  message: null,
  error: null,
  downloaded: 0,
  total: null,
  installerPath: null,
  lastCheckedAt: null,
  dialogOpen: false,
  autoCheck: prefs.autoCheck,
  skippedVersion: prefs.skippedVersion,
  justUpdatedTo: typeof window !== 'undefined' ? consumeJustUpdated(packageJson.version) : null
}));

const set = useDesktopUpdate.setState;
const get = useDesktopUpdate.getState;

function writePrefs(): void {
  const { autoCheck, skippedVersion, channel } = get();
  try { window.localStorage.setItem(PREFS_KEY, JSON.stringify({ autoCheck, skippedVersion, channel })); } catch { /* storage unavailable */ }
}

export function isDesktopUpdateSupported(): boolean {
  return isTauriDesktopApp() && !import.meta.env.DEV;
}

type CheckFields = Pick<
  DesktopUpdateState,
  'currentVersion' | 'latestVersion' | 'installerUrl' | 'installerFileName' | 'message' | 'changelog' | 'publishedAt' | 'installerSize' | 'installerSha256' | 'forced'
>;
type CheckResult = CheckFields & { available: boolean };

/**
 * 向发版服务报的平台和架构。macOS 是通用包（Apple Silicon + Intel 一个包）：更新器要的是 arch=universal 的
 * `.app.tar.gz`，网页下载用的 dmg 不填 arch（见 KukeChat-Server/docs/releases.md 的 artifact 挑选规则）。
 */
const RELEASE_TARGET = isMacPlatform() ? { platform: 'macos', arch: 'universal' } as const : { platform: 'windows', arch: 'x64' } as const;

/** 发版服务。返回 null 表示「这台服务器没有发版服务的数据」，交给旧的元数据检查。 */
async function checkReleaseService(): Promise<CheckResult | null> {
  const current = packageJson.version;
  let result;
  try {
    result = await fetchLatestRelease({ ...RELEASE_TARGET, channel: get().channel, current });
  } catch {
    // 旧后端没有这个接口（404）、网络或证明头问题：都退回旧路径，旧路径也失败才报错
    return null;
  }
  const latest = result.latest;
  if (!latest) return null;
  const artifact = latest.artifact;
  const available = result.updateAvailable && artifact !== null;
  return {
    currentVersion: current,
    latestVersion: latest.version,
    installerUrl: artifact?.url ?? null,
    installerFileName: artifact?.fileName ?? null,
    installerSize: artifact?.size ?? null,
    installerSha256: artifact?.sha256 ?? null,
    changelog: latest.changelog.trim() || null,
    publishedAt: latest.publishedAt,
    forced: available && result.forced,
    available,
    message: available ? '发现新版本' : result.updateAvailable ? '服务器暂未提供安装包' : '已是最新版本'
  };
}

async function checkLegacyMetadata(): Promise<CheckResult> {
  // 旧的 /desktop-update.json 只有 Windows 安装包，macOS 不能走这条路
  if (isMacPlatform()) {
    return {
      currentVersion: packageJson.version, latestVersion: null, installerUrl: null, installerFileName: null, installerSize: null, installerSha256: null,
      changelog: null, publishedAt: null, forced: false, available: false, message: '服务器暂未发布 Mac 版本'
    };
  }
  const result = await invoke<UpdateCheck>('desktop_update_check', { metadataUrl: DESKTOP_UPDATE_METADATA_URL });
  return {
    currentVersion: result.current_version,
    latestVersion: result.latest_version,
    installerUrl: result.installer_url,
    installerFileName: null,
    installerSize: null,
    installerSha256: null,
    changelog: null,
    publishedAt: null,
    forced: false,
    available: result.available,
    message: result.message
  };
}

/**
 * Manual checks always open the dialog with the result; automatic checks only open it for an unskipped new
 * version while auto-check is on. A forced update always opens it and can't be skipped or dismissed.
 */
export async function checkForDesktopUpdate({ manual = false } = {}): Promise<void> {
  const busy = get().phase;
  if (!isDesktopUpdateSupported() || busy === 'checking' || busy === 'downloading' || busy === 'installing') return;
  if (busy === 'ready') { if (manual || get().forced) set({ dialogOpen: true }); return; }
  set({ phase: 'checking', error: null, message: null, ...(manual ? { dialogOpen: true } : {}) });
  try {
    const { available, ...fields } = (await checkReleaseService()) ?? (await checkLegacyMetadata());
    const skipped = !manual && !fields.forced && available && fields.latestVersion === get().skippedVersion;
    set({
      ...fields,
      phase: available ? 'available' : 'upToDate',
      lastCheckedAt: Date.now(),
      dialogOpen: manual || fields.forced || (available && !skipped && get().autoCheck)
    });
  } catch (error) {
    set({ phase: 'error', error: errorText(error), lastCheckedAt: Date.now(), dialogOpen: manual || get().forced });
  }
}

export async function downloadDesktopUpdate(): Promise<void> {
  const { installerUrl, installerFileName, latestVersion, phase, installerSha256, installerSize } = get();
  if (!installerUrl || !latestVersion || phase === 'downloading') return;
  set({ phase: 'downloading', downloaded: 0, total: installerSize, error: null });
  const { listen } = await import('@tauri-apps/api/event');
  const unlisten = await listen<{ downloaded: number; total: number | null }>('kukechat-update-progress', (event) => {
    set({ downloaded: event.payload.downloaded, total: event.payload.total ?? installerSize });
  });
  try {
    // sha256 / expectedSize 由 Rust 在落盘前校验，不一致时报「安装包校验失败，请重新下载」
    const path = await invoke<string>('desktop_update_download', {
      url: installerUrl, version: latestVersion, sha256: installerSha256, expectedSize: installerSize, fileName: installerFileName
    });
    set({ phase: 'ready', installerPath: path, dialogOpen: true });
  } catch (error) {
    const message = errorText(error);
    set(message === '已取消下载' ? { phase: 'available', downloaded: 0, total: null } : { phase: 'error', error: message });
  } finally {
    unlisten();
  }
}

export function cancelDesktopUpdateDownload(): void {
  void invoke('desktop_update_cancel').catch(() => undefined);
}

export async function installDesktopUpdate(): Promise<void> {
  const { installerPath, latestVersion } = get();
  if (!installerPath) return;
  set({ phase: 'installing', error: null });
  try {
    if (latestVersion) window.localStorage.setItem(PENDING_KEY, latestVersion);
  } catch { /* the "updated" notice is optional */ }
  try {
    // Rust 返回 "manual"：macOS 上没法自动替换（比如没装进「应用程序」、没有写权限），已经在 Finder 里打开了新版本
    const mode = await invoke<string | null>('desktop_update_install', { path: installerPath });
    if (mode === 'manual') {
      try { window.localStorage.removeItem(PENDING_KEY); } catch { /* ignore */ }
      set({ phase: 'ready', dialogOpen: false });
      toast.info('已在访达中打开新版本：把 KukeChat 拖进「应用程序」替换旧版本，然后重新打开。', { id: 'desktop.update-manual', duration: 12000 });
    }
  } catch (error) {
    set({ phase: 'error', error: errorText(error), installerPath: null });
  }
}

export function setDesktopUpdateDialogOpen(open: boolean): void {
  // 强制更新期间对话框关不掉
  if (!open && get().forced) return;
  set({ dialogOpen: open });
}

export function skipDesktopUpdateVersion(): void {
  if (get().forced) return;
  set({ skippedVersion: get().latestVersion, dialogOpen: false });
  writePrefs();
}

export function setDesktopUpdateAutoCheck(autoCheck: boolean): void {
  set({ autoCheck });
  writePrefs();
  if (autoCheck) void checkForDesktopUpdate();
}

/** 接收测试版：beta 渠道检查时 stable 和 beta 一起比，谁新给谁 */
export function setDesktopUpdateChannel(channel: ReleaseChannel): void {
  if (get().channel === channel) return;
  set({ channel });
  writePrefs();
  const phase = get().phase;
  if (phase !== 'downloading' && phase !== 'ready' && phase !== 'installing') void checkForDesktopUpdate();
}

export function dismissJustUpdated(): void {
  set({ justUpdatedTo: null });
}

/**
 * Starts background checks: shortly after launch (always — a forced update must be found even with auto-check
 * off; without auto-check the dialog only opens for forced ones), then every few hours while auto-check is on.
 */
export function startDesktopUpdateSchedule(): () => void {
  if (!isDesktopUpdateSupported()) return () => undefined;
  const tick = (): void => { if (get().autoCheck) void checkForDesktopUpdate(); };
  const first = window.setTimeout(() => void checkForDesktopUpdate(), AUTO_CHECK_DELAY_MS);
  const interval = window.setInterval(tick, AUTO_CHECK_INTERVAL_MS);
  return () => { window.clearTimeout(first); window.clearInterval(interval); };
}
