import type { RoyaltySummary as Summary } from '../api/types';
import { formatDate, formatInr } from '../lib/format';
import { Notice, Stat } from './ui';

/** Author-facing explanation of where their royalties stand. Wording never says "overdue"; that's for the team to judge. */
function payoutMessage(summary: Summary): { tone: 'info' | 'success' | 'warning'; text: string } {
  const payBy = formatDate(summary.nextPayout.payBy);
  const quarter = formatDate(summary.nextPayout.quarterEnding);
  switch (summary.payoutState) {
    case 'NOTHING_PENDING':
      return { tone: 'success', text: 'You’re all paid up. Royalties from new sales will appear here.' };
    case 'BELOW_MINIMUM':
      return {
        tone: 'info',
        text: `Your pending balance of ${formatInr(summary.totalPending)} is below the ${formatInr(summary.minimumPayout)} minimum payout, so it rolls over to next quarter and is paid once it reaches ${formatInr(summary.minimumPayout)}.`,
      };
    case 'SCHEDULED':
    case 'NEEDS_REVIEW':
      return {
        tone: 'info',
        text: `Royalties for the quarter ending ${quarter} are paid by ${payBy}. If you were expecting a payout that hasn't arrived, raise a ticket and we'll look into it.`,
      };
  }
}

export function RoyaltySummary({ summary, audience = 'author' }: { summary: Summary; audience?: 'author' | 'admin' }) {
  const message = payoutMessage(summary);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <Stat label="Earned" value={formatInr(summary.totalEarned)} />
        <Stat label="Paid" value={formatInr(summary.totalPaid)} hint={summary.lastPayoutDate ? `Last payout ${formatDate(summary.lastPayoutDate)}` : 'No payouts yet'} />
        <Stat label="Pending" value={formatInr(summary.totalPending)} />
      </div>
      {audience === 'admin' && summary.payoutState === 'NEEDS_REVIEW' ? (
        <Notice tone="warning">
          Pending balance is above {formatInr(summary.minimumPayout)} with no payout for the last closed quarter. Check with finance before replying.
        </Notice>
      ) : (
        <Notice tone={message.tone}>{message.text}</Notice>
      )}
    </div>
  );
}
