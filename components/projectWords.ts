import type { MilestoneStatus, ProjectKind, ProjectStatus, Stage } from './api';

// The board's words. lib/projects.ts writes the same stage names into the work log.
export const STAGE_NAMES: Record<ProjectKind, Record<Stage, string>> = {
  youtube: { idea: '아이디어', prep: '대본', make: '제작', finish: '편집·검토', done: '업로드 완료', hold: '보류' },
  store: { idea: '아이디어', prep: '기획', make: '제작', finish: '검토', done: '게시 완료', hold: '보류' },
  life: { idea: '아이디어', prep: '준비', make: '진행', finish: '마무리', done: '완료', hold: '보류' },
  other: { idea: '아이디어', prep: '준비', make: '제작', finish: '마무리', done: '완료', hold: '보류' },
};

export const FLOW: Stage[] = ['idea', 'prep', 'make', 'finish'];

export const KIND_NAMES: Record<ProjectKind, string> = {
  youtube: 'YouTube',
  store: '매장 SNS',
  life: '삶 기획',
  other: '기타',
};

export const STATUS_NAMES: Record<ProjectStatus, string> = {
  active: '진행 중',
  resting: '쉬는 중',
  completed: '마침',
  archived: '보관',
};

export const MILESTONE_NAMES: Record<MilestoneStatus, string> = {
  planned: '가는 중',
  reached: '달성',
  dropped: '내려놓음',
};

// Obsidian opens a note from this address when the vault is registered in the Obsidian app.
export const VAULT_NAME = 'AIFilmStudio';

export function obsidianLink(note: string): string {
  return `obsidian://open?vault=${encodeURIComponent(VAULT_NAME)}&file=${encodeURIComponent(note)}`;
}

export const PLAN_END = '2036-11-09';

export function shortDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const thisYear = new Date().getFullYear();
  return y === thisYear ? `${m}월 ${d}일` : `${y}년 ${m}월 ${d}일`;
}

export function monthOf(day: string): string {
  const [y, m] = day.split('-').map(Number);
  return `${y}년 ${m}월`;
}

/** "9년 11개월": time left until the plan's last day, counted in whole months. */
export function timeLeft(today: string): string {
  const [ty, tm, td] = today.split('-').map(Number);
  const [ey, em, ed] = PLAN_END.split('-').map(Number);
  let months = (ey - ty) * 12 + (em - tm) - (ed < td ? 1 : 0);
  if (months <= 0) return '마지막 달';
  const years = Math.floor(months / 12);
  months %= 12;
  return [years ? `${years}년` : '', months ? `${months}개월` : ''].filter(Boolean).join(' ');
}
