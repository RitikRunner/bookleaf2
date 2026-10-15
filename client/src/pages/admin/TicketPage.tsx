import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { useAddNote, useAdminTicket, useAuthor, useBook, useMe, useReclassify, useUpdateTicket } from '../../api/queries';
import type { AdminTicket, TicketCategory, TicketPriority, TicketStatus } from '../../api/types';
import { ProductionProgress, BookFacts } from '../../components/BookDetails';
import { SourceTag, StatusBadge } from '../../components/badges';
import { RoyaltySummary } from '../../components/RoyaltySummary';
import { Thread } from '../../components/Thread';
import { Button, Card, CardHeader, ErrorNotice, inputClass, PageLoader, Spinner } from '../../components/ui';
import { formatDate, formatDateTime, formatFileSize, timeAgo } from '../../lib/format';
import { CATEGORY_LABELS, entriesOf, PRIORITY_LABELS, STATUS_LABELS } from '../../lib/labels';
import { ReplyComposer } from './ReplyComposer';

export function AdminTicketPage() {
  const { ticketId = '' } = useParams();
  const ticket = useAdminTicket(ticketId);

  if (ticket.isPending) return <PageLoader />;
  if (ticket.error) return <ErrorNotice error={ticket.error} />;
  const data = ticket.data;

  return (
    <>
      <Link to="/admin/tickets" className="text-sm text-brand-600 hover:underline">
        ← Back to queue
      </Link>
      <div className="mb-6 mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{data.subject}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {data.reference} · raised by {data.author.name} {timeAgo(data.createdAt)} · {data.book?.title ?? 'General / account level'}
          </p>
        </div>
        <StatusBadge status={data.status.code} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Author's request" subtitle={formatDateTime(data.createdAt)} />
            <div className="p-4 text-sm">
              <p className="whitespace-pre-wrap leading-relaxed text-slate-800">{data.description}</p>
              {data.attachment && (
                <p className="mt-3 text-xs text-slate-500">
                  Attachment: {data.attachment.fileName}
                  {data.attachment.fileSize ? ` (${formatFileSize(data.attachment.fileSize)})` : ''}. File storage isn't enabled; ask the author to email it if needed.
                </p>
              )}
            </div>
          </Card>

          {data.messages.length > 0 && (
            <Card>
              <CardHeader title="Conversation" />
              <div className="p-4">
                <Thread messages={data.messages} perspective="ADMIN" />
              </div>
            </Card>
          )}

          <ReplyComposer ticket={data} />
        </div>

        <div className="space-y-6">
          <TriagePanel ticket={data} />
          <AuthorContext ticket={data} />
          <NotesPanel ticket={data} />
        </div>
      </div>
    </>
  );
}

