'use client';

import { useCallback, useState } from 'react';
import { projectApi, type Milestone, type ProcedureStep, type ProjectDetail, type ProjectFields, type ProjectStatus, type Sub, type SubStatus } from './api';
import { colorOf, marksOf, ProgressBar, usePage, type Change, type Go } from './common';
import { FIRST_YEAR, LAST_YEAR, MILESTONE_NAMES, STATUS_NAMES, SUB_NAMES, addDays, dateRange, obsidianLink, shortDay } from './projectWords';
import { Timeline, type Lane } from './Timeline';

/** A top project: what it is, its standard procedure, the projects under it on one timeline, its milestones. */
export function TopProject({ id, go }: { id: string; go: Go }) {
  const fetcher = useCallback(() => projectApi.detail(id), [id]);
  const { data: project, problem, change } = usePage<ProjectDetail>(fetcher);

  if (!project) {
    return (
      <main className="page wide projects">
        <button className="link" onClick={() => go(null)}>‹ 전체 흐름</button>
        {problem && <p className="notice" role="alert">{problem}</p>}
      </main>
    );
  }

  const color = colorOf(project.sort_order);
  const lanes: Lane[] = project.subprojects
    .map((s) => ({
      key: s.id,
      label: s.title,
      color,
      bars: [{ id: s.id, title: s.current_step && s.status === 'active' ? `지금: ${s.current_step.title}` : SUB_NAMES[s.status], start: s.start_on, end: s.end_on, tone: s.status, percent: s.percent, tip: `${s.title} · ${dateRange(s.start_on, s.end_on)}` }],
      marks: [],
      onLabel: () => go({ sub: s.id }),
    }));
  if (lanes.length) lanes[0].marks = marksOf(project.milestones);

  return (
    <main className="page wide projects">
      <button className="link" onClick={() => go(null)}>‹ 전체 흐름</button>
      <div className="page-title">
        <h2><span className="crumb">Top 프로젝트</span> {project.title}</h2>
        <label className="status-pick">
          <span className="visually-hidden">상태</span>
          <select value={project.status} onChange={(e) => void change(() => projectApi.update(id, { status: e.target.value as ProjectStatus }))}>
            {(Object.keys(STATUS_NAMES) as ProjectStatus[]).map((s) => (
              <option key={s} value={s}>{STATUS_NAMES[s]}</option>
            ))}
          </select>
        </label>
      </div>
      {problem && <p className="notice" role="alert">{problem}</p>}

      <About project={project} change={change} />
      <SubList project={project} go={go} change={change} color={color} />
      <Timeline
        title="프로젝트 타임라인"
        lanes={lanes}
        today={project.today}
        scales={['months', 'decade']}
        onBar={(bar) => go({ sub: bar.id })}
        legend={[
          { tone: 'active', label: '진행 중' },
          { tone: 'planned', label: '예정' },
          { tone: 'done', label: '마침' },
          { tone: 'paused', label: '쉬는 중' },
        ]}
      />
      <Procedure project={project} change={change} />
      <Milestones project={project} change={change} />
    </main>
  );
}

const GROUPS: { status: SubStatus; label: string }[] = [
  { status: 'active', label: '진행 중' },
  { status: 'planned', label: '예정' },
  { status: 'paused', label: '쉬는 중' },
  { status: 'done', label: '마침' },
];

