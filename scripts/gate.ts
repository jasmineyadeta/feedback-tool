/**
 * pnpm gate — live proxy feasibility run (SPEC §8 M1, D3). Non-blocking for verify.
 * Starts its own app (:3200, harness enabled) and proxy (:8789, real DNS), then for each site in
 * docs/test-portfolios.json × {chromium, webkit-iphone}: health check, render, scripted interaction
 * causes a DOM change, tap produces an anchor, re-anchor succeeds after reload.
 * Writes docs/PLATFORM_SUPPORT.md, docs/gate-results.json and apps/web/lib/platform-policy.json.
 */
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium, webkit, devices, type Browser, type Page } from '@playwright/test';
import {
  checkUrlSyntax,
  dohResolver,
  resolveSiteUrl,
  signProxyToken,
} from '../packages/shared/src';

const APP = 'http://localhost:3200';
const PROXY = 'http://localhost:8789';
const SECRET = `gate-${Date.now()}-${Math.random().toString(36).slice(2)}`;
type Site = { url: string; role: string; platform_guess: string };
const sites: Site[] = JSON.parse(readFileSync('docs/test-portfolios.json', 'utf8')).sites;
const only = process.argv[2];

type BrowserResult = {
  pass: boolean;
  reason: string | null;
  steps: Record<string, boolean>;
  ms: number;
};
type Row = {
  url: string;
  guess: string;
  platform: string;
  reachable: boolean;
  health: {
    ok: boolean;
    status?: number;
    xfo?: string | null;
    csp?: boolean;
    reason?: string | null;
  };
  chromium?: BrowserResult;
  'webkit-iphone'?: BrowserResult;
};

function sbEnv(k: string): string {
  const out = execSync('supabase status -o env', {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return /^([A-Z_]+)="?(.*?)"?$/m.test(out)
    ? (new RegExp(`^${k}="?(.*?)"?$`, 'm').exec(out)?.[1] ?? '')
    : '';
}

function start(cmd: string, args: string[], env: Record<string, string>, cwd = '.'): ChildProcess {
  return spawn(cmd, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'ignore', 'ignore'],
    detached: true,
  });
}
async function waitFor(url: string, ms = 90_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* not yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`timeout waiting for ${url}`);
}

async function health(site: URL, etld1: string) {
  const t = await signProxyToken({ rid: 'gate', etld1, origin: site.origin }, SECRET);
  const res = await fetch(
    `${PROXY}/__health?t=${encodeURIComponent(t)}&p=${encodeURIComponent(site.pathname)}`,
  );
  return (await res.json()) as Row['health'] & { platform?: string };
}

type Msg = { type: string; [k: string]: unknown };
const msgs = (p: Page) =>
  p.evaluate(() => (window as unknown as { __ftMessages?: Msg[] }).__ftMessages ?? []);
async function waitMsg(p: Page, pred: (m: Msg) => boolean, ms: number): Promise<Msg | null> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const m = (await msgs(p)).find(pred);
    if (m) return m;
    await p.waitForTimeout(250);
  }
  return null;
}
const send = (p: Page, m: object) =>
  p.evaluate(
    (x) => (window as unknown as { __ftSend: (m: object) => void }).__ftSend({ ft: 1, ...x }),
    m,
  );