function TriagePanel({ ticket }: { ticket: AdminTicket }) {
  const { data: me } = useMe();
  const update = useUpdateTicket(ticket.id);
  const reclassify = useReclassify(ticket.id);
  const { ai } = ticket;

  return (
    <Card>
      <CardHeader title="Triage" />
      <div className="space-y-4 p-4 text-sm">
        <label className="block">
          <span className="mb-1 block font-medium text-slate-700">Status</span>
          <select className={inputClass} value={ticket.status.code} onChange={(e) => update.mutate({ status: e.target.value as TicketStatus })}>
            {entriesOf(STATUS_LABELS).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 flex items-center justify-between font-medium text-slate-700">
            Category <SourceTag source={ticket.category?.source ?? null} />
          </span>
          <select
            className={inputClass}
            value={ticket.category?.code ?? ''}
            onChange={(e) => update.mutate({ category: e.target.value as TicketCategory })}
          >
            {!ticket.category && <option value="">Classifying…</option>}
            {entriesOf(CATEGORY_LABELS).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 flex items-center justify-between font-medium text-slate-700">
            Priority <SourceTag source={ticket.priority?.source ?? null} />
          </span>
          <select
            className={inputClass}
            value={ticket.priority?.code ?? ''}
            onChange={(e) => update.mutate({ priority: e.target.value as TicketPriority })}
          >
            {!ticket.priority && <option value="">Classifying…</option>}
            {entriesOf(PRIORITY_LABELS).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <div className="rounded-md bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
          {ai.status === 'PENDING' && <Spinner label="AI triage in progress…" />}
          {ai.status === 'COMPLETED' && ai.category && ai.priority && (
            <p>
              <span className="font-medium text-violet-700">AI suggested</span> {CATEGORY_LABELS[ai.category]} · {PRIORITY_LABELS[ai.priority]}
              {ai.confidence && ` · ${ai.confidence.toLowerCase()} confidence`}
            </p>
          )}
          {ai.status === 'FALLBACK' && <p className="font-medium">Triaged by keyword rules because AI was unavailable ({ai.lastError}). It will be retried.</p>}
          {ai.reasoning && <p className="mt-1 italic">{ai.reasoning}</p>}
          <button
            type="button"
            className="mt-2 font-medium text-brand-600 hover:underline disabled:text-slate-400"
            disabled={reclassify.isPending}
            onClick={() => reclassify.mutate()}
          >
            {reclassify.isPending ? 'Re-running…' : 'Re-run AI triage'}
          </button>
        </div>

        <div>
          <span className="mb-1 block font-medium text-slate-700">Assignee</span>
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-700">{ticket.assignee?.name ?? 'Unassigned'}</span>
            {ticket.assignee?.id === me?.id ? (
              <Button variant="secondary" onClick={() => update.mutate({ assigneeId: null })}>
                Unassign
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => me && update.mutate({ assigneeId: me.id })}>
                Assign to me
              </Button>
            )}
          </div>
        </div>

        {(update.error || reclassify.error) && <ErrorNotice error={update.error ?? reclassify.error} />}
      </div>
    </Card>
  );
}

/** The author's account and the book in question, so the admin never has to leave the ticket. */
function AuthorContext({ ticket }: { ticket: AdminTicket }) {
  const author = useAuthor(ticket.author.id);
  const book = useBook(ticket.book?.id);

  return (
    <>
      <Card>
        <CardHeader title={ticket.author.name} subtitle={ticket.author.email} />
        <div className="space-y-3 p-4 text-sm">
          {author.data ? (
            <>
              <p className="text-xs text-slate-500">
                {author.data.city ?? 'City unknown'} · with BookLeaf since {formatDate(author.data.joinedDate)} · {author.data.bookCount} book
                {author.data.bookCount === 1 ? '' : 's'} · figures as of {formatDate(author.data.royalty.asOf)}
              </p>
              <RoyaltySummary summary={author.data.royalty} audience="admin" />
            </>
          ) : (
            <Spinner />
          )}
        </div>
      </Card>

      {ticket.book && (
        <Card>
          <CardHeader title={ticket.book.title} subtitle={book.data?.genre} />
          <div className="space-y-3 p-4">
            {book.data ? (
              <>
                {book.data.status === 'IN_PRODUCTION' && <ProductionProgress book={book.data} />}
                <BookFacts book={book.data} />
              </>
            ) : (
              <Spinner />
            )}
          </div>
        </Card>
      )}
    </>
  );
}

function NotesPanel({ ticket }: { ticket: AdminTicket }) {
  const [body, setBody] = useState('');
  const addNote = useAddNote(ticket.id);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    addNote.mutate(body, { onSuccess: () => setBody('') });
  };

  return (
    <Card>
      <CardHeader title="Internal notes" subtitle="Only visible to the BookLeaf team" />
      <div className="space-y-3 p-4 text-sm">
        {ticket.internalNotes.length === 0 && <p className="text-slate-500">No notes yet.</p>}
        {ticket.internalNotes.map((note) => (
          <div key={note.id} className="rounded-md bg-amber-50 px-3 py-2">
            <p className="whitespace-pre-wrap text-slate-800">{note.body}</p>
            <p className="mt-1 text-xs text-slate-500">
              {note.admin.name} · {formatDateTime(note.createdAt)}
            </p>
          </div>
        ))}
        <form onSubmit={submit} className="space-y-2">
          <textarea rows={2} className={inputClass} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a note for the team…" aria-label="Internal note" />
          {addNote.error && <ErrorNotice error={addNote.error} />}
          <div className="flex justify-end">
            <Button type="submit" variant="secondary" disabled={!body.trim() || addNote.isPending}>
              Add note
            </Button>
          </div>
        </form>
      </div>
    </Card>
  );
}
