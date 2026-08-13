import { connect, disconnect } from '@/src/clients/websocket-client';
import { UserContext } from '@/src/contexts/user-context';
import { authService } from '@/src/services/auth';
import { useEffect, useState } from 'react';

import type { ReactNode } from 'react';
import type { User } from '../types/user';

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // On mount, try to restore the session from the httpOnly cookie
  useEffect(() => {
    async function bootstrapSession() {
      try {
        const user = await authService.me();
        setUser(user);
        connect(process.env.EXPO_PUBLIC_WEB_SOCKET_URL!);
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    }

    bootstrapSession();
  }, []);

  const logout = async () => {
    await authService.logout();
    disconnect();
    setUser(null);
  };

  return <UserContext.Provider value={{ user, loading, logout }}>{children}</UserContext.Provider>;
}
