import path from 'node:path';
import { SCHEMA_SQL } from './schema';

export type Row = Record<string, unknown>;
export type Query = (text: string, params?: unknown[]) => Promise<Row[]>;

let ready: Promise<Query> | null = null;

/** Split the schema into single statements: the Neon HTTP driver runs one statement per call. */
export function statements(sqlText: string): string[] {
  return sqlText
    .replace(/^\s*--.*$/gm, '')
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function ensureSchema(query: Query): Promise<void> {
  for (const statement of statements(SCHEMA_SQL)) await query(statement);
}

async function open(): Promise<Query> {
  let query: Query;
  const url = process.env.DATABASE_URL;
  if (url) {
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(url);
    query = async (text, params = []) => (await sql.query(text, params)) as Row[];
  } else {
    // Local development: a Postgres in a folder, no server to install.
    const { PGlite } = await import('@electric-sql/pglite');
    const db = new PGlite(process.env.PGLITE_DIR ?? path.join(process.cwd(), '.pglite'));
    query = async (text, params = []) => (await db.query<Row>(text, params)).rows;
  }
  await ensureSchema(query);
  return query;
}

/** The database, schema checked once per server process. */
export function db(): Promise<Query> {
  if (!ready) {
    ready = open().catch((problem) => {
      ready = null; // let the next request try again
      throw problem;
    });
  }
  return ready;
}

/** Tests hand in their own in-memory database. */
export function useDatabaseForTests(query: Query): void {
  ready = Promise.resolve(query);
}
