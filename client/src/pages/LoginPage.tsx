import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { useLogin, useMe } from '../api/queries';
import { homePath } from '../components/AppShell';
import { Button, Card, ErrorNotice, Field, inputClass, PageLoader } from '../components/ui';

// Seeded demo accounts (see README). Each one shows a different scenario from the BookLeaf dataset.
const DEMO_ACCOUNTS = [
  { email: 'admin@bookleaf.test', password: 'Admin@123', who: 'Neha Verma', note: 'Admin: support lead' },
  { email: 'kavita.deshmukh@email.com', password: 'Author@123', who: 'Kavita Deshmukh', note: 'Book in typesetting; ₹850 below payout minimum' },
  { email: 'ananya.reddy@email.com', password: 'Author@123', who: 'Ananya Reddy', note: 'Never been paid since 2024' },
  { email: 'sneha.kulkarni@email.com', password: 'Author@123', who: 'Sneha Kulkarni', note: 'Three books, one in cover design' },
  { email: 'farhan.sheikh@email.com', password: 'Author@123', who: 'Farhan Sheikh', note: 'Fully paid, resolved ticket' },
];

export function LoginPage() {
  const me = useMe();
  const login = useLogin();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  if (me.isPending) return <PageLoader />;
  if (me.data) return <Navigate to={homePath(me.data.role)} replace />;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    login.mutate({ email, password }, { onSuccess: (profile) => navigate(homePath(profile.role)) });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-brand-50 to-slate-50 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-brand-600 text-lg font-bold text-white">B</span>
          <h1 className="mt-3 text-2xl font-semibold text-slate-900">BookLeaf Author Support</h1>
          <p className="mt-1 text-sm text-slate-500">Track your books and royalties, and get help from our team.</p>
        </div>

        <Card className="p-6">
          <form onSubmit={submit} className="space-y-4">
            <Field label="Email" htmlFor="email">
              <input id="email" type="email" autoComplete="email" required className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Password" htmlFor="password">
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                className={inputClass}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            {login.error && <ErrorNotice error={login.error} />}
            <Button type="submit" className="w-full" disabled={login.isPending}>
              {login.isPending ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </Card>

        <Card className="mt-4 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Demo accounts</p>
          <ul className="mt-2 divide-y divide-slate-100">
            {DEMO_ACCOUNTS.map((account) => (
              <li key={account.email}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 py-2 text-left hover:text-brand-700"
                  onClick={() => {
                    setEmail(account.email);
                    setPassword(account.password);
                  }}
                >
                  <span>
                    <span className="block text-sm font-medium">{account.who}</span>
                    <span className="block text-xs text-slate-500">{account.note}</span>
                  </span>
                  <span className="text-xs text-brand-600">Use</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-500">All ten authors from the dataset can sign in with password Author@123.</p>
        </Card>
      </div>
    </div>
  );
}
