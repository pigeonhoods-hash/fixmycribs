import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Building2, ChevronRight, Receipt, Search, AlertCircle } from "lucide-react";
import { formatNaira } from "@/lib/format";

export default function RentRecords() {
  const nav = useNavigate();
  const [properties, setProperties] = useState([]);
  const [records, setRecords] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    const [p, r, t] = await Promise.all([
      api.get("/properties"),
      api.get("/rent-records"),
      api.get("/tenants"),
    ]);
    setProperties(p.data);
    setRecords(r.data);
    setTenants(t.data);
  }, []);
  useEffect(() => { load(); }, [load]);

  const byProp = properties.map((p) => {
    const propTenants = tenants.filter((t) => t.property_id === p.id);
    const tenantIds = new Set(propTenants.map((t) => t.id));
    const propRecords = records.filter((r) => tenantIds.has(r.tenant_id));
    let expected = 0, collected = 0, balance = 0, overdue = 0, paid = 0;
    propRecords.forEach((r) => {
      expected += r.amount_due || 0;
      collected += r.amount_paid || 0;
      balance += r.balance || 0;
      if (r.status === "overdue") overdue += 1;
      if (r.status === "paid") paid += 1;
    });
    return { p, propRecords, propTenants: propTenants.filter((x) => x.status === "active"), expected, collected, balance, overdue, paid };
  });

  const filtered = byProp.filter(({ p }) => !q || p.name.toLowerCase().includes(q.toLowerCase()));

  const totals = byProp.reduce((a, r) => ({
    expected: a.expected + r.expected,
    collected: a.collected + r.collected,
    balance: a.balance + r.balance,
  }), { expected: 0, collected: 0, balance: 0 });

  return (
    <div className="space-y-6">
      <div>
        <div className="tiny-label text-emerald-700">Ledger</div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight mt-2">Rent by property</h1>
        <p className="text-slate-500 mt-1 text-sm sm:text-base">Pick a property to see rent cycles and record payments for its tenants.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="p-4 sm:p-5 border border-slate-200 bg-white">
          <div className="tiny-label text-slate-600">Total outstanding</div>
          <div className="font-display text-xl sm:text-2xl font-bold mt-2 text-red-600">{formatNaira(totals.balance)}</div>
        </Card>
        <Card className="p-4 sm:p-5 border border-slate-200 bg-white">
          <div className="tiny-label text-slate-600">Total collected</div>
          <div className="font-display text-xl sm:text-2xl font-bold mt-2 text-emerald-700">{formatNaira(totals.collected)}</div>
        </Card>
        <Card className="p-4 sm:p-5 border border-slate-200 bg-white">
          <div className="tiny-label text-slate-600">Total expected</div>
          <div className="font-display text-xl sm:text-2xl font-bold mt-2 text-slate-900">{formatNaira(totals.expected)}</div>
        </Card>
      </div>

      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search property or estate…" className="pl-9" data-testid="rent-property-search" />
      </div>

      {filtered.length === 0 ? (
        <Card className="p-10 border border-dashed border-slate-300 bg-white text-center">
          <Building2 className="w-10 h-10 text-slate-300 mx-auto" />
          <div className="mt-3 font-display font-bold text-lg">No properties</div>
          <p className="text-slate-500 mt-1 text-sm">Add a property and tenants to see rent records here.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
          {filtered.map(({ p, propRecords, propTenants, balance, collected, expected, overdue }) => (
            <button
              key={p.id}
              onClick={() => nav(`/dashboard/rent/property/${p.id}`)}
              data-testid={`rent-property-card-${p.id}`}
              className="group text-left rounded-2xl border border-slate-200 bg-white p-5 hover:border-emerald-400 hover:shadow-lg hover:shadow-emerald-100 transition-all focus:outline-none focus:ring-2 focus:ring-emerald-400"
            >
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-700 grid place-items-center shrink-0"><Building2 className="w-5 h-5" /></div>
                <div className="flex-1 min-w-0">
                  <div className="font-display font-bold text-lg text-slate-900 truncate">{p.name}</div>
                  <div className="text-xs text-slate-500 truncate">{p.address || p.city || "—"} · {propTenants.length} active tenant{propTenants.length === 1 ? "" : "s"}</div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all mt-1" />
              </div>
              <div className="mt-5 grid grid-cols-3 gap-3">
                <div>
                  <div className="tiny-label text-slate-500">Outstanding</div>
                  <div className="font-display font-bold text-red-600 text-base mt-0.5">{formatNaira(balance)}</div>
                </div>
                <div>
                  <div className="tiny-label text-slate-500">Collected</div>
                  <div className="font-display font-bold text-emerald-700 text-base mt-0.5">{formatNaira(collected)}</div>
                </div>
                <div>
                  <div className="tiny-label text-slate-500">Expected</div>
                  <div className="font-display font-bold text-slate-900 text-base mt-0.5">{formatNaira(expected)}</div>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-500 flex items-center gap-1"><Receipt className="w-3 h-3" /> {propRecords.length} record{propRecords.length === 1 ? "" : "s"}</span>
                {overdue > 0 ? (
                  <span className="inline-flex items-center gap-1 text-red-700 font-semibold"><AlertCircle className="w-3 h-3" /> {overdue} overdue</span>
                ) : (
                  <span className="text-emerald-700 font-semibold">All on track</span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
