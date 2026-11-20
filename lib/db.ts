import path from 'node:path';
import type { PGlite } from '@electric-sql/pglite';
import { SCHEMA_SQL } from './schema';

export type Row = Record<string, unknown>;
export type Query = (text: string, params?: unknown[]) => Promise<Row[]>;

/**
 * Reads go straight to `query`. Every change goes through `transaction`, so one user action
 * (e.g. moving a step and every step after it) is saved completely or not at all.
 */
export interface Database {
  query: Query;
  transaction<T>(work: (q: Query) => Promise<T>): Promise<T>;
}

let ready: Promise<Database> | null = null;

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

/** PGlite (local development and tests). It runs one transaction at a time. */
export function pgliteDatabase(db: PGlite): Database {
  return {
    query: async (text, params = []) => (await db.query<Row>(text, params)).rows,
    transaction: (work) => db.transaction((tx) => work(async (text, params = []) => (await tx.query<Row>(text, params)).rows)),
  };
}

async function neonDatabase(url: string): Promise<Database> {
  const { neon, neonConfig, Pool } = await import('@neondatabase/serverless');
  if (typeof WebSocket !== 'undefined') neonConfig.webSocketConstructor = WebSocket;
  const sql = neon(url);
  return {
    query: async (text, params = []) => (await sql.query(text, params)) as Row[],
    // A transaction needs one connection for its whole life: a WebSocket pool, closed afterwards
    // because a serverless function must not keep connections between requests.
    async transaction(work) {
      const pool = new Pool({ connectionString: url });
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await work(async (text, params = []) => (await client.query(text, params)).rows as Row[]);
        await client.query('COMMIT');
        return result;
      } catch (problem) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw problem;
      } finally {
        client.release();
        await pool.end();
      }
    },
  };
}

async function open(): Promise<Database> {
  const url = process.env.DATABASE_URL;
  let database: Database;
  if (url) {
    database = await neonDatabase(url);
  } else {
    // Local development: a Postgres in a folder, no server to install.
    const { PGlite } = await import('@electric-sql/pglite');
    database = pgliteDatabase(new PGlite(process.env.PGLITE_DIR ?? path.join(process.cwd(), '.pglite')));
  }
  await ensureSchema(database.query);
  return database;
}

/** The database, schema checked once per server process. */
export function db(): Promise<Database> {
  if (!ready) {
    ready = open().catch((problem) => {
      ready = null; // let the next request try again
      throw problem;
    });
  }
  return ready;
}
