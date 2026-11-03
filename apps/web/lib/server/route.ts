import 'server-only';
import { fail } from './http';
import { UserError } from './reviews';

/** Wrap a route handler: UserError → friendly message; anything else → generic 500 without details. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof UserError) return fail(e.status, e.message, e.code);
    console.error('route error', e instanceof Error ? e.name : 'unknown');
    return fail(500, 'Something went wrong on our side. Try again in a moment.', 'server');
  }
}
