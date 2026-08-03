/**
 * CCW（Cocrea World）社区平台的公开地址常量。
 *
 * 这些不是本项目的部署配置，而是所对接的第三方社区平台本身的域名，
 * 因此固定写在这里而不是走环境变量 —— 就像 GitHub 客户端会写死 github.com。
 * 如果你要把 KukeChat 接到别的社区，改这一个文件即可。
 */

/** CCW 社区主站。 */
export const CCW_SITE_URL = 'https://www.ccw.site';

/** CCW 扩展仓库元数据接口，用于扩展自更新时查询最新的 assetUri。 */
const CCW_EXTENSION_REGISTRY_URL = 'https://bfs-web.ccw.site/extensions';

/** 某个 CCW 用户（学生）的主页地址。 */
export function ccwStudentProfileUrl(studentOid: string): string {
  return `${CCW_SITE_URL}/student/${studentOid}`;
}

/** 某个 CCW 作品的详情页地址，带 accessKey 时可访问未公开作品。 */
export function ccwWorkDetailUrl(oid: string, accessKey?: string | null): string {
  const suffix = accessKey ? `?accessKey=${encodeURIComponent(accessKey)}` : '';
  return `${CCW_SITE_URL}/detail/${oid}${suffix}`;
}

/** 指定扩展在 CCW 扩展仓库中的版本信息接口。 */
export function ccwExtensionInfoUrl(extensionId: string): string {
  return `${CCW_EXTENSION_REGISTRY_URL}/${extensionId}`;
}
