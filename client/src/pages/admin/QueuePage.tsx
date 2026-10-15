import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useAdminTickets, useAiMetrics, type QueueFilters } from '../../api/queries';
import type { AdminTicketSummary } from '../../api/types';
import { PriorityBadge, SourceTag, StatusBadge } from '../../components/badges';
import { Button, Card, cx, EmptyState, ErrorNotice, inputClass, Notice, PageHeader, PageLoader, Spinner } from '../../components/ui';
import { formatDuration } from '../../lib/format';
import { CATEGORY_LABELS, entriesOf, PRIORITY_LABELS } from '../../lib/labels';
import { FIRST_RESPONSE_TARGET_HOURS, isResponseOverdue } from '../../lib/sla';

/** Saved views: the queue opens on unresolved work, most urgent and oldest first. */
const VIEWS = [
  { key: 'unresolved', label: 'Unresolved', filters: { status: 'OPEN,IN_PROGRESS' } },
  { key: 'mine', label: 'Assigned to me', filters: { status: 'OPEN,IN_PROGRESS', assignee: 'me' } },
  { key: 'unassigned', label: 'Unassigned', filters: { status: 'OPEN,IN_PROGRESS', assignee: 'unassigned' } },
  { key: 'resolved', label: 'Resolved & closed', filters: { status: 'RESOLVED,CLOSED' } },
  { key: 'all', label: 'All', filters: {} },
] as const;