async function runBrowser(browser: Browser, device: object, site: string): Promise<BrowserResult> {
  const started = Date.now();
  const steps: Record<string, boolean> = {
    render: false,
    interaction: false,
    tap: false,
    reanchor: false,
  };
  const ctx = await browser.newContext(device);
  const page = await ctx.newPage();
  const fail = async (reason: string) => {
    await ctx.close();
    return { pass: false, reason, steps, ms: Date.now() - started };
  };
  try {
    await page.goto(`${APP}/dev/harness?url=${encodeURIComponent(site)}`, { timeout: 30_000 });
    const ready = await waitMsg(
      page,
      (m) => m.type === 'overlay:ready' || m.type === 'error',
      30_000,
    );
    if (!ready) return fail('overlay never reported ready (20s+)');
    if (ready.type === 'error') return fail(`proxy error: ${String(ready.code)}`);
    const frame = page.frameLocator('[data-testid=proxy-frame]');
    await page.waitForTimeout(2500); // let client JS hydrate / animate in
    const text = (
      await frame
        .locator('body')
        .innerText({ timeout: 10_000 })
        .catch(() => '')
    ).trim();
    const hasMedia =
      (await frame
        .locator('img, svg, canvas, video')
        .count()
        .catch(() => 0)) > 0;
    if (text.length < 20 && !hasMedia) return fail('page rendered blank');
    steps.render = true;

    // Scripted interaction: scroll, then hover + click a nav/header element; expect a DOM or URL change.
    const f = page.frames().find((x) => x.url().startsWith(PROXY));
    if (!f) return fail('frame not found');
    await f.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 3)).catch(() => {});
    await page.waitForTimeout(800);
    const before = await f
      .evaluate(() => document.body.innerHTML.length + location.href)
      .catch(() => '');
    // Pick a visible element that should cause a change: link to another page > in-page # link > menu/header button.
    // tsx/esbuild keepNames wraps functions in __name(); define it in the page (string eval, untransformed).
    await f.evaluate('window.__name = window.__name || ((fn) => fn)').catch(() => {});
    const probeTarget = await f
      .evaluate((proxy) => {
        const vis = (e: Element) => {
          const r = e.getBoundingClientRect();
          const cs = getComputedStyle(e);
          return (
            r.width > 4 &&
            r.height > 4 &&
            cs.visibility !== 'hidden' &&
            cs.display !== 'none' &&
            r.top < innerHeight * 3
          );
        };
        const all = Array.from(
          document.querySelectorAll('a[href], button, [role="button"]'),
        ).filter(vis);
        const here = location.pathname.replace(/\/$/, '');
        const pathOf = (a: Element) => {
          try {
            const u = new URL((a as HTMLAnchorElement).href);
            return u.origin === proxy ? u.pathname.replace(/\/$/, '') : null;
          } catch {
            return null;
          }
        };
        const navLinks = all.filter(
          (e) =>
            e.tagName === 'A' &&
            pathOf(e) !== null &&
            pathOf(e) !== here &&
            !/cart|login|sign|account/i.test(pathOf(e)!),
        );
        const hashLinks = all.filter(
          (e) =>
            e.tagName === 'A' && pathOf(e) === here && (e as HTMLAnchorElement).hash.length > 1,
        );
        const buttons = all.filter(
          (e) => e.tagName !== 'A' && e.closest('nav, header, [class*="menu" i], [class*="nav" i]'),
        );
        const choice =
          navLinks[0] ?? hashLinks[0] ?? buttons[0] ?? all.find((e) => e.tagName !== 'A');
        if (!choice) return null;
        choice.setAttribute('data-ft-gate', '1');
        return `${choice.tagName.toLowerCase()} ${(choice.textContent ?? '').trim().slice(0, 30)}`;
      }, PROXY)
      .catch((e) => (console.error('probe error:', String(e).slice(0, 160)), null));
    const target = frame.locator('[data-ft-gate]').first();
    let interacted = false;
    if (probeTarget)
      try {
        await target.hover({ timeout: 5000 });
        await target.click({ timeout: 5000 });
        await page.waitForTimeout(2500);
        const f2 = page.frames().find((x) => x.url().startsWith(PROXY)) ?? f;
        const after = await f2
          .evaluate(() => document.body.innerHTML.length + location.href)
          .catch(() => '');
        interacted = after !== '' && after !== before;
      } catch {
        interacted = false;
      }
    steps.interaction = interacted;

    // Tap → anchor (pick mode) on a heading or paragraph, then reload and re-anchor.
    await page.evaluate(
      () => ((window as unknown as { __ftMessages: unknown[] }).__ftMessages = []),
    );
    await page.goto(`${APP}/dev/harness?url=${encodeURIComponent(site)}`, { timeout: 30_000 });
    if (!(await waitMsg(page, (m) => m.type === 'overlay:ready', 30_000)))
      return fail('overlay not ready on second load');
    await page.waitForTimeout(2500);
    await send(page, { type: 'pick:start' });
    const el = frame.locator('h1:visible, h2:visible, p:visible').first();
    await el.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
    await el.click({ timeout: 5000, force: true }).catch(() => {});
    const picked = await waitMsg(page, (m) => m.type === 'anchor:picked', 8000);
    steps.tap = !!picked;
    if (picked) {
      await page.reload();
      if (await waitMsg(page, (m) => m.type === 'overlay:ready', 30_000)) {
        await page.waitForTimeout(2500);
        await send(page, {
          type: 'anchor:show',
          requestId: 'g',
          anchor: picked.anchor,
          label: '1',
        });
        const loc = await waitMsg(page, (m) => m.type === 'anchor:located', 8000);
        steps.reanchor = !!loc && loc.found === true;
      }
    }
    await ctx.close();
    const pass = Object.values(steps).every(Boolean);
    const reason = pass
      ? null
      : `failed: ${Object.entries(steps)
          .filter(([, v]) => !v)
          .map(([k]) => k)
          .join(', ')}`;
    return { pass, reason, steps, ms: Date.now() - started };
  } catch (e) {
    return fail(
      `exception: ${(e instanceof Error ? e.message : String(e)).split('\n')[0]!.slice(0, 120)}`,
    );
  }
}

