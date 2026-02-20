import React, { createContext, useContext, useEffect, useState } from "react";
import { loginApi, meApi, logoutApi } from "../api/authApi";
import { clearRequestCache } from "../api/axiosClient";
import { clearAuthSession, hydrateAuthSession, persistAuthSession } from "../utils/authSession";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => hydrateAuthSession().user);
  const [loading, setLoading] = useState(false);

  const saveSession = (token, userObj) => {
    persistAuthSession(token, userObj);
    setUser(userObj);
  };

  const clearSession = () => {
    clearAuthSession();
    setUser(null);
  };


  useEffect(() => {
    const hydrated = hydrateAuthSession();
    if (hydrated?.user) {
      setUser(hydrated.user);
    }
  }, []);

  const login = async ({ identifier, password }) => {
    // backend accepts identifier (email or phone) + password
    setLoading(true);
    try {
      const res = await loginApi({ identifier, password });
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
