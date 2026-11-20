import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

export const COOKIE = 'pm_session';
const DAYS = 30;

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error('SESSION_SECRET must be set (at least 32 characters).');
  return value;
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** A cookie value that says "logged in until <time>", signed so it cannot be forged. */
export function makeSession(now = Date.now()): { value: string; maxAge: number } {
  const maxAge = DAYS * 24 * 60 * 60;
  const payload = `v1.${now + maxAge * 1000}`;
  return { value: `${payload}.${sign(payload)}`, maxAge };
}

export function validSession(value: string | undefined, now = Date.now()): boolean {
  if (!value) return false;
  const at = value.lastIndexOf('.');
  if (at < 0) return false;
  const payload = value.slice(0, at);
  const [version, expires] = payload.split('.');
  if (version !== 'v1' || !(Number(expires) > now)) return false;
  return same(value.slice(at + 1), sign(payload));
}

export function passwordMatches(given: unknown): boolean {
  const expected = process.env.SITE_PASSWORD;
  if (!expected) throw new Error('SITE_PASSWORD must be set.');
  // Compare hashes so the comparison time does not depend on where the texts differ.
  const h = (s: string) => createHmac('sha256', 'pm-password').update(s).digest('hex');
  return typeof given === 'string' && same(h(given), h(expected));
}

export async function isLoggedIn(): Promise<boolean> {
  return validSession((await cookies()).get(COOKIE)?.value);
}
