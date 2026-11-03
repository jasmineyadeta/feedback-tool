import 'server-only';
import { NextResponse } from 'next/server';
import type { z } from 'zod';
import { adminClient } from './supabase';

const NO_STORE = { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' };

/** Error responses say what happened and what to do next (CLAUDE.md copy rules). */
export function fail(status: number, message: string, code = 'error') {
  return NextResponse.json({ error: { code, message } }, { status, headers: NO_STORE });
}
export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status, headers: NO_STORE });
}
export const notFound = () =>
  fail(404, "We couldn't find that. Check the link and try again.", 'not_found');
export const unauthorized = () =>
  fail(401, 'Your session has ended. Sign in again to continue.', 'unauthorized');

export async function parseJson<S extends z.ZodType>(
  req: Request,
  schema: S,
): Promise<{ ok: true; data: z.output<S> } | { ok: false; res: NextResponse }> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return {
      ok: false,
      res: fail(400, "We couldn't read that request. Reload the page and try again.", 'bad_json'),
    };
  }
  const r = schema.safeParse(body);
  if (!r.success)
    return {
      ok: false,
      res: fail(
        400,
        'Some details are missing or too long. Check the form and try again.',
        'invalid',
      ),
    };
  return { ok: true, data: r.data };
}

/** Postgres token bucket (SPEC §7). Returns false when over the limit. */
export async function rateLimit(
  key: string,
  capacity: number,
  perSeconds: number,
): Promise<boolean> {
  const { data, error } = await adminClient().rpc('take_token', {
    p_key: key,
    p_capacity: capacity,
    p_refill_seconds: perSeconds,
  });
  if (error) {
    console.error('rate limit check failed', error.code);
    return true; // fail open on infra error; limits are abuse protection, not auth
  }
  return data === true;
}
export const tooMany = () =>
  fail(429, "You're doing that a lot. Wait a minute and try again.", 'rate_limited');