const SORTS = [
  { value: 'priority', label: 'Most urgent first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'newest', label: 'Newest first' },
  { value: 'updated', label: 'Recently updated' },
];

export function QueuePage() {
  // Filters live in the URL, so a filtered view survives a refresh and can be shared with a colleague.
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const view = VIEWS.find((item) => item.key === params.get('view')) ?? VIEWS[0];
  const filters: QueueFilters = {
    ...view.filters,
    category: params.get('category') ?? undefined,
    priority: params.get('priority') ?? undefined,
    from: params.get('from') ?? undefined,
    to: params.get('to') ?? undefined,
    sort: params.get('sort') ?? 'priority',
    page: Number(params.get('page') ?? 1),
  };
  const tickets = useAdminTickets(filters);
  const now = useNow();

  const update = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (!('page' in changes)) next.delete('page');
    setParams(next);
  };

  return (
    <>
      <PageHeader title="Ticket queue" subtitle="Most urgent and longest-waiting tickets first. Updates arrive live." />
      <AiStatusBanner />

      <div className="mb-4 flex flex-wrap gap-1">
        {VIEWS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => update({ view: item.key === 'unresolved' ? undefined : item.key })}
            className={cx(
              'rounded-md px-3 py-1.5 text-sm font-medium',
              view.key === item.key ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <Card className="mb-4 grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-5">
        <select aria-label="Category" className={inputClass} value={filters.category ?? ''} onChange={(e) => update({ category: e.target.value })}>
          <option value="">All categories</option>
          {entriesOf(CATEGORY_LABELS).map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </select>
        <select aria-label="Priority" className={inputClass} value={filters.priority ?? ''} onChange={(e) => update({ priority: e.target.value })}>
          <option value="">All priorities</option>
          {entriesOf(PRIORITY_LABELS).map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </select>
        <input aria-label="Created from" type="date" className={inputClass} value={filters.from ?? ''} onChange={(e) => update({ from: e.target.value })} />
        <input aria-label="Created to" type="date" className={inputClass} value={filters.to ?? ''} onChange={(e) => update({ to: e.target.value })} />
        <select aria-label="Sort" className={inputClass} value={filters.sort} onChange={(e) => update({ sort: e.target.value === 'priority' ? undefined : e.target.value })}>
          {SORTS.map((sort) => (
            <option key={sort.value} value={sort.value}>
              {sort.label}
            </option>
          ))}
        </select>
      </Card>

      {tickets.isPending ? (
        <PageLoader />
      ) : tickets.error ? (
        <ErrorNotice error={tickets.error} />
      ) : tickets.data.data.length === 0 ? (
        <EmptyState title="Queue is clear" message="No tickets match this view." />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">Priority</th>
                  <th className="px-4 py-2.5">Ticket</th>
                  <th className="px-4 py-2.5">Category</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Waiting</th>
                  <th className="px-4 py-2.5">Assignee</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tickets.data.data.map((ticket) => (
                  <QueueRow key={ticket.id} ticket={ticket} now={now} onOpen={() => navigate(`/admin/tickets/${ticket.id}`)} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5 text-sm text-slate-500">
            <span>
              {tickets.data.meta.total} ticket{tickets.data.meta.total === 1 ? '' : 's'}
              {tickets.isFetching && <Spinner />}
            </span>
            <span className="flex items-center gap-2">
              <Button variant="secondary" disabled={filters.page === 1} onClick={() => update({ page: String((filters.page ?? 1) - 1) })}>
                Previous
              </Button>
              Page {tickets.data.meta.page} of {tickets.data.meta.totalPages}
              <Button
                variant="secondary"
                disabled={tickets.data.meta.page >= tickets.data.meta.totalPages}
                onClick={() => update({ page: String((filters.page ?? 1) + 1) })}
              >
                Next
              </Button>
            </span>
          </div>
        </Card>
      )}
      <p className="mt-3 text-xs text-slate-500">
        First-response targets: Critical {FIRST_RESPONSE_TARGET_HOURS.CRITICAL}h · High {FIRST_RESPONSE_TARGET_HOURS.HIGH}h · Medium{' '}
        {FIRST_RESPONSE_TARGET_HOURS.MEDIUM}h · Low {FIRST_RESPONSE_TARGET_HOURS.LOW}h. Tickets past their target are flagged.
      </p>
    </>
  );
}

function QueueRow({ ticket, now, onOpen }: { ticket: AdminTicketSummary; now: number; onOpen: () => void }) {
  const overdue = isResponseOverdue(ticket, now);
  const resolved = ticket.status.code === 'RESOLVED' || ticket.status.code === 'CLOSED';
  return (
    <tr className={cx('cursor-pointer hover:bg-slate-50', overdue && 'bg-red-50/60')} onClick={onOpen}>
      <td className="px-4 py-3">
        <div className="flex flex-col items-start gap-1">
          <PriorityBadge priority={ticket.priority?.code ?? null} />
          {ticket.aiStatus === 'FALLBACK' && <span className="text-[11px] text-slate-500">rules (AI unavailable)</span>}
        </div>
      </td>
      <td className="max-w-md px-4 py-3">
        <a href={`/admin/tickets/${ticket.id}`} onClick={(e) => e.preventDefault()} className="font-medium text-slate-900 hover:text-brand-700">
          {ticket.subject}
        </a>
        <p className="mt-0.5 truncate text-xs text-slate-500">
          {ticket.reference} · {ticket.author.name} · {ticket.book?.title ?? 'General / account'}
        </p>
      </td>
      <td className="px-4 py-3">
        {ticket.category ? (
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-slate-700">{CATEGORY_LABELS[ticket.category.code]}</span>
            <SourceTag source={ticket.category.source} />
          </span>
        ) : (
          <span className="text-slate-400">Classifying…</span>
        )}
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={ticket.status.code} />
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        {resolved ? (
          <span className="text-slate-400">—</span>
        ) : (
          <span className={cx(overdue ? 'font-medium text-red-700' : 'text-slate-700')}>
            {formatDuration(now - new Date(ticket.createdAt).getTime())}
            {overdue && <span className="block text-[11px]">reply overdue</span>}
            {!overdue && !ticket.firstResponseAt && <span className="block text-[11px] text-slate-500">awaiting first reply</span>}
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-slate-600">{ticket.assignee?.name ?? <span className="text-slate-400">Unassigned</span>}</td>
    </tr>
  );
}

function AiStatusBanner() {
  const metrics = useAiMetrics();
  const status = metrics.data?.status;
  if (!status || (status.enabled && status.circuit === 'closed')) return null;
  return (
    <div className="mb-4">
      <Notice tone="warning">
        {status.enabled
          ? 'The AI service is failing right now. New tickets are triaged by keyword rules and retried automatically; drafts are unavailable, so reply manually.'
          : 'AI assistance is switched off. Tickets are triaged by keyword rules and replies are written manually.'}
      </Notice>
    </div>
  );
}

/** Current time, refreshed every minute so "waiting" times and overdue flags stay accurate. */
function useNow(): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
