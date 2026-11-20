'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  messageOf,
  projectApi,
  type Milestone,
  type NewPhase,
  type Phase,
  type PhaseStatus,
  type ProjectCard,
  type ProjectDetail,
  type ProjectFields,
  type ProjectKind,
  type ProjectOverview,
  type ProjectStatus,
} from './api';
import {
  FIRST_YEAR,
  KIND_NAMES,
  LAST_YEAR,
  MILESTONE_NAMES,
  PHASE_NAMES,
  STATUS_NAMES,
  monthIndex,
  monthOf,
  monthRange,
  obsidianLink,
  shortDay,
  timeLeft,
} from './projectWords';
import { STARTER } from './projectStarter';

// One screen at /: the overview, or one project at /?p=<id>.
function shownProject(): string | null {
  return new URLSearchParams(window.location.search).get('p');
}

const COLORS = ['var(--green)', 'var(--blue)', 'var(--gold)', 'var(--plum)'];
const colorOf = (sortOrder: number) => COLORS[((sortOrder % COLORS.length) + COLORS.length) % COLORS.length];

export function Projects() {
  const [projectId, setProjectId] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    setProjectId(shownProject());
    const onHistory = () => setProjectId(shownProject());
    window.addEventListener('popstate', onHistory);
    return () => window.removeEventListener('popstate', onHistory);
  }, []);

  function open(id: string | null) {
    window.history.pushState(null, '', id ? `/?p=${id}` : '/');
    setProjectId(id);
    window.scrollTo(0, 0);
  }

  return (
    <>
      <Menu home={() => open(null)} />
      {projectId === undefined ? null : projectId ? <ProjectPage id={projectId} back={() => open(null)} /> : <Overview open={open} />}
    </>
  );
}

