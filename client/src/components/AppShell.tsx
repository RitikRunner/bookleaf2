import type { ReactNode } from 'react';
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useLogout, useMe } from '../api/queries';
import type { Role, TicketEvent } from '../api/types';
import { useTicketEvents, type ConnectionState } from '../realtime/useTicketEvents';
import { useToast } from './Toaster';
import { cx, PageLoader } from './ui';

export function homePath(role: Role): string {
  return role === 'ADMIN' ? '/admin/tickets' : '/author/books';
}

/** Renders its children only for a signed-in user with the given role; everyone else is redirected. */
export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const me = useMe();
  const location = useLocation();
  if (me.isPending) return <PageLoader />;
  if (!me.data) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (me.data.role !== role) return <Navigate to={homePath(me.data.role)} replace />;
  return children;
}

const NAV_ITEMS: Record<Role, { to: string; label: string; end?: boolean }[]> = {
  AUTHOR: [
    { to: '/author/books', label: 'My books' },
    { to: '/author/tickets', label: 'My tickets', end: true },
    { to: '/author/tickets/new', label: 'Raise a ticket' },
  ],
  ADMIN: [
    { to: '/admin/tickets', label: 'Ticket queue' },
    { to: '/admin/insights', label: 'AI insights' },
  ],
};

export function AppShell() {
  const { data: me } = useMe();
  const logout = useLogout();
  const navigate = useNavigate();
  const toast = useToast();

  const connection = useTicketEvents((event: TicketEvent) => {
    if (me?.role === 'AUTHOR' && event.reason === 'reply') {
      toast('BookLeaf Support replied to your ticket.', { to: '/author/tickets', label: 'View reply' });
    }
    if (me?.role === 'ADMIN' && event.reason === 'created') {
      toast('A new ticket just came in.', { to: `/admin/tickets/${event.ticketId}`, label: 'Open ticket' });
    }
  });

  if (!me) return null;

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-8 gap-y-2 px-4 py-3 sm:px-6">
          <NavLink to={homePath(me.role)} className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-brand-600 text-sm font-bold text-white">B</span>
            <span className="leading-tight">
              <span className="block text-sm font-semibold text-slate-900">BookLeaf</span>
              <span className="block text-xs text-slate-500">{me.role === 'ADMIN' ? 'Support desk' : 'Author support'}</span>
            </span>
          </NavLink>

          <nav className="flex flex-1 gap-1">
            {NAV_ITEMS[me.role].map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end ?? false}
                className={({ isActive }) =>
                  cx('rounded-md px-3 py-1.5 text-sm font-medium', isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100')
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-4 text-sm">
            <LiveIndicator state={connection} />
            <span className="hidden text-slate-600 sm:inline">{me.name}</span>
            <button
              type="button"
              className="text-slate-500 hover:text-slate-800"
              onClick={() => logout.mutate(undefined, { onSuccess: () => navigate('/login') })}
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}

function LiveIndicator({ state }: { state: ConnectionState }) {
  const live = state === 'live';
  return (
    <span className="flex items-center gap-1.5 text-xs text-slate-500" title={live ? 'Updates appear automatically' : 'Reconnecting…'}>
      <span className={cx('h-2 w-2 rounded-full', live ? 'bg-emerald-500' : 'bg-amber-400')} />
      {live ? 'Live' : 'Connecting'}
    </span>
  );
}
