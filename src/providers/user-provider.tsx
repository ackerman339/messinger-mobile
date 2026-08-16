import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { connect, disconnect } from '@/src/clients/websocket-client';
import { UserContext } from '@/src/contexts/user-context';
import { authService } from '@/src/services/auth';

import type { ReactNode } from 'react';
import type { AppStateStatus } from 'react-native';
import type { User } from '../types/user';

const WEB_SOCKET_URL = process.env.EXPO_PUBLIC_WEB_SOCKET_URL!;

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  /**
   * Keep the current user available to the AppState listener
   * without recreating the listener whenever the user changes.
   */
  const userRef = useRef<User | null>(null);

  /**
   * Prevents reconnecting after logout.
   */
  const loggedOutRef = useRef(false);

  /**
   * Prevents multiple connection attempts while the app
   * changes state.
   */
  const connectingRef = useRef(false);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  /**
   * Connect the WebSocket only when there is an authenticated
   * user and the app is active.
   */
  const connectWebSocket = () => {
    if (!userRef.current) {
      return;
    }

    if (loggedOutRef.current) {
      return;
    }

    if (connectingRef.current) {
      return;
    }

    connectingRef.current = true;

    try {
      connect(WEB_SOCKET_URL);
    } finally {
      connectingRef.current = false;
    }
  };

  /**
   * Disconnect the WebSocket when the app goes to the
   * background and reconnect when it becomes active again.
   */
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'background' || nextState === 'inactive') {
        disconnect();
        return;
      }

      if (nextState === 'active') {
        if (!userRef.current) {
          return;
        }

        if (loggedOutRef.current) {
          return;
        }

        connectWebSocket();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription.remove();
    };
  }, []);

  /**
   * Restore the authentication session when the provider
   * is mounted.
   */
  useEffect(() => {
    async function bootstrapSession() {
      try {
        const currentUser = await authService.me();

        userRef.current = currentUser;
        setUser(currentUser);

        loggedOutRef.current = false;

        connectWebSocket();
      } catch {
        userRef.current = null;
        setUser(null);
      } finally {
        setLoading(false);
      }
    }

    bootstrapSession();
  }, []);

  const logout = async () => {
    loggedOutRef.current = true;

    disconnect();

    try {
      await authService.logout();
    } finally {
      userRef.current = null;
      setUser(null);

      router.replace('/auth');
    }
  };

  return (
    <UserContext.Provider
      value={{
        user,
        loading,
        logout,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}
