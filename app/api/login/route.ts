import { NextResponse } from 'next/server';
import { COOKIE, makeSession, passwordMatches } from '@/lib/auth';

export async function POST(request: Request) {
  if (request.headers.get('x-pm-request') !== '1') {
    return NextResponse.json({ code: 'csrf_rejected', message: 'Missing app request header.' }, { status: 403 });
  }
  const data = await request.json().catch(() => null);
  if (!passwordMatches(data?.password)) {
    await new Promise((resolve) => setTimeout(resolve, 800)); // slows down guessing
    return NextResponse.json({ code: 'wrong_password', message: '비밀번호가 맞지 않습니다.' }, { status: 401 });
  }
  const session = makeSession();
  const reply = NextResponse.json({ ok: true });
  reply.cookies.set(COOKIE, session.value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: session.maxAge,
  });
  return reply;
}
