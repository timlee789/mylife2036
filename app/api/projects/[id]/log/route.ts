import { body, handler, type Params } from '@/lib/http';
import { addLog } from '@/lib/projects';

export const POST = handler<Params<'id'>>(
  async (q, request, { params }) => ({ id: await addLog(q, (await params).id, await body(request)) }),
  201,
);
