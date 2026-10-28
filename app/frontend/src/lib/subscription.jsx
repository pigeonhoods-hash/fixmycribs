import { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { api } from "./api";
import { useAuth } from "./auth";

const SubCtx = createContext(null);

export function SubscriptionProvider({ children }) {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const r = await api.get("/subscriptions/current");
      setData(r.data);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const limits = data?.limits || {};
  const can = useCallback((feature) => !!limits?.[feature], [limits]);

  const value = useMemo(
    () => ({ data, limits, plan: data?.plan || user?.plan || "starter", can, loading, refresh }),
    [data, limits, can, loading, refresh, user]
  );

  return <SubCtx.Provider value={value}>{children}</SubCtx.Provider>;
}

export const useSubscription = () =>
  useContext(SubCtx) || { data: null, limits: {}, can: () => true, plan: "starter", loading: false, refresh: () => {} };
