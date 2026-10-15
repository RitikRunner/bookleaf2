import type { ReactNode } from 'react';
import type { Book } from '../api/types';
import { formatDate, formatInr } from '../lib/format';
import { NeutralBadge } from './badges';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right text-slate-800">{children}</dd>
    </div>
  );
}

export function ProductionProgress({ book }: { book: Book }) {
  return (
    <div>
      <div className="flex justify-between text-xs text-slate-600">
        <span>
          Currently: <strong className="font-medium text-slate-800">{book.stage.label}</strong>
        </span>
        <span>
          Stage {book.stage.step} of {book.stage.of}
        </span>
      </div>
      <div className="mt-1.5 h-2 rounded-full bg-slate-100">
        <div className="h-2 rounded-full bg-brand-500" style={{ width: `${(book.stage.step / book.stage.of) * 100}%` }} />
      </div>
    </div>
  );
}

/** Key facts about a book. Fields that don't apply yet (books in production) say so instead of showing ₹0. */
export function BookFacts({ book }: { book: Book }) {
  const published = book.status === 'PUBLISHED';
  return (
    <dl className="divide-y divide-slate-100">
      <Row label="ISBN">
        {book.isbn ?? 'Not assigned yet'}
        {book.isbnStatus === 'RESERVED' && <span className="ml-2 text-xs text-slate-500">(reserved)</span>}
      </Row>
      <Row label="Published">{book.publicationDate ? formatDate(book.publicationDate) : 'Not yet'}</Row>
      <Row label="MRP">{book.mrp !== null ? formatInr(book.mrp) : 'Set at publication'}</Row>
      {published ? (
        <>
          <Row label="Copies sold">{book.copiesSold.toLocaleString('en-IN')}</Row>
          <Row label="Royalty per copy">{book.royaltyPerCopy !== null ? formatInr(book.royaltyPerCopy) : '—'}</Row>
          <Row label="Royalty earned">{formatInr(book.royalty.earned)}</Row>
          <Row label="Royalty paid">{formatInr(book.royalty.paid)}</Row>
          <Row label="Royalty pending">{formatInr(book.royalty.pending)}</Row>
          <Row label="Last payout">{book.royalty.lastPayoutDate ? formatDate(book.royalty.lastPayoutDate) : 'None yet'}</Row>
        </>
      ) : (
        <Row label="Royalties">Start once the book is published</Row>
      )}
      {book.printPartner && <Row label="Printed by">{book.printPartner.label}</Row>}
      <Row label="Available on">
        {book.availableOn.length ? (
          <span className="flex flex-wrap justify-end gap-1">
            {book.availableOn.map((platform) => (
              <NeutralBadge key={platform.code}>{platform.label}</NeutralBadge>
            ))}
          </span>
        ) : (
          'After publication'
        )}
      </Row>
    </dl>
  );
}