function SubList({ project, go, change, color }: { project: ProjectDetail; go: Go; change: Change; color: string }) {
  const [adding, setAdding] = useState(false);
  const [showDone, setShowDone] = useState(false);
  return (
    <section>
      <div className="section-head">
        <h3>프로젝트</h3>
        <button className="primary small-btn" onClick={() => setAdding(!adding)}>{adding ? '닫기' : '+ 새 프로젝트'}</button>
      </div>
      {adding && <NewSub project={project} change={change} go={go} />}
      {project.subprojects.length === 0 && !adding && (
        <p className="hint">예: 「죽음의 수용소에서」처럼 이 Top 프로젝트 아래에서 진행할 프로젝트를 만드세요. 진행 절차의 단계가 자동으로 들어갑니다.</p>
      )}
      {GROUPS.map(({ status, label }) => {
        const subs = project.subprojects.filter((s) => s.status === status);
        if (!subs.length) return null;
        const shown = status === 'done' && !showDone ? subs.slice(-5) : subs;
        return (
          <div key={status} className="sub-group">
            <h4>{label} <span className="meta">{subs.length}</span></h4>
            <ul className="sub-list">
              {shown.map((s) => <SubRow key={s.id} sub={s} go={go} color={color} />)}
            </ul>
            {status === 'done' && subs.length > 5 && (
              <button className="link small" onClick={() => setShowDone(!showDone)}>{showDone ? '줄이기' : `모두 보기 (${subs.length})`}</button>
            )}
          </div>
        );
      })}
    </section>
  );
}

function SubRow({ sub, go, color }: { sub: Sub; go: Go; color: string }) {
  return (
    <li className="row sub-row">
      <button className="item-title" onClick={() => go({ sub: sub.id })}>{sub.title}</button>
      <ProgressBar percent={sub.percent} color={color} />
      <span className="meta">
        {sub.steps_total ? `${sub.steps_done}/${sub.steps_total}단계` : ''}
        {sub.current_step && sub.status !== 'done' ? ` · 지금: ${sub.current_step.title}` : ''}
      </span>
      <span className="meta">{sub.status === 'done' && sub.done_on ? `${shortDay(sub.done_on)} 마침` : `${dateRange(sub.start_on, sub.due_on)}`}</span>
    </li>
  );
}

function NewSub({ project, change, go }: { project: ProjectDetail; change: Change; go: Go }) {
  const [title, setTitle] = useState('');
  const [start, setStart] = useState(project.today);
  const [useProcedure, setUseProcedure] = useState(project.procedure.length > 0);
  const days = project.procedure.reduce((n, p) => n + p.days, 0);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    let made = '';
    const ok = await change(async () => {
      made = (await projectApi.addSub(project.id, { title, start_on: start, use_procedure: useProcedure })).id;
    }, '만들지 못했습니다.');
    setBusy(false);
    if (ok) go({ sub: made });
  }

  return (
    <div className="row panel">
      <label className="field">
        <span>프로젝트 이름</span>
        <input autoFocus placeholder="예: 죽음의 수용소에서" value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="field narrow">
        <span>시작일</span>
        <input type="date" min={`${FIRST_YEAR}-01-01`} max={`${LAST_YEAR}-12-31`} value={start} onChange={(e) => setStart(e.target.value)} />
      </label>
      {project.procedure.length > 0 ? (
        <label className="check">
          <input type="checkbox" checked={useProcedure} onChange={(e) => setUseProcedure(e.target.checked)} />
          <span>진행 절차 {project.procedure.length}단계를 넣고 일정 잡기 (끝 예정: {shortDay(addDays(start, days - 1))})</span>
        </label>
      ) : (
        <p className="hint">아직 진행 절차가 없어 빈 프로젝트로 만듭니다. 아래 '진행 절차'를 먼저 정하면 단계가 자동으로 들어갑니다.</p>
      )}
      <div className="buttons">
        <button className="primary" disabled={busy || !title.trim() || !start} onClick={() => void save()}>만들고 열기</button>
      </div>
    </div>
  );
}

