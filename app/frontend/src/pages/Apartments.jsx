import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, ArrowRight, Search } from "lucide-react";
import { formatNaira } from "@/lib/format";

export default function Apartments() {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [prop, setProp] = useState("all");

  const load = useCallback(async () => {
    const { data } = await api.get("/apartments/summary");
    setItems(data);
  }, []);
  useEffect(() => { load(); }, [load]);

  const properties = useMemo(() => {
    const m = new Map();
    items.forEach((i) => m.set(i.property_id, i.property_name));
    return Array.from(m, ([id, name]) => ({ id, name }));
  }, [items]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return items.filter((i) => {
      if (prop !== "all" && i.property_id !== prop) return false;
      if (!s) return true;
      return `${i.apartment_number} ${i.tenant_name} ${i.property_name}`.toLowerCase().includes(s);
    });
  }, [items, q, prop]);

  return (
    <div className="space-y-6">
      <div>
        <div className="tiny-label text-emerald-700">Drill down</div>
        <h1 className="font-display text-3xl font-bold tracking-tight mt-2 flex items-center gap-2"><Building2 className="w-6 h-6 text-emerald-700" /> Apartments</h1>
        <p className="text-slate-500 mt-1">Pick an apartment to see and manage all its bills, rent, service charge and expenses in one place.</p>
      </div>

      <Card className="p-4 border border-slate-200 bg-white">
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search apartment number, tenant or property" className="pl-9" data-testid="apt-search" />
          </div>
          <Select value={prop} onValueChange={setProp}>
            <SelectTrigger data-testid="apt-property-filter"><SelectValue placeholder="Property" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All properties</SelectItem>
              {properties.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {filtered.length === 0 ? (
        <Card className="p-12 border border-dashed border-slate-300 bg-white text-center">
          <Building2 className="w-10 h-10 text-slate-300 mx-auto" />
          <div className="mt-3 font-display font-bold text-lg">No apartments</div>
          <p className="text-slate-500 mt-1">Add tenants to see their apartments here.</p>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((a) => (
            <Link key={a.tenant_id} to={`/dashboard/apartments/${a.tenant_id}`} data-testid={`apt-card-${a.tenant_id}`} className="group">
              <Card className="p-5 border border-slate-200 bg-white hover:shadow-md hover:border-emerald-300 transition-all">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs text-slate-500 uppercase tracking-wide">{a.property_name}</div>
                    <div className="font-display text-2xl font-black mt-1 truncate">Apt {a.apartment_number || "-"}</div>
                    <div className="text-sm text-slate-500 mt-0.5 truncate">{a.tenant_name}</div>
                  </div>
                  <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-emerald-600 transition-colors shrink-0" />
                </div>
                <div className="grid grid-cols-2 gap-3 mt-4 text-xs">
                  <div><div className="text-slate-500">Rent outstanding</div><div className={`font-bold ${a.rent_outstanding > 0 ? "text-red-600" : "text-emerald-700"}`}>{formatNaira(a.rent_outstanding)}</div></div>
                  <div><div className="text-slate-500">Utility outstanding</div><div className={`font-bold ${a.utility_outstanding > 0 ? "text-orange-600" : "text-emerald-700"}`}>{formatNaira(a.utility_outstanding)}</div></div>
                  <div><div className="text-slate-500">Service outstanding</div><div className={`font-bold ${a.service_charge_outstanding > 0 ? "text-blue-600" : "text-emerald-700"}`}>{formatNaira(a.service_charge_outstanding)}</div></div>
                  <div><div className="text-slate-500">Total outstanding</div><div className={`font-bold ${a.total_outstanding > 0 ? "text-red-600" : "text-emerald-700"}`}>{formatNaira(a.total_outstanding)}</div></div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
