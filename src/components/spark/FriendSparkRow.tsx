import { cx } from '@/components/chat/desktop/runtime';
import { Icon } from '@/components/ui/Icon';
import { openSpark, useFriendSpark } from './data';
import { sparkTitle } from './SparkMark';
import { SparkGlyph } from './SparkGlyph';

/**
 * 资料卡上的一行：我和这个好友的火花（等级、天数、今天续没续），点开说明面板。
 * 不是好友、没有火花、服务端没有这个功能时什么都不画，所以资料卡里可以直接放。
 */
export function FriendSparkRow({ userId, className, onOpen }: { userId: number | null | undefined; className?: string; /** 打开之前先做的事（比如关掉资料卡浮层） */ onOpen?: () => void }): JSX.Element | null {
  const spark = useFriendSpark(userId);
  if (!spark || !userId) {
    return null;
  }
  const out = spark.status === 'out';
  const sub = out
    ? spark.can_relight ? `熄灭了，原来 ${spark.lost_days} 天 · 可以重燃` : `熄灭了，原来 ${spark.lost_days} 天`
    : `${spark.status === 'lit' ? '今天已续上' : spark.status === 'dying' ? '快熄灭了，今天聊两句就能续上' : '今天还没续火花'} · 最高 ${spark.best_days} 天`;
  return (
    <button
      type="button"
      className={cx('ksk-row', out && 'is-out', spark.status === 'dying' && 'is-dying', className)}
      title={sparkTitle(spark)}
      onClick={() => {
        onOpen?.();
        openSpark(userId);
      }}
    >
      <span className="ksk-row-glyph"><SparkGlyph level={out ? spark.lost_level_key : spark.level_key} out={out} dim={spark.status === 'dying'} size={26} /></span>
      <span className="ksk-row-main">
        <span className="ksk-row-title"><b>{out ? '火花已熄灭' : spark.level_name ?? '火花'}</b>{out ? null : <span className="ksk-row-days">{spark.days} 天</span>}</span>
        <span className="ksk-row-sub" title={sub}>{sub}</span>
      </span>
      <Icon name="chevron" className="ksk-row-arrow h-3.5 w-3.5" />
    </button>
  );
}