async function main() {
  console.info('Building overlay + app…');
  execSync('pnpm --filter @ft/overlay build && node apps/proxy/scripts-gen-overlay.mjs', {
    stdio: 'ignore',
  });
  execSync('pnpm --filter @ft/web build', { stdio: 'ignore' });
  const commonEnv = { APP_ORIGIN: APP, PROXY_ORIGIN: PROXY, PROXY_TOKEN_SECRET: SECRET };
  writeFileSync(
    'apps/proxy/.dev.vars.gate',
    `PROXY_TOKEN_SECRET=${SECRET}\nENVIRONMENT=development\nAPP_ORIGIN=${APP}\nALLOWED_APP_ORIGINS=${APP}\n`,
  );
  const procs = [
    start('pnpm', ['--filter', '@ft/web', 'exec', 'next', 'start', '--port', '3200'], {
      ...commonEnv,
      NODE_ENV: 'production',
      ENABLE_TEST_HARNESS: '1',
      SUPABASE_URL: sbEnv('API_URL'),
      SUPABASE_ANON_KEY: sbEnv('ANON_KEY'),
      SUPABASE_SERVICE_ROLE_KEY: sbEnv('SERVICE_ROLE_KEY'),
    }),
    start(
      'pnpm',
      [
        'exec',
        'wrangler',
        'dev',
        '--env-file',
        '.dev.vars.gate',
        '--port',
        '8789',
        '--ip',
        '127.0.0.1',
        '--log-level',
        'error',
      ],
      {},
      'apps/proxy',
    ),
  ];
  const stop = () => procs.forEach((p) => p.pid && process.kill(-p.pid, 'SIGTERM'));
  process.on('SIGINT', () => (stop(), process.exit(1)));
  try {
    await waitFor(`${APP}/api/health`);
    await waitFor(`${PROXY}/__ping`);
    const browsers = {
      chromium: { b: await chromium.launch(), d: devices['Desktop Chrome'] },
      'webkit-iphone': { b: await webkit.launch(), d: devices['iPhone 14'] },
    } as const;
    const rows: Row[] = [];
    for (const s of sites.filter((x) => !only || x.url.includes(only))) {
      const resolved = await resolveSiteUrl(s.url, dohResolver());
      const syn = resolved.ok ? checkUrlSyntax(resolved.url.toString()) : checkUrlSyntax(s.url);
      if (resolved.ok && resolved.hops) console.info(`${s.url} redirects to ${resolved.url}`);
      const row: Row = {
        url: s.url,
        guess: s.platform_guess,
        platform: 'unknown',
        reachable: false,
        health: { ok: false },
      };
      if (!syn.ok) {
        row.health = { ok: false, reason: syn.reason };
        rows.push(row);
        continue;
      }
      const h = await health(syn.url, syn.etld1).catch((e) => ({ ok: false, reason: String(e) }));
      row.health = h;
      row.platform = (h as { platform?: string }).platform ?? 'unknown';
      row.reachable = h.ok || (typeof h.status === 'number' && h.status < 500 && h.status !== 404);
      console.info(
        `${s.url}  health=${h.ok ? 'ok' : (h.reason ?? 'fail')}  platform=${row.platform}`,
      );
      if (h.ok) {
        for (const [name, { b, d }] of Object.entries(browsers)) {
          const r = await runBrowser(b, d, syn.url.toString());
          (row as Record<string, unknown>)[name] = r;
          console.info(
            `   ${name.padEnd(14)} ${r.pass ? 'PASS' : 'FAIL'} ${r.reason ?? ''} (${(r.ms / 1000).toFixed(1)}s)`,
          );
        }
      }
      rows.push(row);
    }
    await Promise.all(Object.values(browsers).map((x) => x.b.close()));
    report(rows);
  } finally {
    stop();
  }
}

