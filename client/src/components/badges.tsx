import type { ReactNode } from 'react';
import type { ClassificationSource, TicketPriority, TicketStatus } from '../api/types';
import { PRIORITY_LABELS, STATUS_LABELS } from '../lib/labels';
import { cx } from './ui';

function Badge({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', className)}>
      {children}
    </span>
  );
}

const STATUS_STYLES: Record<TicketStatus, string> = {
  OPEN: 'bg-sky-100 text-sky-800',
  IN_PROGRESS: 'bg-amber-100 text-amber-800',
  RESOLVED: 'bg-emerald-100 text-emerald-800',
  CLOSED: 'bg-slate-200 text-slate-700',
};

export function StatusBadge({ status }: { status: TicketStatus }) {
  return <Badge className={STATUS_STYLES[status]}>{STATUS_LABELS[status]}</Badge>;
}

const PRIORITY_STYLES: Record<TicketPriority, string> = {
  CRITICAL: 'bg-red-600 text-white',
  HIGH: 'bg-orange-100 text-orange-800',
  MEDIUM: 'bg-yellow-100 text-yellow-800',
  LOW: 'bg-slate-100 text-slate-600',
};

export function PriorityBadge({ priority }: { priority: TicketPriority | null }) {
  if (!priority) return <Badge className="bg-slate-100 text-slate-500">Triaging…</Badge>;
  return <Badge className={PRIORITY_STYLES[priority]}>{PRIORITY_LABELS[priority]}</Badge>;
}

const SOURCE_LABELS: Record<ClassificationSource, string> = {
  AI: 'AI',
  RULES: 'Rules',
  ADMIN: 'Set by admin',
};

/** Who set a classification: shown next to category and priority so admins know what to double-check. */
export function SourceTag({ source }: { source: ClassificationSource | null }) {
  if (!source) return null;
  const style = source === 'AI' ? 'bg-violet-100 text-violet-700' : source === 'RULES' ? 'bg-slate-100 text-slate-600' : 'bg-brand-50 text-brand-700';
  return <Badge className={style}>{SOURCE_LABELS[source]}</Badge>;
}

export function NeutralBadge({ children }: { children: ReactNode }) {
  return <Badge className="bg-slate-100 text-slate-700">{children}</Badge>;
}
