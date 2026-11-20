import { NextResponse } from 'next/server';
import { db, type Query } from './db';
import { isLoggedIn } from './auth';
import { AppError } from './projects';

export function error(status: number, code: string, message: string) {
  return NextResponse.json({ code, message }, { status });
}

/**
 * Every API call: must be logged in; writes must also carry the app's own header,
 * which another site's page cannot add without a CORS approval this site never gives.
 */
export function handler<C>(run: (q: Query, request: Request, context: C) => Promise<unknown>, status = 200) {
  return async (request: Request, context: C) => {
    try {
      if (!(await isLoggedIn())) return error(401, 'login_required', '로그인이 필요합니다.');
      if (request.method !== 'GET' && request.headers.get('x-pm-request') !== '1') {
        return error(403, 'csrf_rejected', 'Missing app request header.');
      }
      const database = await db();
      // Reads run as they are; every change is one transaction (all of it saved, or none of it).
      const result =
        request.method === 'GET'
          ? await run(database.query, request, context)
          : await database.transaction((q) => run(q, request, context));
      return result === undefined ? new NextResponse(null, { status: 204 }) : NextResponse.json(result, { status });
    } catch (problem) {
      if (problem instanceof AppError) return error(problem.status, problem.code, problem.message);
      if (problem instanceof SyntaxError) return error(422, 'invalid_request', 'The request body is not JSON.');
      const message = problem instanceof Error ? problem.message : String(problem);
      if (/violates check constraint|violates foreign key/.test(message)) return error(422, 'constraint_failed', message);
      console.error(problem);
      return error(500, 'server_error', '저장하지 못했습니다.');
    }
  };
}

export async function body(request: Request): Promise<Record<string, unknown>> {
  const data = await request.json();
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new AppError(422, 'invalid_request', 'A JSON object is expected.');
  return data as Record<string, unknown>;
}

export type Params<K extends string> = { params: Promise<Record<K, string>> };
