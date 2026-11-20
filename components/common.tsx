'use client';

import { useCallback, useEffect, useState } from 'react';
import { messageOf, type Milestone } from './api';
import type { Mark } from './Timeline';

export const COLORS = ['var(--green)', 'var(--blue)', 'var(--gold)', 'var(--plum)'];
export const colorOf = (sortOrder: number) => COLORS[((sortOrder % COLORS.length) + COLORS.length) % COLORS.length];

/** Where to go: the overview, a top project, or one project under it. */
export type Place = { top: string } | { sub: string } | null;
export type Go = (place: Place) => void;

export type Change = (run: () => Promise<unknown>, failText?: string) => Promise<boolean>;

/** Load a page's data, and run changes that reload it afterwards. */
export function usePage<T>(fetcher: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await fetcher());
      setProblem(null);
    } catch (failure) {
      setProblem(messageOf(failure));
    }
  }, [fetcher]);

  useEffect(() => {
    void load();
  }, [load]);

  const change: Change = async (run, failText = '저장하지 못했습니다.') => {
    try {
      await run();
      await load();
      setProblem(null);
      return true;
    } catch (failure) {
      setProblem(`${failText} ${messageOf(failure)}`);
      return false;
    }
  };

  return { data, problem, setProblem, load, change };
}

export function marksOf(milestones: Milestone[]): Mark[] {
  return milestones
    .filter((m) => m.status !== 'dropped')
    .map((m) => ({ id: m.id, title: m.title, day: m.target_on, reached: m.status === 'reached' }));
}

export function ProgressBar({ percent, color }: { percent: number | null; color?: string }) {
  if (percent === null) return <span className="hint small">단계 없음</span>;
  return (
    <span className="progress-bar" style={color ? { ['--accent' as string]: color } : undefined} aria-label={`진행 ${percent}%`}>
      <span style={{ width: `${percent}%` }} />
    </span>
  );
}
