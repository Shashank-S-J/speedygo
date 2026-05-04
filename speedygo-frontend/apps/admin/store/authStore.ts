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
  updateUser: (user: User) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null, accessToken: null, refreshToken: null, isAuthenticated: false,
      setAuth: (tokens, user) => {
        set({ user, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, isAuthenticated: true });
        setTokenGetter(() => get().accessToken);
        if (typeof document !== 'undefined') {
          document.cookie = 'speedygo-authenticated=1; path=/; max-age=604800; SameSite=Lax';
        }
      },
      updateUser: (user) => set({ user }),
      logout: () => {
        const rt = get().refreshToken;
        authService.logout(rt ?? undefined).catch(() => {});
        set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false });
        if (typeof document !== 'undefined') {
          document.cookie = 'speedygo-authenticated=; path=/; max-age=0';
        }
        if (typeof window !== 'undefined') window.location.href = '/login';
      },
    }),
    { name: 'speedygo-admin-auth' }
  )
);

if (typeof window !== 'undefined') {
  setTokenGetter(() => useAuthStore.getState().accessToken);
  setOnUnauthorized(() => useAuthStore.getState().logout());
  setRefreshTokenGetter(() => useAuthStore.getState().refreshToken);
  setOnTokenRefreshed((accessToken, refreshToken) => {
    useAuthStore.setState({ accessToken, refreshToken });
  });
}

