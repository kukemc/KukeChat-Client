import { Icon } from '@/components/ui/Icon';
import type { Conversation } from '@/types/api';
import { formatChinaDateTime } from '@/utils/dateTime';
import { isGroupStaff, useGroupPlusInfo, useGroupPlusPlans } from '../data';
import { PlusTierTag } from '../PlusBadge';
import { effectiveTier, formatFileSize, formatRemaining, isPermanentPlus } from '../tier';
import { useGroupPlusUi } from '../ui';

/**
 * 群资料页里的「群升级」和「群文件」两块（桌面抽屉、移动资料页共用）。
 * 只展示档位、到期时间（用量在升级面板里），并把「升级」「打开群文件」交给全局浮层（useGroupPlusUi）。
 * 非群主 / 管理员只能看信息，不显示购买按钮。服务端没有群升级（404）时整块不出现。
 */
export function GroupPlusInfoBlock({ conversation, canManage }: { conversation: Conversation; canManage?: boolean }): JSX.Element | null {
  const plans = useGroupPlusPlans().data;
  const info = useGroupPlusInfo(conversation.type === 'group' ? conversation.id : null).data;
  const openUpgrade = useGroupPlusUi((state) => state.openUpgrade);
  const openFiles = useGroupPlusUi((state) => state.openFiles);
  if (conversation.type !== 'group' || !plans) {
    return null;
  }
  const staff = canManage ?? info?.can_purchase ?? isGroupStaff(conversation);
  const tier = effectiveTier(info?.tier ?? conversation.plus_tier ?? 'free', info?.expires_at ?? conversation.plus_expires_at ?? null);
  const expiresAt = tier === 'free' ? null : info?.expires_at ?? conversation.plus_expires_at ?? null;
  const permanent = isPermanentPlus(tier, expiresAt, info?.permanent ?? conversation.plus_permanent);
  const remain = permanent ? null : formatRemaining(expiresAt);
  const files = info?.files;
  const fileLine = !files ? '' : files.state === 'locked'
    ? '升级到 Pro 解锁群文件'
    : files.state === 'grace'
      ? `宽限期内只读${files.grace_until ? `，${formatChinaDateTime(files.grace_until)} 前可下载` : ''}`
      : files.quota_bytes > 0
        ? `已用 ${formatFileSize(files.used_bytes)} / ${formatFileSize(files.quota_bytes)}`
        : '可传 24 小时临时文件';
  // 永久档位不能再买：能管理的人点进去也只是看权益和用量
  const canOpen = staff && (plans.enabled || permanent);
  // 一行写完：还剩多久 + 哪天到期（用量在升级面板里看）
  const status = tier === 'free'
    ? '免费版 · 升级可容纳更多成员'
    : permanent
      ? '永久 · 不会到期'
      : `${remain ? `还剩 ${remain} · ` : ''}${formatChinaDateTime(expiresAt).split(' ')[0]} 到期`;
  // 和侧栏里其他区块一样是一张卡片里的两行：群升级、群文件。能买的人点第一行打开升级面板
  return (
    <section className="kui-group kgp-info" data-plus="info">
      <button type="button" className="kui-row kgp-info-row" data-action="open-upgrade" disabled={!canOpen} onClick={() => openUpgrade({ conversationId: conversation.id })}>
        <Icon name="sparkles" className="h-4 w-4" />
        <span className="kui-row-label">
          <span className="kgp-name-row kgp-info-title">群升级<PlusTierTag tier={tier} /></span>
          <span className="kui-row-hint">{status}</span>
        </span>
        {canOpen && !permanent ? <span className="kgp-info-cta">{tier === 'free' ? '升级' : '续期'}</span> : null}
        {canOpen ? <Icon name="chevron" className="kgp-info-chev h-4 w-4" /> : null}
      </button>
      <button type="button" className="kui-row kgp-info-row" data-action="open-files" onClick={() => openFiles(conversation.id)}>
        <Icon name="folder" className="h-4 w-4" />
        <span className="kui-row-label">
          <span className="kgp-info-title">群文件</span>
          <span className="kui-row-hint">{fileLine || 'Pro 起解锁'}</span>
        </span>
        <Icon name="chevron" className="kgp-info-chev h-4 w-4" />
      </button>
    </section>
  );
}
