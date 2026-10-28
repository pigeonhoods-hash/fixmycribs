import { useSubscription } from "@/lib/subscription";
import { Link } from "react-router-dom";
import { Lock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function FeatureGate({ feature, title, children }) {
  const { can, loading, plan } = useSubscription();
  if (loading) return <div className="p-10 text-slate-500">Loading…</div>;
  if (can(feature)) return children;
  return (
    <div className="max-w-lg mx-auto mt-10 rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm" data-testid={`feature-gate-${feature}`}>
      <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-600 grid place-items-center mx-auto">
        <Lock className="w-7 h-7" />
      </div>
      <h2 className="font-display text-2xl font-bold tracking-tight mt-5">{title} is a paid feature</h2>
      <p className="text-slate-500 mt-2">
        Your current plan ({plan}) doesn't include {title.toLowerCase()}. Upgrade to Growth or Pro to unlock it.
      </p>
      <Link to="/dashboard/billing">
        <Button data-testid="feature-gate-upgrade" className="mt-6 h-11 bg-emerald-600 hover:bg-emerald-700 text-white">
          <Sparkles className="w-4 h-4 mr-2" /> View plans & upgrade
        </Button>
      </Link>
    </div>
  );
}
