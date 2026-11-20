import { redirect } from 'next/navigation';
import { isLoggedIn } from '@/lib/auth';
import { LoginForm } from '@/components/LoginForm';

export const dynamic = 'force-dynamic';

export default async function Login() {
  if (await isLoggedIn()) redirect('/');
  return <LoginForm />;
}
