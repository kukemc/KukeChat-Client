import { useEffect, useRef, useState, type ReactNode } from 'react';
import wordmarkLight from '@/assets/brand/wordmark-next-light.svg';
import wordmarkDark from '@/assets/brand/wordmark-next-dark.svg';
import { BlockStage, ensureSbStyles, type StageField, type StageKind, type StageVars } from '../blocks/blockStage';
import { loadScratchblocks } from '../blocks/loadScratchblocks';
import { mountOutlines } from '../blocks/outlines';
import { FallbackBlocks } from './FallbackBlocks';

/** KukeChat NEXT 字标，浅色 / 深色各一张，按主题显示其中一张。 */
export function Wordmark(): JSX.Element {
  return (
    <>
      <img className="klg-wm-light" src={wordmarkLight} alt="KukeChat NEXT" draggable={false} />
      <img className="klg-wm-dark" src={wordmarkDark} alt="KukeChat NEXT" draggable={false} />
    </>
  );
}

interface WorkspaceProps {
  kind: StageKind;
  vars: StageVars;
  /** 手机：正在填的输入框和键盘是否弹起（画板据此缩小、平移）。 */
  focus?: StageField | null;
  kb?: boolean;
  still: boolean;
  /** 每加一次，积木从帽子那一串开始「运行」一遍（提交时）。 */
  runToken?: number;
  /** 真实的在线人数之类；拿不到就是 null，报告积木不显示数值。 */
  onlineValue?: string | null;
  children?: ReactNode;
}

/**
 * 左边（手机是上面）的 Scratch 工作区：点阵底、描边积木、字标、真积木舞台。
 * 积木由 BlockStage 命令式地画在 .klg-stage 里；scratchblocks 按需加载，失败就画静态兜底。
 */
export function Workspace({ kind, vars, focus = null, kb = false, still, runToken = 0, onlineValue = null, children }: WorkspaceProps): JSX.Element {
  const wsRef = useRef<HTMLElement | null>(null);
  const olRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const engine = useRef<BlockStage | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const stillRef = useRef(still);
  stillRef.current = still;
  const varsRef = useRef(vars);
  varsRef.current = vars;
  const onlineRef = useRef(onlineValue);
  onlineRef.current = onlineValue;

  useEffect(() => {
    let alive = true;
    let unmountOutlines: (() => void) | null = null;
    const reduce = (): boolean => stillRef.current;
    loadScratchblocks().then(
      (renderer) => {
        const stage = stageRef.current;
        const ws = wsRef.current;
        const ol = olRef.current;
        if (!alive || !stage || !ws || !ol) return;
        try {
          ensureSbStyles(renderer, stage);
          engine.current = new BlockStage(stage, { kind, vars: varsRef.current, reduceMotion: reduce, onlineValue: onlineRef.current });
        } catch (error) {
          console.warn('[KukeChat] 登录页积木渲染失败，改用静态积木', error);
          stage.querySelectorAll('.sb-layer').forEach((n) => n.remove());
          setStatus('failed');
          return;
        }
        try {
          unmountOutlines = mountOutlines(ol, ws, kind, renderer, reduce);
        } catch (error) {
          console.warn('[KukeChat] 登录页背景积木渲染失败', error);
        }
        setStatus('ready');
      },
      (error: unknown) => {
        console.warn('[KukeChat] scratchblocks 加载失败，改用静态积木', error);
        if (alive) setStatus('failed');
      }
    );
    return () => {
      alive = false;
      unmountOutlines?.();
      engine.current?.destroy();
      engine.current = null;
    };
  }, [kind]);

  useEffect(() => {
    engine.current?.update(vars);
  }, [vars]);

  useEffect(() => {
    engine.current?.setFocus(focus, kb);
  }, [focus, kb, status]);

  useEffect(() => {
    engine.current?.setOnlineValue(onlineValue);
  }, [onlineValue]);

  useEffect(() => {
    if (runToken > 0) void engine.current?.runMain();
  }, [runToken]);

  return (
    <section ref={wsRef} className="klg-ws">
      <div ref={olRef} className="klg-ol" aria-hidden="true" />
      <div className="klg-brand"><Wordmark /></div>
      <div ref={stageRef} className="klg-stage" aria-hidden="true">
        {status === 'failed' ? <FallbackBlocks kind={kind} mode={vars.mode} /> : null}
      </div>
      {children}
    </section>
  );
}
