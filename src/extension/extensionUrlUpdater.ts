import { ccwExtensionInfoUrl } from '@/config';
import { extensionId } from './assets';
import type { ScratchRuntime } from '@/types/scratch';
import packageInfo from '../../package.json';

const EXTENSION_INFO_URL = ccwExtensionInfoUrl(extensionId);
const LOG_PREFIX = '[KukeChat]';
const TOAST_CONTAINER_ID = 'kukechat-extension-update-toasts';

let latestAssetUrl: string | null = null;
const patchedVMs = new WeakSet<object>();
let latestVersionRequest: Promise<ExtensionVersionInfo | null> | null = null;

interface ExtensionVersionInfo {
  assetUri?: unknown;
  version?: unknown;
  releasedAt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  id?: unknown;
  changelog?: unknown;
}

interface ExtensionInfoResponse {
  body?: {
    versions?: ExtensionVersionInfo[];
  };
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function numericValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function versionSortValue(version: ExtensionVersionInfo): number {
  return Math.max(
    numericValue(version.releasedAt),
    numericValue(version.createdAt),
    numericValue(version.updatedAt),
    numericValue(version.id)
  );
}

function getLatestVersionInfo(data: ExtensionInfoResponse): ExtensionVersionInfo | null {
  const versions = Array.isArray(data.body?.versions) ? data.body.versions : [];
  const sortedVersions = [...versions].sort((a, b) => versionSortValue(b) - versionSortValue(a));
  return sortedVersions.find((version) => isHttpUrl(version.assetUri)) ?? null;
}

function formatTimestamp(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '未知';
  }

  return new Date(value).toLocaleString('zh-CN');
}

function describeVersion(version: ExtensionVersionInfo): Record<string, unknown> {
  return {
    currentPackageVersion: packageInfo.version,
    latestVersion: typeof version.version === 'string' ? version.version : '未知',
    latestId: version.id ?? '未知',
    releasedAt: formatTimestamp(version.releasedAt),
    createdAt: formatTimestamp(version.createdAt),
    updatedAt: formatTimestamp(version.updatedAt),
    changelog: typeof version.changelog === 'string' ? version.changelog : '',
    assetUri: version.assetUri
  };
}

async function fetchLatestVersionInfo(): Promise<ExtensionVersionInfo | null> {
  if (latestVersionRequest) {
    console.log(`${LOG_PREFIX} 正在复用扩展更新检测请求`);
    return latestVersionRequest;
  }

  console.log(`${LOG_PREFIX} 开始检测扩展最新版本`, {
    endpoint: EXTENSION_INFO_URL,
    currentPackageVersion: packageInfo.version
  });
  latestVersionRequest = fetch(EXTENSION_INFO_URL, { credentials: 'omit' })
    .then(async (response) => {
      if (!response.ok) {
        console.warn(`${LOG_PREFIX} 扩展更新检测失败：HTTP ${response.status}`);
        return null;
      }
      const data = (await response.json()) as ExtensionInfoResponse;
      const versions = Array.isArray(data.body?.versions) ? data.body.versions : [];
      const latestVersion = getLatestVersionInfo(data);
      console.log(`${LOG_PREFIX} 扩展版本列表`, versions.map((version) => describeVersion(version)));
      if (latestVersion && isHttpUrl(latestVersion.assetUri)) {
        console.log(`${LOG_PREFIX} 已选择最新扩展版本`, describeVersion(latestVersion));
      } else {
        console.warn(`${LOG_PREFIX} 扩展更新检测未返回有效 assetUri`);
      }
      return latestVersion;
    })
    .catch((error) => {
      console.warn(`${LOG_PREFIX} 扩展更新检测请求异常`, error);
      return null;
    })
    .finally(() => {
      latestVersionRequest = null;
    });

  return latestVersionRequest;
}

function getCurrentSavedUrl(runtime: ScratchRuntime): string | null {
  return runtime.gandi?.wildExtensions?.[extensionId]?.url
    ?? runtime.extensionManager?._customExtensionInfo?.[extensionId]?.url
    ?? runtime.extensionManager?._officialExtensionInfo?.[extensionId]?.url
    ?? null;
}

type ToastKind = 'info' | 'success' | 'error';
interface ToastOptions {
  actionLabel?: string;
  action?: () => void;
  duration?: number;
}

