import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

/** Per-request client acting as the signed-in owner (RLS applies). Server-only (D31). */
export async function userClient(): Promise<SupabaseClient> {
  const jar = await cookies();
  const e = env();
  return createServerClient(e.SUPABASE_URL, e.SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list)
            jar.set(name, value, { ...options, httpOnly: true, sameSite: 'lax' });
        } catch {
          /* called from a Server Component: proxy.ts refreshes cookies instead */
        }
      },
    },
  });
}

let admin: SupabaseClient | null = null;
/** Service-role client. Only for reviewer routes (explicit invite_id scoping) and storage after authz. */
export function adminClient(): SupabaseClient {
  if (!admin) {
    const e = env();
    admin = createClient(e.SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return admin;
}

export async function currentUser() {
  const sb = await userClient();
  const { data } = await sb.auth.getUser();
  return data.user ?? null;
}

/** Rewrite a Supabase URL so the browser reaches it through the app (`/sb/*`, D31). */
export function viaApp(url: string): string {
  const u = new URL(url);
  return `${env().APP_ORIGIN}/sb${u.pathname}${u.search}`;
}
