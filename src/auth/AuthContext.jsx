import React, { createContext, useContext, useEffect, useState } from "react";
import { loginApi, meApi, logoutApi } from "../api/authApi";
import { clearRequestCache } from "../api/axiosClient";
import { clearAuthSession, getStoredUser, saveAuthSession, hydrateAuthSessionFromCookie } from "../utils/authStorage";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getStoredUser());
  const [loading, setLoading] = useState(false);

  const saveSession = (token, userObj) => {
    saveAuthSession(token, userObj);
    setUser(userObj);
  };

  const clearSession = () => {
    clearAuthSession();
    setUser(null);
  };


  useEffect(() => {
    const restored = hydrateAuthSessionFromCookie();
    if (restored?.user) setUser(restored.user);
  }, []);

  const login = async ({ identifier, password }) => {
    // backend expects { email: "...", password: "..." }
    setLoading(true);
    try {
      const res = await loginApi({ email: identifier, password });
      saveSession(res.data.token, res.data.user);

      // optional: refresh full user from /user
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
    <AuthContext.Provider value={{ user, loading, login, logout, clearSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
