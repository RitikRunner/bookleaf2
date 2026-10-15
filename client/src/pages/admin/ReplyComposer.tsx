import { useEffect, useState } from 'react';
import { ApiError } from '../../api/client';
import { useDraft, useRegenerateDraft, useSendMessage } from '../../api/queries';
import type { AdminTicket, Draft, TicketStatus } from '../../api/types';
import { Button, Card, CardHeader, ErrorNotice, inputClass, Notice, Spinner } from '../../components/ui';
import { timeAgo } from '../../lib/format';
import { ESCALATION_LABELS } from '../../lib/labels';

const PLACEHOLDER = /\[CONFIRM:[^\]]*\]/g;

/**
 * Reply box with the AI draft. The draft pre-fills the box until the admin starts editing; it is never sent
 * without a person pressing Send, and unfilled [CONFIRM: …] placeholders block sending.
 */
export function ReplyComposer({ ticket }: { ticket: AdminTicket }) {
  const lastMessage = ticket.messages.at(-1);
  const authorIsWaiting = !lastMessage || lastMessage.sender.role === 'AUTHOR';
  const isOpen = ticket.status.code === 'OPEN' || ticket.status.code === 'IN_PROGRESS';
  // Draft automatically only when a reply is actually owed; otherwise wait until the admin asks (saves model calls).
  const [requested, setRequested] = useState(false);
  const draft = useDraft(ticket.id, (authorIsWaiting && isOpen) || requested);
  const regenerate = useRegenerateDraft(ticket.id);
  const send = useSendMessage(ticket.id);

  const [body, setBody] = useState('');
  const [draftId, setDraftId] = useState<string>();
  const [edited, setEdited] = useState(false);

  const useDraftText = (value: Draft) => {
    setBody(value.reply);
    setDraftId(value.id);
    setEdited(false);
  };

  useEffect(() => {
    if (draft.data && !edited) useDraftText(draft.data);
    // Only react to a new draft arriving, not to every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.data?.id]);

  const placeholders = body.match(PLACEHOLDER) ?? [];
  const canSend = body.trim().length > 0 && placeholders.length === 0 && !send.isPending;
  const suggestResolve = draft.data?.suggestedStatus === 'RESOLVED' && draftId === draft.data.id;

  const sendReply = (status?: TicketStatus) =>
    send.mutate(
      { body, status, draftId },
      {
        onSuccess: () => {
          setBody('');
          setDraftId(undefined);
          setEdited(true); // don't refill with the old draft
        },
      },
    );

  return (
    <Card>
      <CardHeader
        title="Reply to author"
        subtitle="Sent replies appear on the author's ticket immediately."
        action={
          <Button
            variant="ghost"
            disabled={regenerate.isPending || draft.isFetching}
            onClick={() => (draft.data || draft.error ? regenerate.mutate(undefined, { onSuccess: useDraftText }) : setRequested(true))}
          >
            {regenerate.isPending ? 'Drafting…' : draft.data ? 'Regenerate draft' : 'Draft with AI'}
          </Button>
        }
      />
      <div className="space-y-3 p-4">
        <DraftStatus draft={draft.data} loading={draft.isFetching || regenerate.isPending} error={draft.error ?? regenerate.error} />

        {draft.data && edited && draftId !== draft.data.id && (
          <button type="button" className="text-sm font-medium text-brand-600 hover:underline" onClick={() => useDraftText(draft.data!)}>
            Replace my text with the AI draft
          </button>
        )}

        <textarea
          rows={15}
          className={inputClass}
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            setEdited(true);
          }}
          placeholder="Write your reply…"
          aria-label="Reply"
        />

        {placeholders.length > 0 && (
          <Notice tone="warning">
            Fill in before sending: {placeholders.map((placeholder) => <code key={placeholder} className="mx-1 rounded bg-amber-100 px-1">{placeholder}</code>)}
          </Notice>
        )}
        {send.error && <ErrorNotice error={send.error} />}

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant={suggestResolve ? 'secondary' : 'primary'} disabled={!canSend} onClick={() => sendReply()}>
            Send reply
          </Button>
          <Button variant={suggestResolve ? 'primary' : 'secondary'} disabled={!canSend} onClick={() => sendReply('RESOLVED')}>
            Send &amp; mark resolved
          </Button>
        </div>
      </div>
    </Card>
  );
}

function DraftStatus({ draft, loading, error }: { draft?: Draft; loading: boolean; error: unknown }) {
  if (loading) return <Spinner label="Drafting a reply from BookLeaf policy and this author's account…" />;
  if (error instanceof ApiError && error.code === 'AI_UNAVAILABLE') {
    return <Notice tone="warning">AI drafting is unavailable right now. Write your reply below; nothing else is affected.</Notice>;
  }
  if (error) return <ErrorNotice error={error} />;
  if (!draft) return null;

  return (
    <div className="space-y-2 rounded-md border border-violet-100 bg-violet-50/60 px-3 py-2.5 text-sm">
      <p className="text-xs text-violet-800">
        AI draft · {timeAgo(draft.createdAt)} · review and edit before sending
        {draft.escalateTo !== 'NONE' && (
          <span className="ml-2 rounded-full bg-violet-100 px-2 py-0.5 font-medium">Escalate to {ESCALATION_LABELS[draft.escalateTo]}</span>
        )}
      </p>
      {draft.freshness === 'STALE' && (
        <Notice tone="warning">This draft was written before the latest message, and AI is unavailable to update it. Edit carefully.</Notice>
      )}
      {draft.adminNotes.length > 0 && (
        <ul className="list-inside list-disc text-slate-700">
          {draft.adminNotes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
