import { describe, expect, it } from 'vitest';
import { normalizeSignOff } from './drafter.js';

describe('normalizeSignOff', () => {
  it.each([
    ['Thanks for your patience.\n\nWarm regards,\n\nBookLeaf Author Support'],
    ['Thanks for your patience. Warm regards, BookLeaf Author Support'],
    ['Thanks for your patience.\n\nWarm regards,\nBookLeaf Author Support\n'],
  ])('fixes the sign-off layout: %j', (reply) => {
    expect(normalizeSignOff(reply)).toBe('Thanks for your patience.\n\nWarm regards,\nBookLeaf Author Support');
  });

  it('leaves a reply without the standard sign-off unchanged', () => {
    expect(normalizeSignOff('Hi Priya,\n\nThanks!')).toBe('Hi Priya,\n\nThanks!');
  });
});
