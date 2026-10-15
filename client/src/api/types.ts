/*
 * Response shapes of the BookLeaf API, mirroring the server's DTO files (server/src/modules/<feature>/<feature>.dto.ts).
 * Hand-written for now; in production these would be generated from an OpenAPI spec.
 */

export type Role = 'AUTHOR' | 'ADMIN';

export interface Profile {
  id: string;
  email: string;
  name: string;
  role: Role;
  authorId: string | null;
}

export interface Labeled<T extends string = string> {
  code: T;
  label: string;
}

export type PayoutState = 'NOTHING_PENDING' | 'BELOW_MINIMUM' | 'SCHEDULED' | 'NEEDS_REVIEW';

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

export interface Author {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  city: string | null;
  joinedDate: string;
  bookCount: number;
  royalty: RoyaltySummary;
}

export interface Book {
  id: string;
  title: string;
  genre: string;
  isbn: string | null;
  isbnStatus: 'ASSIGNED' | 'RESERVED' | 'NOT_ASSIGNED';
  status: 'PUBLISHED' | 'IN_PRODUCTION';
  stage: { code: string; label: string; step: number; of: number };
  publicationDate: string | null;
  mrp: number | null;
  royaltyPerCopy: number | null;
  copiesSold: number;
  royalty: { earned: number; paid: number; pending: number; lastPayoutDate: string | null; neverPaid: boolean };
  printPartner: Labeled | null;
  availableOn: Labeled[];
}

export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
export type TicketCategory =
  | 'ROYALTY_PAYMENTS'
  | 'ISBN_METADATA'
  | 'PRINTING_QUALITY'
  | 'DISTRIBUTION_AVAILABILITY'
  | 'BOOK_STATUS_PRODUCTION'
  | 'GENERAL_INQUIRY';
export type TicketPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type ClassificationSource = 'AI' | 'RULES' | 'ADMIN';
export type AiStatus = 'PENDING' | 'COMPLETED' | 'FALLBACK';

export interface Message {
  id: string;
  body: string;
  sender: { name: string; role: Role };
  createdAt: string;
}

export interface Attachment {
  fileName: string;
  fileSize: number | null;
  mimeType: string | null;
}

export interface AuthorTicket {
  id: string;
  reference: string;
  subject: string;
  description: string;
  status: Labeled<TicketStatus>;
  book: { id: string; title: string } | null;
  attachment: Attachment | null;
  messages: Message[];
  createdAt: string;
  lastActivityAt: string;
}

export interface Classified<T extends string> {
  code: T;
  label: string;
  source: ClassificationSource | null;
}

interface AdminTicketBase {
  id: string;
  reference: string;
  subject: string;
  status: Labeled<TicketStatus>;
  category: Classified<TicketCategory> | null;
  priority: Classified<TicketPriority> | null;
  aiStatus: AiStatus;
  book: { id: string; title: string } | null;
  assignee: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
  firstResponseAt: string | null;
  resolvedAt: string | null;
}

export interface AdminTicketSummary extends AdminTicketBase {
  author: { id: string; name: string };
  messageCount: number;
}

export interface InternalNote {
  id: string;
  body: string;
  admin: { id: string; name: string };
  createdAt: string;
}

export interface AdminTicket extends AdminTicketBase {
  description: string;
  attachment: Attachment | null;
  author: { id: string; name: string; email: string };
  ai: {
    status: AiStatus;
    category: TicketCategory | null;
    priority: TicketPriority | null;
    confidence: 'HIGH' | 'MEDIUM' | 'LOW' | null;
    reasoning: string | null;
    attempts: number;
    lastError: string | null;
  };
  messages: Message[];
  internalNotes: InternalNote[];
}

export type EscalationTeam = 'NONE' | 'FINANCE' | 'PRODUCTION' | 'DISTRIBUTION' | 'PRINTING';

export interface Draft {
  id: string;
  reply: string;
  adminNotes: string[];
  suggestedStatus: 'IN_PROGRESS' | 'RESOLVED';
  escalateTo: EscalationTeam;
  placeholders: string[];
  model: string;
  promptVersion: string;
  createdAt: string;
  freshness: 'GENERATED' | 'CACHED' | 'STALE';
}

export interface Page<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface AiUsageRow {
  operation: 'CLASSIFY' | 'DRAFT';
  calls: number;
  failures: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  costUsd: number;
  avgCostUsd: number;
  avgLatencyMs: number;
}

export interface AiMetrics {
  status: { enabled: boolean; circuit: 'open' | 'closed'; models: { classification: string; draft: string } };
  usage: AiUsageRow[];
  classification: {
    total: number;
    byAi: number;
    byRules: number;
    pending: number;
    categoryCorrections: number;
    priorityCorrections: number;
    categoryAgreementRate: number | null;
  };
  drafts: { generated: number; sentAsWritten: number; sentEdited: number };
}

export interface TicketEvent {
  ticketId: string;
  reason: 'created' | 'reply' | 'author_message' | 'status' | 'triage' | 'note';
}
