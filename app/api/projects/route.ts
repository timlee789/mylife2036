import { body, handler } from '@/lib/http';
import { createProject, overview } from '@/lib/projects';

export const GET = handler((q) => overview(q));
export const POST = handler(async (q, request) => ({ id: await createProject(q, await body(request)) }), 201);
