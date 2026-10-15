import type { TicketCategory } from '@prisma/client';

/*
 * The BookLeaf knowledge base, split into sections so each draft carries only the policy relevant to the
 * ticket's category instead of the whole document. Wording follows BookLeaf's own policy text.
 */

const COMPANY = `## Company
- BookLeaf Publishing is a self-publishing company operating in India and the US.
- Publishing packages: Standard Free (no upfront cost) and Bestseller Breakthrough (premium, paid package with marketing and distribution add-ons).
- BookLeaf handles cover design, typesetting, ISBN assignment, printing, distribution and royalty management for its authors.
- The in-house printing facility and warehouse are in Delhi. Print partners include Repro India and Epitome Books.`;

const ROYALTIES = `## Royalty policy
- 80/20 royalty split: 80% of the net profit per book goes to the author, 20% to BookLeaf.
- Net profit = MRP minus printing cost, platform commission (Amazon/Flipkart) and shipping charges.
- Royalties are calculated quarterly and paid within 45 days of the quarter ending.
- Minimum payout threshold: ₹1,000. If accumulated royalties are below this, they roll over to the next quarter.
- Payouts are made by bank transfer to the account linked in the author's dashboard.
- Authors can view a detailed royalty breakdown in their dashboard, showing sales figures per platform.`;

const ISBN = `## ISBN policy
- Every book published through BookLeaf receives a unique ISBN assigned by BookLeaf.
- ISBNs are registered under BookLeaf's publisher imprint. An author who wants an ISBN under their own imprint must obtain it independently.
- An ISBN error (duplicate, wrong book linked, mismatch between listing and print) is treated as a high-priority issue and escalated to the production team.`;

const METADATA_UPDATES = `## Metadata updates
- Metadata updates (for example the book description) can be submitted through the dashboard or by emailing the BookLeaf team.
- Changes typically reflect on retail platforms within 3–5 business days.`;

const PRINTING = `## Printing and quality
- In-house printing handles most orders. Overflow or specific format requirements go to Repro India or Epitome Books.
- Standard print turnaround: 5–7 business days from order confirmation.
- For a quality issue (misprints, binding defects, colour inconsistency), BookLeaf arranges a free reprint after verification. The author may need to share photos of the defective copy.`;

const DISTRIBUTION = `## Distribution and availability
- Books are listed on Amazon India, Flipkart, Amazon US, Amazon UK and the BookLeaf Store (each book is listed on the platforms in its distribution plan).
- New listings typically go live within 7–10 business days after publication is complete.
- A book showing as unavailable on a platform it is listed on usually indicates a stock sync issue. BookLeaf's team can trigger a re-sync, which takes effect within 24–48 hours.`;

const PRODUCTION = `## Production stages
- Stages in order: Manuscript Received → Editing (if opted) → Cover Design → Typesetting → Proofreading → ISBN Assignment → Printing → Distribution Setup → Published & Live.
- Authors are updated at each stage by email.
- Delays typically happen at Cover Design (waiting for author approval) and Proofreading (revision rounds).`;

/** Guidance on how replies to typical queries should be framed, from BookLeaf's sample responses. */
const EXAMPLES: Record<TicketCategory, string[]> = {
  ROYALTY_PAYMENTS: [
    `Query: "I published my book 4 months ago and still haven't received any royalty." → Acknowledge the frustration. Explain the quarterly cycle and 45-day payout window. Check whether bank details are linked. Give the specific next payout date. If the payment is genuinely overdue, escalate with a 48-hour resolution timeline.`,
    `Query: "My royalty seems too low. I sold 200 copies but only received ₹3,000." → Explain the net profit calculation (MRP minus printing, platform commission and shipping). Offer a detailed line-by-line royalty breakdown. Don't be defensive; offer transparency.`,
  ],
  ISBN_METADATA: [
    `Query: "My book shows a different ISBN on Amazon than on the physical copy." → Treat as high priority. Acknowledge this is a serious data issue. Confirm you are escalating to the production team immediately. Give a 48-hour resolution timeline.`,
  ],
  PRINTING_QUALITY: [
    `Query: "The print quality of my author copies is terrible: blurry images, misaligned pages." → Apologise sincerely. Ask for photos of the defective copies. Confirm BookLeaf will arrange a free reprint once verified, with a 5–7 business day timeline for the reprint.`,
  ],
  DISTRIBUTION_AVAILABILITY: [
    `Query: "My book is published but shows 'Currently Unavailable' on Amazon." → Explain this is typically a stock sync issue. Confirm you're triggering a re-sync with the distribution team. Set the expectation of 24–48 hours for it to be available again.`,
  ],
  BOOK_STATUS_PRODUCTION: [
    `Query: "It's been 3 weeks and my book is still in typesetting. When will it be done?" → Check the actual production status. If it's delayed, be honest about why (e.g. waiting on author approval of proofs). Give a specific updated timeline. Don't blame the author even if the delay is on their side; frame it collaboratively.`,
  ],
  GENERAL_INQUIRY: [
    `Query: "Can I update the description of my book on Amazon after it's live?" → Yes: metadata updates can be submitted through the dashboard or by emailing the BookLeaf team, and changes typically reflect on platforms within 3–5 business days.`,
  ],
};

const SECTIONS_BY_CATEGORY: Record<TicketCategory, string[]> = {
  ROYALTY_PAYMENTS: [ROYALTIES],
  ISBN_METADATA: [ISBN, METADATA_UPDATES],
  PRINTING_QUALITY: [PRINTING],
  DISTRIBUTION_AVAILABILITY: [DISTRIBUTION],
  BOOK_STATUS_PRODUCTION: [PRODUCTION],
  GENERAL_INQUIRY: [METADATA_UPDATES, PRODUCTION],
};

const ALL_SECTIONS = [ROYALTIES, ISBN, METADATA_UPDATES, PRINTING, DISTRIBUTION, PRODUCTION];

/**
 * Knowledge-base text for a ticket: company overview plus the sections for its category, with that category's
 * reference examples. An unclassified ticket gets every section, since we can't yet tell what is relevant.
 */
export function knowledgeFor(category: TicketCategory | null): string {
  const sections = category ? SECTIONS_BY_CATEGORY[category] : ALL_SECTIONS;
  const examples = category ? EXAMPLES[category] : Object.values(EXAMPLES).flat();

  return [
    '<knowledge_base>',
    COMPANY,
    ...sections,
    '</knowledge_base>',
    '',
    '<reference_examples>',
    'How BookLeaf frames replies to queries like this one:',
    ...examples.map((example) => `- ${example}`),
    '</reference_examples>',
  ].join('\n');
}
