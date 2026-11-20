// Project site schema (Postgres: Neon in production, PGlite locally).
// Kept in code, not a .sql file, so it is always bundled with the server functions on Vercel.
// Every statement is idempotent; the app runs it once per server start.
export const SCHEMA_SQL = String.raw`

CREATE TABLE IF NOT EXISTS projects (
  id text PRIMARY KEY,
  title text NOT NULL CHECK (length(trim(title)) > 0),
  kind text NOT NULL CHECK (kind IN ('youtube','store','life','other')),
  summary text NOT NULL DEFAULT '',
  purpose text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','resting','completed','archived')),
  current_focus text NOT NULL DEFAULT '',
  next_action text NOT NULL DEFAULT '',
  vault_note text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- project_items and project_log: the first version's episode-level work items and work log.
-- No longer shown (the site plans the flow only); kept so old data stays in the backup export.
CREATE TABLE IF NOT EXISTS project_items (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (length(trim(title)) > 0),
  series text,
  stage text NOT NULL DEFAULT 'idea' CHECK (stage IN ('idea','prep','make','finish','done','hold')),
  due_on text CHECK (due_on IS NULL OR due_on ~ '^\d{4}-\d{2}-\d{2}$'),
  done_on text CHECK (done_on IS NULL OR done_on ~ '^\d{4}-\d{2}-\d{2}$'),
  link text,
  note text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK ((stage = 'done') = (done_on IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_project_items_project ON project_items(project_id, stage);

CREATE TABLE IF NOT EXISTS project_milestones (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (length(trim(title)) > 0),
  target_on text NOT NULL CHECK (target_on ~ '^\d{4}-\d{2}-\d{2}$'),
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','reached','dropped')),
  reached_on text CHECK (reached_on IS NULL OR reached_on ~ '^\d{4}-\d{2}-\d{2}$'),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'reached') = (reached_on IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_project_milestones_target ON project_milestones(project_id, target_on);

CREATE TABLE IF NOT EXISTS project_log (
  id serial PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  item_id text REFERENCES project_items(id) ON DELETE SET NULL,
  logged_on text NOT NULL CHECK (logged_on ~ '^\d{4}-\d{2}-\d{2}$'),
  kind text NOT NULL CHECK (kind IN ('note','created','stage','milestone')),
  text text NOT NULL CHECK (length(trim(text)) > 0),
  minutes integer CHECK (minutes IS NULL OR minutes >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_project_log_project ON project_log(project_id, logged_on);

-- project_phases: the second version's month-long phases, converted to subprojects on 2026-11-20.
-- No longer shown; kept so old data stays in the backup export.
-- One stretch of work on the timeline: "EP002~EP010 제작기", "메뉴 사진 리뉴얼".
-- Months are 'YYYY-MM'. The materials themselves live in Obsidian, not here.
CREATE TABLE IF NOT EXISTS project_phases (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (length(trim(title)) > 0),
  start_month text NOT NULL CHECK (start_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  end_month text NOT NULL CHECK (end_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','active','done','paused')),
  goal text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK (end_month >= start_month)
);
CREATE INDEX IF NOT EXISTS idx_project_phases_project ON project_phases(project_id, start_month);

-- Top project -> projects -> steps.
-- A top project (e.g. 규영, 책에게 묻다) keeps one standard procedure: the steps every project under it follows.
CREATE TABLE IF NOT EXISTS procedure_steps (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  position integer NOT NULL,
  title text NOT NULL CHECK (length(trim(title)) > 0),
  days integer NOT NULL DEFAULT 3 CHECK (days BETWEEN 1 AND 365)
);
CREATE INDEX IF NOT EXISTS idx_procedure_steps_project ON procedure_steps(project_id, position);

-- One project under a top project (e.g. 「죽음의 수용소에서」). Dates are 'YYYY-MM-DD'.
CREATE TABLE IF NOT EXISTS subprojects (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (length(trim(title)) > 0),
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','active','done','paused')),
  start_on text NOT NULL CHECK (start_on ~ '^\d{4}-\d{2}-\d{2}$'),
  due_on text NOT NULL CHECK (due_on ~ '^\d{4}-\d{2}-\d{2}$'),
  done_on text CHECK (done_on IS NULL OR done_on ~ '^\d{4}-\d{2}-\d{2}$'),
  vault_note text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK (due_on >= start_on),
  CHECK ((status = 'done') = (done_on IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_subprojects_project ON subprojects(project_id, start_on);

-- The steps of one project, copied from the procedure and then scheduled on its own timeline.
CREATE TABLE IF NOT EXISTS subproject_steps (
  id text PRIMARY KEY,
  subproject_id text NOT NULL REFERENCES subprojects(id) ON DELETE RESTRICT,
  position integer NOT NULL,
  title text NOT NULL CHECK (length(trim(title)) > 0),
  start_on text NOT NULL CHECK (start_on ~ '^\d{4}-\d{2}-\d{2}$'),
  end_on text NOT NULL CHECK (end_on ~ '^\d{4}-\d{2}-\d{2}$'),
  status text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','doing','done','skipped')),
  done_on text CHECK (done_on IS NULL OR done_on ~ '^\d{4}-\d{2}-\d{2}$'),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK (end_on >= start_on),
  CHECK ((status = 'done') = (done_on IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_subproject_steps_sub ON subproject_steps(subproject_id, position);
`;
