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
    try {
      persistSession(token, userObj);
      setUser(userObj);
    } catch (error) {
      console.error('Error saving session:', error);
      // Fallback to in-memory storage if persistent storage fails
      setUser(userObj);
    }
  };

  const clearSession = () => {
    try {
      clearPersistedSession();
    } catch (error) {
      console.error('Error clearing session:', error);
    }
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
    const onVisibility = async () => {
      if (document.visibilityState === "visible") {
        const token = getStoredToken();
        const storedUser = getStoredUser();
        
        if (token && storedUser) {
          // Try to re-validate the session when app comes back to foreground
          try {
            const me = await meApi();
            const resolvedUser = me?.data?.user ?? storedUser;
            if (resolvedUser) {
              saveSession(token, resolvedUser);
              setUser(resolvedUser);
            }
          } catch {
            // If API fails, at least restore from stored values
            saveSession(token, storedUser);
            setUser(storedUser);
          }
        } else if (token && !storedUser) {
          // If we have a token but no user data, try to fetch user data
          try {
            const me = await meApi();
            if (me?.data?.user) {
              saveSession(token, me.data.user);
              setUser(me.data.user);
            }
          } catch {
            // Token might be invalid, clear session
            clearSession();
          }
        }
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
