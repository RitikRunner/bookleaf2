import type { Response } from 'express';
import type { SessionUser } from '../lib/session.js';

/*
 * Real-time ticket updates over Server-Sent Events.
 *
 * Events are deliberately thin, saying only "ticket X changed and why". The browser re-fetches through the normal
 * API, so access control is enforced in one place and the event stream never carries ticket content.
 *
 * Connections live in memory, which fits a single server. With several servers, events would fan out through
 * Redis pub/sub or Postgres LISTEN/NOTIFY instead.
 */

export type TicketEventReason = 'created' | 'reply' | 'author_message' | 'status' | 'triage' | 'note';

export interface TicketEvent {
  ticketId: string;
  reason: TicketEventReason;
}

/** Who hears about a change: the ticket's author and the support team, or the support team only (internal changes). */
export type Audience = 'author-and-admins' | 'admins';

interface Connection {
  user: SessionUser;
  res: Response;
}

const HEARTBEAT_MS = 25_000; // keeps proxies from closing idle connections

export class RealtimeHub {
  private readonly connections = new Set<Connection>();

  /** Registers an open SSE response; returns a function that unregisters it. */
  subscribe(user: SessionUser, res: Response): () => void {
    const connection = { user, res };
    this.connections.add(connection);
    const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);
    heartbeat.unref();
    return () => {
      clearInterval(heartbeat);
      this.connections.delete(connection);
    };
  }

  publish(event: TicketEvent & { authorId: string }, audience: Audience): void {
    const payload = `data: ${JSON.stringify({ ticketId: event.ticketId, reason: event.reason })}\n\n`;
    for (const { user, res } of this.connections) {
      const isAdmin = user.role === 'ADMIN';
      const isTicketAuthor = audience === 'author-and-admins' && user.authorId === event.authorId;
      if (isAdmin || isTicketAuthor) res.write(payload);
    }
  }

  get connectionCount(): number {
    return this.connections.size;
  }
}

export const realtimeHub = new RealtimeHub();
