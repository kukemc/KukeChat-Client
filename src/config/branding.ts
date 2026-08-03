/**
 * 应用身份与署名信息。
 *
 * Fork 本项目做二次开发时，改这一个文件就能完成整体换名与换署名；
 * 注意 MIT 协议要求保留 LICENSE 中的原始版权声明。
 */

import { ccwStudentProfileUrl, ccwWorkDetailUrl } from './ccw';

/** 应用展示名称。 */
export const APP_NAME = 'KukeChat';

/**
 * Scratch/CCW 扩展的唯一 ID。
 *
 * 它会被写进作品文件（`gandi.wildExtensions`），改动后旧作品将无法识别
 * 已加载的扩展，除非同时重新加载扩展文件。
 */
export const EXTENSION_ID = 'kukechat';

/** KukeChat 在 CCW 社区的作品 oid，用于「介绍页 / 组队分享」等外链。 */
const CCW_WORK_OID = '66d52d2366bfcb0e0b42e7c8';

/** 项目在 CCW 社区的介绍页。 */
export const CCW_SUPPORT_URL = ccwWorkDetailUrl(CCW_WORK_OID);

/** 组队帖分享出去时附带的落地页。 */
export const TEAMUP_SHARE_URL = CCW_SUPPORT_URL;

/** 赞助入口，置为 null 即可隐藏「支持开发者」按钮。 */
export const SPONSOR_URL: string | null = 'https://afdian.com/a/kukemc';

/** 关于页展示的开发者名单。 */
export const APP_DEVELOPERS = [
  { name: 'kukemc', profileUrl: ccwStudentProfileUrl('610b508176415b2f27e0f851') },
  { name: '白猫', profileUrl: ccwStudentProfileUrl('6173f57f48cf8f4796fc860e') }
] as const;
