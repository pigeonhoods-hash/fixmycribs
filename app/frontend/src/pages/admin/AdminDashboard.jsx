import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Users, Building2, CreditCard, Gift, User, Home } from "lucide-react";

function Stat({ icon: Icon, label, value, hint }) {
  return (
    <Card className="p-5 bg-slate-800/60 border border-slate-700 text-white">
      <div className="flex items-center gap-2 text-slate-300"><Icon className="w-4 h-4" /><div className="tiny-label !text-slate-400">{label}</div></div>
      <div className="font-display text-3xl font-bold mt-2">{value ?? 0}</div>
      {hint && <div className="text-xs text-slate-400 mt-1">{hint}</div>}
    </Card>
  );
}

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  useEffect(() => { api.get("/admin/summary").then((r) => setData(r.data)); }, []);

  return (
    <div className="space-y-6">
      <div>
        <div className="tiny-label text-orange-400">Platform</div>
        <h1 className="font-display text-3xl font-bold tracking-tight mt-2">Admin overview</h1>
        <p className="text-slate-400 mt-1">FixMyCribs platform-wide metrics.</p>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat icon={Users} label="Total users" value={data?.total_users} />
        <Stat icon={User} label="Landlords" value={data?.owners} />
        <Stat icon={Home} label="Tenants (with accounts)" value={data?.tenant_users} />
        <Stat icon={Building2} label="Properties" value={data?.properties} />
        <Stat icon={Users} label="Tenants (records)" value={data?.tenants} />
        <Stat icon={CreditCard} label="Active subscriptions" value={data?.active_subscriptions} />
        <Stat icon={Gift} label="Gifted subscriptions" value={data?.gifted_subscriptions} />
      </div>
    </div>
  );
}
