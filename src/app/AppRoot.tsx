import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useKukeStore } from '@/store/kukeStore';
import { useRealtime } from '@/realtime/client';
import { WindowFrame } from '@/components/window/WindowFrame';
import { ChatShell } from './ChatShell';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 10_000
    }
  }
});

function RealtimeConnector(): null {
  const isOpen = useKukeStore((state) => state.isOpen);
  useRealtime(isOpen);
  return null;
}

function AppContent(): JSX.Element | null {
  const isOpen = useKukeStore((state) => state.isOpen);

  if (!isOpen) {
    return null;
  }

  return (
    <WindowFrame>
      <ChatShell />
    </WindowFrame>
  );
}

export function AppRoot(): JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <RealtimeConnector />
      <AppContent />
    </QueryClientProvider>
  );
}
