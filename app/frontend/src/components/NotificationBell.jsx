import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Bell, AlertTriangle, Clock, MessageSquare, Wrench, LifeBuoy, Wallet, X, CheckCheck } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

function iconFor(kind) {
  if (kind === "message") return MessageSquare;
  if (kind === "maintenance") return Wrench;
  if (kind === "support") return LifeBuoy;
  if (kind === "loss_alert") return AlertTriangle;
  if (kind?.startsWith("rent")) return Wallet;
  if (kind?.startsWith("bill")) return Wallet;
  return Bell;
}

function colorFor(severity) {
  if (severity === "danger") return { pill: "bg-red-500/15 text-red-500 border-red-500/30", dot: "bg-red-500" };
  if (severity === "warning") return { pill: "bg-amber-500/15 text-amber-600 border-amber-500/30", dot: "bg-amber-500" };
  return { pill: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30", dot: "bg-emerald-500" };
}

/**
 * NotificationBell — role-agnostic. Hits GET /notifications and renders a dropdown.
 * Pass `theme="dark"` when placed on a dark header (admin/tenant/support/facility).
 */
export function NotificationBell({ theme = "light" }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();
  const ref = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/notifications");
      setItems(data.items || []);
    } catch {
      setItems([]);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 45000); // poll every 45s
    return () => clearInterval(t);
  }, [load]);

  // Click outside to close
  useEffect(() => {
    if (!open) return;
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const count = items.length;
  const isDark = theme === "dark";

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => { setOpen((o) => !o); if (!open) load(); }}
        aria-label="Notifications"
        data-testid="notification-bell"
        className={`relative p-2 rounded-full transition-colors ${isDark ? "text-slate-200 hover:text-white hover:bg-slate-700/70" : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"}`}
      >
        <Bell className="w-5 h-5" />
        {count > 0 && (
          <span data-testid="notification-count" className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-96 max-w-[92vw] bg-white text-slate-900 rounded-xl border border-slate-200 shadow-2xl z-50 overflow-hidden"
            data-testid="notification-dropdown"
          >
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <div className="font-display font-bold text-slate-900 flex items-center gap-2"><Bell className="w-4 h-4" /> Notifications</div>
              <div className="flex items-center gap-2">
                {items.length > 0 && (
                  <button
                    onClick={async () => { try { await api.post("/notifications/dismiss-all"); setItems([]); } catch { /* ignore */ } }}
                    className="text-xs px-2 py-1 rounded text-emerald-700 hover:bg-emerald-50 font-semibold flex items-center gap-1"
                    data-testid="notification-mark-all-read"
                  >
                    <CheckCheck className="w-3.5 h-3.5" /> Mark all read
                  </button>
                )}
                <div className="text-xs text-slate-500">{count} active</div>
              </div>
            </div>
            <div className="max-h-[420px] overflow-y-auto">
              {loading && items.length === 0 ? (
                <div className="p-6 text-center text-sm text-slate-500">Loading…</div>
              ) : items.length === 0 ? (
                <div className="p-8 text-center">
                  <Bell className="w-8 h-8 text-slate-300 mx-auto" />
                  <div className="mt-2 font-medium text-slate-700">You&apos;re all caught up</div>
                  <div className="text-xs text-slate-500 mt-1">New alerts will appear here.</div>
                </div>
              ) : (
                items.map((n) => {
                  const Icon = iconFor(n.kind);
                  const c = colorFor(n.severity);
                  const dismiss = async () => {
                    setItems((prev) => prev.filter((x) => x.key !== n.key));
                    try { await api.post("/notifications/dismiss", { key: n.key }); } catch { /* ignore */ }
                  };
                  return (
                    <div key={n.id} data-testid={`notification-item-${n.kind}`} className="border-b border-slate-100 hover:bg-slate-50 transition-colors flex items-start gap-2 pr-2">
                      <button
                        onClick={() => { setOpen(false); dismiss(); if (n.link) nav(n.link); }}
                        className="flex-1 text-left px-4 py-3 flex items-start gap-3"
                      >
                        <div className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center border ${c.pill}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-slate-900 truncate flex items-center gap-2">
                            {n.severity === "danger" && <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />}
                            {n.severity === "warning" && <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                            <span className="truncate">{n.title}</span>
                          </div>
                          {n.body && <div className="text-xs text-slate-500 truncate mt-0.5">{n.body}</div>}
                        </div>
                      </button>
                      <button
                        onClick={dismiss}
                        aria-label="Dismiss"
                        data-testid={`notification-dismiss-${n.kind}`}
                        className="p-1.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 self-center"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
