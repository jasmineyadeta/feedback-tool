import { describe, expect, it } from 'vitest';
import { normalizeWhitespace } from '../src';

describe('normalizeWhitespace', () => {
  it('collapses and trims', () => {
    expect(normalizeWhitespace('  a \n\t b  ')).toBe('a b');
  });
});
