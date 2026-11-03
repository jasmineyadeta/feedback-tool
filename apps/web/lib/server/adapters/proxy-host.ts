import 'server-only';
import type { ProxyHost } from '@ft/shared';
import { env } from '../env';

/** Phase A: one proxy host, `__enter` cookie flow (SPEC §6). */
export function localProxyHost(origin = env().PROXY_ORIGIN): ProxyHost {
  const o = new URL(origin).origin;
  return {
    name: 'local',
    originFor: () => o,
    enterUrl: (_reviewId, token, path) => {
      const u = new URL('/__enter', o);
      u.searchParams.set('t', token);
      u.searchParams.set('p', path.startsWith('/') ? path : '/');
      return u.toString();
    },
  };
}
