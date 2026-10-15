import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { queryKeys } from '../api/queries';
import type { TicketEvent } from '../api/types';

export type ConnectionState = 'connecting' | 'live' | 'reconnecting';

/**
 * Subscribes to the server's ticket event stream (Server-Sent Events). Each event only names the ticket that
 * changed; the affected queries are refetched through the normal API. The browser reconnects automatically
 * if the connection drops.
 */
export function useTicketEvents(onEvent?: (event: TicketEvent) => void): ConnectionState {
  const queryClient = useQueryClient();
  const [state, setState] = useState<ConnectionState>('connecting');
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    const source = new EventSource('/api/v1/events');
    source.onopen = () => setState('live');
    source.onerror = () => setState('reconnecting');
    source.onmessage = (message: MessageEvent<string>) => {
      const event = JSON.parse(message.data) as TicketEvent;
      void queryClient.invalidateQueries({ queryKey: queryKeys.tickets });
      void queryClient.invalidateQueries({ queryKey: queryKeys.ticket(event.ticketId) });
      // A new message, note or category changes what the draft should say; the server decides if a new one is needed.
      if (event.reason !== 'status') void queryClient.invalidateQueries({ queryKey: queryKeys.draft(event.ticketId) });
      if (event.reason === 'triage') void queryClient.invalidateQueries({ queryKey: queryKeys.aiMetrics });
      onEventRef.current?.(event);
    };
    return () => source.close();
  }, [queryClient]);

  return state;
}
