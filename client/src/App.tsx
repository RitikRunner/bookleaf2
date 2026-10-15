import { Navigate, Route, Routes } from 'react-router';
import { useMe } from './api/queries';
import { AppShell, homePath, RequireRole } from './components/AppShell';
import { PageLoader } from './components/ui';
import { InsightsPage } from './pages/admin/InsightsPage';
import { QueuePage } from './pages/admin/QueuePage';
import { AdminTicketPage } from './pages/admin/TicketPage';
import { BooksPage } from './pages/author/BooksPage';
import { NewTicketPage } from './pages/author/NewTicketPage';
import { AuthorTicketsPage } from './pages/author/TicketsPage';
import { LoginPage } from './pages/LoginPage';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        element={
          <RequireRole role="AUTHOR">
            <AppShell />
          </RequireRole>
        }
      >
        <Route path="/author/books" element={<BooksPage />} />
        <Route path="/author/tickets" element={<AuthorTicketsPage />} />
        <Route path="/author/tickets/new" element={<NewTicketPage />} />
      </Route>

      <Route
        element={
          <RequireRole role="ADMIN">
            <AppShell />
          </RequireRole>
        }
      >
        <Route path="/admin/tickets" element={<QueuePage />} />
        <Route path="/admin/tickets/:ticketId" element={<AdminTicketPage />} />
        <Route path="/admin/insights" element={<InsightsPage />} />
      </Route>

      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  );
}

/** Sends people to their portal's home page, or to sign in. */
function HomeRedirect() {
  const me = useMe();
  if (me.isPending) return <PageLoader />;
  return <Navigate to={me.data ? homePath(me.data.role) : '/login'} replace />;
}
