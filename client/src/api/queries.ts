import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from './client';
import type {
  AdminTicket,
  AdminTicketSummary,
  AiMetrics,
  Author,
  AuthorTicket,
  Book,
  Draft,
  Message,
  Page,
  Profile,
  TicketCategory,
  TicketPriority,
  TicketStatus,
} from './types';

/*
 * Every server read and write the UI makes, as React Query hooks. Keys are hierarchical, so invalidating
 * ['tickets'] refreshes every ticket list, and the real-time stream only has to say which ticket changed.
 */

export const queryKeys = {
  me: ['me'] as const,
  author: (authorId: string) => ['author', authorId] as const,
  books: (authorId?: string) => ['books', authorId ?? 'mine'] as const,
  book: (bookId: string) => ['book', bookId] as const,
  tickets: ['tickets'] as const,
  ticket: (ticketId: string) => ['ticket', ticketId] as const,
  draft: (ticketId: string) => ['draft', ticketId] as const,
  aiMetrics: ['ai-metrics'] as const,
};

const unwrap = <T>(response: { data: T }) => response.data;

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

/** The signed-in user, or null when signed out. */
export function useMe() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: async () => {
      try {
        return unwrap(await api<{ data: Profile }>('/auth/me'));
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: Infinity,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (credentials: { email: string; password: string }) =>
      api<{ data: Profile }>('/auth/login', { method: 'POST', body: credentials }).then(unwrap),
    onSuccess: (profile) => queryClient.setQueryData(queryKeys.me, profile),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>('/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      queryClient.clear();
      queryClient.setQueryData(queryKeys.me, null);
    },
  });
}

// ---------------------------------------------------------------------------
// Authors and books
// ---------------------------------------------------------------------------

export function useAuthor(authorId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.author(authorId ?? ''),
    queryFn: () => api<{ data: Author }>(`/authors/${authorId}`).then(unwrap),
    enabled: Boolean(authorId),
  });
}

export function useBooks(authorId?: string) {
  return useQuery({
    queryKey: queryKeys.books(authorId),
    queryFn: () => api<{ data: Book[] }>(`/books${authorId ? `?authorId=${authorId}` : ''}`).then(unwrap),
  });
}

export function useBook(bookId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.book(bookId ?? ''),
    queryFn: () => api<{ data: Book }>(`/books/${bookId}`).then(unwrap),
    enabled: Boolean(bookId),
  });
}

// ---------------------------------------------------------------------------
// Tickets
// ---------------------------------------------------------------------------

export function useAuthorTickets() {
  return useQuery({
    queryKey: [...queryKeys.tickets, 'author'],
    queryFn: () => api<Page<AuthorTicket>>('/tickets?pageSize=100'),
  });
}

export interface QueueFilters {
  status?: string;
  category?: string;
  priority?: string;
  assignee?: string;
  from?: string;
  to?: string;
  sort?: string;
  page?: number;
}

export function useAdminTickets(filters: QueueFilters) {
  const params = new URLSearchParams(
    Object.entries({ pageSize: '25', ...filters })
      .filter(([, value]) => value !== undefined && value !== '')
      .map(([key, value]) => [key, String(value)]),
  );
  return useQuery({
    queryKey: [...queryKeys.tickets, 'admin', filters],
    queryFn: () => api<Page<AdminTicketSummary>>(`/tickets?${params}`),
    placeholderData: keepPreviousData, // keep the table on screen while filters change
  });
}

export function useAdminTicket(ticketId: string) {
  return useQuery({
    queryKey: queryKeys.ticket(ticketId),
    queryFn: () => api<{ data: AdminTicket }>(`/tickets/${ticketId}`).then(unwrap),
  });
}

/** Refreshes everything that shows a ticket after it changes. */
function useTicketInvalidation(ticketId?: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.tickets });
    if (ticketId) void queryClient.invalidateQueries({ queryKey: queryKeys.ticket(ticketId) });
  };
}

export interface NewTicket {
  bookId: string | null;
  subject: string;
  description: string;
  attachment?: { fileName: string; fileSize: number; mimeType: string };
}

export function useCreateTicket() {
  const invalidate = useTicketInvalidation();
  return useMutation({
    mutationFn: (ticket: NewTicket) => api<{ data: AuthorTicket }>('/tickets', { method: 'POST', body: ticket }).then(unwrap),
    onSuccess: invalidate,
  });
}

export function useSendMessage(ticketId: string) {
  const invalidate = useTicketInvalidation(ticketId);
  return useMutation({
    mutationFn: (message: { body: string; status?: TicketStatus; draftId?: string }) =>
      api<{ data: Message }>(`/tickets/${ticketId}/messages`, { method: 'POST', body: message }).then(unwrap),
    onSuccess: invalidate,
  });
}

export interface TicketUpdate {
  status?: TicketStatus;
  category?: TicketCategory;
  priority?: TicketPriority;
  assigneeId?: string | null;
}

export function useUpdateTicket(ticketId: string) {
  const queryClient = useQueryClient();
  const invalidate = useTicketInvalidation(ticketId);
  return useMutation({
    mutationFn: (update: TicketUpdate) =>
      api<{ data: AdminTicket }>(`/tickets/${ticketId}`, { method: 'PATCH', body: update }).then(unwrap),
    onSuccess: (ticket) => {
      queryClient.setQueryData(queryKeys.ticket(ticketId), ticket);
      invalidate();
    },
  });
}

export function useAddNote(ticketId: string) {
  const invalidate = useTicketInvalidation(ticketId);
  return useMutation({
    mutationFn: (body: string) => api(`/tickets/${ticketId}/notes`, { method: 'POST', body: { body } }),
    onSuccess: invalidate,
  });
}

export function useReclassify(ticketId: string) {
  const queryClient = useQueryClient();
  const invalidate = useTicketInvalidation(ticketId);
  return useMutation({
    mutationFn: () => api<{ data: AdminTicket }>(`/tickets/${ticketId}/classification`, { method: 'POST' }).then(unwrap),
    onSuccess: (ticket) => {
      queryClient.setQueryData(queryKeys.ticket(ticketId), ticket);
      invalidate();
    },
  });
}

// ---------------------------------------------------------------------------
// AI
// ---------------------------------------------------------------------------

/**
 * The AI draft for a ticket. `enabled` lets the page skip the model call when no reply is needed.
 * A 503 means AI is unavailable and is not retried: the admin writes manually.
 */
export function useDraft(ticketId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.draft(ticketId),
    queryFn: () => api<{ data: Draft }>(`/tickets/${ticketId}/draft`).then(unwrap),
    enabled,
    retry: false,
    staleTime: Infinity, // the server already decides when a new draft is needed
  });
}

export function useRegenerateDraft(ticketId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ data: Draft }>(`/tickets/${ticketId}/draft`, { method: 'POST' }).then(unwrap),
    onSuccess: (draft) => queryClient.setQueryData(queryKeys.draft(ticketId), draft),
  });
}

export function useAiMetrics() {
  return useQuery({
    queryKey: queryKeys.aiMetrics,
    queryFn: () => api<{ data: AiMetrics }>('/ai/metrics').then(unwrap),
    refetchInterval: 60_000,
  });
}
