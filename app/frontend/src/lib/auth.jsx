import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "./api";

const AuthCtx = createContext(null);

export function getDefaultDashboard(user) {
  if (!user) return "/login";
  if (user.role === "admin") return "/admin";
  if (user.role === "tenant") return "/tenant";
  if (user.role === "support") return "/support";
  if (user.role === "facility_manager") return "/facility-manager";
  return "/dashboard";
}

export function hasRole(user, allowedRoles) {
  if (!user) return false;
  if (!allowedRoles || allowedRoles.length === 0) return true;
  return allowedRoles.includes(user.role);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("fmc_user")); } catch { return null; }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("fmc_token");
    if (!token) { setLoading(false); return; }
    api.get("/auth/me").then((r) => {
      setUser(r.data);
      localStorage.setItem("fmc_user", JSON.stringify(r.data));
    }).catch(() => {
      localStorage.removeItem("fmc_token");
      localStorage.removeItem("fmc_user");
      setUser(null);
    }).finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    localStorage.setItem("fmc_token", data.token);
    localStorage.setItem("fmc_user", JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (payload) => {
    const { data } = await api.post("/auth/register", payload);
    localStorage.setItem("fmc_token", data.token);
    localStorage.setItem("fmc_user", JSON.stringify(data.user));
    setUser(data.user);
    return { ...data.user, email_delivery_failed: Boolean(data.email_delivery_failed) };
  }, []);

  const setSession = useCallback((token, u) => {
    localStorage.setItem("fmc_token", token);
    localStorage.setItem("fmc_user", JSON.stringify(u));
    setUser(u);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("fmc_token");
    localStorage.removeItem("fmc_user");
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const { data } = await api.get("/auth/me");
    setUser(data);
    localStorage.setItem("fmc_user", JSON.stringify(data));
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout, refreshUser, setSession }),
    [user, loading, login, register, logout, refreshUser, setSession]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
