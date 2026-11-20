'use client';

import { useCallback, useState } from 'react';
import { projectApi, type Step, type StepStatus, type SubDetail, type SubStatus } from './api';
import { colorOf, marksOf, ProgressBar, usePage, type Change, type Go } from './common';
import { FIRST_YEAR, LAST_YEAR, STEP_NAMES, SUB_NAMES, addDays, dateRange, dayNumber, lengthOf, obsidianLink, shortDay } from './projectWords';
import { Timeline, type Bar, type Lane } from './Timeline';

const TONE: Record<StepStatus, Bar['tone']> = { todo: 'planned', doing: 'active', done: 'done', skipped: 'skipped' };

/** One project under a top project: its steps, its own timeline and its progress. */
export function SubProject({ id, go }: { id: string; go: Go }) {
  const fetcher = useCallback(() => projectApi.sub(id), [id]);
  const { data: sub, problem, change } = usePage<SubDetail>(fetcher);
  const [open, setOpen] = useState<string | null>(null);

  if (!sub) {
    return (
      <main className="page wide projects">
        <button className="link" onClick={() => go(null)}>‹ 전체 흐름</button>
        {problem && <p className="notice" role="alert">{problem}</p>}
      </main>
    );
  }

  const color = colorOf(sub.top.sort_order);
  const lanes: Lane[] = sub.steps.map((s, i) => ({
    key: s.id,
    label: `${i + 1}. ${s.title}`,
    color,
    bars: [{ id: s.id, title: '', start: s.start_on, end: s.end_on, tone: TONE[s.status], tip: `${s.title} · ${dateRange(s.start_on, s.end_on)} · ${STEP_NAMES[s.status]}` }],
    marks: i === 0 ? marksOf(sub.milestones) : [],
  }));
  // The project's own timeline starts a few days before it and spans at least six weeks.
  const weeks = Math.max(6, Math.ceil((dayNumber(sub.end_on) - dayNumber(sub.start_on) + 10) / 7));
  const late = sub.status !== 'done' && sub.end_on > sub.due_on;

  return (
    <main className="page wide projects">
      <nav className="crumbs">
        <button className="link" onClick={() => go(null)}>전체 흐름</button> ›{' '}
        <button className="link" onClick={() => go({ top: sub.top.id })}>{sub.top.title}</button>
      </nav>
      <div className="page-title">
        <h2>{sub.title}</h2>
        <label className="status-pick">
          <span className="visually-hidden">상태</span>
          <select value={sub.status} onChange={(e) => void change(() => projectApi.updateSub(id, { status: e.target.value as SubStatus }))}>
            {(Object.keys(SUB_NAMES) as SubStatus[]).map((s) => (
              <option key={s} value={s}>{SUB_NAMES[s]}</option>
            ))}
          </select>
        </label>
      </div>
      {problem && <p className="notice" role="alert">{problem}</p>}

      <Summary sub={sub} change={change} color={color} late={late} />
      {sub.steps.length > 0 && (
        <Timeline
          title="이 프로젝트의 타임라인"
          lanes={lanes}
          today={sub.today}
          scales={['weeks']}
          weeksFrom={addDays(sub.start_on, -3)}
          weeksCount={weeks}
          onBar={(bar) => setOpen(bar.id)}
          legend={[
            { tone: 'active', label: '진행 중' },
            { tone: 'planned', label: '할 일' },
            { tone: 'done', label: '완료' },
            { tone: 'skipped', label: '건너뜀' },
          ]}
        />
      )}
      <Steps sub={sub} change={change} open={open} setOpen={setOpen} />
      <Danger sub={sub} change={change} go={go} />
    </main>
  );
}

