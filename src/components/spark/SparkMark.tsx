import type { KeyboardEvent, MouseEvent } from 'react';
import { cx } from '@/components/chat/desktop/runtime';
import type { Spark } from '@/types/spark';
import { openSpark } from './data';
import { SparkGlyph } from './SparkGlyph';

/** 鼠标停在火花上时的说明。 */
export function sparkTitle(spark: Spark): string {
  if (spark.status === 'out') {
    return spark.can_relight ? `火花熄灭了（原来 ${spark.lost_days} 天），可以重燃` : '火花熄灭了';
  }
  const head = `${spark.level_name ?? '火花'} · 连续 ${spark.days} 天`;
  if (spark.status === 'lit') {
    return `${head}，今天已经续上`;
  }
  if (spark.status === 'dying') {
    return `${head}，火花快熄灭了，今天聊两句就能续上`;
  }
  return `${head}，今天还没续火花`;
}

/**
 * 名字旁的火花：图标 + 天数。spark 没有可画的（null）就什么都不画，所以私聊行、聊天标题旁可以直接放。
 *
 * hint：今天还没续 / 快熄灭时，天数后面再带一个很轻的提示字（聊天标题旁用，会话列表里不放，太挤）。
 * openable：点一下打开说明面板。放在本身就是按钮的行里（会话列表的一项）时不要开，免得一点两个动作。
 */
export function SparkMark({ spark, friendId, size = 14, openable = false, hint = false, className }: { spark: Spark | null | undefined; friendId: number | null | undefined; size?: number; openable?: boolean; hint?: boolean; className?: string }): JSX.Element | null {
  if (!spark || !friendId) {
    return null;
  }
  const out = spark.status === 'out';
  const dim = spark.status === 'dying';
  const title = sparkTitle(spark);
  const hintText = !hint ? null : out ? (spark.can_relight ? '可重燃' : null) : spark.status === 'dying' ? '快熄灭了' : spark.status === 'pending' ? '今天还没续' : null;
  const body = (
    <>
      <SparkGlyph level={out ? spark.lost_level_key : spark.level_key} out={out} dim={dim} size={size} />
      {out ? null : <b className="ksk-days">{spark.days}</b>}
      {hintText ? <span className="ksk-hint">{hintText}</span> : null}
    </>
  );
  const classes = cx('ksk-mark', out && 'is-out', dim && 'is-dying', spark.status === 'lit' && 'is-lit', className);
  if (!openable) {
    return <span className={classes} title={title} data-spark-level={spark.level_key ?? 'out'}>{body}</span>;
  }
  const open = (event: MouseEvent | KeyboardEvent): void => {
    event.stopPropagation();
    event.preventDefault();
    openSpark(friendId);
  };
  return (
    <span
      role="button"
      tabIndex={0}
      className={cx(classes, 'is-openable')}
      title={`${title} · 点开看看`}
      data-spark-level={spark.level_key ?? 'out'}
      onClick={open}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          open(event);
        }
      }}
    >
      {body}
    </span>
  );
}
