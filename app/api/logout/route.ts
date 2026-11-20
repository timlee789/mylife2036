import { NextResponse } from 'next/server';
import { COOKIE } from '@/lib/auth';

export async function POST() {
  const reply = NextResponse.json({ ok: true });
  reply.cookies.delete(COOKIE);
  return reply;
}
