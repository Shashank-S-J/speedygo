'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState, useEffect } from 'react';
import { setTokenGetter, setOnUnauthorized, setRefreshTokenGetter, setOnTokenRefreshed } from '@speedygo/api-client';
import { useAuthStore } from '@/store/authStore';

function AuthInit() {

  useEffect(() => {
    setTokenGetter(() => useAuthStore.getState().accessToken);
    setOnUnauthorized(() => useAuthStore.getState().logout());
    setRefreshTokenGetter(() => useAuthStore.getState().refreshToken);
    setOnTokenRefreshed((accessToken, refreshToken) => {
      useAuthStore.setState({ accessToken, refreshToken });
    });
  }, []);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthInit />
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
