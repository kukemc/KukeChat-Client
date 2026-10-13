import { readPreference, writePreference } from '@/components/chat/desktop/runtime';
import type { JuryBallot, JuryExamAnswer } from '@/types/juryGrowth';

/**
 * 考试的作答草稿。服务端不保存草稿（一次性交卷），所以选了什么按 attempt_id 存在本机：
 * 中途离开、刷新、切到别的板块再回来，题目从 GET /jury/exam 的 active 恢复，答案从这里恢复。
 * 存的只有「第几题选了哪一项」，不含题目内容；交卷或这一场过期后清掉。
 */
const KEY = 'kukechat:jury-exam-draft';
const BALLOTS: JuryBallot[] = ['none', 'l1', 'l2', 'l3'];

export type ExamDraft = Record<number, JuryBallot>;

// 本地存储不可用（宿主页面禁用）时，至少在这次会话里记住
let memory: { attemptId: number; answers: ExamDraft } | null = null;

export function readExamDraft(attemptId: number): ExamDraft {
  if (memory?.attemptId === attemptId) {
    return memory.answers;
  }
  try {
    const stored = JSON.parse(readPreference(KEY) ?? 'null') as { attempt_id?: unknown; answers?: unknown } | null;
    if (!stored || stored.attempt_id !== attemptId || typeof stored.answers !== 'object' || stored.answers === null) {
      return {};
    }
    const answers: ExamDraft = {};
    for (const [question, vote] of Object.entries(stored.answers as Record<string, unknown>)) {
      if (Number.isInteger(Number(question)) && BALLOTS.includes(vote as JuryBallot)) {
        answers[Number(question)] = vote as JuryBallot;
      }
    }
    return answers;
  } catch {
    return {};
  }
}

export function writeExamDraft(attemptId: number, answers: ExamDraft): void {
  memory = { attemptId, answers };
  writePreference(KEY, JSON.stringify({ attempt_id: attemptId, answers }));
}

export function clearExamDraft(): void {
  memory = null;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // 存储不可用时本来就没存进去
  }
}

export function draftToAnswers(answers: ExamDraft): JuryExamAnswer[] {
  return Object.entries(answers).map(([question, vote]) => ({ question: Number(question), vote })).sort((left, right) => left.question - right.question);
}