function report(rows: Row[]) {
  const reachable = rows.filter((r) => r.reachable);
  const passBoth = reachable.filter((r) => r.chromium?.pass && r['webkit-iphone']?.pass);
  const rate = reachable.length ? passBoth.length / reachable.length : 0;
  const plat = (p: string) =>
    passBoth.filter((r) => r.platform === p || (r.platform === 'unknown' && r.guess === p)).length;
  const framer = plat('framer');
  const webflow = plat('webflow');
  const gatePass = rate >= 0.7 && framer >= 2 && webflow >= 2;

  // D3: platforms with any reachable failure go to Screenshot mode by default (auto-chosen at health check).
  const failingPlatforms = new Set<string>();
  const passingPlatforms = new Set<string>();
  for (const r of reachable) {
    const ok = r.chromium?.pass && r['webkit-iphone']?.pass;
    (ok ? passingPlatforms : failingPlatforms).add(r.platform);
  }
  const screenshotPlatforms = gatePass
    ? []
    : [...failingPlatforms].filter((p) => !passingPlatforms.has(p)).sort();
  const mixedPlatforms = [...failingPlatforms].filter((p) => passingPlatforms.has(p)).sort();

  const date = new Date().toISOString().slice(0, 10);
  writeFileSync(
    'docs/gate-results.json',
    JSON.stringify({ date, rate, framer, webflow, gatePass, rows }, null, 2) + '\n',
  );
  writeFileSync(
    'apps/web/lib/platform-policy.json',
    JSON.stringify({ source: `pnpm gate ${date}`, gatePass, screenshotPlatforms }, null, 2) + '\n',
  );
  const cell = (r?: BrowserResult) => (!r ? '—' : r.pass ? '✅ pass' : `❌ ${r.reason}`);
  const lines = [
    '# Platform support (generated by `pnpm gate`)',
    '',
    `Run: ${date}. Each site goes through the proxy health check, then Playwright (chromium desktop + WebKit iPhone 14): render, scripted interaction (scroll + hover/click a nav element → DOM/URL change), tap → anchor, re-anchor after reload.`,
    '',
    '## D3 result',
    '',
    `- Reachable sites: **${reachable.length}/${rows.length}**; passing on both browsers: **${passBoth.length}** → **${Math.round(rate * 100)}%** (threshold 70%).`,
    `- Framer passes: **${framer}** (need ≥2). Webflow passes: **${webflow}** (need ≥2).`,
    `- Gate: **${gatePass ? 'PASS — live mode is the default for all platforms' : 'BELOW THRESHOLD — Screenshot mode is mandatory for failing platform fingerprints'}**.`,
    gatePass
      ? ''
      : `- Screenshot mode auto-chosen at health check for: ${screenshotPlatforms.length ? screenshotPlatforms.map((p) => `\`${p}\``).join(', ') : '(none — failures are per-site, the per-site headless check decides)'}.`,
    mixedPlatforms.length
      ? `- Mixed results (some sites pass, some fail) for: ${mixedPlatforms.map((p) => `\`${p}\``).join(', ')} — these stay live by default; the per-review headless health check falls back to Screenshot mode for individual sites that fail.`
      : '',
    '',
    '## Sites',
    '',
    '| URL | Platform (fingerprint / guess) | Health | XFO / CSP upstream | Chromium | WebKit iPhone |',
    '|---|---|---|---|---|---|',
    ...rows.map(
      (r) =>
        `| ${r.url} | ${r.platform} / ${r.guess} | ${r.health.ok ? 'ok' : `❌ ${r.health.reason ?? r.health.status ?? ''}`} | ${r.health.xfo ?? '—'} / ${r.health.csp ? 'yes' : 'no'} | ${cell(r.chromium)} | ${cell(r['webkit-iphone'])} |`,
    ),
    '',
    '## Known limits',
    '',
    '- Only the HTML document is proxied; assets load from the original host. Sites that block cross-origin asset loading by Referer, or that require cookies/login, will not work.',
    '- Service workers and form submission are disabled in review mode by design.',
    '- One upstream host per review session on the Phase A single proxy host; other subdomains of the same site switch the host.',
    '- Results reflect these sites on the run date; sites change. Re-run with `pnpm gate` (or `pnpm gate <substring>` for one site).',
    '',
  ];
  writeFileSync(
    'docs/PLATFORM_SUPPORT.md',
    lines.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n'),
  );
  console.info(
    `\nGate ${gatePass ? 'PASS' : 'BELOW THRESHOLD'}: ${Math.round(rate * 100)}% (framer ${framer}, webflow ${webflow}). Report: docs/PLATFORM_SUPPORT.md`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