/** The top project's standard procedure: the ordered steps every new project gets. */
function Procedure({ project, change }: { project: ProjectDetail; change: Change }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ProcedureStep[]>([]);
  const total = project.procedure.reduce((n, p) => n + p.days, 0);

  function edit() {
    setDraft(project.procedure.length ? project.procedure.map(({ title, days }) => ({ title, days })) : [{ title: '', days: 3 }]);
    setEditing(true);
  }
  function set(i: number, step: ProcedureStep) {
    setDraft(draft.map((d, n) => (n === i ? step : d)));
  }
  function move(i: number, by: number) {
    const next = [...draft];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    setDraft(next);
  }
  async function save() {
    const steps = draft.filter((d) => d.title.trim());
    if (await change(() => projectApi.setProcedure(project.id, steps))) setEditing(false);
  }

  return (
    <section>
      <div className="section-head">
        <h3>진행 절차</h3>
        {!editing && <button className="link" onClick={edit}>{project.procedure.length ? '고치기' : '정하기'}</button>}
      </div>
      <p className="hint">새 프로젝트를 만들 때 이 순서와 기간으로 단계가 들어갑니다. 고쳐도 이미 만든 프로젝트는 바뀌지 않습니다.</p>
      {!editing ? (
        project.procedure.length ? (
          <ol className="procedure">
            {project.procedure.map((p) => (
              <li key={p.id ?? p.title}><span>{p.title}</span><span className="meta">{p.days}일</span></li>
            ))}
            <li className="total"><span>합계</span><span className="meta">{total}일</span></li>
          </ol>
        ) : (
          <p className="hint">아직 정한 절차가 없습니다.</p>
        )
      ) : (
        <div className="row panel">
          <ol className="procedure-edit">
            {draft.map((d, i) => (
              <li key={i}>
                <span className="meta num">{i + 1}</span>
                <input aria-label={`${i + 1}단계 이름`} value={d.title} placeholder="단계 이름" onChange={(e) => set(i, { ...d, title: e.target.value })} />
                <input aria-label={`${i + 1}단계 기간(일)`} className="days" type="number" min={1} max={365} value={d.days}
                  onChange={(e) => set(i, { ...d, days: Math.max(1, Number(e.target.value) || 1) })} />
                <span className="meta">일</span>
                <button className="secondary small" aria-label="위로" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                <button className="secondary small" aria-label="아래로" disabled={i === draft.length - 1} onClick={() => move(i, 1)}>↓</button>
                <button className="link danger small" onClick={() => setDraft(draft.filter((_, n) => n !== i))}>빼기</button>
              </li>
            ))}
          </ol>
          <button className="link" onClick={() => setDraft([...draft, { title: '', days: 3 }])}>+ 단계 추가</button>
          <div className="buttons">
            <button className="primary" onClick={() => void save()}>저장</button>
            <button className="secondary" onClick={() => setEditing(false)}>취소</button>
          </div>
        </div>
      )}
    </section>
  );
}

const ABOUT_FIELDS: { key: keyof ProjectFields; label: string; rows: number }[] = [
  { key: 'summary', label: '한 줄 소개', rows: 2 },
  { key: 'purpose', label: '2036년의 모습 · 왜 계속하나', rows: 3 },
  { key: 'current_focus', label: '지금 상태', rows: 2 },
  { key: 'next_action', label: '다음 할 일 하나', rows: 1 },
];

function About({ project, change }: { project: ProjectDetail; change: Change }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ProjectFields>(project);

  async function save() {
    const fields = {
      title: draft.title,
      kind: draft.kind,
      summary: draft.summary,
      purpose: draft.purpose,
      current_focus: draft.current_focus,
      next_action: draft.next_action,
      vault_note: draft.vault_note?.trim() ? draft.vault_note : null,
    };
    if (await change(() => projectApi.update(project.id, fields))) setEditing(false);
  }

  if (!editing) {
    return (
      <section className="row about">
        {ABOUT_FIELDS.map(({ key, label }) => (
          <div key={key}>
            <span className="label">{label}</span>
            <p className={project[key] ? '' : 'hint'}>{(project[key] as string) || '아직 적지 않음'}</p>
          </div>
        ))}
        <div className="actions">
          <button className="link" onClick={() => { setDraft(project); setEditing(true); }}>고치기</button>
          {project.vault_note && <a className="link" href={obsidianLink(project.vault_note)}>자료는 Obsidian 프로젝트 홈에서</a>}
        </div>
      </section>
    );
  }
  return (
    <section className="row panel">
      <label className="field">
        <span>이름</span>
        <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
      </label>
      {ABOUT_FIELDS.map(({ key, label, rows }) => (
        <label key={key} className="field">
          <span>{label}</span>
          <textarea rows={rows} value={(draft[key] as string) ?? ''} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} />
        </label>
      ))}
      <label className="field">
        <span>Obsidian 프로젝트 홈 (vault 안 경로, 예: 10_Projects/1_규영의_인문학_여행/00_홈)</span>
        <input value={draft.vault_note ?? ''} onChange={(e) => setDraft({ ...draft, vault_note: e.target.value })} />
      </label>
      <div className="buttons">
        <button className="primary" disabled={!draft.title.trim()} onClick={() => void save()}>저장</button>
        <button className="secondary" onClick={() => setEditing(false)}>취소</button>
      </div>
    </section>
  );
}


