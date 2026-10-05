"use client";

import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, refreshSession, setAccessToken, setOnSessionExpired } from "@/lib/api";
import type { AuthResponse, User } from "@/lib/types";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

type AuthContextValue = {
  user: User | null;
  status: AuthStatus;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  const startSession = useCallback((session: AuthResponse) => {
    setAccessToken(session.accessToken);
    setUser(session.user);
    setStatus("authenticated");
  }, []);

  const endSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    setStatus("unauthenticated");
    // Limpa os dados em cache do usuário anterior (ex.: lista de tarefas).
    queryClient.clear();
  }, [queryClient]);

  // Ao abrir ou recarregar a página, o access token (que vive só em memória)
  // não existe mais. O cookie de refresh restaura a sessão sem pedir login de novo.
  useEffect(() => {
    setOnSessionExpired(endSession);
    refreshSession().then((session) => (session ? startSession(session) : endSession()));
  }, [startSession, endSession]);

  const login = useCallback(
    async (email: string, password: string) => {
      startSession(await api<AuthResponse>("/auth/login", { method: "POST", body: { email, password } }));
    },
    [startSession],
  );

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      startSession(
        await api<AuthResponse>("/auth/register", { method: "POST", body: { name, email, password } }),
      );
    },
    [startSession],
  );

  const logout = useCallback(async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => {});
    endSession();
  }, [endSession]);

  const value = useMemo(
    () => ({ user, status, login, register, logout }),
    [user, status, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth precisa estar dentro de <AuthProvider>");
  return context;
}
