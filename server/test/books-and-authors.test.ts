import { describe, expect, it } from 'vitest';
import { accounts, signIn } from './helpers.js';

describe('books', () => {
  it('lists books in production first, with nullable fields as null rather than zero', async () => {
    const kavita = await signIn(accounts.kavita);
    const res = await kavita.get('/api/v1/books').expect(200);
    const [inProduction, published] = res.body.data;

    expect(inProduction).toMatchObject({
      id: 'BK015',
      status: 'IN_PRODUCTION',
      stage: { code: 'TYPESETTING', label: 'Typesetting', step: 4, of: 9 },
      isbnStatus: 'RESERVED',
      mrp: null,
      publicationDate: null,
      availableOn: [],
    });
    expect(published).toMatchObject({ id: 'BK016', status: 'PUBLISHED', royalty: { pending: 850, neverPaid: true } });
  });

  it('labels platforms and print partners', async () => {
    const rohit = await signIn(accounts.rohit);
    const res = await rohit.get('/api/v1/books/BK004').expect(200);
    expect(res.body.data.printPartner).toEqual({ code: 'IN_HOUSE', label: 'In-House' });
    expect(res.body.data.availableOn.map((platform: { label: string }) => platform.label)).toContain('Amazon UK');
  });
});

describe('author royalty summary', () => {
  it('applies the ₹1,000 minimum to the combined balance', async () => {
    const kavita = await signIn(accounts.kavita);
    const res = await kavita.get('/api/v1/authors/AUTH009').expect(200);
    expect(res.body.data.royalty).toMatchObject({
      asOf: '2026-01-15',
      totalPending: 850,
      minimumPayout: 1000,
      payoutState: 'BELOW_MINIMUM',
      nextPayout: { quarterEnding: '2025-12-31', payBy: '2026-02-14' },
    });
  });

  it('flags never-paid balances above the minimum for review', async () => {
    const admin = await signIn(accounts.admin);
    const res = await admin.get('/api/v1/authors').expect(200);
    const states = Object.fromEntries(
      res.body.data.map((author: { id: string; royalty: { payoutState: string } }) => [author.id, author.royalty.payoutState]),
    );
    expect(states).toMatchObject({
      AUTH001: 'SCHEDULED',
      AUTH003: 'NEEDS_REVIEW', // Ananya: never paid since July 2024
      AUTH006: 'NEEDS_REVIEW', // Arjun: never paid since September 2024
      AUTH008: 'NOTHING_PENDING', // Farhan: fully paid
      AUTH009: 'BELOW_MINIMUM', // Kavita: ₹850
    });
  });
});
