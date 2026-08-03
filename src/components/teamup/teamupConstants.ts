import type { IconName } from '@/components/ui/Icon';
import type { TeamupSkill, TeamupSkillLevel } from '@/types/api';

export interface SkillMeta {
  key: TeamupSkill;
  label: string;
  icon: IconName;
  tone: string;
}

export const SKILL_META: SkillMeta[] = [
  { key: 'program', label: '程序', icon: 'code', tone: 'from-sky-500/16 to-cyan-400/8' },
  { key: 'art', label: '美术', icon: 'image', tone: 'from-pink-500/16 to-fuchsia-400/8' },
  { key: 'design', label: '策划', icon: 'sparkles', tone: 'from-amber-500/18 to-orange-400/8' },
  { key: 'music', label: '音乐音效', icon: 'volume', tone: 'from-emerald-500/16 to-lime-400/8' },
  { key: 'writing', label: '文案剧情', icon: 'quote', tone: 'from-indigo-500/16 to-blue-400/8' },
  { key: 'test', label: '测试', icon: 'shieldCheck', tone: 'from-teal-500/16 to-cyan-400/8' },
  { key: 'other', label: '其他', icon: 'star', tone: 'from-slate-500/16 to-slate-400/8' }
];

const SKILL_MAP = new Map<TeamupSkill, SkillMeta>(SKILL_META.map((item) => [item.key, item]));

export function skillMeta(skill: TeamupSkill): SkillMeta {
  return SKILL_MAP.get(skill) ?? { key: skill, label: skill, icon: 'star', tone: 'from-slate-500/16 to-slate-400/8' };
}

export function skillLabel(skill: TeamupSkill): string {
  return skillMeta(skill).label;
}

export const SKILL_LEVEL_LABEL: Record<TeamupSkillLevel, string> = {
  beginner: '入门',
  skilled: '熟练',
  expert: '精通'
};