function Milestones({ project, change }: { project: ProjectDetail; change: Change }) {
  const [title, setTitle] = useState('');
  const [target, setTarget] = useState('');
  const [moving, setMoving] = useState<string | null>(null);
  const [moveTo, setMoveTo] = useState('');
  const [showDropped, setShowDropped] = useState(false);
  const live = project.milestones.filter((m) => m.status !== 'dropped');
  const dropped = project.milestones.filter((m) => m.status === 'dropped');

  async function add() {
    if (await change(() => projectApi.addMilestone(project.id, title, target))) {
      setTitle('');
      setTarget('');
    }
  }

  function row(m: Milestone) {
    return (
      <li key={m.id} className={m.status}>
        <span>{m.status === 'reached' ? '✓ ' : '◆ '}{m.title}</span>
        <span className="meta">
          {m.status === 'reached' ? `${shortDay(m.reached_on!)} 달성` : shortDay(m.target_on)}
          {m.status === 'planned' && m.target_on < project.today && ' · 날짜를 다시 정해도 됩니다'}
          {m.status === 'dropped' && ` · ${MILESTONE_NAMES.dropped}`}
        </span>
        <span className="actions">
          {m.status === 'planned' ? (
            <>
              <button className="link small" onClick={() => void change(() => projectApi.updateMilestone(m.id, { status: 'reached' }))}>달성</button>
              <button className="link small" onClick={() => { setMoving(m.id); setMoveTo(m.target_on); }}>날짜 옮기기</button>
              <button className="link small" onClick={() => void change(() => projectApi.updateMilestone(m.id, { status: 'dropped' }))}>내려놓기</button>
            </>
          ) : (
            <button className="link small" onClick={() => void change(() => projectApi.updateMilestone(m.id, { status: 'planned' }))}>다시 이정표로</button>
          )}
        </span>
        {moving === m.id && (
          <span className="inline-form">
            <input type="date" min={`${FIRST_YEAR}-01-01`} max={`${LAST_YEAR}-12-31`} value={moveTo} onChange={(e) => setMoveTo(e.target.value)} />
            <button
              className="secondary small"
              disabled={!moveTo}
              onClick={() => void change(() => projectApi.updateMilestone(m.id, { target_on: moveTo })).then((ok) => ok && setMoving(null))}
            >
              옮기기
            </button>
          </span>
        )}
      </li>
    );
  }

  return (
    <section>
      <h3>이정표 (2036까지)</h3>
      {live.length === 0 && <p className="hint">예: "2027년 말 에피소드 50편", "구독자 1,000명". 이루지 못해도 옮기거나 내려놓으면 됩니다.</p>}
      <ul className="lines milestones">{live.map(row)}</ul>
      {dropped.length > 0 && (
        <>
          <button className="link small" onClick={() => setShowDropped(!showDropped)}>내려놓은 이정표 {dropped.length}</button>
          {showDropped && <ul className="lines milestones">{dropped.map(row)}</ul>}
        </>
      )}
      <form className="add-item" onSubmit={(e) => { e.preventDefault(); if (title.trim() && target) void add(); }}>
        <input aria-label="이정표" placeholder="새 이정표" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input aria-label="날짜" type="date" min={`${FIRST_YEAR}-01-01`} max={`${LAST_YEAR}-12-31`} value={target} onChange={(e) => setTarget(e.target.value)} />
        <button className="secondary" disabled={!title.trim() || !target}>추가</button>
      </form>
    </section>
  );
}
