'use client';

import { useCallback, useEffect, useState } from 'react';
import { messageOf, projectApi, type ProjectCard, type ProjectKind, type ProjectOverview } from './api';
import { colorOf, ProgressBar, marksOf, usePage, type Go, type Place } from './common';
import { KIND_NAMES, STATUS_NAMES, SUB_NAMES, shortDay, timeLeft } from './projectWords';
import { STARTER } from './projectStarter';
import { SubProject } from './SubProject';
import { Timeline, type Lane } from './Timeline';
import { TopProject } from './TopProject';

// One screen at /: the overview, a top project at /?p=<id>, one project under it at /?s=<id>.
function placeFromUrl(): Place {
  const q = new URLSearchParams(window.location.search);
  if (q.get('s')) return { sub: q.get('s')! };
  if (q.get('p')) return { top: q.get('p')! };
  return null;
}

export function Projects() {
  const [place, setPlace] = useState<Place | undefined>(undefined);

  useEffect(() => {
    setPlace(placeFromUrl());
    const onHistory = () => setPlace(placeFromUrl());
    window.addEventListener('popstate', onHistory);
    return () => window.removeEventListener('popstate', onHistory);
  }, []);

  const go: Go = (next) => {
    const url = !next ? '/' : 'top' in next ? `/?p=${next.top}` : `/?s=${next.sub}`;
    window.history.pushState(null, '', url);
    setPlace(next);
    window.scrollTo(0, 0);
  };

  return (
    <>
      <Menu home={() => go(null)} />
      {place === undefined ? null : !place ? (
        <Overview go={go} />
      ) : 'top' in place ? (
        <TopProject key={place.top} id={place.top} go={go} />
      ) : (
        <SubProject key={place.sub} id={place.sub} go={go} />
      )}
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

// ---------------- overview ----------------

function Overview({ go }: { go: Go }) {
  const fetcher = useCallback(() => projectApi.overview(), []);
  const { data, problem, setProblem, load } = usePage<ProjectOverview>(fetcher);

  if (!data) return <main className="page wide">{problem && <p className="notice" role="alert">{problem}</p>}</main>;

  const lanes: Lane[] = data.projects
    .filter((p) => p.status !== 'archived')
    .map((p) => ({
      key: p.id,
      label: p.title,
      color: colorOf(p.sort_order),
      bars: data.subprojects
        .filter((s) => s.project_id === p.id)
        .map((s) => ({
          id: s.id,
          title: s.title,
          start: s.start_on,
          end: s.end_on,
          tone: s.status,
          percent: s.percent,
          tip: `${s.title} · ${SUB_NAMES[s.status]}${s.percent !== null ? ` · ${s.percent}%` : ''}`,
        })),
      marks: marksOf(data.milestones.filter((m) => m.project_id === p.id)),
      onLabel: () => go({ top: p.id }),
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
              <Card key={project.id} project={project} go={go} />
            ))}
          </ul>
          <Timeline
            title="전체 타임라인"
            lanes={lanes}
            today={data.today}
            scales={['months', 'decade']}
            onBar={(bar) => go({ sub: bar.id })}
            legend={[
              { tone: 'active', label: '진행 중' },
              { tone: 'planned', label: '예정' },
              { tone: 'done', label: '마침' },
              { tone: 'paused', label: '쉬는 중' },
            ]}
          />
          <section>
            <h3>다가오는 이정표</h3>
            {data.upcoming_milestones.length === 0 ? (
              <p className="hint">아직 정한 이정표가 없습니다. Top 프로젝트 안에서 2036년까지의 이정표를 적어 보세요.</p>
            ) : (
              <ul className="lines">
                {data.upcoming_milestones.map((m) => (
                  <li key={m.id}>
                    <button className="link" onClick={() => go({ top: m.project_id })}>◆ {m.title}</button>
                    <span className="meta">{m.project_title} · {shortDay(m.target_on)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {data.overdue_milestones.length > 0 && (
            <section>
              <h3>날짜 다시 정하기</h3>
              <p className="hint">날짜가 지난 이정표입니다. 옮기거나 내려놓아도 됩니다.</p>
              <ul className="lines">
                {data.overdue_milestones.map((m) => (
                  <li key={m.id}>
                    <button className="link" onClick={() => go({ top: m.project_id })}>◆ {m.title}</button>
                    <span className="meta">{m.project_title} · {shortDay(m.target_on)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <NewTopProject onDone={load} onError={setProblem} />
        </>
      )}
      <p className="hint small-print">원고·사진·대본 같은 자료는 Obsidian에 둡니다. 이곳은 일의 흐름만 계획하고 관리합니다.</p>
    </main>
  );
}

function Card({ project, go }: { project: ProjectCard; go: Go }) {
  const color = colorOf(project.sort_order);
  return (
    <li className={`card${project.status === 'active' ? '' : ' quiet'}`} style={{ ['--accent' as string]: color }}>
      <div className="card-body">
        <div className="row-head">
          <span className={`tag kind ${project.kind}`}>{KIND_NAMES[project.kind]}</span>
          {project.status !== 'active' && <span className="tag scheduled">{STATUS_NAMES[project.status]}</span>}
          <span className="meta push">진행 {project.counts.active} · 예정 {project.counts.planned} · 올해 마침 {project.counts.done_this_year}</span>
        </div>
        <button className="title card-title" onClick={() => go({ top: project.id })}>{project.title}</button>
        {project.active.length > 0 ? (
          <ul className="sub-mini">
            {project.active.map((s) => (
              <li key={s.id}>
                <button className="link" onClick={() => go({ sub: s.id })}>{s.title}</button>
                <ProgressBar percent={s.percent} color={color} />
                <span className="meta">{s.current_step ? `지금: ${s.current_step.title}` : ''} · {shortDay(s.due_on)}까지</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="hint">진행 중인 프로젝트 없음</p>
        )}
        {project.next_action && <p className="next"><b>다음</b> {project.next_action}</p>}
        {project.next_planned && (
          <p className="meta">이어서: <button className="link small" onClick={() => go({ sub: project.next_planned!.id })}>{project.next_planned.title}</button> ({shortDay(project.next_planned.start_on)} 시작)</p>
        )}
        {project.next_milestone && <p className="meta goal">◆ {project.next_milestone.title} · {shortDay(project.next_milestone.target_on)}</p>}
      </div>
    </li>
  );
}

function Starter({ onDone, onError }: { onDone: () => Promise<void>; onError: (message: string | null) => void }) {
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    try {
      // A retry after a failure skips the top projects already made.
      const made = new Set((await projectApi.overview()).projects.map((p) => p.title));
      for (const [index, starter] of STARTER.entries()) {
        if (made.has(starter.title)) continue;
        const { procedure, milestones, ...fields } = starter;
        const { id } = await projectApi.create({ ...fields, sort_order: index });
        await projectApi.setProcedure(id, procedure);
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
      <h3>4개 Top 프로젝트로 시작하기</h3>
      <p className="hint">각 Top 프로젝트와 진행 절차 초안을 넣습니다. 나중에 모두 고칠 수 있습니다.</p>
      <ul className="lines">
        {STARTER.map((s) => (
          <li key={s.title}>
            <span><span className={`tag kind ${s.kind}`}>{KIND_NAMES[s.kind]}</span> {s.title}</span>
            <span className="meta">절차 {s.procedure.length}단계</span>
          </li>
        ))}
      </ul>
      <button className="primary" disabled={busy} onClick={() => void start()}>{busy ? '만드는 중…' : '이 4개로 시작'}</button>
    </section>
  );
}

function NewTopProject({ onDone, onError }: { onDone: () => Promise<void>; onError: (message: string | null) => void }) {
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

  if (!open) return <button className="link" onClick={() => setOpen(true)}>새 Top 프로젝트 추가</button>;
  return (
    <section className="row panel">
      <h3>새 Top 프로젝트</h3>
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

