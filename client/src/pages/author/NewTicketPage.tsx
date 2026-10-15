import { useState, type ChangeEvent, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { ApiError } from '../../api/client';
import { useBooks, useCreateTicket, type NewTicket } from '../../api/queries';
import { useToast } from '../../components/Toaster';
import { Button, Card, ErrorNotice, Field, inputClass, PageHeader } from '../../components/ui';
import { formatFileSize } from '../../lib/format';

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const ATTACHMENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

export function NewTicketPage() {
  const [searchParams] = useSearchParams();
  const books = useBooks();
  const createTicket = useCreateTicket();
  const navigate = useNavigate();
  const toast = useToast();

  const [bookId, setBookId] = useState(searchParams.get('book') ?? '');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [attachment, setAttachment] = useState<NewTicket['attachment']>();
  const [attachmentError, setAttachmentError] = useState<string>();

  const fieldErrors = createTicket.error instanceof ApiError ? createTicket.error.fieldErrors : {};

  // The file itself isn't uploaded (out of scope for this version); its details are recorded with the ticket.
  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setAttachmentError(undefined);
    setAttachment(undefined);
    if (!file) return;
    if (!ATTACHMENT_TYPES.includes(file.type)) return setAttachmentError('Please attach a JPG, PNG, WebP or PDF file.');
    if (file.size > MAX_ATTACHMENT_BYTES) return setAttachmentError('Attachments must be 10 MB or smaller.');
    setAttachment({ fileName: file.name, fileSize: file.size, mimeType: file.type });
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    createTicket.mutate(
      { bookId: bookId || null, subject, description, attachment },
      {
        onSuccess: (ticket) => {
          toast(`Ticket ${ticket.reference} raised. We'll reply on your tickets page.`);
          navigate(`/author/tickets?open=${ticket.id}`);
        },
      },
    );
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Raise a ticket" subtitle="Tell us what's going on. Our reply will appear on your tickets page." />
      <Card className="p-6">
        <form onSubmit={submit} className="space-y-5">
          <Field label="Which book is this about?" htmlFor="book" error={fieldErrors.bookId}>
            <select id="book" className={inputClass} value={bookId} onChange={(e) => setBookId(e.target.value)} disabled={books.isPending}>
              <option value="">General / account level</option>
              {books.data?.map((book) => (
                <option key={book.id} value={book.id}>
                  {book.title}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Subject" htmlFor="subject" error={fieldErrors.subject}>
            <input
              id="subject"
              className={inputClass}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. My book shows as unavailable on Amazon"
              maxLength={150}
              required
            />
          </Field>

          <Field
            label="Details"
            htmlFor="description"
            error={fieldErrors.description}
            hint="Include anything that helps: dates, platform names, what you expected and what happened."
          >
            <textarea
              id="description"
              rows={7}
              className={inputClass}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              minLength={20}
              maxLength={5000}
              required
            />
          </Field>

          <Field
            label="Attachment (optional)"
            htmlFor="attachment"
            error={attachmentError ?? fieldErrors['attachment.mimeType'] ?? fieldErrors['attachment.fileSize']}
            hint={attachment ? `${attachment.fileName} · ${formatFileSize(attachment.fileSize)}` : 'A photo or PDF, e.g. of a printing defect. JPG, PNG, WebP or PDF up to 10 MB.'}
          >
            <input
              id="attachment"
              type="file"
              accept={ATTACHMENT_TYPES.join(',')}
              onChange={chooseFile}
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100"
            />
          </Field>

          {createTicket.error && !Object.keys(fieldErrors).length && <ErrorNotice error={createTicket.error} />}

          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => navigate(-1)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createTicket.isPending || Boolean(attachmentError)}>
              {createTicket.isPending ? 'Sending…' : 'Submit ticket'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
