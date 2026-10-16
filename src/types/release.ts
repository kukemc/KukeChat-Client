/** 发版服务（KukeChat-Server/docs/releases.md）对外接口的形状。 */

export type ReleasePlatform = 'android' | 'windows' | 'macos' | 'linux';
export type ReleaseChannel = 'stable' | 'beta';

export interface ReleaseArtifact {
  id: number;
  source: 'upload' | 'external';
  fileName: string;
  url: string;
  /** 字节数；外部链接可能没填 */
  size: number | null;
  /** 64 位小写十六进制；外部链接可能没填 */
  sha256: string | null;
  arch: string | null;
}

export interface AppRelease {
  id: number;
  platform: ReleasePlatform;
  channel: ReleaseChannel;
  version: string;
  build: number;
  changelog: string;
  minSupportedVersion: string | null;
  publishedAt: string | null;
  artifacts: ReleaseArtifact[];
  /** 按 arch 挑出来的那个安装包 */
  artifact: ReleaseArtifact | null;
}

export interface LatestReleaseResult {
  platform: ReleasePlatform;
  channel: ReleaseChannel;
  current: string | null;
  updateAvailable: boolean;
  forced: boolean;
  latest: AppRelease | null;
}

export interface ReleasePage {
  items: AppRelease[];
  total: number;
}
