import React, { createContext, useContext, useState } from "react";
import { loginApi, meApi, logoutApi } from "../api/authApi";
import { clearRequestCache } from "../api/axiosClient";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("user");
    return raw ? JSON.parse(raw) : null;
  });
  const [loading, setLoading] = useState(false);

  const saveSession = (token, userObj) => {
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(userObj));
    setUser(userObj);
  };

  const clearSession = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
  };

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

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);
