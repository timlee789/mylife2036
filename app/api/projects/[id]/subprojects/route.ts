import { body, handler, type Params } from '@/lib/http';
import { createSubproject } from '@/lib/projects';

export const POST = handler<Params<'id'>>(
  async (q, request, { params }) => ({ id: await createSubproject(q, (await params).id, await body(request)) }),
  201,
);
