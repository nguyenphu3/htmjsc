import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { UserDto } from '@htm/shared';
import { onSessionExpired, post, refreshSession, setAccessToken } from '../api/client';

interface AuthState {
  user: UserDto | null;
  ready: boolean;
  login: (tenant: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserDto | null>(null);
  const [ready, setReady] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    // Khôi phục phiên từ cookie refresh khi tải lại trang.
    refreshSession()
      .then((r) => setUser((r?.user as UserDto) ?? null))
      .finally(() => setReady(true));
    return onSessionExpired(() => {
      setAccessToken(null);
      setUser(null);
      qc.clear();
    });
  }, [qc]);

  const login = useCallback(async (tenant: string, email: string, password: string) => {
    const r = await post<{ accessToken: string; user: UserDto }>('/auth/login', { tenant, email, password });
    setAccessToken(r.accessToken);
    setUser(r.user);
  }, []);

  const logout = useCallback(async () => {
    await post('/auth/logout').catch(() => undefined);
    setAccessToken(null);
    setUser(null);
    qc.clear();
  }, [qc]);

  const value = useMemo(() => ({ user, ready, login, logout }), [user, ready, login, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used within AuthProvider');
  return v;
}

export function useMe(): UserDto {
  const { user } = useAuth();
  if (!user) throw new Error('not signed in');
  return user;
}
