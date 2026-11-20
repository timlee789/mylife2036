'use client';

import { useState } from 'react';
import { FIRST_YEAR, LAST_YEAR, addDays, dayNumber, fromDayNumber, monthOf, shortDay } from './projectWords';

/** One bar: a project on the long timeline, or a step on a project's own timeline. */
export interface Bar {
  id: string;
  title: string;
  start: string; // YYYY-MM-DD, inclusive
  end: string; // YYYY-MM-DD, inclusive
  tone: 'planned' | 'active' | 'done' | 'paused' | 'skipped';
  percent?: number | null;
  tip?: string;
}

export interface Mark {
  id: string;
  title: string;
  day: string;
  reached: boolean;
}

export interface Lane {
  key: string;
  label: string;
  color: string;
  bars: Bar[];
  marks: Mark[];
  onLabel?: () => void;
}

export type Scale = 'weeks' | 'months' | 'decade';

const SCALE_NAMES: Record<Scale, string> = { weeks: '주 단위', months: '12개월', decade: '2026–2036' };

/** Bars that overlap go on separate lines inside one lane. */
function stack(bars: Bar[]): Bar[][] {
  const lines: Bar[][] = [];
  for (const bar of [...bars].sort((a, b) => a.start.localeCompare(b.start))) {
    const line = lines.find((l) => l[l.length - 1].end < bar.start);
    if (line) line.push(bar);
    else lines.push([bar]);
  }
  return lines.length ? lines : [[]];
}

const monthStart = (day: string) => `${day.slice(0, 7)}-01`;
const nextMonth = (day: string) => monthStart(addDays(`${day.slice(0, 7)}-28`, 4));

interface Column {
  key: string;
  label: string;
  from: number; // day number, inclusive
  to: number; // day number, exclusive
  now: boolean;
}

function weekColumns(from: string, weeks: number, today: string): Column[] {
  const monday = addDays(from, -((new Date(`${from}T00:00:00Z`).getUTCDay() + 6) % 7));
  return Array.from({ length: weeks }, (_, i) => {
    const start = addDays(monday, i * 7);
    const [, m, d] = start.split('-').map(Number);
    const a = dayNumber(start);
    const t = dayNumber(today);
    return { key: start, label: `${m}/${d}`, from: a, to: a + 7, now: t >= a && t < a + 7 };
  });
}

function monthColumns(first: string, count: number, today: string): Column[] {
  const cols: Column[] = [];
  let cursor = monthStart(first);
  for (let i = 0; i < count; i++) {
    const next = nextMonth(cursor);
    const [y, m] = cursor.split('-').map(Number);
    cols.push({
      key: cursor,
      label: i === 0 || m === 1 ? `${y}.${m}월` : `${m}월`,
      from: dayNumber(cursor),
      to: dayNumber(next),
      now: today.slice(0, 7) === cursor.slice(0, 7),
    });
    cursor = next;
  }
  return cols;
}

function yearColumns(today: string): Column[] {
  return Array.from({ length: LAST_YEAR - FIRST_YEAR + 1 }, (_, i) => {
    const y = FIRST_YEAR + i;
    return { key: String(y), label: String(y), from: dayNumber(`${y}-01-01`), to: dayNumber(`${y + 1}-01-01`), now: today.startsWith(String(y)) };
  });
}

/**
 * A Gantt-style timeline. Columns are weeks, months or years; bars and marks are placed by day,
 * so the same data reads at every scale.
 */
