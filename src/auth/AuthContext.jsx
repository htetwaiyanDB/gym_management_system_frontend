import React, { createContext, useContext, useEffect, useState } from "react";
import { loginApi, meApi, logoutApi } from "../api/authApi";
import { clearRequestCache } from "../api/axiosClient";
import {
  clearPersistedSession,
  getStoredToken,
  getStoredUser,
  persistSession,
} from "../utils/sessionPersistence";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getStoredUser());
  const [loading, setLoading] = useState(false);
  const [hydrating, setHydrating] = useState(true);

  const saveSession = (token, userObj) => {
    persistSession(token, userObj);
    setUser(userObj);
  };

  const clearSession = () => {
    clearPersistedSession();
    setUser(null);
  };

  const hydrateAuth = async () => {
    const token = getStoredToken();
    const storedUser = getStoredUser();

    if (!token) {
      setUser(null);
      setHydrating(false);
      return;
    }

    if (storedUser) {
      setUser(storedUser);
    }

    try {
      const me = await meApi();
      const resolvedUser = me?.data?.user ?? storedUser;
      if (resolvedUser) {
        saveSession(token, resolvedUser);
      }
    } catch {
      if (storedUser) {
        saveSession(token, storedUser);
      }
    } finally {
      setHydrating(false);
    }
  };

  useEffect(() => {
    hydrateAuth();
  }, []);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        const stored = getStoredUser();
        if (stored) setUser(stored);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const login = async ({ identifier, password }) => {
    setLoading(true);
    try {
      const res = await loginApi({ email: identifier, password });
      saveSession(res.data.token, res.data.user);

      const me = await meApi();
      saveSession(res.data.token, me.data.user ?? res.data.user);

      return me.data.user?.role ?? res.data.user.role;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      await logoutApi();
    } finally {
      clearSession();
      clearRequestCache();
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, hydrating, login, logout, clearSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
