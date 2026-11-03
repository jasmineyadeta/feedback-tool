import { describe, expect, it } from 'vitest';
import { checkUrl, checkUrlSyntax, isPrivateIp, fixtureHosts, sameEtld1 } from '../src';

const pub = async () => ['93.184.215.14'];

describe('URL validator (SPEC §7)', () => {
  it.each([
    ['file:///etc/passwd', 'scheme'],
    ['javascript:alert(1)', 'scheme'],
    ['http://example.com', 'scheme'],
    ['ftp://example.com', 'scheme'],
    ['https://localhost/', 'local-host'],
    ['https://foo.localhost/', 'local-host'],
    ['https://printer.local/', 'local-host'],
    ['https://intranet/', 'local-host'],
    ['https://127.0.0.1/', 'private-ip'],
    ['https://[::1]/', 'private-ip'],
    ['https://10.1.2.3/', 'private-ip'],
    ['https://172.16.0.1/', 'private-ip'],
    ['https://172.31.255.255/', 'private-ip'],
    ['https://192.168.1.1/', 'private-ip'],
    ['https://169.254.169.254/latest/meta-data', 'private-ip'],
    ['https://[fc00::1]/', 'private-ip'],
    ['https://[fd12:3456::1]/', 'private-ip'],
    ['https://[fe80::1]/', 'private-ip'],
    ['https://[::ffff:127.0.0.1]/', 'private-ip'],
    ['https://[::ffff:7f00:1]/', 'private-ip'],
    ['https://2130706433/', 'private-ip'], // decimal 127.0.0.1
    ['https://0177.0.0.1/', 'private-ip'], // octal
    ['https://0x7f.0.0.1/', 'private-ip'], // hex
    ['https://127.1/', 'private-ip'], // short form
    ['https://0/', 'private-ip'],
    ['https://user:pw@example.com/', 'credentials'],
    ['https://example.com:8443/', 'port'],
    ['https://8.8.8.8/', 'no-domain'],
    ['not a url', 'invalid'],
  ])('rejects %s (%s)', (u, reason) => {
    const r = checkUrlSyntax(u);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe(reason);
  });

  it('accepts a public https URL and computes eTLD+1', async () => {
    const r = await checkUrl('https://www.Example.co.uk/work#top', pub);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.etld1).toBe('example.co.uk');
      expect(r.url.hash).toBe('');
    }
  });

  it('treats private PSL suffixes as their own registrable domain', () => {
    const r = checkUrlSyntax('https://danshettysite.webflow.io/');
    expect(r.ok && r.etld1).toBe('danshettysite.webflow.io');
  });

  it('rejects public names that resolve to private addresses (DNS rebinding at check time)', async () => {
    const r = await checkUrl('https://evil.example.com/', async () => [
      '93.184.215.14',
      '10.0.0.5',
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('private-ip');
  });

  it('rejects unresolvable names', async () => {
    const r = await checkUrl('https://nope.example.com/', async () => []);
    expect(!r.ok && r.reason).toBe('unresolvable');
    const r2 = await checkUrl('https://nope.example.com/', async () => {
      throw new Error('x');
    });
    expect(!r2.ok && r2.reason).toBe('unresolvable');
  });

  it('private IP classifier', () => {
    for (const ip of [
      '100.64.0.1',
      '0.0.0.0',
      '224.0.0.1',
      '255.255.255.255',
      '::',
      '64:ff9b::a00:1',
    ])
      expect(isPrivateIp(ip), ip).toBe(true);
    for (const ip of ['1.1.1.1', '93.184.215.14', '2606:4700::1111'])
      expect(isPrivateIp(ip), ip).toBe(false);
  });
});

describe('ALLOW_FIXTURE_HOSTS', () => {
  it('is honored only when ENVIRONMENT=test', async () => {
    const allowHosts = 'localhost:4601';
    expect(fixtureHosts({ environment: 'test', allowHosts }).has('localhost:4601')).toBe(true);
    for (const environment of ['development', 'production', undefined, 'TEST']) {
      expect(fixtureHosts({ environment, allowHosts }).size).toBe(0);
      const r = await checkUrl('http://localhost:4601/', pub, { environment, allowHosts });
      expect(r.ok).toBe(false);
    }
    const ok = await checkUrl('http://localhost:4601/', pub, { environment: 'test', allowHosts });
    expect(ok.ok).toBe(true);
  });
});

describe('sameEtld1', () => {
  it('matches host and subdomains only', () => {
    expect(sameEtld1('www.foo.com', 'foo.com')).toBe(true);
    expect(sameEtld1('foo.com', 'foo.com')).toBe(true);
    expect(sameEtld1('evilfoo.com', 'foo.com')).toBe(false);
  });
});
