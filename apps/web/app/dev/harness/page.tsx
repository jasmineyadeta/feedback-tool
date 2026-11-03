import { notFound } from 'next/navigation';
import { harnessEnabled, proxyEnterUrl, validateSiteUrl } from '@/lib/server/proxy';
import { env } from '@/lib/server/env';
import { Harness } from '@/components/harness';

export const dynamic = 'force-dynamic';

/** Test-only page used by Playwright e2e and `pnpm gate`. 404 unless harnessEnabled(). */
export default async function HarnessPage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string }>;
}) {
  if (!harnessEnabled()) notFound();
  const { url } = await searchParams;
  const chk = await validateSiteUrl(url ?? '');
  if (!chk.ok) return <p data-testid="harness-error">{chk.message}</p>;
  const enter = await proxyEnterUrl({ reviewId: 'harness', siteUrl: chk.url, etld1: chk.etld1 });
  return <Harness enterUrl={enter.url} proxyOrigin={enter.origin} appOrigin={env().APP_ORIGIN} />;
}
