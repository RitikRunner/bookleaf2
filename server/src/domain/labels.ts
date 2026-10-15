import type {
  Platform,
  PrintPartner,
  ProductionStage,
  TicketCategory,
  TicketPriority,
  TicketStatus,
} from '@prisma/client';

/** Production pipeline in order, from the knowledge base. Editing only happens if the author opted in. */
export const STAGE_ORDER: readonly ProductionStage[] = [
  'MANUSCRIPT_RECEIVED',
  'EDITING',
  'COVER_DESIGN',
  'TYPESETTING',
  'PROOFREADING',
  'ISBN_ASSIGNMENT',
  'PRINTING',
  'DISTRIBUTION_SETUP',
  'PUBLISHED_LIVE',
];

export const STAGE_LABELS: Record<ProductionStage, string> = {
  MANUSCRIPT_RECEIVED: 'Manuscript Received',
  EDITING: 'Editing',
  COVER_DESIGN: 'Cover Design',
  TYPESETTING: 'Typesetting',
  PROOFREADING: 'Proofreading',
  ISBN_ASSIGNMENT: 'ISBN Assignment',
  PRINTING: 'Printing',
  DISTRIBUTION_SETUP: 'Distribution Setup',
  PUBLISHED_LIVE: 'Published & Live',
};

export const PLATFORM_LABELS: Record<Platform, string> = {
  AMAZON_IN: 'Amazon India',
  FLIPKART: 'Flipkart',
  AMAZON_US: 'Amazon US',
  AMAZON_UK: 'Amazon UK',
  BOOKLEAF_STORE: 'BookLeaf Store',
};

export const PRINT_PARTNER_LABELS: Record<PrintPartner, string> = {
  IN_HOUSE: 'In-House',
  REPRO_INDIA: 'Repro India',
  EPITOME_BOOKS: 'Epitome Books',
};

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

export const CATEGORY_LABELS: Record<TicketCategory, string> = {
  ROYALTY_PAYMENTS: 'Royalty & Payments',
  ISBN_METADATA: 'ISBN & Metadata Issues',
  PRINTING_QUALITY: 'Printing & Quality',
  DISTRIBUTION_AVAILABILITY: 'Distribution & Availability',
  BOOK_STATUS_PRODUCTION: 'Book Status & Production Updates',
  GENERAL_INQUIRY: 'General Inquiry',
};

export const PRIORITY_LABELS: Record<TicketPriority, string> = {
  CRITICAL: 'Critical',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
};

/** Reverse lookup for importing the dataset, which stores human-readable labels rather than codes. */
export function codeForLabel<T extends string>(labels: Record<T, string>, label: string): T | undefined {
  return (Object.keys(labels) as T[]).find((code) => labels[code] === label);
}

const IN_PRODUCTION_PREFIX = 'In Production - ';

/** Dataset statuses look like "Published & Live" or "In Production - Cover Design". */
export function stageFromDatasetStatus(status: string): ProductionStage | undefined {
  const label = status.startsWith(IN_PRODUCTION_PREFIX) ? status.slice(IN_PRODUCTION_PREFIX.length) : status;
  return codeForLabel(STAGE_LABELS, label);
}
