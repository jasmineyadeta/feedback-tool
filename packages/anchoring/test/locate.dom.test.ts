import { describe, expect, it } from 'vitest';
import { buildDomAnchor, locate, meaningfulTarget } from '../src';

const PAGE = `
<nav><a href="/">Home</a></nav>
<header><img src="/img/logo.svg" alt="Ada logo"><h1>Product designer crafting calm tools</h1></header>
<section id="work"><h2>Selected work</h2>
  <article><h3>Checkout redesign</h3><p>Reduced drop-off by simplifying the payment step.</p></article>
  <article><h3>Onboarding flow</h3><p>Rebuilt the first-run experience with fewer questions.</p></article>
</section>
<section><h2>Skills</h2><ul><li>Research</li><li>Prototyping</li></ul></section>
<section><h2>More</h2><ul><li>Research</li><li>Writing</li></ul></section>`;

function doc(html: string): Document {
  document.body.innerHTML = html;
  return document;
}
const page = { pageUrl: 'https://x.test/', pagePath: '/' };
const anchorFor = (sel: string, nth = 0) => {
  const d = doc(PAGE);
  return buildDomAnchor(d.querySelectorAll(sel)[nth]!, page);
};

describe('buildDomAnchor', () => {
  it('captures quote, descriptor, heading context and paths', () => {
    const a = anchorFor('article p', 1);
    expect(a.textQuote?.exact).toBe('Rebuilt the first-run experience with fewer questions.');
    expect(a.textQuote?.prefix).toContain('Onboarding flow');
    expect(a.elementDescriptor.tag).toBe('p');
    expect(a.elementDescriptor.headingContext).toBe('Onboarding flow');
    expect(a.cssPath).toContain('#work');
    expect(a.nthPath).toMatch(/^\d+(\/\d+)*$/);
  });
  it('meaningfulTarget climbs from inline spans to the paragraph', () => {
    const d = doc('<p id="p">Hello <span id="s">world</span></p>');
    expect(meaningfulTarget(d.getElementById('s')!).id).toBe('p');
  });
});

describe('locate (SPEC §4.3 order)', () => {
  it('finds the element by textQuote on an unchanged page', () => {
    const a = anchorFor('article p', 1);
    const d = doc(PAGE);
    const r = locate(a, d);
    expect(r.method).toBe('textQuote');
    if (r.method === 'textQuote') expect(r.element).toBe(d.querySelectorAll('article p')[1]);
  });

  it('disambiguates duplicate text using prefix/suffix context', () => {
    const a = anchorFor('li', 2); // second "Research"
    const d = doc(PAGE);
    const r = locate(a, d);
    expect(r.method).toBe('textQuote');
    if (r.method === 'textQuote') expect(r.element).toBe(d.querySelectorAll('li')[2]);
  });

  it('survives structural changes (wrapper inserted, order changed) via textQuote', () => {
    const a = anchorFor('article p', 0);
    const mutated = PAGE.replace(
      '<section id="work">',
      '<div class="new"><section id="work">',
    ).replace('</section>\n<section><h2>Skills', '</section></div>\n<section><h2>Skills');
    const d = doc(mutated);
    const r = locate(a, d);
    expect(r.method).toBe('textQuote');
    if (r.method === 'textQuote') expect(r.element.textContent).toContain('Reduced drop-off');
  });

  it('fuzzy-matches lightly edited text', () => {
    const a = anchorFor('article p', 0);
    const d = doc(
      PAGE.replace('simplifying the payment step', 'simplifying the whole payment step'),
    );
    const r = locate(a, d);
    expect(r.method).toBe('textQuote');
  });

  it('falls back to cssPath with descriptor check when the text is gone (image)', () => {
    const a = anchorFor('img');
    const d = doc(PAGE.replace('alt="Ada logo"', 'alt="New logo"'));
    const r = locate(a, d);
    expect(r.method).toBe('cssPath');
    if (r.method === 'cssPath') expect(r.element.tagName).toBe('IMG');
  });

  it('does not accept a cssPath hit whose content no longer matches; goes to rect', () => {
    const a = anchorFor('article p', 0);
    const d = doc(
      PAGE.replace(
        'Reduced drop-off by simplifying the payment step.',
        'Totally different words here now.',
      ),
    );
    (d.defaultView as Window & { innerWidth: number }).innerWidth = a.viewport.w;
    const r = locate(a, d);
    expect(r.method).toBe('rect');
  });

  it('returns none (→ screenshot) when text is gone and viewport width differs', () => {
    const a = { ...anchorFor('article p', 0), viewport: { w: 99999, h: 800, dpr: 1 } };
    const d = doc(
      PAGE.replace(
        'Reduced drop-off by simplifying the payment step.',
        'Totally different words here now.',
      ),
    );
    expect(locate(a, d).method).toBe('none');
  });
});
