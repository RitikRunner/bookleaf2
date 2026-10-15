import { addDays, toIsoDate } from '../lib/dates.js';

/**
 * BookLeaf royalty policy (knowledge base): authors earn 80% of net profit per copy, royalties are
 * calculated quarterly and paid within 45 days of quarter end, and balances under ₹1,000 roll over.
 *
 * These facts are calculated here, in code, and handed to the AI as data. The model never does date or money arithmetic.
 */
export const ROYALTY_POLICY = {
  authorShare: 0.8,
  payoutWindowDays: 45,
  minimumPayoutInr: 1000,
} as const;

export type PayoutState =
  | 'NOTHING_PENDING' // everything earned has been paid
  | 'BELOW_MINIMUM' // pending balance is under ₹1,000 and rolls over to next quarter
  | 'SCHEDULED' // pending balance will be paid in the next payout window
  | 'NEEDS_REVIEW'; // above the minimum, yet no payout covers the last closed cycle: finance should check

export interface RoyaltyBook {
  publicationDate: Date | null;
  royaltyEarned: number;
  royaltyPaid: number;
  royaltyPending: number;
  lastPayoutDate: Date | null;
}

export interface RoyaltySummary {
  asOf: string;
  totalEarned: number;
  totalPaid: number;
  totalPending: number;
  minimumPayout: number;
  lastPayoutDate: string | null;
  nextPayout: { quarterEnding: string; payBy: string };
  payoutState: PayoutState;
}

/** Last day of the calendar quarter containing `date` (31 Mar, 30 Jun, 30 Sep or 31 Dec). */
function quarterEndContaining(date: Date): Date {
  const quarterIndex = Math.floor(date.getUTCMonth() / 3);
  // Day 0 of the month after the quarter is the quarter's last day.
  return new Date(Date.UTC(date.getUTCFullYear(), quarterIndex * 3 + 3, 0));
}

function previousQuarterEnd(quarterEnd: Date): Date {
  return new Date(Date.UTC(quarterEnd.getUTCFullYear(), quarterEnd.getUTCMonth() - 2, 0));
}

function payByDate(quarterEnd: Date): Date {
  return addDays(quarterEnd, ROYALTY_POLICY.payoutWindowDays);
}

/** The next payout an author can expect as of `asOf`: which quarter it covers and the date it is due by. */
export function nextPayoutWindow(asOf: Date): { quarterEnding: Date; payBy: Date } {
  const lastCompletedQuarter = previousQuarterEnd(quarterEndContaining(asOf));
  if (asOf <= payByDate(lastCompletedQuarter)) {
    return { quarterEnding: lastCompletedQuarter, payBy: payByDate(lastCompletedQuarter) };
  }
  const currentQuarter = quarterEndContaining(asOf);
  return { quarterEnding: currentQuarter, payBy: payByDate(currentQuarter) };
}

/** End of the most recent quarter whose payout deadline has already passed as of `asOf`. */
export function lastClosedPayoutQuarter(asOf: Date): Date {
  let quarterEnd = previousQuarterEnd(quarterEndContaining(asOf));
  while (payByDate(quarterEnd) >= asOf) quarterEnd = previousQuarterEnd(quarterEnd);
  return quarterEnd;
}

/** Net profit per copy implied by the 80/20 split, e.g. ₹35 royalty → ₹43.75 net profit. */
export function impliedNetProfitPerCopy(royaltyPerCopy: number): number {
  return Math.round((royaltyPerCopy / ROYALTY_POLICY.authorShare) * 100) / 100;
}

export function summarizeRoyalties(books: RoyaltyBook[], asOf: Date): RoyaltySummary {
  const totalEarned = sum(books.map((book) => book.royaltyEarned));
  const totalPaid = sum(books.map((book) => book.royaltyPaid));
  const totalPending = sum(books.map((book) => book.royaltyPending));
  const lastPayout = latest(books.map((book) => book.lastPayoutDate));
  const next = nextPayoutWindow(asOf);

  return {
    asOf: toIsoDate(asOf),
    totalEarned,
    totalPaid,
    totalPending,
    minimumPayout: ROYALTY_POLICY.minimumPayoutInr,
    lastPayoutDate: lastPayout ? toIsoDate(lastPayout) : null,
    nextPayout: { quarterEnding: toIsoDate(next.quarterEnding), payBy: toIsoDate(next.payBy) },
    payoutState: determinePayoutState(books, totalPending, lastPayout, asOf),
  };
}

/**
 * The minimum payout applies to the author's combined balance across all books, since payouts go to one bank account.
 * NEEDS_REVIEW is deliberately cautious ("finance should verify"), not "overdue": the dataset has no per-quarter
 * accrual history, so we can only tell that a payout covering the last closed cycle is missing.
 */
function determinePayoutState(
  books: RoyaltyBook[],
  totalPending: number,
  lastPayout: Date | null,
  asOf: Date,
): PayoutState {
  if (totalPending === 0) return 'NOTHING_PENDING';
  if (totalPending < ROYALTY_POLICY.minimumPayoutInr) return 'BELOW_MINIMUM';

  const closedQuarterEnd = lastClosedPayoutQuarter(asOf);
  if (lastPayout && lastPayout > closedQuarterEnd) return 'SCHEDULED';
  if (lastPayout) return 'NEEDS_REVIEW';

  // Never paid: only suspicious if some book was already earning before the last closed cycle ended.
  const earningBeforeClosedCycle = books.some(
    (book) => book.royaltyEarned > 0 && book.publicationDate !== null && book.publicationDate <= closedQuarterEnd,
  );
  return earningBeforeClosedCycle ? 'NEEDS_REVIEW' : 'SCHEDULED';
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function latest(dates: (Date | null)[]): Date | null {
  return dates.reduce<Date | null>((max, date) => (date && (!max || date > max) ? date : max), null);
}
