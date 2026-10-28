import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Check } from "lucide-react";

export default function AdminPlans() {
  const [plans, setPlans] = useState([]);
  useEffect(() => { api.get("/admin/plans").then((r) => setPlans(r.data)); }, []);

  return (
    <div className="space-y-6">
      <div>
        <div className="tiny-label text-orange-400">Configuration</div>
        <h1 className="font-display text-3xl font-bold tracking-tight mt-2">Plan configurations</h1>
        <p className="text-slate-400 mt-1">View plan limits and pricing. Edit endpoints are wired for a future admin UI.</p>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        {plans.map((p) => (
          <Card key={p.id} className="p-6 bg-slate-800/60 border border-slate-700 text-white" data-testid={`admin-plan-${p.id}`}>
            <div className="tiny-label !text-slate-400">{p.name}</div>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="font-display text-3xl font-black">₦{Number(p.price).toLocaleString()}</span>
              <span className="text-slate-400 text-sm">/{p.billing_cycle}</span>
            </div>
            <ul className="mt-5 space-y-2 text-sm text-slate-200">
              {(p.features || []).map((f) => (
                <li key={f} className="flex gap-2"><Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" /> {f}</li>
              ))}
            </ul>
            <div className="mt-5 text-xs text-slate-400 space-y-1">
              <div>Properties: {p.limits?.properties}</div>
              <div>Tenants: {p.limits?.tenants}</div>
              <div>Facility managers: {p.limits?.facility_managers}</div>
              <div>Postpaid billing: {p.limits?.postpaid_billing ? "yes" : "no"}</div>
              <div>Maintenance: {p.limits?.maintenance ? "yes" : "no"}</div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
