import { useEffect, useState } from 'react';
import type { TaskEvent } from '../types';

export function useEvents(onEvent?: (event: TaskEvent) => void) {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const baseUrl = import.meta.env.VITE_API_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8080');
    const url = new URL('/api/events', baseUrl);
    let eventSource: EventSource | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      try {
        eventSource = new EventSource(url.toString());

        const handleIncomingEvent = (e: Event) => {
          if (e instanceof MessageEvent) {
            try {
              const event = JSON.parse(e.data) as TaskEvent;
              onEvent?.(event);
            } catch (err) {
              console.error('Failed to parse event:', err);
            }
          }
        };

        eventSource.addEventListener('task.created', handleIncomingEvent);
        eventSource.addEventListener('task.updated', handleIncomingEvent);
        eventSource.addEventListener('task.started', handleIncomingEvent);
        eventSource.addEventListener('execution.completed', handleIncomingEvent);
        eventSource.addEventListener('prd.generated', handleIncomingEvent);
        eventSource.addEventListener('assignment.updated', handleIncomingEvent);

        eventSource.onopen = () => {
          setConnected(true);
          setError(null);
        };

        eventSource.onerror = () => {
          setConnected(false);
          if (eventSource?.readyState === EventSource.CLOSED) {
            setError('Connection closed');
            reconnectTimeout = setTimeout(connect, 3000);
          }
        };
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Connection failed');
        reconnectTimeout = setTimeout(connect, 3000);
      }
    };

    connect();

    return () => {
      if (eventSource) eventSource.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, [onEvent]);

  return { connected, error };
}
