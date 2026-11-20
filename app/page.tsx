import { redirect } from 'next/navigation';
import { isLoggedIn } from '@/lib/auth';
import { Projects } from '@/components/Projects';

export const dynamic = 'force-dynamic';

export default async function Home() {
  if (!(await isLoggedIn())) redirect('/login');
  return <Projects />;
}
