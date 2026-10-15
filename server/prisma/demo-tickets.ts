import type { TicketStatus } from '@prisma/client';

/** Demo admin accounts. Emails use the reserved .test domain so they can never reach a real inbox. */
export const DEMO_ADMINS = {
  lead: { email: 'admin@bookleaf.test', name: 'Neha Verma' },
  agent: { email: 'support@bookleaf.test', name: 'Karan Mehta' },
} as const;

export type AdminKey = keyof typeof DEMO_ADMINS;

export interface DemoTicket {
  authorId: string;
  bookId: string | null;
  subject: string;
  description: string;
  hoursAgo: number;
  status?: TicketStatus;
  assignee?: AdminKey;
  replies?: { from: AdminKey | 'author'; body: string; hoursAgo: number }[];
  notes?: { by: AdminKey; body: string; hoursAgo: number }[];
}

/**
 * Seeded tickets mirror the knowledge-base sample queries, attached to dataset records where the
 * correct answer depends on the data (never-paid royalties, the ₹1,000 minimum, books in production).
 * They start unclassified; the classification pipeline picks them up like any new ticket.
 */
export const DEMO_TICKETS: DemoTicket[] = [
  {
    authorId: 'AUTH003',
    bookId: 'BK005',
    subject: 'No royalty received since my book was published',
    description:
      'Between Two Temples was published in July 2024 and my dashboard shows ₹2,546 in pending royalties, but I have never received a single payment. My bank details were added when I signed up. It has been well over a year. What is going on?',
    hoursAgo: 30,
  },
  {
    authorId: 'AUTH009',
    bookId: 'BK016',
    subject: 'When will I receive royalties for The Nagpur Notebooks?',
    description:
      'My book has been live since November 2024 and the dashboard shows ₹850 pending, but nothing has been paid into my account yet. Can you tell me when I will receive this?',
    hoursAgo: 52,
  },
  {
    authorId: 'AUTH009',
    bookId: 'BK015',
    subject: 'Raising Roots has been stuck in typesetting',
    description:
      "It's been 3 weeks and my book is still showing as in typesetting. When will it be done? I was hoping to launch before the school holidays.",
    hoursAgo: 6,
  },
  {
    authorId: 'AUTH002',
    bookId: 'BK003',
    subject: 'Amazon shows a different ISBN from my printed copies',
    description:
      "The ISBN on the Amazon India listing for Code & Karma is different from the one printed on the back cover of my physical copies. A bookstore that wanted to stock it couldn't find it using the printed ISBN. Please fix this urgently.",
    hoursAgo: 3,
  },
  {
    authorId: 'AUTH005',
    bookId: 'BK008',
    subject: 'Blurry images and misaligned pages in my author copies',
    description:
      'I received my author copies of Cardamom & Chaos yesterday and the print quality is terrible. The images in chapter 3 are blurry and several pages are misaligned. I was planning to hand these out at a reading next week.',
    hoursAgo: 20,
  },
  {
    authorId: 'AUTH001',
    bookId: 'BK001',
    subject: "Whispers of the Ganges shows 'Currently Unavailable' on Amazon",
    description:
      "Since last week my book has been showing as 'Currently Unavailable' on Amazon India. Readers are messaging me that they can't order it. It is still available on Flipkart.",
    hoursAgo: 75,
  },
  {
    authorId: 'AUTH004',
    bookId: 'BK006',
    subject: 'My royalty amount seems too low',
    description:
      "I've sold 534 copies of Debugging Life but my total royalty is only ₹13,350. That's ₹25 a copy on a ₹299 book. Can you explain how this is calculated?",
    hoursAgo: 96,
  },
  {
    authorId: 'AUTH010',
    bookId: null,
    subject: 'Can I update my author bio on Amazon?',
    description:
      'I have a new author photo and an updated bio. Can I change these on my Amazon author page now that my books are already live?',
    hoursAgo: 120,
  },
  {
    authorId: 'AUTH007',
    bookId: 'BK013',
    subject: 'Status of the cover design for Midnight in Mysore',
    description:
      "I approved the second cover concept last week but haven't heard anything since. Is the cover finalised, and when does typesetting start?",
    hoursAgo: 48,
    status: 'IN_PROGRESS',
    assignee: 'lead',
    replies: [
      {
        from: 'lead',
        hoursAgo: 40,
        body: "Hi Sneha,\n\nThank you for approving the second concept, and sorry for the silence since then. Our design team is preparing the final print-ready files now, including the back-cover blurb you shared. We'll send the final cover to you for one last look by Friday, and typesetting starts as soon as you confirm it.\n\nWarm regards,\nNeha\nBookLeaf Author Support",
      },
    ],
    notes: [
      {
        by: 'lead',
        hoursAgo: 39,
        body: 'Design team confirmed final files due Thursday. Follow up on Friday if Sneha has not confirmed.',
      },
    ],
  },
  {
    authorId: 'AUTH008',
    bookId: null,
    subject: 'Royalty statement for tax filing',
    description:
      'I need a statement of my royalty earnings for my income tax filing this year. Can you share one?',
    hoursAgo: 200,
    status: 'RESOLVED',
    assignee: 'agent',
    replies: [
      {
        from: 'agent',
        hoursAgo: 190,
        body: "Hi Farhan,\n\nHappy to help. Your account is fully settled: ₹3,120 earned and paid for Ghazal of the Forgotten, with the last payout on 1 December 2025. Your dashboard shows the per-platform breakdown, and I've asked our finance team to email you a consolidated statement for your filing. You'll have it within 2 business days.\n\nWarm regards,\nKaran\nBookLeaf Author Support",
      },
      { from: 'author', hoursAgo: 150, body: 'Received the statement, thank you!' },
    ],
  },
];
