import { useState } from 'react';
import { cx } from '@/components/chat/desktop/runtime';
import { RedPacketLayer } from '@/components/redpacket/RedPacketLayer';
import { CoinIcon } from '@/components/ui/CoinIcon';
import { Icon } from '@/components/ui/Icon';
import { toast } from '@/components/ui/toast';
import type { Spark, SparkDetail } from '@/types/spark';
import { parseApiDate } from '@/utils/dateTime';
import { sparkErrorText, useRelightSpark, useSparkDetail, useSparkUi } from './data';
import { SparkGlyph } from './SparkGlyph';

/** 说明面板的唯一入口：主界面上挂一个，谁要看就 openSpark(好友 id)。 */
export function SparkHost(): JSX.Element | null {
  const friendId = useSparkUi((state) => state.friendId);
  const close = useSparkUi((state) => state.close);
  if (friendId === null) {
    return null;
  }
  return <SparkDialog key={friendId} friendId={friendId} onClose={close} />;
}

function shortTime(value: string | null): string {
  const date = parseApiDate(value);
  if (!date) {
    return '';
  }
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 今天的状态那一句。 */
function todayLine(spark: Spark): { text: string; tone: 'ok' | 'wait' | 'warn' | 'out' } {
  switch (spark.status) {
    case 'lit':
      return { text: '今天已经续上了，明天也记得来聊聊', tone: 'ok' };
    case 'pending':
      return { text: spark.i_spoke_today ? '今天还没续火花：你已经说过话了，等 TA 回一句就续上' : spark.friend_spoke_today ? '今天还没续火花：TA 已经说过话了，回一句就续上' : '今天还没续火花，你们各发一条消息就续上', tone: 'wait' };
    case 'dying':
      return { text: '昨天没续上，火花快熄灭了。今天你们都聊两句，还能接着数', tone: 'warn' };
    case 'out':
      return { text: spark.lost_days > 0 ? `火花熄灭了，原来连续 ${spark.lost_days} 天` : '火花熄灭了', tone: 'out' };
    default:
      return { text: '同一天里你们都发一条消息，就能点燃火花', tone: 'wait' };
  }
}

function relightNote(spark: Spark): string | null {
  if (spark.can_relight) {
    return `${shortTime(spark.relight_deadline)} 前，任何一方都可以花 ${spark.relight_cost} 金币重燃，恢复 ${spark.lost_days} 天`;
  }
  if (spark.lost_days > 0 && spark.relight_block === 'cooldown') {
    return `30 天内已经重燃过一次，${shortTime(spark.relight_cooldown_until)} 之后才能再重燃`;
  }
  if (spark.lost_days > 0 && spark.relight_block === 'expired') {
    return '熄灭太久了，已经不能重燃';
  }
  return null;
}

/**
 * 火花说明面板：当前等级、天数、历史最高、下一级还差几天、今天续没续、各级一览和规则；熄灭后可以在这里重燃（先确认花多少金币）。
 * 外壳借红包的弹层（RedPacketLayer：桌面居中、移动端从底下升起），内容的样式在 spark.css（ksk-）。
 */
export function SparkDialog({ friendId, onClose }: { friendId: number; onClose: () => void }): JSX.Element {
  const query = useSparkDetail(friendId);
  const detail = query.data;
  const relight = useRelightSpark(friendId, detail?.conversation_id ?? null);
  const [confirming, setConfirming] = useState(false);

  return (
    <RedPacketLayer label="火花" onClose={onClose} locked={relight.isPending} className="ksk-layer">
      <section className="krp-panel ksk-panel">
        <header className="krp-panel-head">
          <h2>{confirming ? '重燃火花' : '我们的火花'}</h2>
          <button type="button" className="kui-icon-btn" aria-label="关闭" onClick={onClose} disabled={relight.isPending}><Icon name="close" className="h-4 w-4" /></button>
        </header>
        {query.isLoading ? <div className="krp-panel-body"><p className="ksk-quiet" role="status">加载中…</p></div>
          : !detail ? (
            <div className="krp-panel-body">
              <p className="kui-note kui-note--danger" role="alert">没有加载出来：{sparkErrorText(query.error)}</p>
              <button type="button" className="kui-btn kui-btn--sm" onClick={() => void query.refetch()}>重试</button>
            </div>
          ) : confirming ? (
            <Confirm
              spark={detail.spark}
              pending={relight.isPending}
              onCancel={() => setConfirming(false)}
              onConfirm={() => relight.mutate(undefined, {
                onSuccess: (result) => {
                  setConfirming(false);
                  toast.success(`火花重燃了，连续 ${result.spark.days} 天`);
                },
                onError: (error) => toast.error(sparkErrorText(error))
              })}
            />
          ) : (
            <div className="krp-panel-body ksk-body kui-scroll">
              <Overview detail={detail} onRelight={() => setConfirming(true)} />
            </div>
          )}
      </section>
    </RedPacketLayer>
  );
}

function Overview({ detail, onRelight }: { detail: SparkDetail; onRelight: () => void }): JSX.Element {
  const { spark, rules } = detail;
  const out = spark.status === 'out';
  const today = todayLine(spark);
  const note = relightNote(spark);
  const current = rules.levels.find((level) => level.level === spark.level) ?? null;
  const upcoming = rules.levels.find((level) => level.level === spark.next_level) ?? null;
  const span = current && upcoming ? upcoming.min_days - current.min_days : 0;
  const progress = span > 0 ? Math.min(1, (spark.days - (current?.min_days ?? 0)) / span) : spark.days > 0 ? 1 : 0;
  return (
    <>
      <div className={cx('ksk-hero', out && 'is-out', spark.status === 'dying' && 'is-dying')} data-spark-level={spark.level_key ?? 'none'}>
        <span className="ksk-hero-glyph"><SparkGlyph level={out ? spark.lost_level_key : spark.level_key} out={out || spark.days === 0} dim={spark.status === 'dying'} size={56} /></span>
        <div className="ksk-hero-main">
          <p className="ksk-hero-level">{out ? '已熄灭' : spark.level_name ?? '还没有火花'}</p>
          <p className="ksk-hero-days"><b>{out ? spark.lost_days : spark.days}</b><span>{out ? '天（熄灭前）' : '天'}</span></p>
        </div>
      </div>
      <p className={cx('ksk-today', `is-${today.tone}`)}>{today.text}</p>
      {!out && spark.days > 0 ? (
        <div className="ksk-progress">
          <div className="ksk-bar" role="progressbar" aria-label="离下一级" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}><i style={{ width: `${Math.round(progress * 100)}%` }} /></div>
          <span>{spark.days_to_next !== null && spark.next_level_name ? `再续 ${spark.days_to_next} 天升到「${spark.next_level_name}」` : '已经是最高等级'}</span>
        </div>
      ) : null}
      <dl className="ksk-stats">
        <div><dt>当前连续</dt><dd>{spark.days} 天</dd></div>
        <div><dt>历史最高</dt><dd>{spark.best_days} 天</dd></div>
        <div><dt>今天</dt><dd>{spark.today_lit ? '已续上' : out ? '—' : '还没续'}</dd></div>
      </dl>
      {note ? (
        <div className="ksk-relight">
          <p>{note}</p>
          {spark.can_relight ? <button type="button" className="ksk-btn" onClick={onRelight}><CoinIcon size={14} />花 {spark.relight_cost} 金币重燃</button> : null}
        </div>
      ) : null}
      <h3 className="ksk-section">等级</h3>
      <ol className="ksk-levels">
        {rules.levels.map((level) => (
          <li key={level.key} className={cx(level.level === spark.level && !out && 'is-current', level.min_days <= spark.best_days && 'is-reached')}>
            <SparkGlyph level={level.key} size={20} />
            <b>{level.name}</b>
            <span>{level.min_days} 天</span>
          </li>
        ))}
      </ol>
      <h3 className="ksk-section">规则</h3>
      <ul className="ksk-rules">
        {rules.rules.map((rule) => <li key={rule}>{rule}</li>)}
      </ul>
    </>
  );
}

function Confirm({ spark, pending, onCancel, onConfirm }: { spark: Spark; pending: boolean; onCancel: () => void; onConfirm: () => void }): JSX.Element {
  return (
    <>
      <div className="krp-panel-body ksk-body ksk-confirm">
        <span className="ksk-hero-glyph"><SparkGlyph level={spark.lost_level_key} size={48} /></span>
        <p className="ksk-confirm-main">花 <b>{spark.relight_cost}</b> 金币，把火花恢复到 <b>{spark.lost_days}</b> 天</p>
        <p className="ksk-quiet">金币从你的余额里扣，不退。重燃之后双方都能看到；每对好友 30 天内只能重燃一次。</p>
      </div>
      <footer className="krp-panel-foot ksk-foot">
        <button type="button" className="kui-btn kui-btn--ghost" onClick={onCancel} disabled={pending}>再想想</button>
        <button type="button" className="ksk-btn" onClick={onConfirm} disabled={pending}><CoinIcon size={14} />{pending ? '正在重燃…' : `确认花 ${spark.relight_cost} 金币`}</button>
      </footer>
    </>
  );
}
