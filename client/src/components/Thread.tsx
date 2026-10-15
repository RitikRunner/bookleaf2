import type { Message } from '../api/types';
import { formatDateTime } from '../lib/format';
import { cx } from './ui';

/** A ticket conversation. `perspective` decides which side counts as "us" for alignment. */
export function Thread({ messages, perspective }: { messages: Message[]; perspective: 'AUTHOR' | 'ADMIN' }) {
  if (messages.length === 0) return null;
  return (
    <ol className="space-y-3">
      {messages.map((message) => {
        const fromBookLeaf = message.sender.role === 'ADMIN';
        const mine = (perspective === 'ADMIN') === fromBookLeaf;
        return (
          <li key={message.id} className={cx('flex', mine ? 'justify-end' : 'justify-start')}>
            <div
              className={cx(
                'max-w-[85%] rounded-lg px-4 py-3 text-sm',
                fromBookLeaf ? 'bg-brand-50 text-slate-800 ring-1 ring-brand-100' : 'bg-slate-100 text-slate-800',
              )}
            >
              <p className="mb-1 text-xs font-medium text-slate-500">
                {fromBookLeaf ? `${message.sender.name} · BookLeaf Support` : message.sender.name} · {formatDateTime(message.createdAt)}
              </p>
              <p className="whitespace-pre-wrap leading-relaxed">{message.body}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
