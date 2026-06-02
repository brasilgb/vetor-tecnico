import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';

import { ApiCompany, ApiError, ApiUser, login as loginRequest, logout as logoutRequest } from '@/lib/api';

type Session = {
  accessToken: string;
  user: ApiUser;
  company?: ApiCompany | null;
};

type SessionContextValue = {
  baseUrl: string;
  session: Session | null;
  isAuthenticated: boolean;
  isRestoring: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const serverUrl = process.env.EXPO_PUBLIC_SERVER_IP ?? 'http://127.0.0.1:8000';
const DEFAULT_BASE_URL = `${serverUrl.replace(/\/+$/, '')}/api`;
const STORAGE_SESSION = '@VetorAtendimento:session';

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);

  useEffect(() => {
    async function restoreSession() {
      try {
        const savedSession = await AsyncStorage.getItem(STORAGE_SESSION);

        if (savedSession) {
          setSession(JSON.parse(savedSession) as Session);
        }
      } finally {
        setIsRestoring(false);
      }
    }

    restoreSession();
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      baseUrl: DEFAULT_BASE_URL,
      session,
      isAuthenticated: Boolean(session),
      isRestoring,
      async signIn(email, password) {
        const response = await loginRequest(DEFAULT_BASE_URL, email, password);
        const accessToken = response.access_token;

        if (!accessToken) {
          throw new ApiError('Token de acesso ausente na resposta da API.', 200);
        }

        const nextSession = {
          accessToken,
          user: response.user,
          company: response.company,
        };

        await AsyncStorage.setItem(STORAGE_SESSION, JSON.stringify(nextSession));
        setSession(nextSession);
        router.replace('/home');
      },
      async signOut() {
        if (session) {
          await logoutRequest(DEFAULT_BASE_URL, session.accessToken).catch(() => undefined);
        }
        await AsyncStorage.removeItem(STORAGE_SESSION);
        setSession(null);
        router.replace('/' as never);
      },
    }),
    [isRestoring, session],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);

  if (!context) {
    throw new Error('useSession must be used within SessionProvider');
  }

  return context;
}
