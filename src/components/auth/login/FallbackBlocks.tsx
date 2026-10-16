import { blockPath } from '../blocks/motion';
import type { StageKind, StageMode } from '../blocks/blockStage';

/**
 * scratchblocks 没加载出来（离线、出错）时的兜底：几块静态的 Scratch 3 配色积木，不能拖，也不跟着表单变。
 * 宽度按字数粗估（中文 16px、其它 8.5px），只求看着像，不求和真积木一样准。
 */

interface Part {
  text: string;
  slot?: boolean;
}

interface Row {
  parts: Part[];
  fill: string;
  stroke: string;
  hat?: boolean;
}

const width = (s: string): number => [...s].reduce((sum, ch) => sum + (/[　-鿿＀-￯]/.test(ch) ? 16 : 8.5), 0);

const ROWS: Record<StageMode, Row[]> = {
  login: [
    { parts: [{ text: '当 ⚑ 被点击' }], fill: '#ffbf00', stroke: '#cc9900', hat: true },
    { parts: [{ text: '说' }, { text: '你好，Scratcher!', slot: true }], fill: '#9966ff', stroke: '#774dcb' },
    { parts: [{ text: '将' }, { text: '密码', slot: true }, { text: '设为' }, { text: '•••', slot: true }], fill: '#ff8c1a', stroke: '#db6e00' }
  ],
  reg: [
    { parts: [{ text: '当 ⚑ 被点击' }], fill: '#ffbf00', stroke: '#cc9900', hat: true },
    { parts: [{ text: '说' }, { text: '欢迎加入，Scratcher!', slot: true }], fill: '#9966ff', stroke: '#774dcb' },
    { parts: [{ text: '创建' }, { text: '新的 KukeChat', slot: true }, { text: '账号' }], fill: '#ff6680', stroke: '#ff3355' }
  ]
};

const BODY = 48;
const HAT = 16;

export function FallbackBlocks({ kind, mode }: { kind: StageKind; mode: StageMode }): JSX.Element {
  const rows = ROWS[mode];
  const left = kind === 'desk' ? 40 : 26;
  const top = kind === 'desk' ? 150 : 10;
  let y = 0;
  const shapes = rows.map((row, i) => {
    let x = 8;
    const items = row.parts.map((part, j) => {
      const w = width(part.text);
      const item = part.slot
        ? (
          <g key={j} transform={`translate(${x} ${(BODY - 32) / 2 + (row.hat ? HAT : 0)})`}>
            <rect className="fb-slot" width={w + 22} height={32} rx={16} />
            <text className="fb-slot-text" x={11} y={21}>{part.text}</text>
          </g>
        )
        : <text key={j} x={x} y={(row.hat ? HAT : 0) + 29}>{part.text}</text>;
      x += (part.slot ? w + 22 : w) + 8;
      return item;
    });
    const w = Math.max(row.hat ? 112 : 64, x);
    const g = (
      <g key={i} transform={`translate(0 ${y})`}>
        <path d={blockPath(w, BODY, row.hat)} fill={row.fill} stroke={row.stroke} strokeWidth={1} />
        {items}
      </g>
    );
    y += (row.hat ? HAT : 0) + BODY;
    return g;
  });
  return (
    <svg className="klg-fallback" style={{ left, top }} width={420} height={y + 12} aria-hidden="true">
      {shapes}
    </svg>
  );
}
