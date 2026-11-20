import { body, handler, type Params } from '@/lib/http';
import { moveStep } from '@/lib/projects';

export const POST = handler<Params<'id'>>(async (q, request, { params }) => ({
  result: await moveStep(q, (await params).id, (await body(request)).direction),
}));
