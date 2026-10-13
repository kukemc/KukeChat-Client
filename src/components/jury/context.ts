import { createContext, useContext } from 'react';
import type { JuryStatus } from '@/types/jury';
import type { JuryConfigState } from './data/queries';
import type { JuryIdentity } from './identity';
import type { JuryNavigation } from './route';

/** 风纪页里每个板块都要用的东西：我是谁、后端有哪些能力、现在在哪、怎么跳。由 JuryPage 提供。 */
export interface JuryContextValue {
  nav: JuryNavigation;
  /** GET /jury/me；还没拿到或失败时为 undefined */
  status: JuryStatus | undefined;
  statusError: unknown;
  refetchStatus: () => void;
  identity: JuryIdentity;
  config: JuryConfigState;
  /** 打开设置里的「处罚与申诉」 */
  openPenalties: () => void;
}

export const JuryContext = createContext<JuryContextValue | null>(null);

export function useJury(): JuryContextValue {
  const value = useContext(JuryContext);
  if (!value) {
    throw new Error('useJury 只能在 JuryPage 里面用');
  }
  return value;
}
