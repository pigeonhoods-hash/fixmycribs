import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Check, Save } from "lucide-react";

export default function AdminPlans() {
  const [plans, setPlans] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [saving, setSaving] = useState(null);
  const load = async () => {
    const { data } = await api.get("/admin/plans");
    setPlans(data);
    setDrafts(Object.fromEntries(data.map(p => [p.id, {
      price: p.price,
      active: p.active !== false,
      features: [...(p.features || [])],
      limits: { ...(p.limits || {}) },
    }])));
  };
  useEffect(() => { load().catch(() => toast.error("Could not load plan settings")); }, []);
  const update = (id, patch) => setDrafts(prev => ({...prev, [id]: {...prev[id], ...patch}}));
  const save = async (id) => {
    setSaving(id);
    try {
      await api.patch(`/admin/plans/${id}`, drafts[id]);
      toast.success("Plan settings saved");
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not save plan");
    } finally { setSaving(null); }
  };
  return (
    <div className="space-y-6">
      <div>
        <div className="tiny-label text-orange-400">Subscription configuration</div>
        <h1 className="font-display text-3xl font-bold tracking-tight mt-2">Plan configurations</h1>
        <p className="text-slate-400 mt-1">Manage prices and per-plan feature limits. Updating a price affects new checkouts; existing paid periods are not recalculated.</p>
      </div>
      <div className="grid xl:grid-cols-3 md:grid-cols-2 gap-4">
        {plans.map(p => {
          const d = drafts[p.id];
          if (!d) return null;
          return <Card key={p.id} className="p-6 bg-slate-800/60 border border-slate-700 text-white space-y-4" data-testid={`admin-plan-${p.id}`}>
            <div className="font-display text-xl font-bold">{p.name}</div>
            <label className="block text-sm text-slate-200">Monthly price (₦)
              <Input className="mt-1 bg-slate-900 border-slate-600 text-white" type="number" min={p.id === "starter" ? 0 : 100} step="1" disabled={p.id === "starter"}
                value={d.price} onChange={e => update(p.id, {price: Number(e.target.value)})} />
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-200">
              <input type="checkbox" checked={d.active} disabled={p.id === "starter"} onChange={e => update(p.id, {active: e.target.checked})} /> Plan available for new checkouts
            </label>
            <div className="text-sm font-semibold text-slate-200">Plan limits</div>
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(d.limits).map(([key, value]) => (
                <label key={key} className="text-xs text-slate-300 min-w-0 break-words">
                  {key.replaceAll("_", " ")}
                  {typeof value === "boolean" ? <span className="flex items-center gap-2 mt-2"><input type="checkbox" checked={value} onChange={e => update(p.id, {limits: {...d.limits, [key]: e.target.checked}})} /> Enabled</span>
                    : <Input type="number" min="0" step="1" className="mt-1 bg-slate-900 text-white border-slate-600" value={value} onChange={e => update(p.id, {limits: {...d.limits, [key]: Number(e.target.value)}})} />}
                </label>
              ))}
            </div>
            <label className="block text-sm text-slate-200">Features (one per line)
              <textarea className="mt-1 w-full min-h-36 rounded-md bg-slate-900 border border-slate-600 text-white p-2 text-sm"
                value={d.features.join("\n")} onChange={e => update(p.id, {features: e.target.value.split("\n").map(x => x.trim()).filter(Boolean)})} />
            </label>
            <Button onClick={() => save(p.id)} disabled={saving === p.id} className="bg-orange-600 hover:bg-orange-700 text-white w-full">
              <Save className="w-4 h-4 mr-2" /> {saving === p.id ? "Saving..." : "Save plan"}
            </Button>
          </Card>;
        })}
      </div>
      <p className="text-xs text-slate-400">Paid access is checked by the backend. A paid plan expires when its recorded period ends. Payment gateway test mode is not permitted for live subscriptions.</p>
    </div>
  );
}