export function Timeline({
  title,
  lanes,
  today,
  scales,
  weeksFrom,
  weeksCount = 6,
  onBar,
  legend,
}: {
  title: string;
  lanes: Lane[];
  today: string;
  scales: Scale[];
  weeksFrom?: string;
  weeksCount?: number;
  onBar?: (bar: Bar, lane: Lane) => void;
  legend: { tone: Bar['tone']; label: string }[];
}) {
  const [scale, setScale] = useState<Scale>(scales[0]);
  const defaultMonth = monthStart(addDays(monthStart(today), -1));
  const [monthFrom, setMonthFrom] = useState(defaultMonth);
  const [weekShift, setWeekShift] = useState(0);
  const weekStart = addDays(weeksFrom ?? today, weekShift * 7);

  const columns =
    scale === 'weeks' ? weekColumns(weekStart, weeksCount, today) : scale === 'months' ? monthColumns(monthFrom, 12, today) : yearColumns(today);
  const first = columns[0].from;
  const last = columns[columns.length - 1].to;
  const span = last - first;
  const pos = (day: number) => `${((day - first) / span) * 100}%`;
  const todayAt = dayNumber(today) + 0.5;
  const shiftMonths = (n: number) => {
    let d = monthFrom;
    for (let i = 0; i < Math.abs(n); i++) d = n > 0 ? nextMonth(d) : monthStart(addDays(d, -1));
    const min = `${FIRST_YEAR}-01-01`;
    const max = `${LAST_YEAR}-01-01`;
    setMonthFrom(d < min ? min : d > max ? max : d);
  };

  return (
    <section className="timeline">
      <div className="timeline-bar">
        <h3>{title}</h3>
        {scales.length > 1 && (
          <div className="segmented" role="group" aria-label="보기">
            {scales.map((s) => (
              <button key={s} aria-pressed={scale === s} onClick={() => setScale(s)}>{SCALE_NAMES[s]}</button>
            ))}
          </div>
        )}
        {scale === 'months' && (
          <div className="year-nav">
            <button aria-label="6개월 앞으로" onClick={() => shiftMonths(-6)}>‹</button>
            <strong>{monthOf(fromDayNumber(first))} – {monthOf(fromDayNumber(last - 1))}</strong>
            <button aria-label="6개월 뒤로" onClick={() => shiftMonths(6)}>›</button>
            {monthFrom !== defaultMonth && <button className="link small" onClick={() => setMonthFrom(defaultMonth)}>지금</button>}
          </div>
        )}
        {scale === 'weeks' && (
          <div className="year-nav">
            <button aria-label="2주 앞으로" onClick={() => setWeekShift(weekShift - 2)}>‹</button>
            <strong>{shortDay(fromDayNumber(first))} – {shortDay(fromDayNumber(last - 1))}</strong>
            <button aria-label="2주 뒤로" onClick={() => setWeekShift(weekShift + 2)}>›</button>
            {weekShift !== 0 && <button className="link small" onClick={() => setWeekShift(0)}>처음으로</button>}
          </div>
        )}
      </div>
      <div className="tl-scroll">
        <div className={`tl-grid ${scale}`}>
          <div className="tl-head">
            <span className="tl-label" />
            <div className="tl-track">
              {columns.map((c) => (
                <span key={c.key} className={c.now ? 'now' : ''} style={{ width: `${((c.to - c.from) / span) * 100}%` }}>{c.label}</span>
              ))}
            </div>
          </div>
          {lanes.length === 0 && <p className="hint tl-empty">아직 표시할 것이 없습니다.</p>}
          {lanes.map((lane) => {
            const marks = lane.marks.filter((m) => dayNumber(m.day) >= first && dayNumber(m.day) < last);
            return (
              <div key={lane.key} className="tl-row" style={{ ['--lane' as string]: lane.color }}>
                <span className="tl-label">
                  {lane.onLabel ? <button className="link" onClick={lane.onLabel}>{lane.label}</button> : <span className="lane-name">{lane.label}</span>}
                </span>
                <div className="tl-track">
                  <div className="tl-cells" aria-hidden>
                    {columns.map((c) => (
                      <span key={c.key} className={`tl-cell${c.now ? ' now' : ''}`} style={{ width: `${((c.to - c.from) / span) * 100}%` }} />
                    ))}
                  </div>
                  {todayAt >= first && todayAt < last && <span className="tl-today" style={{ left: pos(todayAt) }} title={`오늘 ${today}`} />}
                  <div className="tl-lines">
                    {stack(lane.bars).map((line, n) => (
                      <div key={n} className="tl-line">
                        {line.map((bar) => {
                          const s = Math.max(dayNumber(bar.start), first);
                          const e = Math.min(dayNumber(bar.end) + 1, last);
                          if (e <= s) return null;
                          return (
                            <button
                              key={bar.id}
                              className={`tl-phase ${bar.tone}`}
                              style={{ left: pos(s), width: `${((e - s) / span) * 100}%` }}
                              title={bar.tip ?? bar.title}
                              onClick={() => onBar?.(bar, lane)}
                            >
                              {bar.percent !== undefined && bar.percent !== null && bar.tone !== 'done' && (
                                <span className="tl-progress" style={{ width: `${bar.percent}%` }} aria-hidden />
                              )}
                              <span className="tl-text">{bar.title}</span>
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                  {marks.map((m) => (
                    <span key={m.id} className={`tl-mark${m.reached ? ' reached' : ''}`} style={{ left: pos(dayNumber(m.day) + 0.5) }} title={`${m.title} · ${shortDay(m.day)}`}>
                      {m.reached ? '✓' : '◆'}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <p className="legend">
        {legend.map((l) => (
          <span key={l.tone} className={`tl-key ${l.tone}`}>{l.label}</span>
        ))}
        <span>◆ 이정표 · 세로줄 오늘</span>
      </p>
    </section>
  );
}
