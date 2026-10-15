import { describe, expect, it } from 'vitest';
import { parseIsoDate, toIsoDate } from '../lib/dates.js';
import {
  impliedNetProfitPerCopy,
  lastClosedPayoutQuarter,
  nextPayoutWindow,
  summarizeRoyalties,
  type RoyaltyBook,
} from './royalty.js';

const asOf = parseIsoDate('2026-01-15');

function book(overrides: Partial<RoyaltyBook>): RoyaltyBook {
  return {
    publicationDate: parseIsoDate('2024-01-01'),
    royaltyEarned: 0,
    royaltyPaid: 0,
    royaltyPending: 0,
    lastPayoutDate: null,
    ...overrides,
  };
}

describe('nextPayoutWindow', () => {
  it('points to the last completed quarter while its 45-day window is still open', () => {
    const window = nextPayoutWindow(asOf);
    expect(toIsoDate(window.quarterEnding)).toBe('2025-12-31');
    expect(toIsoDate(window.payBy)).toBe('2026-02-14');
  });

  it('rolls forward to the current quarter once that window has passed', () => {
    const window = nextPayoutWindow(parseIsoDate('2026-02-20'));
    expect(toIsoDate(window.quarterEnding)).toBe('2026-03-31');
    expect(toIsoDate(window.payBy)).toBe('2026-05-15');
  });

  it.each([
    ['2026-04-10', '2026-03-31', '2026-05-15'],
    ['2026-07-01', '2026-06-30', '2026-08-14'],
    ['2026-10-15', '2026-09-30', '2026-11-14'],
  ])('as of %s → quarter ending %s, pay by %s', (date, quarterEnding, payBy) => {
    const window = nextPayoutWindow(parseIsoDate(date));
    expect(toIsoDate(window.quarterEnding)).toBe(quarterEnding);
    expect(toIsoDate(window.payBy)).toBe(payBy);
  });
});

describe('lastClosedPayoutQuarter', () => {
  it('returns the latest quarter whose payout deadline has passed', () => {
    expect(toIsoDate(lastClosedPayoutQuarter(asOf))).toBe('2025-09-30');
  });
});

describe('impliedNetProfitPerCopy', () => {
  it('reverses the 80/20 split', () => {
    expect(impliedNetProfitPerCopy(35)).toBe(43.75);
    expect(impliedNetProfitPerCopy(25)).toBe(31.25);
  });
});

describe('summarizeRoyalties (dataset scenarios, as of 2026-01-15)', () => {
  it('Farhan: fully paid → NOTHING_PENDING', () => {
    const summary = summarizeRoyalties(
      [book({ royaltyEarned: 3120, royaltyPaid: 3120, lastPayoutDate: parseIsoDate('2025-12-01') })],
      asOf,
    );
    expect(summary.payoutState).toBe('NOTHING_PENDING');
  });

  it('Kavita: ₹850 combined balance is below the ₹1,000 minimum → BELOW_MINIMUM', () => {
    const summary = summarizeRoyalties(
      [book({ publicationDate: null }), book({ royaltyEarned: 850, royaltyPending: 850 })],
      asOf,
    );
    expect(summary.totalPending).toBe(850);
    expect(summary.payoutState).toBe('BELOW_MINIMUM');
  });

  it('Ananya: never paid since 2024 with ₹2,546 pending → NEEDS_REVIEW', () => {
    const summary = summarizeRoyalties(
      [book({ publicationDate: parseIsoDate('2024-07-05'), royaltyEarned: 2546, royaltyPending: 2546 })],
      asOf,
    );
    expect(summary.payoutState).toBe('NEEDS_REVIEW');
    expect(summary.lastPayoutDate).toBeNull();
  });

  it('Priya: paid recently, balance accrued since → SCHEDULED for the next window', () => {
    const summary = summarizeRoyalties(
      [
        book({ royaltyEarned: 11970, royaltyPaid: 8400, royaltyPending: 3570, lastPayoutDate: parseIsoDate('2025-10-15') }),
        book({ royaltyEarned: 7938, royaltyPaid: 7938, lastPayoutDate: parseIsoDate('2025-12-01') }),
      ],
      asOf,
    );
    expect(summary.payoutState).toBe('SCHEDULED');
    expect(summary.lastPayoutDate).toBe('2025-12-01');
    expect(summary.nextPayout).toEqual({ quarterEnding: '2025-12-31', payBy: '2026-02-14' });
  });

  it('a book published this quarter that has never been paid is not flagged yet', () => {
    const summary = summarizeRoyalties(
      [book({ publicationDate: parseIsoDate('2025-11-01'), royaltyEarned: 1500, royaltyPending: 1500 })],
      asOf,
    );
    expect(summary.payoutState).toBe('SCHEDULED');
  });
});
