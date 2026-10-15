import type { EscalationTeam, TicketCategory, TicketPriority, TicketStatus } from '../api/types';

export const STATUS_LABELS: Record<TicketStatus, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

export const CATEGORY_LABELS: Record<TicketCategory, string> = {
  ROYALTY_PAYMENTS: 'Royalty & Payments',
  ISBN_METADATA: 'ISBN & Metadata',
  PRINTING_QUALITY: 'Printing & Quality',
  DISTRIBUTION_AVAILABILITY: 'Distribution & Availability',
  BOOK_STATUS_PRODUCTION: 'Book Status & Production',
  GENERAL_INQUIRY: 'General Inquiry',
};

export const PRIORITY_LABELS: Record<TicketPriority, string> = {
  CRITICAL: 'Critical',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
};

export const ESCALATION_LABELS: Record<Exclude<EscalationTeam, 'NONE'>, string> = {
  FINANCE: 'Finance',
  PRODUCTION: 'Production',
  DISTRIBUTION: 'Distribution',
  PRINTING: 'Printing',
};

export const entriesOf = <K extends string>(labels: Record<K, string>) => Object.entries(labels) as [K, string][];
