import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Zap, Fuel, Wallet, Building2, ChevronRight, ArrowUpRight, AlertCircle, Search } from "lucide-react";
import { formatNaira } from "@/lib/format";
import BillsTools from "@/components/BillsTools";
import MonthFilterBar from "@/components/MonthFilterBar";
import { monthLabel, todayMonth } from "@/lib/monthUtils";

export default function Bills() {
  const nav = useNavigate();
  const [properties, setProperties] = useState([]);      // for BillsTools (import)
  const [summary, setSummary] = useState({ properties: [], months: [], totals: { expected: 0, collected: 0, outstanding: 0 } });
  const [q, setQ] = useState("");
  const [month, setMonth] = useState(todayMonth());
  const [loading, setLoading] = useState(true);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/bills/property-summary?month=${month}`);
      setSummary(data);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => { api.get("/properties").then((r) => setProperties(r.data)).catch(() => {}); }, []);

  const monthList = summary.months || [];
  const totals = summary.totals || { expected: 0, collected: 0, outstanding: 0 };

  const filtered = useMemo(
    () => (summary.properties || []).filter((p) => !q || (p.property_name || "").toLowerCase().includes(q.toLowerCase())),
    [summary, q]
  );

  const scopeLabel = month === "all" ? "all time" : monthLabel(month);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="tiny-label text-orange-700">Utility bills</div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight mt-2">Bills by property</h1>
          <p className="text-slate-500 mt-1 text-sm sm:text-base">Pick a property to manage its diesel, electricity, service charge and other bills.</p>
        </div>
        <BillsTools properties={properties} onImported={loadSummary} />
      </div>

      <MonthFilterBar value={month} onChange={setMonth} months={monthList} note={`Showing bills for ${scopeLabel}. Use "All time" for the full total.`} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="p-4 sm:p-5 border border-slate-200 bg-white">
          <div className="tiny-label text-slate-600 flex items-center gap-1.5"><Wallet className="w-3.5 h-3.5" /> Total outstanding</div>
          <div className="font-display text-xl sm:text-2xl font-bold mt-2 text-red-600" data-testid="bills-total-outstanding">{formatNaira(totals.outstanding)}</div>
        </Card>
        <Card className="p-4 sm:p-5 border border-slate-200 bg-white">
          <div className="tiny-label text-slate-600 flex items-center gap-1.5"><ArrowUpRight className="w-3.5 h-3.5" /> Total collected</div>
          <div className="font-display text-xl sm:text-2xl font-bold mt-2 text-emerald-700" data-testid="bills-total-collected">{formatNaira(totals.collected)}</div>
        </Card>
        <Card className="p-4 sm:p-5 border border-slate-200 bg-white">
          <div className="tiny-label text-slate-600 flex items-center gap-1.5"><Wallet className="w-3.5 h-3.5" /> Total expected</div>
          <div className="font-display text-xl sm:text-2xl font-bold mt-2 text-slate-900" data-testid="bills-total-expected">{formatNaira(totals.expected)}</div>
        </Card>
      </div>

      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search property or estate…" className="pl-9" data-testid="bills-property-search" />
      </div>

      {loading ? (
        <div className="text-slate-500 text-sm py-10 text-center">Loading bill summary…</div>
      ) : filtered.length === 0 ? (
        <Card className="p-10 border border-dashed border-slate-300 bg-white text-center">
          <Building2 className="w-10 h-10 text-slate-300 mx-auto" />
          <div className="mt-3 font-display font-bold text-lg">No properties</div>
          <p className="text-slate-500 mt-1 text-sm">Add a property first to start tracking bills.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
          {filtered.map((p) => (
            <button
              key={p.property_id}
              onClick={() => nav(`/dashboard/bills/property/${p.property_id}`)}
              data-testid={`bills-property-card-${p.property_id}`}
              className="group text-left rounded-2xl border border-slate-200 bg-white p-5 hover:border-emerald-400 hover:shadow-lg hover:shadow-emerald-100 transition-all focus:outline-none focus:ring-2 focus:ring-emerald-400"
            >
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-700 grid place-items-center shrink-0">
                  <Building2 className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-display font-bold text-lg text-slate-900 truncate">{p.property_name}</div>
                  <div className="text-xs text-slate-500 truncate">{p.address || p.city || "—"} · {p.active_tenants} active tenant{p.active_tenants === 1 ? "" : "s"}</div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all mt-1" />
              </div>

              <div className="mt-5 grid grid-cols-3 gap-3">
                <div>
                  <div className="tiny-label text-slate-500">Outstanding</div>
                  <div className="font-display font-bold text-red-600 text-base mt-0.5">{formatNaira(p.outstanding)}</div>
                </div>
                <div>
                  <div className="tiny-label text-slate-500">Collected</div>
                  <div className="font-display font-bold text-emerald-700 text-base mt-0.5">{formatNaira(p.collected)}</div>
                </div>
                <div>
                  <div className="tiny-label text-slate-500">Expected</div>
                  <div className="font-display font-bold text-slate-900 text-base mt-0.5">{formatNaira(p.expected)}</div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-3 gap-2 text-xs">
                <div className="flex items-center gap-1.5 text-orange-700"><Fuel className="w-3 h-3" /> {formatNaira(p.diesel_out)}</div>
                <div className="flex items-center gap-1.5 text-emerald-700"><Zap className="w-3 h-3" /> {formatNaira(p.elec_out)}</div>
                <div className="flex items-center gap-1.5 text-blue-700"><Wallet className="w-3 h-3" /> {formatNaira(p.svc_out)}</div>
              </div>

              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="text-slate-500">{p.bill_count} bill{p.bill_count === 1 ? "" : "s"}</span>
                {p.overdue_count > 0 ? (
                  <span className="inline-flex items-center gap-1 text-red-700 font-semibold"><AlertCircle className="w-3 h-3" /> {p.overdue_count} overdue</span>
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