function getToastColor(kind: ToastKind): string {
  if (kind === 'success') {
    return '#22c55e';
  }
  if (kind === 'error') {
    return '#ef4444';
  }
  return '#3b82f6';
}

function getToastIcon(kind: ToastKind): string {
  if (kind === 'success') {
    return '✓';
  }
  if (kind === 'error') {
    return '!';
  }
  return 'i';
}

function ensureToastContainer(): HTMLElement | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const existing = document.getElementById(TOAST_CONTAINER_ID);
  if (existing) {
    return existing;
  }

  const container = document.createElement('div');
  container.id = TOAST_CONTAINER_ID;
  container.style.position = 'fixed';
  container.style.top = '44px';
  container.style.left = '50%';
  container.style.transform = 'translateX(-50%)';
  container.style.zIndex = '2147483647';
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.gap = '10px';
  container.style.pointerEvents = 'none';
  document.body.appendChild(container);
  return container;
}

function showToast(message: string, kind: ToastKind = 'info', options: ToastOptions = {}): void {
  console.log(`${LOG_PREFIX} ${message}`);

  const container = ensureToastContainer();
  if (!container) {
    return;
  }

  const color = getToastColor(kind);
  const toast = document.createElement('div');
  toast.style.display = 'flex';
  toast.style.alignItems = 'center';
  toast.style.gap = '8px';
  toast.style.maxWidth = '360px';
  toast.style.padding = '9px 10px';
  toast.style.borderRadius = '8px';
  toast.style.border = '1px solid rgba(148, 163, 184, 0.22)';
  toast.style.background = 'rgba(255, 255, 255, 0.98)';
  toast.style.boxShadow = '0 10px 26px rgba(15, 23, 42, 0.18)';
  toast.style.color = '#1f2937';
  toast.style.fontSize = '13px';
  toast.style.fontWeight = '500';
  toast.style.lineHeight = '1.35';
  toast.style.opacity = '0';
  toast.style.pointerEvents = 'auto';
  toast.style.transform = 'translateY(-6px) scale(0.98)';
  toast.style.transition = 'opacity 160ms ease, transform 160ms ease';

  const icon = document.createElement('span');
  icon.textContent = getToastIcon(kind);
  icon.style.display = 'inline-flex';
  icon.style.alignItems = 'center';
  icon.style.justifyContent = 'center';
  icon.style.width = '18px';
  icon.style.height = '18px';
  icon.style.flex = '0 0 18px';
  icon.style.borderRadius = '999px';
  icon.style.background = color;
  icon.style.color = '#ffffff';
  icon.style.fontSize = '12px';
  icon.style.fontWeight = '900';

  const text = document.createElement('span');
  text.textContent = message;
  text.style.flex = '1 1 auto';

  toast.append(icon, text);

  if (options.actionLabel && options.action) {
    const actionButton = document.createElement('button');
    actionButton.type = 'button';
    actionButton.textContent = options.actionLabel;
    actionButton.style.flex = '0 0 auto';
    actionButton.style.border = '0';
    actionButton.style.borderRadius = '6px';
    actionButton.style.padding = '5px 8px';
    actionButton.style.background = color;
    actionButton.style.color = '#ffffff';
    actionButton.style.fontSize = '12px';
    actionButton.style.fontWeight = '700';
    actionButton.style.cursor = 'pointer';
    actionButton.onclick = options.action;
    toast.appendChild(actionButton);
  }

  container.appendChild(toast);

  window.setTimeout(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0) scale(1)';
  }, 0);

  window.setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-6px) scale(0.98)';
    window.setTimeout(() => {
      toast.remove();
      if (!container.childElementCount) {
        container.remove();
      }
    }, 180);
  }, options.duration ?? (kind === 'error' ? 4200 : 3200));
}

function showRefreshToast(message: string): void {
  showToast(message, 'success', {
    actionLabel: '刷新网页',
    action: () => window.location.reload(),
    duration: 8000
  });
}

function updateExtensionManagerUrl(runtime: ScratchRuntime, assetUrl: string): boolean {
  const extensionManager = runtime.extensionManager;
  let changed = false;

  const updateInfo = (info: { url?: string } | undefined): void => {
    if (info && info.url !== assetUrl) {
      info.url = assetUrl;
      changed = true;
    }
  };

  updateInfo(extensionManager?._customExtensionInfo?.[extensionId]);
  updateInfo(extensionManager?._officialExtensionInfo?.[extensionId]);

  if (typeof extensionManager?.saveWildExtensionsURL === 'function') {
    extensionManager.saveWildExtensionsURL(extensionId, assetUrl);
  }

  return changed;
}

