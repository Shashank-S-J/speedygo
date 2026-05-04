'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { setTokenGetter, setOnUnauthorized, setRefreshTokenGetter, setOnTokenRefreshed } from '@speedygo/api-client';
import { useAuthStore } from '@/store/authStore';

export function Providers({ children }: { children: React.ReactNode }) {
  const [qc] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } }));
  useEffect(() => {
    setTokenGetter(() => useAuthStore.getState().accessToken);
    setOnUnauthorized(() => useAuthStore.getState().logout());
    setRefreshTokenGetter(() => useAuthStore.getState().refreshToken);
    setOnTokenRefreshed((accessToken, refreshToken) => {
      useAuthStore.setState({ accessToken, refreshToken });
    });
  }, []);
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