function downloadJson(data: unknown, fileName: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function Menu({ home }: { home: () => void }) {
  async function backup() {
    downloadJson(await projectApi.exportAll(), `projects-${new Date().toISOString().slice(0, 10)}.json`);
  }
  async function logout() {
    await projectApi.logout();
    window.location.href = '/login';
  }
  return (
    <nav className="menu" aria-label="메뉴">
      <a className="brand" href="/" onClick={(e) => { e.preventDefault(); home(); }}>PROJECTS 2036</a>
      <button className="link small" onClick={() => void backup()}>백업 받기</button>
      <button className="link small" onClick={() => void logout()}>로그아웃</button>
    </nav>
  );
}

// ---------------- timeline ----------------

interface Lane {
  key: string;
  label: string;
  color: string;
  phases: Phase[];
  milestones: Milestone[];
  onLabel?: () => void;
}

type Scale = 'year' | 'decade';

/** Phases that overlap go on separate lines inside one project row. */
function stack(phases: Phase[]): Phase[][] {
  const lines: Phase[][] = [];
  for (const phase of [...phases].sort((a, b) => a.start_month.localeCompare(b.start_month))) {
    const line = lines.find((l) => l[l.length - 1].end_month < phase.start_month);
    if (line) line.push(phase);
    else lines.push([phase]);
  }
  return lines.length ? lines : [[]];
}

const monthName = (index: number) => `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;

function Timeline({ lanes, today, onPhase }: { lanes: Lane[]; today: string; onPhase?: (phase: Phase) => void }) {
  const thisYear = Number(today.slice(0, 4));
  const nowIndex = monthIndex(today.slice(0, 7));
  const earliest = monthIndex(`${FIRST_YEAR}-01`);
  const latest = monthIndex(`${LAST_YEAR}-12`) - 11;
  const clampStart = (i: number) => Math.min(Math.max(i, earliest), latest);
  const [scale, setScale] = useState<Scale>('year');
  // The 12-month view starts one month back, so this month's work sits near the left.
  const [windowStart, setWindowStart] = useState(clampStart(nowIndex - 1));

  const first = scale === 'year' ? windowStart : earliest;
  const last = scale === 'year' ? windowStart + 11 : monthIndex(`${LAST_YEAR}-12`);
  const total = last - first + 1;
  const at = (index: number) => `${((index - first) / total) * 100}%`;
  const dayPoint = (day: string) => monthIndex(day.slice(0, 7)) + (Number(day.slice(8, 10)) - 1) / 31;
  const columns =
    scale === 'year'
      ? Array.from({ length: 12 }, (_, i) => {
          const index = windowStart + i;
          const m = (index % 12) + 1;
          return { key: index, label: i === 0 || m === 1 ? `${Math.floor(index / 12)}.${m}월` : `${m}월`, now: index === nowIndex };
        })
      : Array.from({ length: LAST_YEAR - FIRST_YEAR + 1 }, (_, i) => ({ key: i, label: String(FIRST_YEAR + i), now: FIRST_YEAR + i === thisYear }));
  const todayAt = dayPoint(today);
  const showToday = todayAt >= first && todayAt < last + 1;

  return (
    <section className="timeline">
      <div className="timeline-bar">
        <h3>흐름 타임라인</h3>
        <div className="segmented" role="group" aria-label="보기">
          <button aria-pressed={scale === 'year'} onClick={() => setScale('year')}>12개월</button>
          <button aria-pressed={scale === 'decade'} onClick={() => setScale('decade')}>2026–2036</button>
        </div>
        {scale === 'year' && (
          <div className="year-nav">
            <button aria-label="6개월 앞으로" disabled={windowStart <= earliest} onClick={() => setWindowStart(clampStart(windowStart - 6))}>‹</button>
            <strong>{monthOf(monthName(first))} – {monthOf(monthName(last))}</strong>
            <button aria-label="6개월 뒤로" disabled={windowStart >= latest} onClick={() => setWindowStart(clampStart(windowStart + 6))}>›</button>
            {windowStart !== clampStart(nowIndex - 1) && (
              <button className="link small" onClick={() => setWindowStart(clampStart(nowIndex - 1))}>지금</button>
            )}
          </div>
        )}
      </div>
      <div className="tl-scroll">
        <div className={`tl-grid ${scale}`}>
          <div className="tl-head">
            <span className="tl-label" />
            <div className="tl-track">
              {columns.map((c) => (
                <span key={c.key} className={c.now ? 'now' : ''} style={{ width: `${100 / columns.length}%` }}>{c.label}</span>
              ))}
            </div>
          </div>
          {lanes.map((lane) => {
            const marks = lane.milestones.filter((m) => {
              const x = dayPoint(m.target_on);
              return x >= first && x < last + 1;
            });
            return (
              <div key={lane.key} className="tl-row" style={{ ['--lane' as string]: lane.color }}>
                <span className="tl-label">
                  {lane.onLabel ? <button className="link" onClick={lane.onLabel}>{lane.label}</button> : lane.label}
                </span>
                <div className="tl-track">
                  <div className="tl-cells" aria-hidden>
                    {columns.map((c) => (
                      <span key={c.key} className={`tl-cell${c.now ? ' now' : ''}`} style={{ width: `${100 / columns.length}%` }} />
                    ))}
                  </div>
                  {showToday && <span className="tl-today" style={{ left: at(todayAt) }} title={`오늘 ${today}`} />}
                  <div className="tl-lines">
                    {stack(lane.phases).map((line, n) => (
                      <div key={n} className="tl-line">
                        {line.map((phase) => {
                          const s = Math.max(monthIndex(phase.start_month), first);
                          const e = Math.min(monthIndex(phase.end_month), last);
                          if (e < s) return null;
                          return (
                            <button
                              key={phase.id}
                              className={`tl-phase ${phase.status}`}
                              style={{ left: at(s), width: `${((e - s + 1) / total) * 100}%` }}
                              title={`${phase.title} · ${monthRange(phase.start_month, phase.end_month)} · ${PHASE_NAMES[phase.status]}${phase.goal ? `\n→ ${phase.goal}` : ''}`}
                              onClick={() => onPhase?.(phase)}
                            >
                              {phase.title}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                  {marks.map((m) => (
                    <span
                      key={m.id}
                      className={`tl-mark ${m.status}`}
                      style={{ left: at(dayPoint(m.target_on)) }}
                      title={`${m.title} · ${shortDay(m.target_on)}${m.status === 'reached' ? ' · 달성' : ''}`}
                    >
                      {m.status === 'reached' ? '✓' : '◆'}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <p className="legend">
        <span className="tl-key active">진행 중</span>
        <span className="tl-key planned">예정</span>
        <span className="tl-key done">마침</span>
        <span className="tl-key paused">쉬는 중</span>
        <span>◆ 이정표 · ✓ 달성 · 세로줄 오늘</span>
      </p>
    </section>
  );
}

// ---------------- overview ----------------

function Overview({ open }: { open: (id: string) => void }) {
  const [data, setData] = useState<ProjectOverview | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await projectApi.overview());
      setProblem(null);
    } catch (failure) {
      setProblem(messageOf(failure));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!data) return <main className="page wide">{problem && <p className="notice" role="alert">{problem}</p>}</main>;

  const lanes: Lane[] = data.projects
    .filter((p) => p.status !== 'archived')
    .map((p) => ({
      key: p.id,
      label: p.title,
      color: colorOf(p.sort_order),
      phases: data.phases.filter((f) => f.project_id === p.id),
      milestones: data.milestones.filter((m) => m.project_id === p.id),
      onLabel: () => open(p.id),
    }));

  return (
    <main className="page wide projects">
      <div className="page-title">
        <h2>일의 흐름</h2>
        <span className="hint">2036년 11월까지 {timeLeft(data.today)}</span>
      </div>
      {problem && <p className="notice" role="alert">{problem}</p>}

      {data.projects.length === 0 ? (
        <Starter onDone={load} onError={setProblem} />
      ) : (
        <>
          <ul className="cards">
            {data.projects.map((project) => (
              <Card key={project.id} project={project} open={() => open(project.id)} />
            ))}
          </ul>
          <Timeline lanes={lanes} today={data.today} onPhase={(phase) => open(phase.project_id)} />
          <section>
            <h3>다가오는 이정표</h3>
            {data.upcoming_milestones.length === 0 ? (
              <p className="hint">아직 정한 이정표가 없습니다. 프로젝트 안에서 2036년까지의 이정표를 적어 보세요.</p>
            ) : (
              <ul className="lines">
                {data.upcoming_milestones.map((m) => (
                  <li key={m.id}>
                    <button className="link" onClick={() => open(m.project_id)}>◆ {m.title}</button>
                    <span className="meta">
                      {m.project_title} · {shortDay(m.target_on)}
                      {m.target_on < data.today ? ' · 날짜 다시 정하기' : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <NewProject onDone={load} onError={setProblem} />
        </>
      )}
      <p className="hint small-print">에피소드·사진·대본 같은 자료는 Obsidian의 각 프로젝트 홈에 둡니다. 이곳은 일의 흐름만 계획합니다.</p>
    </main>
  );
}

function Card({ project, open }: { project: ProjectCard; open: () => void }) {
  return (
    <li className={`card${project.status === 'active' ? '' : ' quiet'}`} style={{ ['--accent' as string]: colorOf(project.sort_order) }}>
      <button className="card-open" onClick={open} aria-label={`${project.title} 열기`}>
        <div className="row-head">
          <span className={`tag kind ${project.kind}`}>{KIND_NAMES[project.kind]}</span>
          {project.status !== 'active' && <span className="tag scheduled">{STATUS_NAMES[project.status]}</span>}
        </div>
        <span className="title">{project.title}</span>
        <p className="focus">
          <b>지금 단계</b>{' '}
          {project.now_phases.length ? project.now_phases.map((f) => f.title).join(', ') : <span className="hint">정한 단계 없음</span>}
        </p>
        {project.next_action && <p className="next"><b>다음</b> {project.next_action}</p>}
        <p className="meta">
          {project.next_phase ? `이어서: ${project.next_phase.title} (${monthOf(project.next_phase.start_month)})` : '다음 단계는 아직 정하지 않음'}
        </p>
        {project.next_milestone && (
          <p className="meta goal">◆ {project.next_milestone.title} · {shortDay(project.next_milestone.target_on)}</p>
        )}
      </button>
    </li>
  );
}

function Starter({ onDone, onError }: { onDone: () => Promise<void>; onError: (message: string | null) => void }) {
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    try {
      // A retry after a failure skips the projects already made.
      const made = new Set((await projectApi.overview()).projects.map((p) => p.title));
      for (const [index, starter] of STARTER.entries()) {
        if (made.has(starter.title)) continue;
        const { phases, milestones, ...fields } = starter;
        const { id } = await projectApi.create({ ...fields, sort_order: index });
        for (const phase of phases) await projectApi.addPhase(id, phase);
        for (const goal of milestones) await projectApi.addMilestone(id, goal.title, goal.target_on);
      }
      onError(null);
      await onDone();
    } catch (failure) {
      onError(`만들지 못했습니다. ${messageOf(failure)}`);
      setBusy(false);
    }
  }

  return (
    <section className="row starter">
      <h3>4개 프로젝트로 시작하기</h3>
      <p className="hint">지금 상태·다음 할 일과 예시 단계 몇 개를 넣습니다. 나중에 모두 고칠 수 있습니다.</p>
      <ul className="lines">
        {STARTER.map((s) => (
          <li key={s.title}>
            <span><span className={`tag kind ${s.kind}`}>{KIND_NAMES[s.kind]}</span> {s.title}</span>
            <span className="meta">단계 {s.phases.length}개</span>
          </li>
        ))}
      </ul>
      <button className="primary" disabled={busy} onClick={() => void start()}>{busy ? '만드는 중…' : '이 4개로 시작'}</button>
    </section>
  );
}

function NewProject({ onDone, onError }: { onDone: () => Promise<void>; onError: (message: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<ProjectKind>('other');
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await projectApi.create({ title, kind, summary: '', purpose: '', current_focus: '', next_action: '', vault_note: null, sort_order: 100 });
      setTitle('');
      setOpen(false);
      onError(null);
      await onDone();
    } catch (failure) {
      onError(`만들지 못했습니다. ${messageOf(failure)}`);
    } finally {
      setBusy(false);
    }
  }

  if (!open) return <button className="link" onClick={() => setOpen(true)}>새 프로젝트 추가</button>;
  return (
    <section className="row panel">
      <h3>새 프로젝트</h3>
      <label className="field">
        <span>이름</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="field narrow">
        <span>종류</span>
        <select value={kind} onChange={(e) => setKind(e.target.value as ProjectKind)}>
          {(Object.keys(KIND_NAMES) as ProjectKind[]).map((k) => (
            <option key={k} value={k}>{KIND_NAMES[k]}</option>
          ))}
        </select>
      </label>
      <div className="buttons">
        <button className="primary" disabled={busy || !title.trim()} onClick={() => void save()}>만들기</button>
        <button className="secondary" onClick={() => setOpen(false)}>취소</button>
      </div>
    </section>
  );
}

// ---------------- one project ----------------

type Change = (run: () => Promise<unknown>, failText?: string) => Promise<boolean>;

function ProjectPage({ id, back }: { id: string; back: () => void }) {
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setProject(await projectApi.detail(id));
    } catch (failure) {
      setProblem(messageOf(failure));
    }
  }, [id]);

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

  function editPhase(phase: Phase) {
    setEditing(phase.id);
    window.setTimeout(() => document.getElementById(`phase-${phase.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  }

  if (!project) {
    return (
      <main className="page wide projects">
        <button className="link" onClick={back}>‹ 전체 흐름</button>
        {problem && <p className="notice" role="alert">{problem}</p>}
      </main>
    );
  }

  const lane: Lane = {
    key: project.id,
    label: project.title,
    color: colorOf(project.sort_order),
    phases: project.phases,
    milestones: project.milestones.filter((m) => m.status !== 'dropped'),
  };

  return (
    <main className="page wide projects">
      <button className="link" onClick={back}>‹ 전체 흐름</button>
      <div className="page-title">
        <h2>{project.title}</h2>
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
      <Timeline lanes={[lane]} today={project.today} onPhase={editPhase} />
      <Phases project={project} change={change} editing={editing} setEditing={setEditing} />
      <Milestones project={project} change={change} />
    </main>
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

/** Year and month dropdowns: Safari on the Mac has no picker for <input type="month">. */
function MonthPicker({ label, value, onChange }: { label: string; value: string; onChange: (month: string) => void }) {
  const [year, month] = value.split('-');
  const years = Array.from({ length: LAST_YEAR - FIRST_YEAR + 1 }, (_, i) => String(FIRST_YEAR + i));
  return (
    <fieldset className="field month-picker">
      <legend>{label}</legend>
      <select aria-label={`${label} 연도`} value={year} onChange={(e) => onChange(`${e.target.value}-${month}`)}>
        {years.map((y) => <option key={y} value={y}>{y}년</option>)}
      </select>
      <select aria-label={`${label} 월`} value={month} onChange={(e) => onChange(`${year}-${e.target.value}`)}>
        {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map((m) => (
          <option key={m} value={m}>{Number(m)}월</option>
        ))}
      </select>
    </fieldset>
  );
}

function PhaseForm({ initial, onSave, onCancel, today }: {
  initial?: Phase;
  onSave: (phase: NewPhase) => Promise<boolean>;
  onCancel?: () => void;
  today: string;
}) {
  const month = today.slice(0, 7);
  const [draft, setDraft] = useState<NewPhase>({
    title: initial?.title ?? '',
    start_month: initial?.start_month ?? month,
    end_month: initial?.end_month ?? month,
    status: initial?.status ?? 'planned',
    goal: initial?.goal ?? '',
  });
  const [busy, setBusy] = useState(false);
  const valid = draft.title.trim() && draft.start_month && draft.end_month && draft.end_month >= draft.start_month;

  async function save() {
    setBusy(true);
    const ok = await onSave({ ...draft, goal: draft.goal?.trim() ? draft.goal : null });
    setBusy(false);
    if (ok && !initial) setDraft({ ...draft, title: '', goal: '' });
  }

  return (
    <div className="phase-form">
      <label className="field">
        <span>단계 이름</span>
        <input placeholder="예: EP002~EP010 정기 제작" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
      </label>
      <div className="phase-dates">
        <MonthPicker label="시작" value={draft.start_month}
          onChange={(v) => setDraft({ ...draft, start_month: v, end_month: draft.end_month < v ? v : draft.end_month })} />
        <MonthPicker label="끝" value={draft.end_month} onChange={(v) => setDraft({ ...draft, end_month: v })} />
        <label className="field">
          <span>상태</span>
          <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as PhaseStatus })}>
            {(Object.keys(PHASE_NAMES) as PhaseStatus[]).map((s) => (
              <option key={s} value={s}>{PHASE_NAMES[s]}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        <span>이 단계가 끝나면 (선택)</span>
        <input placeholder="예: 한 달에 두 편 올리는 리듬이 자리 잡는다" value={draft.goal ?? ''} onChange={(e) => setDraft({ ...draft, goal: e.target.value })} />
      </label>
      <div className="buttons">
        <button className="primary" disabled={busy || !valid} onClick={() => void save()}>{initial ? '저장' : '단계 추가'}</button>
        {onCancel && <button className="secondary" onClick={onCancel}>닫기</button>}
      </div>
    </div>
  );
}

function Phases({ project, change, editing, setEditing }: {
  project: ProjectDetail;
  change: Change;
  editing: string | null;
  setEditing: (id: string | null) => void;
}) {
  const [adding, setAdding] = useState(false);

  async function remove(phase: Phase) {
    if (!window.confirm(`「${phase.title}」 단계를 지울까요? 백업에는 남습니다.`)) return;
    if (await change(() => projectApi.deletePhase(phase.id), '지우지 못했습니다.')) setEditing(null);
  }

  return (
    <section>
      <h3>단계</h3>
      {project.phases.length === 0 && <p className="hint">일을 몇 달짜리 단계로 나눠 보세요. 타임라인에 막대로 나타납니다.</p>}
      <ul className="lines phases">
        {project.phases.map((phase) => (
          <li key={phase.id} id={`phase-${phase.id}`}>
            <span>
              <span className={`dot ${phase.status}`} aria-hidden />
              <button className="link" onClick={() => setEditing(editing === phase.id ? null : phase.id)}>{phase.title}</button>
            </span>
            <span className="meta">{monthRange(phase.start_month, phase.end_month)} · {PHASE_NAMES[phase.status]}</span>
            {phase.goal && editing !== phase.id && <span className="meta goal-line">→ {phase.goal}</span>}
            {editing === phase.id && (
              <div className="details">
                <PhaseForm
                  initial={phase}
                  today={project.today}
                  onSave={async (fields) => {
                    const ok = await change(() => projectApi.updatePhase(phase.id, fields));
                    if (ok) setEditing(null);
                    return ok;
                  }}
                  onCancel={() => setEditing(null)}
                />
                <button className="link danger small" onClick={() => void remove(phase)}>이 단계 지우기</button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {adding ? (
        <div className="row panel">
          <PhaseForm today={project.today} onSave={(fields) => change(() => projectApi.addPhase(project.id, fields))} onCancel={() => setAdding(false)} />
        </div>
      ) : (
        <button className="link" onClick={() => setAdding(true)}>단계 추가</button>
      )}
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
