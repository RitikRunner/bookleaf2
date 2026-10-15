import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useAuthorTickets, useSendMessage } from '../../api/queries';
import type { AuthorTicket, TicketStatus } from '../../api/types';
import { StatusBadge } from '../../components/badges';
import { Thread } from '../../components/Thread';
import { Button, Card, cx, EmptyState, ErrorNotice, inputClass, PageHeader, PageLoader } from '../../components/ui';
import { formatDateTime, formatFileSize, timeAgo } from '../../lib/format';

const STATUS_EXPLANATIONS: Record<TicketStatus, string> = {
  OPEN: "We've received your ticket and will reply soon.",
  IN_PROGRESS: 'Our team is working on this.',
  RESOLVED: 'We believe this is sorted. Reply below if you need anything else; that reopens the ticket.',
  CLOSED: 'This ticket is closed. Raise a new one if you need more help.',
};

const FILTERS: { key: string; label: string; statuses: TicketStatus[] | null }[] = [
  { key: 'all', label: 'All', statuses: null },
  { key: 'active', label: 'Active', statuses: ['OPEN', 'IN_PROGRESS'] },
  { key: 'done', label: 'Resolved & closed', statuses: ['RESOLVED', 'CLOSED'] },
];

export function AuthorTicketsPage() {
  const tickets = useAuthorTickets();
  const [searchParams] = useSearchParams();
  const [filter, setFilter] = useState('all');
  const [expanded, setExpanded] = useState<string | null>(searchParams.get('open'));

  if (tickets.isPending) return <PageLoader />;
  if (tickets.error) return <ErrorNotice error={tickets.error} />;

  const statuses = FILTERS.find((item) => item.key === filter)?.statuses;
  const visible = tickets.data.data.filter((ticket) => !statuses || statuses.includes(ticket.status.code));

  return (
    <>
      <PageHeader
        title="My tickets"
        subtitle="Replies from our team appear here as soon as they're sent."
        action={
          <Link to="/author/tickets/new" className="rounded-md bg-brand-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-700">
            Raise a ticket
          </Link>
        }
      />

      {tickets.data.data.length === 0 ? (
        <EmptyState
          title="No tickets yet"
          message="Questions about royalties, ISBNs, printing or your book's progress? Raise a ticket and our team will get back to you."
          action={
            <Link to="/author/tickets/new" className="text-sm font-medium text-brand-600 hover:underline">
              Raise your first ticket →
            </Link>
          }
        />
      ) : (
        <>
          <div className="mb-4 flex gap-1">
            {FILTERS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setFilter(item.key)}
                className={cx(
                  'rounded-md px-3 py-1.5 text-sm font-medium',
                  filter === item.key ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50',
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          {visible.length === 0 ? (
            <EmptyState title="Nothing here" message="No tickets match this filter." />
          ) : (
            <div className="space-y-3">
              {visible.map((ticket) => (
                <TicketCard
                  key={ticket.id}
                  ticket={ticket}
                  open={expanded === ticket.id}
                  onToggle={() => setExpanded(expanded === ticket.id ? null : ticket.id)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}

function TicketCard({ ticket, open, onToggle }: { ticket: AuthorTicket; open: boolean; onToggle: () => void }) {
  const replies = ticket.messages.filter((message) => message.sender.role === 'ADMIN').length;
  return (
    <Card>
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-4 px-4 py-3 text-left" aria-expanded={open}>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-slate-900">{ticket.subject}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {ticket.reference} · {ticket.book?.title ?? 'General / account'} · updated {timeAgo(ticket.lastActivityAt)}
            {replies > 0 && ` · ${replies} ${replies === 1 ? 'reply' : 'replies'} from BookLeaf`}
          </p>
        </div>
        <StatusBadge status={ticket.status.code} />
        <span className="text-slate-400">{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div className="space-y-4 border-t border-slate-100 px-4 py-4">
          <p className="text-sm text-slate-600">{STATUS_EXPLANATIONS[ticket.status.code]}</p>
          <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm">
            <p className="mb-1 text-xs font-medium text-slate-500">Your request · {formatDateTime(ticket.createdAt)}</p>
            <p className="whitespace-pre-wrap leading-relaxed text-slate-800">{ticket.description}</p>
            {ticket.attachment && (
              <p className="mt-2 text-xs text-slate-500">
                Attachment: {ticket.attachment.fileName}
                {ticket.attachment.fileSize ? ` (${formatFileSize(ticket.attachment.fileSize)})` : ''}
              </p>
            )}
          </div>
          <Thread messages={ticket.messages} perspective="AUTHOR" />
          {ticket.status.code !== 'CLOSED' && <ReplyForm ticketId={ticket.id} reopens={ticket.status.code === 'RESOLVED'} />}
        </div>
      )}
    </Card>
  );
}

function ReplyForm({ ticketId, reopens }: { ticketId: string; reopens: boolean }) {
  const [body, setBody] = useState('');
  const send = useSendMessage(ticketId);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    send.mutate({ body }, { onSuccess: () => setBody('') });
  };

  return (
    <form onSubmit={submit} className="space-y-2">
      <textarea
        rows={3}
        className={inputClass}
        placeholder={reopens ? 'Still need help? Replying reopens this ticket.' : 'Add a reply…'}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        aria-label="Reply"
      />
      {send.error && <ErrorNotice error={send.error} />}
      <div className="flex justify-end">
        <Button type="submit" disabled={!body.trim() || send.isPending}>
          {send.isPending ? 'Sending…' : 'Send reply'}
        </Button>
      </div>
    </form>
  );
}
