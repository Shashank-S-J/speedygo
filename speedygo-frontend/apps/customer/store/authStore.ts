import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User } from '@speedygo/types';
import { setTokenGetter, setOnUnauthorized, setRefreshTokenGetter, setOnTokenRefreshed, authService } from '@speedygo/api-client';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  setAuth: (tokens: { accessToken: string; refreshToken: string }, user: User) => void;
  logout: () => void;
  updateUser: (user: Partial<User>) => void;
}

export const useAuthStore = create<AuthState>()(
  persist<AuthState>(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,

      setAuth: (tokens: { accessToken: string; refreshToken: string }, user: User) => {
        set({ user, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, isAuthenticated: true });
        setTokenGetter(() => get().accessToken);
        // Set auth indicator cookie for middleware (server-side redirect check)
        if (typeof document !== 'undefined') {
          document.cookie = 'speedygo-authenticated=1; path=/; max-age=604800; SameSite=Lax';
        }
      },

      logout: () => {
        const rt = get().refreshToken;
        // Fire and forget - don't block UI on this
        authService.logout(rt ?? undefined).catch(() => {});
        set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false });
        if (typeof document !== 'undefined') {
          document.cookie = 'speedygo-authenticated=; path=/; max-age=0';
        }
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
      },

      updateUser: (partial: Partial<User>) => {
        set((s: AuthState) => ({ user: s.user ? { ...s.user, ...partial } : null }));
      },
    }),
    { name: 'speedygo-auth' }
  )
);

// Wire up unauthorized handler
if (typeof window !== 'undefined') {
  setOnUnauthorized(() => useAuthStore.getState().logout());
  setTokenGetter(() => useAuthStore.getState().accessToken);
  setRefreshTokenGetter(() => useAuthStore.getState().refreshToken);
  setOnTokenRefreshed((accessToken, refreshToken) => {
    useAuthStore.setState({ accessToken, refreshToken });
  });
}

