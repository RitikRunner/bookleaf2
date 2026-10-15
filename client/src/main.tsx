import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { ApiError } from './api/client';
import { queryKeys } from './api/queries';
import { App } from './App';
import { ToastProvider } from './components/Toaster';
import './styles.css';

/** If the session expires mid-use, any 401 signs the user out so the route guards send them to the login page. */
function handleSessionExpiry(error: Error) {
  if (error instanceof ApiError && error.status === 401) queryClient.setQueryData(queryKeys.me, null);
}

const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({ onError: handleSessionExpiry }),
  mutationCache: new MutationCache({ onError: handleSessionExpiry }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // 4xx answers (validation, permissions, not found) won't change on retry.
      retry: (failureCount, error) => !(error instanceof ApiError && error.status < 500) && failureCount < 2,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>
          <App />
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