function updateWildExtensionUrl(runtime: ScratchRuntime, assetUrl: string): boolean {
  let changed = false;
  const previousUrl = runtime.gandi?.wildExtensions?.[extensionId]?.url;

  if (previousUrl !== assetUrl) {
    changed = true;
  }

  if (typeof runtime.gandi?.addWildExtension === 'function') {
    runtime.gandi.addWildExtension({ id: extensionId, url: assetUrl });
  } else if (runtime.gandi?.wildExtensions) {
    runtime.gandi.wildExtensions[extensionId] = { id: extensionId, url: assetUrl };
  }

  return changed;
}

function applyLatestUrl(runtime: ScratchRuntime, assetUrl: string): void {
  const wildExtensionChanged = updateWildExtensionUrl(runtime, assetUrl);
  const extensionManagerChanged = updateExtensionManagerUrl(runtime, assetUrl);
  const changed = wildExtensionChanged || extensionManagerChanged;
  if (changed) {
    console.log(`${LOG_PREFIX} 已同步项目保存 URL 为最新扩展文件`, assetUrl);
    runtime.emitProjectChanged?.();
  } else {
    console.log(`${LOG_PREFIX} 项目保存 URL 已是最新`, assetUrl);
  }
}

function patchProjectSerialization(runtime: ScratchRuntime): void {
  const vm = runtime.extensionManager?.vm;
  if (!vm || patchedVMs.has(vm) || typeof vm.toJSON !== 'function') {
    return;
  }

  console.log(`${LOG_PREFIX} 已启用项目保存 URL 兜底同步`);
  patchedVMs.add(vm);
  const originalToJSON = vm.toJSON;
  vm.toJSON = function toJSON(this: typeof vm, ...args: unknown[]) {
    if (latestAssetUrl) {
      applyLatestUrl(runtime, latestAssetUrl);
    }
    const result = originalToJSON.apply(this, args);

    if (!latestAssetUrl || typeof result !== 'string') {
      return result;
    }

    try {
      const project = JSON.parse(result) as {
        gandi?: { wildExtensions?: Record<string, { id: string; url: string }> };
        extensionURLs?: Record<string, string>;
      };
      project.gandi = project.gandi ?? {};
      project.gandi.wildExtensions = project.gandi.wildExtensions ?? {};
      project.gandi.wildExtensions[extensionId] = { id: extensionId, url: latestAssetUrl };
      project.extensionURLs = project.extensionURLs ?? {};
      project.extensionURLs[extensionId] = latestAssetUrl;
      console.log(`${LOG_PREFIX} 保存项目时已写入最新扩展 URL`, latestAssetUrl);
      return JSON.stringify(project);
    } catch {
      return result;
    }
  };
}

export async function updateToLatestExtensionUrl(runtime?: ScratchRuntime): Promise<void> {
  if (!runtime || typeof fetch !== 'function') {
    console.log(`${LOG_PREFIX} 跳过扩展更新检测：runtime 或 fetch 不可用`);
    showToast('KukeChat 更新失败：当前环境不支持更新检测', 'error');
    return;
  }

  showToast('KukeChat 正在检测最新扩展版本...', 'info');
  const currentUrl = getCurrentSavedUrl(runtime);
  console.log(`${LOG_PREFIX} 当前项目保存的扩展 URL`, currentUrl ?? '未找到');
  const latestVersion = await fetchLatestVersionInfo();

  if (!latestVersion || !isHttpUrl(latestVersion.assetUri)) {
    showToast('KukeChat 更新失败：没有获取到最新扩展文件', 'error');
    return;
  }

  const assetUrl = latestVersion.assetUri;
  console.log(`${LOG_PREFIX} 准备同步最新扩展 URL`, {
    currentUrl,
    nextUrl: assetUrl,
    latestVersion: describeVersion(latestVersion)
  });

  if (currentUrl === assetUrl) {
    console.log(`${LOG_PREFIX} 当前项目扩展 URL 与最新版本一致，无需更新`);
    showToast('KukeChat 已是最新版本，无需更新', 'success');
    return;
  }

  latestAssetUrl = assetUrl;
  patchProjectSerialization(runtime);
  applyLatestUrl(runtime, assetUrl);
  showRefreshToast('KukeChat 更新成功，请保存作品并刷新网页后生效');
}
