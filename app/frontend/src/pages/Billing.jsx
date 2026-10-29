import { useEffect, useState, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, Sparkles, Info } from "lucide-react";
import { toast } from "sonner";

function formatDate(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString(); } catch { return iso; }
}

export default function Billing() {
  const { user, refreshUser } = useAuth();
  const [plans, setPlans] = useState([]);
  const [sub, setSub] = useState(null);
  const [saving, setSaving] = useState(false);
  const [params, setParams] = useSearchParams();
  const verifiedRef = useRef(null);
  const paymentRef = params.get("reference");

  const load = async () => {
    const [pRes, sRes] = await Promise.all([api.get("/plans"), api.get("/subscriptions/current")]);
    setPlans(pRes.data);
    setSub(sRes.data);
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!paymentRef || verifiedRef.current === paymentRef) return;
    verifiedRef.current = paymentRef;
    const verify = async () => {
      try {
        const { data } = await api.post(`/subscriptions/verify/${encodeURIComponent(paymentRef)}`);
        if (data.status === "processing") toast.info("Payment verification is underway. Refresh to check status.");
        else {
          toast.success("Payment verified by Paystack. Your subscription is updated.");
          await refreshUser();
          await load();
        }
      } catch (error) {
        toast.error(error.response?.data?.detail || "Payment has not been verified. Your plan was not changed.");
      } finally {
        setParams((prev) => { const next = new URLSearchParams(prev); next.delete("reference"); return next; }, { replace: true });
      }
    };
    verify();
  }, [paymentRef, refreshUser, setParams]);

  const startCheckout = async (planId) => {
    if (planId === "starter") {
      toast.info("Starter is the free tier. If you want to downgrade, contact support.");
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.post("/subscriptions/checkout", { plan: planId });
      window.location.href = data.checkout_url;
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not start checkout");
    } finally { setSaving(false); }
  };

  const currentPlan = sub?.plan || user?.plan || "starter";
  const planStatus = sub?.plan_status || user?.plan_status || "free";
  const expires = sub?.plan_expires_at;

  return (
    <div className="space-y-6">
      <div>
        <div className="tiny-label text-orange-700">Subscription</div>
        <h1 className="font-display text-3xl font-bold tracking-tight mt-2">Billing & Plan</h1>
        <p className="text-slate-500 mt-1">
          You are currently on the <span className="font-semibold text-emerald-700 capitalize">{currentPlan}</span> plan
          <span className="capitalize"> ({planStatus})</span>
          {expires && <> · renews/expires <span className="font-semibold">{formatDate(expires)}</span></>}
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {plans.map((p) => {
          const current = currentPlan === p.id;
          const isPaid = p.id !== "starter";
          return (
            <Card key={p.id} className={`p-6 border ${current ? "border-emerald-600 ring-1 ring-emerald-600" : "border-slate-200"} bg-white relative`} data-testid={`billing-plan-${p.id}`}>
              {current && (
                <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-emerald-600 text-white text-xs font-bold px-3 py-0.5 rounded-full uppercase tracking-widest">Current</div>
              )}
              <div className="tiny-label">{p.name}</div>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="font-display text-3xl font-black tracking-tight">₦{Number(p.price).toLocaleString()}</span>
                <span className="text-slate-500 text-sm">/{p.billing_cycle}</span>
              </div>
              <ul className="mt-6 space-y-2 text-sm text-slate-700">
                {(p.features || []).map((f) => (
                  <li key={f} className="flex gap-2"><Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" /> {f}</li>
                ))}
              </ul>
              <Button
                onClick={() => startCheckout(p.id)}
                disabled={current || saving || !isPaid}
                data-testid={`upgrade-${p.id}`}
                className={`w-full mt-6 ${p.id === "starter" ? "bg-white text-slate-900 border border-slate-300 hover:bg-slate-50" : p.id === "growth" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-orange-600 hover:bg-orange-700 text-white"}`}
              >
                {current ? "Current plan" : isPaid ? `Pay ₦${Number(p.price).toLocaleString()}/${p.billing_cycle}` : "Free tier"}
              </Button>
            </Card>
          );
        })}
      </div>

      <Card className="p-6 border border-slate-200 bg-white flex items-start gap-4">
        <Info className="w-5 h-5 text-orange-600 mt-0.5 shrink-0" />
        <div>
          <div className="font-display font-bold">Subscription payments</div>
          <p className="text-sm text-slate-600 mt-1">
            Growth and Pro access activates only after the backend verifies a successful Paystack payment.
            Each purchase covers 30 days. Renewal is manual until recurring billing is separately enabled and tested.
            Never pay outside the official Paystack checkout link.
          </p>
        </div>
      </Card>

      {sub?.subscription && (
        <Card className="p-6 border border-slate-200 bg-white">
          <div className="tiny-label text-emerald-700">Active subscription</div>
          <div className="mt-3 grid sm:grid-cols-2 gap-3 text-sm">
            <div><span className="text-slate-500">Status:</span> <span className="font-semibold capitalize">{sub.subscription.status}</span></div>
            <div><span className="text-slate-500">Plan:</span> <span className="font-semibold capitalize">{sub.subscription.plan}</span></div>
            <div><span className="text-slate-500">Period start:</span> <span className="font-semibold">{formatDate(sub.subscription.current_period_start)}</span></div>
            <div><span className="text-slate-500">Period end:</span> <span className="font-semibold">{formatDate(sub.subscription.current_period_end)}</span></div>
            {sub.subscription.gift_reason && <div className="sm:col-span-2"><span className="text-slate-500">Gift reason:</span> <span className="font-semibold">{sub.subscription.gift_reason}</span></div>}
          </div>
        </Card>
      )}
    </div>
  );
}
