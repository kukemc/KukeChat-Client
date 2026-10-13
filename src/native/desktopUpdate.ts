import { create } from 'zustand';
import { API_BASE_URL } from '@/config';
import { isTauriDesktopApp } from '@/utils/appMode';
import packageJson from '../../package.json';

/**
 * Desktop self-update state machine. The Rust side (src-tauri/src/updater.rs) does the network and
 * file work; this store decides when to check, when to show the dialog, and remembers user choices.
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

function readPrefs(): { autoCheck: boolean; skippedVersion: string | null } {
  try {
    const raw = JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? '{}') as { autoCheck?: unknown; skippedVersion?: unknown };
    return { autoCheck: raw.autoCheck !== false, skippedVersion: typeof raw.skippedVersion === 'string' ? raw.skippedVersion : null };
  } catch {
    return { autoCheck: true, skippedVersion: null };
  }
}

function writePrefs(prefs: { autoCheck: boolean; skippedVersion: string | null }): void {
  try { window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* storage unavailable */ }
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

const prefs = typeof window !== 'undefined' ? readPrefs() : { autoCheck: true, skippedVersion: null };

export const useDesktopUpdate = create<DesktopUpdateState>(() => ({
  phase: 'idle',
  currentVersion: packageJson.version,
  latestVersion: null,
  installerUrl: null,
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

export function isDesktopUpdateSupported(): boolean {
  return isTauriDesktopApp() && !import.meta.env.DEV;
}

/** Manual checks always open the dialog with the result; automatic checks only open it for an unskipped new version. */
export async function checkForDesktopUpdate({ manual = false } = {}): Promise<void> {
  const busy = get().phase;
  if (!isDesktopUpdateSupported() || busy === 'checking' || busy === 'downloading' || busy === 'installing') return;
  if (busy === 'ready') { if (manual) set({ dialogOpen: true }); return; }
  set({ phase: 'checking', error: null, message: null, ...(manual ? { dialogOpen: true } : {}) });
  try {
    const result = await invoke<UpdateCheck>('desktop_update_check', { metadataUrl: DESKTOP_UPDATE_METADATA_URL });
    const skipped = !manual && result.available && result.latest_version === get().skippedVersion;
    set({
      phase: result.available ? 'available' : 'upToDate',
      currentVersion: result.current_version,
      latestVersion: result.latest_version,
      installerUrl: result.installer_url,
      message: result.message,
      lastCheckedAt: Date.now(),
      dialogOpen: manual || (result.available && !skipped)
    });
  } catch (error) {
    set({ phase: 'error', error: errorText(error), lastCheckedAt: Date.now(), dialogOpen: manual });
  }
}

export async function downloadDesktopUpdate(): Promise<void> {
  const { installerUrl, latestVersion, phase } = get();
  if (!installerUrl || !latestVersion || phase === 'downloading') return;
  set({ phase: 'downloading', downloaded: 0, total: null, error: null });
  const { listen } = await import('@tauri-apps/api/event');
  const unlisten = await listen<{ downloaded: number; total: number | null }>('kukechat-update-progress', (event) => {
    set({ downloaded: event.payload.downloaded, total: event.payload.total });
  });
  try {
    const path = await invoke<string>('desktop_update_download', { url: installerUrl, version: latestVersion });
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
    await invoke('desktop_update_install', { path: installerPath });
  } catch (error) {
    set({ phase: 'error', error: errorText(error), installerPath: null });
  }
}

export function setDesktopUpdateDialogOpen(open: boolean): void {
  set({ dialogOpen: open });
}

export function skipDesktopUpdateVersion(): void {
  const version = get().latestVersion;
  set({ skippedVersion: version, dialogOpen: false });
  writePrefs({ autoCheck: get().autoCheck, skippedVersion: version });
}

export function setDesktopUpdateAutoCheck(autoCheck: boolean): void {
  set({ autoCheck });
  writePrefs({ autoCheck, skippedVersion: get().skippedVersion });
  if (autoCheck) void checkForDesktopUpdate();
}

export function dismissJustUpdated(): void {
  set({ justUpdatedTo: null });
}

/** Starts background checks: shortly after launch, then every few hours while auto-check is on. */
export function startDesktopUpdateSchedule(): () => void {
  if (!isDesktopUpdateSupported()) return () => undefined;
  const tick = (): void => { if (get().autoCheck) void checkForDesktopUpdate(); };
  const first = window.setTimeout(tick, AUTO_CHECK_DELAY_MS);
  const interval = window.setInterval(tick, AUTO_CHECK_INTERVAL_MS);
  return () => { window.clearTimeout(first); window.clearInterval(interval); };
}