function Summary({ sub, change, color, late }: { sub: SubDetail; change: Change; color: string; late: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ title: sub.title, start_on: sub.start_on, due_on: sub.due_on, vault_note: sub.vault_note ?? '' });

  async function save() {
    const ok = await change(() =>
      projectApi.updateSub(sub.id, { ...draft, vault_note: draft.vault_note.trim() ? draft.vault_note : null }),
    );
    if (ok) setEditing(false);
  }

  if (editing) {
    return (
      <section className="row panel">
        <label className="field">
          <span>이름</span>
          <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
        </label>
        <div className="phase-dates">
          <label className="field">
            <span>시작일</span>
            <input type="date" min={`${FIRST_YEAR}-01-01`} max={`${LAST_YEAR}-12-31`} value={draft.start_on} onChange={(e) => setDraft({ ...draft, start_on: e.target.value })} />
          </label>
          <label className="field">
            <span>목표일</span>
            <input type="date" min={draft.start_on} max={`${LAST_YEAR}-12-31`} value={draft.due_on} onChange={(e) => setDraft({ ...draft, due_on: e.target.value })} />
          </label>
        </div>
        <label className="field">
          <span>Obsidian 노트 (선택, vault 안 경로 · 예: 10_Projects/1_규영의_인문학_여행/03_작품/EP001_…)</span>
          <input value={draft.vault_note} onChange={(e) => setDraft({ ...draft, vault_note: e.target.value })} />
        </label>
        <div className="buttons">
          <button className="primary" disabled={!draft.title.trim() || !draft.start_on || !draft.due_on} onClick={() => void save()}>저장</button>
          <button className="secondary" onClick={() => setEditing(false)}>취소</button>
        </div>
      </section>
    );
  }

  return (
    <section className="row summary">
      <div className="summary-progress">
        <ProgressBar percent={sub.percent} color={color} />
        <strong>{sub.percent === null ? '단계 없음' : `${sub.percent}%`}</strong>
        <span className="meta">{sub.steps_total ? `${sub.steps_done}/${sub.steps_total}단계 완료` : ''}</span>
      </div>
      <dl className="facts">
        <div><dt>지금 단계</dt><dd>{sub.status === 'done' ? '모두 마침' : (sub.current_step?.title ?? '—')}</dd></div>
        <div><dt>기간</dt><dd>{dateRange(sub.start_on, sub.due_on)} ({lengthOf(sub.start_on, sub.due_on)})</dd></div>
        <div>
          <dt>{sub.status === 'done' ? '마친 날' : '끝 예정'}</dt>
          <dd>
            {sub.status === 'done' && sub.done_on ? shortDay(sub.done_on) : shortDay(sub.end_on)}
            {late && <span className="hint"> · 단계 일정이 목표일보다 늦습니다. 목표일을 옮기거나 단계를 줄여도 됩니다.</span>}
          </dd>
        </div>
      </dl>
      <div className="actions">
        <button className="link" onClick={() => { setDraft({ title: sub.title, start_on: sub.start_on, due_on: sub.due_on, vault_note: sub.vault_note ?? '' }); setEditing(true); }}>이름·기간 고치기</button>
        {sub.vault_note && <a className="link" href={obsidianLink(sub.vault_note)}>자료는 Obsidian에서</a>}
      </div>
    </section>
  );
}

function Steps({ sub, change, open, setOpen }: { sub: SubDetail; change: Change; open: string | null; setOpen: (id: string | null) => void }) {
  const [title, setTitle] = useState('');

  async function add() {
    if (await change(() => projectApi.addStep(sub.id, { title }))) setTitle('');
  }

  return (
    <section>
      <h3>진행 단계</h3>
      {sub.steps.length === 0 && (
        <div className="row panel">
          <p className="hint">아직 단계가 없습니다.</p>
          <button className="secondary" onClick={() => void change(() => projectApi.applyProcedure(sub.id), '절차를 넣지 못했습니다.')}>
            Top 프로젝트의 진행 절차 넣기
          </button>
        </div>
      )}
      <ol className="steps">
        {sub.steps.map((step, i) => (
          <StepRow key={step.id} step={step} index={i} last={i === sub.steps.length - 1} change={change} open={open === step.id} setOpen={(v) => setOpen(v ? step.id : null)} />
        ))}
      </ol>
      <form className="add-item" onSubmit={(e) => { e.preventDefault(); if (title.trim()) void add(); }}>
        <input aria-label="새 단계" placeholder="단계 추가 (맨 뒤에 붙습니다)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <button className="secondary" disabled={!title.trim()}>추가</button>
      </form>
    </section>
  );
}

const STEP_ORDER: StepStatus[] = ['todo', 'doing', 'done', 'skipped'];

