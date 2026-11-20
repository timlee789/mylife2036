'use client';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let reply: Response;
  try {
    reply = await fetch(`/api${path}`, {
      method,
      headers: { 'X-PM-Request': '1', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(0, 'offline', '서버에 연결할 수 없습니다. 인터넷 연결을 확인해 주세요.');
  }
  if (reply.status === 401) {
    window.location.href = '/login';
    throw new ApiError(401, 'login_required', '로그인이 필요합니다.');
  }
  if (reply.status === 204) return undefined as T;
  const data = await reply.json().catch(() => null);
  if (!reply.ok) throw new ApiError(reply.status, data?.code ?? 'unknown', data?.message ?? '요청을 처리하지 못했습니다.');
  return data as T;
}

export function messageOf(problem: unknown): string {
  return problem instanceof ApiError ? problem.message : '알 수 없는 문제가 생겼습니다.';
}

export type ProjectKind = 'youtube' | 'store' | 'life' | 'other';
export type ProjectStatus = 'active' | 'resting' | 'completed' | 'archived';
export type SubStatus = 'planned' | 'active' | 'done' | 'paused';
export type StepStatus = 'todo' | 'doing' | 'done' | 'skipped';
export type MilestoneStatus = 'planned' | 'reached' | 'dropped';

export interface ProjectFields {
  title: string;
  kind: ProjectKind;
  summary: string;
  purpose: string;
  current_focus: string;
  next_action: string;
  vault_note: string | null;
}

export interface CurrentStep {
  id: string;
  title: string;
  start_on: string;
  end_on: string;
  status: StepStatus;
}

/** One project under a top project. */
export interface Sub {
  id: string;
  project_id: string;
  title: string;
  status: SubStatus;
  start_on: string;
  /** The target the owner set. */
  due_on: string;
  /** When it will likely finish, from the steps still to do. */
  forecast_on: string;
  late: boolean;
  /** Where the bar ends on the long timelines. */
  end_on: string;
  /** The span the project's own timeline shows, so no step falls outside it. */
  span_start: string;
  span_end: string;
  done_on: string | null;
  vault_note: string | null;
  sort_order: number;
  steps_done: number;
  steps_total: number;
  percent: number | null;
  current_step: CurrentStep | null;
}

export interface Step {
  id: string;
  subproject_id: string;
  position: number;
  title: string;
  start_on: string;
  end_on: string;
  status: StepStatus;
  done_on: string | null;
  note: string | null;
}

export interface ProcedureStep {
  id?: string;
  position?: number;
  title: string;
  days: number;
}

export interface Milestone {
  id: string;
  project_id: string;
  project_title: string;
  title: string;
  target_on: string;
  status: MilestoneStatus;
  reached_on: string | null;
  note: string | null;
}

export interface ProjectCard extends ProjectFields {
  id: string;
  status: ProjectStatus;
  sort_order: number;
  active: Sub[];
  next_planned: Sub | null;
  counts: { planned: number; active: number; done_this_year: number; done_total: number };
  next_milestone: { id: string; title: string; target_on: string } | null;
}

export interface ProjectOverview {
  today: string;
  projects: ProjectCard[];
  subprojects: Sub[];
  milestones: Milestone[];
  upcoming_milestones: Milestone[];
  overdue_milestones: Milestone[];
}

export interface ProjectDetail extends ProjectCard {
  today: string;
  subprojects: Sub[];
  procedure: ProcedureStep[];
  milestones: Milestone[];
}

export interface SubDetail extends Sub {
  today: string;
  top: { id: string; title: string; kind: ProjectKind; sort_order: number };
  steps: Step[];
  milestones: Milestone[];
}

export const projectApi = {
  overview: () => request<ProjectOverview>('GET', '/projects'),
  detail: (id: string) => request<ProjectDetail>('GET', `/projects/${id}`),
  create: (fields: ProjectFields & { sort_order?: number }) => request<{ id: string }>('POST', '/projects', fields),
  update: (id: string, fields: Partial<ProjectFields & { status: ProjectStatus }>) => request<unknown>('PATCH', `/projects/${id}`, fields),
  setProcedure: (id: string, steps: ProcedureStep[]) =>
    request<{ procedure: ProcedureStep[] }>('PUT', `/projects/${id}/procedure`, { steps: steps.map(({ title, days }) => ({ title, days })) }),
  addSub: (projectId: string, fields: { title: string; start_on: string; due_on?: string; use_procedure: boolean }) =>
    request<{ id: string }>('POST', `/projects/${projectId}/subprojects`, fields),
  sub: (id: string) => request<SubDetail>('GET', `/subprojects/${id}`),
  updateSub: (id: string, fields: Partial<Pick<Sub, 'title' | 'status' | 'start_on' | 'due_on' | 'vault_note'>> & { shift_steps?: boolean }) =>
    request<unknown>('PATCH', `/subprojects/${id}`, fields),
  deleteSub: (id: string) => request<void>('DELETE', `/subprojects/${id}`),
  applyProcedure: (id: string) => request<unknown>('POST', `/subprojects/${id}/apply-procedure`),
  addStep: (subId: string, fields: { title: string; start_on?: string; end_on?: string }) =>
    request<{ id: string }>('POST', `/subprojects/${subId}/steps`, fields),
  updateStep: (id: string, fields: Partial<Pick<Step, 'title' | 'start_on' | 'end_on' | 'status' | 'note'>> & { shift_following?: boolean }) =>
    request<unknown>('PATCH', `/steps/${id}`, fields),
  moveStep: (id: string, direction: -1 | 1) => request<unknown>('POST', `/steps/${id}/move`, { direction }),
  deleteStep: (id: string) => request<void>('DELETE', `/steps/${id}`),
  addMilestone: (projectId: string, title: string, target_on: string) =>
    request<{ id: string }>('POST', `/projects/${projectId}/milestones`, { title, target_on }),
  updateMilestone: (id: string, fields: Partial<Pick<Milestone, 'title' | 'target_on' | 'status' | 'note'>>) =>
    request<unknown>('PATCH', `/milestones/${id}`, fields),
  exportAll: () => request<unknown>('GET', '/export'),
  logout: () => request<unknown>('POST', '/logout'),
};
