import { Link } from 'react-router';
import { useAuthor, useBooks, useMe } from '../../api/queries';
import type { Book } from '../../api/types';
import { BookFacts, ProductionProgress } from '../../components/BookDetails';
import { RoyaltySummary } from '../../components/RoyaltySummary';
import { Card, CardHeader, EmptyState, ErrorNotice, PageHeader, PageLoader } from '../../components/ui';
import { formatDate } from '../../lib/format';

export function BooksPage() {
  const { data: me } = useMe();
  const author = useAuthor(me?.authorId);
  const books = useBooks();

  if (author.isPending || books.isPending) return <PageLoader />;
  if (author.error || books.error) return <ErrorNotice error={author.error ?? books.error} />;

  return (
    <>
      <PageHeader
        title="My books"
        subtitle={`Royalty figures as of ${formatDate(author.data.royalty.asOf)}`}
        action={
          <Link to="/author/tickets/new" className="rounded-md bg-brand-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-700">
            Raise a ticket
          </Link>
        }
      />

      <Card className="mb-8">
        <CardHeader title="Royalties across all your books" subtitle="80% of the net profit on every copy is yours, calculated quarterly." />
        <div className="p-4">
          <RoyaltySummary summary={author.data.royalty} />
        </div>
      </Card>

      {books.data.length === 0 ? (
        <EmptyState title="No books yet" message="Once your manuscript is with us, its progress will show here." />
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {books.data.map((book) => (
            <BookCard key={book.id} book={book} />
          ))}
        </div>
      )}
    </>
  );
}

function BookCard({ book }: { book: Book }) {
  const inProduction = book.status === 'IN_PRODUCTION';
  return (
    <Card>
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div>
          <h2 className="font-semibold text-slate-900">{book.title}</h2>
          <p className="text-xs text-slate-500">{book.genre}</p>
        </div>
        <span
          className={
            inProduction
              ? 'rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800'
              : 'rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800'
          }
        >
          {inProduction ? 'In production' : 'Published & live'}
        </span>
      </div>
      <div className="space-y-4 p-4">
        {inProduction && <ProductionProgress book={book} />}
        <BookFacts book={book} />
        <Link to={`/author/tickets/new?book=${book.id}`} className="inline-block text-sm font-medium text-brand-600 hover:underline">
          Ask about this book →
        </Link>
      </div>
    </Card>
  );
}
