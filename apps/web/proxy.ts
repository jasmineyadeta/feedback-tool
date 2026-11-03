import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/** Refreshes the owner's Supabase session cookie on owner pages (Next 16 `proxy`, formerly middleware). */
export async function proxy(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return res;
  const sb = createServerClient(url, key, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) req.cookies.set(name, value);
        res = NextResponse.next({ request: req });
        for (const { name, value, options } of list)
          res.cookies.set(name, value, { ...options, httpOnly: true, sameSite: 'lax' });
      },
    },
  });
  await sb.auth.getUser();
  return res;
}

export const config = { matcher: ['/reviews/:path*', '/api/reviews/:path*'] };