function StepRow({ step, index, last, change, open, setOpen }: {
  step: Step;
  index: number;
  last: boolean;
  change: Change;
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const [draft, setDraft] = useState({ title: step.title, start_on: step.start_on, end_on: step.end_on, note: step.note ?? '', shift: true });

  function toggle() {
    if (!open) setDraft({ title: step.title, start_on: step.start_on, end_on: step.end_on, note: step.note ?? '', shift: true });
    setOpen(!open);
  }

  async function save() {
    const ok = await change(() =>
      projectApi.updateStep(step.id, {
        title: draft.title,
        start_on: draft.start_on,
        end_on: draft.end_on,
        note: draft.note.trim() ? draft.note : null,
        shift_following: draft.shift,
      }),
    );
    if (ok) setOpen(false);
  }

  async function remove() {
    if (!window.confirm(`「${step.title}」 단계를 뺄까요? 백업에는 남습니다.`)) return;
    await change(() => projectApi.deleteStep(step.id), '빼지 못했습니다.');
  }

  return (
    <li className={`row step ${step.status}`} id={`step-${step.id}`}>
      <div className="step-head">
        <span className="num">{index + 1}</span>
        <button className="item-title" aria-expanded={open} onClick={toggle}>{step.title}</button>
        <span className="meta">{dateRange(step.start_on, step.end_on)} · {lengthOf(step.start_on, step.end_on)}{step.done_on ? ` · ${shortDay(step.done_on)} 완료` : ''}</span>
      </div>
      {step.note && !open && <p className="meta step-note">{step.note}</p>}
      <div className="statuses" role="group" aria-label={`${step.title} 상태`}>
        {STEP_ORDER.map((s) => (
          <button key={s} className={`status ${s}`} aria-pressed={step.status === s} onClick={() => void change(() => projectApi.updateStep(step.id, { status: s }))}>
            {STEP_NAMES[s]}
          </button>
        ))}
      </div>
      {open && (
        <div className="details">
          <label className="field">
            <span>단계 이름</span>
            <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          </label>
          <div className="phase-dates">
            <label className="field">
              <span>시작</span>
              <input type="date" value={draft.start_on} onChange={(e) => setDraft({ ...draft, start_on: e.target.value, end_on: draft.end_on < e.target.value ? e.target.value : draft.end_on })} />
            </label>
            <label className="field">
              <span>끝</span>
              <input type="date" min={draft.start_on} value={draft.end_on} onChange={(e) => setDraft({ ...draft, end_on: e.target.value })} />
            </label>
          </div>
          {!last && (
            <label className="check">
              <input type="checkbox" checked={draft.shift} onChange={(e) => setDraft({ ...draft, shift: e.target.checked })} />
              <span>끝 날짜를 옮기면 뒤의 단계도 같은 날수만큼 옮기기 (완료한 단계는 그대로)</span>
            </label>
          )}
          <label className="field">
            <span>진행 메모 (한 줄, 선택 · 예: 녹음 다시 필요)</span>
            <input value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
          </label>
          <div className="buttons">
            <button className="primary" disabled={!draft.title.trim() || !draft.start_on || !draft.end_on} onClick={() => void save()}>저장</button>
            <button className="secondary" onClick={() => setOpen(false)}>닫기</button>
            <button className="secondary small" aria-label="위로" disabled={index === 0} onClick={() => void change(() => projectApi.moveStep(step.id, -1))}>↑</button>
            <button className="secondary small" aria-label="아래로" disabled={last} onClick={() => void change(() => projectApi.moveStep(step.id, 1))}>↓</button>
            <button className="link danger small" onClick={() => void remove()}>단계 빼기</button>
          </div>
        </div>
      )}
    </li>
  );
}

function Danger({ sub, change, go }: { sub: SubDetail; change: Change; go: Go }) {
  async function remove() {
    if (!window.confirm(`「${sub.title}」 프로젝트를 지울까요? 화면에서 사라지고 백업에는 남습니다.`)) return;
    if (await change(() => projectApi.deleteSub(sub.id), '지우지 못했습니다.')) go({ top: sub.top.id });
  }
  return (
    <p className="danger-zone">
      <button className="link danger small" onClick={() => void remove()}>이 프로젝트 지우기</button>
    </p>
  );
}
