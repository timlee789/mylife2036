'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  projectApi,
  type LogLine,
  type Milestone,
  type ProjectCard,
  type ProjectDetail,
  type ProjectFields,
  type ProjectKind,
  type ProjectOverview,
  type ProjectStatus,
  type Stage,
  type WorkItem,
  messageOf,
} from './api';
import {
  FLOW,
  KIND_NAMES,
  MILESTONE_NAMES,
  STAGE_NAMES,
  STATUS_NAMES,
  monthOf,
  obsidianLink,
  shortDay,
  timeLeft,
} from './projectWords';
import { STARTER } from './projectStarter';

// One screen at /: the overview, or one project at /?p=<id>.
function shownProject(): string | null {
  return new URLSearchParams(window.location.search).get('p');
}

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
    const data = await projectApi.exportAll();
    downloadJson(data, `projects-${new Date().toISOString().slice(0, 10)}.json`);
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

  return (
    <main className="page wide projects">
      <div className="page-title">
        <h2>프로젝트</h2>
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
          <Roadmap data={data} open={open} />
          <div className="two-col">
            <section>
              <h3>다가오는 목표</h3>
              {data.upcoming_milestones.length === 0 ? (
                <p className="hint">아직 정한 목표가 없습니다. 프로젝트 안에서 2036년까지의 목표를 적어 보세요.</p>
              ) : (
                <ul className="lines">
                  {data.upcoming_milestones.map((m) => (
                    <li key={m.id}>
                      <button className="link" onClick={() => open(m.project_id)}>{m.title}</button>
                      <span className="meta">{m.project_title} · {monthOf(m.target_on)}{m.target_on < data.today ? ' · 날짜 다시 정하기' : ''}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section>
              <h3>최근 작업</h3>
              {data.recent_log.length === 0 ? (
                <p className="hint">작업을 옮기거나 한 줄 기록을 남기면 여기에 쌓입니다.</p>
              ) : (
                <LogList lines={data.recent_log} withProject />
              )}
            </section>
          </div>
          <NewProject onDone={load} onError={setProblem} />
        </>
      )}
    </main>
  );
}

function Card({ project, open }: { project: ProjectCard; open: () => void }) {
  const names = STAGE_NAMES[project.kind];
  return (
    <li className={`card kind-${project.kind}${project.status === 'active' ? '' : ' quiet'}`}>
      <button className="card-open" onClick={open} aria-label={`${project.title} 열기`}>
        <div className="row-head">
          <span className={`tag kind ${project.kind}`}>{KIND_NAMES[project.kind]}</span>
          {project.status !== 'active' && <span className="tag scheduled">{STATUS_NAMES[project.status]}</span>}
        </div>
        <span className="title">{project.title}</span>
        {project.summary && <p className="summary">{project.summary}</p>}
        {project.current_focus && <p className="focus"><b>지금</b> {project.current_focus}</p>}
        {project.next_action && <p className="next"><b>다음</b> {project.next_action}</p>}
        <ol className="pipeline" aria-label="단계별 작업 수">
          {FLOW.map((stage) => (
            <li key={stage} className={project.stage_counts[stage] ? 'has' : ''}>
              <span className="count">{project.stage_counts[stage]}</span>
              <span className="name">{names[stage]}</span>
            </li>
          ))}
        </ol>
        <p className="meta">
          올해 {names.done} {project.done_this_year} · 이번 달 {project.done_this_month}
          {' · '}
          {project.last_activity_on ? `최근 작업 ${shortDay(project.last_activity_on)}` : '아직 작업 기록 없음'}
        </p>
        {project.next_milestone && (
          <p className="meta goal">◆ {project.next_milestone.title} · {monthOf(project.next_milestone.target_on)}</p>
        )}
      </button>
    </li>
  );
}

function Roadmap({ data, open }: { data: ProjectOverview; open: (id: string) => void }) {
  const thisYear = Number(data.today.slice(0, 4));
  const most = Math.max(1, ...Object.values(data.roadmap.done_by_year).flatMap((byYear) => Object.values(byYear)));
  return (
    <section className="roadmap">
      <h3>10년 로드맵 2026–2036</h3>
      <p className="hint">칸의 숫자는 그해 완성한 작업 수, ◆는 그해의 목표입니다(✓ 달성).</p>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">프로젝트</th>
              {data.roadmap.years.map((year) => (
                <th key={year} scope="col" className={year === thisYear ? 'now' : ''}>{year}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.projects.map((project) => (
              <tr key={project.id}>
                <th scope="row">
                  <button className="link" onClick={() => open(project.id)}>{project.title}</button>
                </th>
                {data.roadmap.years.map((year) => {
                  const done = data.roadmap.done_by_year[project.id]?.[String(year)] ?? 0;
                  const goals = data.roadmap.milestones.filter(
                    (m) => m.project_id === project.id && m.target_on.startsWith(String(year)),
                  );
                  return (
                    <td
                      key={year}
                      className={year === thisYear ? 'now' : ''}
                      style={done ? { background: `color-mix(in srgb, var(--green) ${12 + Math.round((done / most) * 40)}%, transparent)` } : undefined}
                    >
                      {done > 0 && <span className="done-count">{done}</span>}
                      {goals.map((m) => (
                        <span key={m.id} className={`goal-mark ${m.status}`} title={`${m.title} (${m.target_on})`}>
                          {m.status === 'reached' ? '✓' : '◆'}
                        </span>
                      ))}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
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
        const { items, milestones, ...fields } = starter;
        const { id } = await projectApi.create({ ...fields, sort_order: index });
        for (const item of items) await projectApi.addItem(id, item);
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
      <p className="hint">Obsidian 프로젝트 홈(11/20 기준)의 현재 상태와 다음 할 일을 그대로 넣습니다. 나중에 모두 고칠 수 있습니다.</p>
      <ul className="lines">
        {STARTER.map((s) => (
          <li key={s.title}>
            <span className={`tag kind ${s.kind}`}>{KIND_NAMES[s.kind]}</span> {s.title}
            <span className="meta">작업 {s.items.length}개</span>
          </li>
        ))}
      </ul>
      <button className="primary" disabled={busy} onClick={() => void start()}>
        {busy ? '만드는 중…' : '이 4개로 시작'}
      </button>
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

  if (!open) {
    return (
      <button className="link" onClick={() => setOpen(true)}>
        새 프로젝트 추가
      </button>
    );
  }
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

function LogList({ lines, withProject = false }: { lines: LogLine[]; withProject?: boolean }) {
  return (
    <ul className="lines">
      {lines.map((line) => (
        <li key={line.id}>
          <span>{line.text}</span>
          <span className="meta">
            {shortDay(line.logged_on)}
            {line.minutes !== null && ` · ${line.minutes}분`}
            {withProject && ` · ${line.project_title}`}
          </span>
        </li>
      ))}
    </ul>
  );
}

// ---------------- one project ----------------

type Change = (run: () => Promise<unknown>, failText?: string) => Promise<boolean>;

function ProjectPage({ id, back }: { id: string; back: () => void }) {
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

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

  if (!project) {
    return (
      <main className="page wide projects">
        <button className="link" onClick={back}>‹ 전체 프로젝트</button>
        {problem && <p className="notice" role="alert">{problem}</p>}
      </main>
    );
  }

  const names = STAGE_NAMES[project.kind];
  const open = project.items.filter((i) => i.stage !== 'done' && i.stage !== 'hold');
  const held = project.items.filter((i) => i.stage === 'hold');
  const done = project.items.filter((i) => i.stage === 'done');

  return (
    <main className="page wide projects">
      <button className="link" onClick={back}>‹ 전체 프로젝트</button>
      <div className="page-title">
        <h2>{project.title}</h2>
        <label className="status-pick">
          <span className="visually-hidden">상태</span>
          <select
            value={project.status}
            onChange={(e) => void change(() => projectApi.update(id, { status: e.target.value as ProjectStatus }))}
          >
            {(Object.keys(STATUS_NAMES) as ProjectStatus[]).map((s) => (
              <option key={s} value={s}>{STATUS_NAMES[s]}</option>
            ))}
          </select>
        </label>
      </div>
      {problem && <p className="notice" role="alert">{problem}</p>}

      <About project={project} change={change} />

      <section>
        <h3>작업 보드</h3>
        <div className="board">
          {FLOW.map((stage) => (
            <div key={stage} className="column">
              <h4>
                {names[stage]} <span className="meta">{open.filter((i) => i.stage === stage).length}</span>
              </h4>
              <ul className="rows">
                {open
                  .filter((i) => i.stage === stage)
                  .map((item) => (
                    <ItemCard key={item.id} item={item} kind={project.kind} today={project.today} change={change} />
                  ))}
              </ul>
              {stage === 'idea' && <AddItem projectId={id} change={change} />}
            </div>
          ))}
        </div>
        {held.length > 0 && (
          <>
            <h4>{names.hold}</h4>
            <ul className="rows held">
              {held.map((item) => (
                <ItemCard key={item.id} item={item} kind={project.kind} today={project.today} change={change} />
              ))}
            </ul>
          </>
        )}
      </section>

      <DoneList items={done} kind={project.kind} today={project.today} change={change} />

      <div className="two-col">
        <Milestones project={project} change={change} />
        <WorkLog project={project} change={change} />
      </div>
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

  function edit() {
    setDraft(project);
    setEditing(true);
  }

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
          <button className="link" onClick={edit}>고치기</button>
          {project.vault_note && (
            <a className="link" href={obsidianLink(project.vault_note)}>Obsidian에서 프로젝트 홈 열기</a>
          )}
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
        <span>Obsidian 노트 (vault 안 경로, 예: 10_Projects/1_규영의_인문학_여행/00_홈)</span>
        <input value={draft.vault_note ?? ''} onChange={(e) => setDraft({ ...draft, vault_note: e.target.value })} />
      </label>
      <div className="buttons">
        <button className="primary" disabled={!draft.title.trim()} onClick={() => void save()}>저장</button>
        <button className="secondary" onClick={() => setEditing(false)}>취소</button>
      </div>
    </section>
  );
}

function AddItem({ projectId, change }: { projectId: string; change: Change }) {
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);

  async function add() {
    setBusy(true);
    if (await change(() => projectApi.addItem(projectId, { title, stage: 'idea' }))) setTitle('');
    setBusy(false);
  }

  return (
    <form
      className="add-item"
      onSubmit={(e) => {
        e.preventDefault();
        if (title.trim()) void add();
      }}
    >
      <input aria-label="새 작업 이름" placeholder="새 작업 추가" value={title} onChange={(e) => setTitle(e.target.value)} />
      <button className="secondary" disabled={busy || !title.trim()}>추가</button>
    </form>
  );
}

interface ItemProps {
  item: WorkItem;
  kind: ProjectKind;
  today: string;
  change: Change;
}

function ItemCard({ item, kind, today, change }: ItemProps) {
  const [open, setOpen] = useState(false);
  const names = STAGE_NAMES[kind];
  const at = FLOW.indexOf(item.stage);
  const next: Stage | null = item.stage === 'hold' ? 'idea' : at === FLOW.length - 1 ? 'done' : at >= 0 ? FLOW[at + 1] : null;
  const prev: Stage | null = at > 0 ? FLOW[at - 1] : null;
  const move = (stage: Stage) => void change(() => projectApi.updateItem(item.id, { stage }));

  return (
    <li className="row item">
      <button className="item-title" aria-expanded={open} onClick={() => setOpen(!open)}>
        {item.title}
      </button>
      <div className="meta">
        {item.series && <span className="chip">{item.series}</span>}
        {item.due_on && <span>{shortDay(item.due_on)}까지</span>}
        {item.note && !open && <span className="note-mark" title={item.note}>메모</span>}
      </div>
      <div className="moves">
        {prev && <button className="secondary small" aria-label={`${names[prev]}(으)로 되돌리기`} onClick={() => move(prev)}>‹</button>}
        {next && (
          <button className="secondary small grow" onClick={() => move(next)}>
            {names[next]} ›
          </button>
        )}
      </div>
      {open && <ItemEditor item={item} kind={kind} today={today} change={change} close={() => setOpen(false)} />}
    </li>
  );
}

function ItemEditor({ item, kind, today, change, close }: ItemProps & { close: () => void }) {
  const names = STAGE_NAMES[kind];
  const [draft, setDraft] = useState({
    title: item.title,
    series: item.series ?? '',
    stage: item.stage,
    due_on: item.due_on ?? '',
    done_on: item.done_on ?? '',
    link: item.link ?? '',
    note: item.note ?? '',
  });
  const orNull = (text: string) => (text.trim() ? text : null);

  async function save() {
    const fields = {
      title: draft.title,
      series: orNull(draft.series),
      stage: draft.stage,
      due_on: orNull(draft.due_on),
      link: orNull(draft.link),
      note: orNull(draft.note),
      ...(draft.stage === 'done' ? { done_on: orNull(draft.done_on) } : {}),
    };
    if (await change(() => projectApi.updateItem(item.id, fields))) close();
  }

  async function remove() {
    if (!window.confirm(`「${item.title}」을(를) 보드에서 지울까요? 기록은 데이터에 남습니다.`)) return;
    await change(() => projectApi.deleteItem(item.id), '지우지 못했습니다.');
  }

  return (
    <div className="details">
      <label className="field">
        <span>이름</span>
        <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
      </label>
      <label className="field">
        <span>시리즈·분류</span>
        <input value={draft.series} onChange={(e) => setDraft({ ...draft, series: e.target.value })} />
      </label>
      <label className="field">
        <span>단계</span>
        <select value={draft.stage} onChange={(e) => setDraft({ ...draft, stage: e.target.value as Stage })}>
          {(Object.keys(names) as Stage[]).map((s) => (
            <option key={s} value={s}>{names[s]}</option>
          ))}
        </select>
      </label>
      {draft.stage === 'done' ? (
        <label className="field">
          <span>{names.done} 날짜</span>
          <input type="date" max={today} value={draft.done_on} onChange={(e) => setDraft({ ...draft, done_on: e.target.value })} />
        </label>
      ) : (
        <label className="field">
          <span>언제까지 (선택)</span>
          <input type="date" value={draft.due_on} onChange={(e) => setDraft({ ...draft, due_on: e.target.value })} />
        </label>
      )}
      <label className="field">
        <span>링크 (YouTube 주소 등)</span>
        <input value={draft.link} onChange={(e) => setDraft({ ...draft, link: e.target.value })} />
      </label>
      <label className="field">
        <span>메모</span>
        <textarea rows={2} value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
      </label>
      <div className="buttons">
        <button className="primary" disabled={!draft.title.trim()} onClick={() => void save()}>저장</button>
        <button className="secondary" onClick={close}>닫기</button>
        {draft.stage !== 'hold' && item.stage !== 'hold' && (
          <button className="link" onClick={() => void change(() => projectApi.updateItem(item.id, { stage: 'hold' }))}>보류로</button>
        )}
        <button className="link danger" onClick={() => void remove()}>지우기</button>
      </div>
    </div>
  );
}

const DONE_SHOWN = 8;

function DoneList({ items, kind, today, change }: { items: WorkItem[]; kind: ProjectKind; today: string; change: Change }) {
  const [all, setAll] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const names = STAGE_NAMES[kind];
  if (items.length === 0) return null;
  const shown = all ? items : items.slice(0, DONE_SHOWN);
  return (
    <section>
      <h3>{names.done} <span className="meta">{items.length}</span></h3>
      <ul className="lines">
        {shown.map((item) => (
          <li key={item.id}>
            <span>
              <button className="link" onClick={() => setEditing(editing === item.id ? null : item.id)}>{item.title}</button>
              {item.link && <> · <a className="link" href={item.link} target="_blank" rel="noreferrer">열기</a></>}
            </span>
            <span className="meta">{item.series ? `${item.series} · ` : ''}{shortDay(item.done_on!)}</span>
            {editing === item.id && (
              <ItemEditor item={item} kind={kind} today={today} change={change} close={() => setEditing(null)} />
            )}
          </li>
        ))}
      </ul>
      {items.length > DONE_SHOWN && (
        <button className="link" onClick={() => setAll(!all)}>{all ? '줄이기' : `모두 보기 (${items.length})`}</button>
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
          {m.status === 'reached' ? `${shortDay(m.reached_on!)} 달성` : `${monthOf(m.target_on)} 목표`}
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
            <button className="link small" onClick={() => void change(() => projectApi.updateMilestone(m.id, { status: 'planned' }))}>다시 목표로</button>
          )}
        </span>
        {moving === m.id && (
          <span className="inline-form">
            <input type="date" min="2026-01-01" max="2036-12-31" value={moveTo} onChange={(e) => setMoveTo(e.target.value)} />
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
      <h3>2036까지의 목표</h3>
      {live.length === 0 && <p className="hint">예: "2027년 말 에피소드 50편", "구독자 1,000명". 이루지 못해도 옮기거나 내려놓으면 됩니다.</p>}
      <ul className="lines milestones">{live.map(row)}</ul>
      {dropped.length > 0 && (
        <>
          <button className="link small" onClick={() => setShowDropped(!showDropped)}>내려놓은 목표 {dropped.length}</button>
          {showDropped && <ul className="lines milestones">{dropped.map(row)}</ul>}
        </>
      )}
      <form
        className="add-item"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim() && target) void add();
        }}
      >
        <input aria-label="목표" placeholder="새 목표" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input aria-label="목표 날짜" type="date" min="2026-01-01" max="2036-12-31" value={target} onChange={(e) => setTarget(e.target.value)} />
        <button className="secondary" disabled={!title.trim() || !target}>추가</button>
      </form>
    </section>
  );
}

function WorkLog({ project, change }: { project: ProjectDetail; change: Change }) {
  const [text, setText] = useState('');
  const [minutes, setMinutes] = useState('');

  async function add() {
    const m = minutes.trim() === '' ? null : Number(minutes);
    if (await change(() => projectApi.addLog(project.id, text, m))) {
      setText('');
      setMinutes('');
    }
  }

  return (
    <section>
      <h3>작업 기록</h3>
      <form
        className="add-item"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) void add();
        }}
      >
        <input aria-label="오늘 한 일" placeholder="오늘 한 일 한 줄" value={text} onChange={(e) => setText(e.target.value)} />
        <input aria-label="시간(분)" className="minutes-in" type="number" min={0} inputMode="numeric" placeholder="분" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
        <button className="secondary" disabled={!text.trim()}>남기기</button>
      </form>
      {project.log.length === 0 ? <p className="hint">아직 기록이 없습니다.</p> : <LogList lines={project.log} />}
    </section>
  );
}
