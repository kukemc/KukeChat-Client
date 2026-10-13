import type { JuryStatus } from '@/types/jury';
import type {
  JuryAchievement, JuryBallot, JuryExamAnswer, JuryExamAttempt, JuryExamResult, JuryExamState, JuryLeaderboard, JuryLeaderboardPeriod,
  JuryPointsPage, JuryPracticeAnswer, JuryPracticeNext
} from '@/types/juryGrowth';
import { apiRequest } from './client';

/**
 * 风纪 v2 二期的接口（docs/jury-v2.md 第 2 节）：入门考试、练习场、风纪值、成就、排行榜、公开展示身份。
 * 一期的后端上都不存在 —— 调用方先看 GET /jury/config 的 capabilities（exam / practice / points / achievements / leaderboard / badge）。
 */

// ───────────────────────── 入门考试 ─────────────────────────

export async function getJuryExam(): Promise<JuryExamState> {
  return apiRequest<JuryExamState>('/jury/exam');
}

/** 已有进行中的一场时返回同一场 */
export async function startJuryExam(): Promise<JuryExamAttempt> {
  return apiRequest<JuryExamAttempt>('/jury/exam/start', { method: 'POST', body: {} });
}

/** 可以不答完就交：没出现在 answers 里的题按答错算 */
export async function submitJuryExam(attemptId: number, answers: JuryExamAnswer[]): Promise<JuryExamResult> {
  return apiRequest<JuryExamResult>(`/jury/exam/${attemptId}/submit`, { method: 'POST', body: { answers } });
}

// ───────────────────────── 练习场 ─────────────────────────

export async function getJuryPracticeNext(): Promise<JuryPracticeNext> {
  return apiRequest<JuryPracticeNext>('/jury/practice/next');
}

export async function answerJuryPractice(questionId: number, vote: JuryBallot): Promise<JuryPracticeAnswer> {
  return apiRequest<JuryPracticeAnswer>(`/jury/practice/${questionId}/answer`, { method: 'POST', body: { vote } });
}

// ───────────────────────── 风纪值、成就、排行榜 ─────────────────────────

export async function getJuryPoints(limit: number, offset: number): Promise<JuryPointsPage> {
  return apiRequest<JuryPointsPage>(`/jury/me/points?limit=${limit}&offset=${offset}`);
}

export async function getJuryAchievements(): Promise<{ items: JuryAchievement[] }> {
  return apiRequest<{ items: JuryAchievement[] }>('/jury/me/achievements');
}

export async function getJuryLeaderboard(period: JuryLeaderboardPeriod, limit = 50): Promise<JuryLeaderboard> {
  return apiRequest<JuryLeaderboard>(`/jury/leaderboard?period=${period}&limit=${limit}`);
}

// ───────────────────────── 公开展示委员身份 ─────────────────────────

export async function updateJurySettings(settings: { badge_visible: boolean }): Promise<JuryStatus> {
  return apiRequest<JuryStatus>('/jury/me/settings', { method: 'PUT', body: settings });
}
