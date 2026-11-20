import { handler } from '@/lib/http';
import { exportAll } from '@/lib/projects';

export const GET = handler((q) => exportAll(q));
