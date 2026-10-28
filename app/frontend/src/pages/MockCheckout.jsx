import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { CreditCard, CheckCircle2, XCircle } from "lucide-react";
import { formatNaira } from "@/lib/format";

export default function MockCheckout() {
  const [params] = useSearchParams();
  const ref = params.get("ref");
  const nav = useNavigate();
  const { refreshUser } = useAuth();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!ref) return;
    api.get(`/subscriptions/checkout/${ref}`).then((r) => setSession(r.data)).catch(() => setStatus("invalid"));
  }, [ref]);

  const pay = async () => {
    setLoading(true);
    try {
      await api.post("/subscriptions/mock-confirm", { reference: ref });
      await refreshUser();
      setStatus("paid");
      toast.success("Payment successful (mock). Plan activated.");
      setTimeout(() => nav("/dashboard/billing"), 1500);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Payment failed");
    } finally { setLoading(false); }
  };

  const cancel = () => nav("/dashboard/billing");

  if (status === "invalid") {
    return <div className="min-h-screen flex items-center justify-center text-slate-500">Invalid checkout session.</div>;
  }
  if (!session) {
    return <div className="min-h-screen flex items-center justify-center text-slate-500">Loading checkout…</div>;
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-6">
      <Card className="w-full max-w-md p-8 bg-white text-slate-900 border border-slate-200">
        <div className="flex items-center gap-2 tiny-label text-orange-700">
          <CreditCard className="w-4 h-4" /> Mock payment gateway
        </div>
        <h1 className="font-display text-3xl font-bold tracking-tight mt-3">Confirm your subscription</h1>
        <p className="text-slate-500 mt-1">This is a simulated payment page for development. Click <span className="font-semibold">Pay now</span> to activate your plan.</p>

        <div className="mt-6 p-5 rounded-md bg-slate-50 border border-slate-200 space-y-2">
          <div className="flex justify-between text-sm"><span className="text-slate-500">Plan</span><span className="font-semibold capitalize">{session.plan}</span></div>
          <div className="flex justify-between text-sm"><span className="text-slate-500">Amount</span><span className="font-semibold">{formatNaira(session.amount)}</span></div>
          <div className="flex justify-between text-sm"><span className="text-slate-500">Reference</span><span className="font-mono text-xs">{session.reference}</span></div>
        </div>

        {status === "paid" ? (
          <div className="mt-6 p-4 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5" /> Payment successful. Redirecting…
          </div>
        ) : (
          <div className="mt-6 flex gap-3">
            <Button onClick={pay} disabled={loading} data-testid="mock-pay-btn" className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white h-11">
              {loading ? "Processing…" : `Pay ${formatNaira(session.amount)}`}
            </Button>
            <Button onClick={cancel} variant="outline" data-testid="mock-cancel-btn" className="border-slate-300">
              <XCircle className="w-4 h-4 mr-1.5" /> Cancel
            </Button>
          </div>
        )}
        <p className="text-xs text-slate-400 mt-4">Real Paystack/Flutterwave integration will replace this page in production.</p>
      </Card>
    </div>
  );
}
