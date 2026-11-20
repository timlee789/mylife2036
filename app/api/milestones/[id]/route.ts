import { body, handler, type Params } from '@/lib/http';
import { updateMilestone } from '@/lib/projects';

export const PATCH = handler<Params<'id'>>(async (q, request, { params }) => ({
  result: await updateMilestone(q, (await params).id, await body(request)),
}));
