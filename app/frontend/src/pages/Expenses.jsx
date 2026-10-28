import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Building2, ChevronRight, Receipt, TrendingDown, TrendingUp, Search, AlertTriangle } from "lucide-react";
import { formatNaira } from "@/lib/format";
import MonthFilterBar from "@/components/MonthFilterBar";
import { monthLabel, todayMonth, buildMonthList } from "@/lib/monthUtils";

export default function Expenses() {
  const nav = useNavigate();
  const [pnl, setPnl] = useState([]);
  const [summary, setSummary] = useState(null);
  const [includeRent, setIncludeRent] = useState(true);
  const [q, setQ] = useState("");
  const [month, setMonth] = useState(todayMonth());

  const load = useCallback(async () => {
    const p = new URLSearchParams();
    p.set("include_rent", includeRent ? "true" : "false");
    p.set("month", month);
    const [r, s] = await Promise.all([
      api.get(`/reports/summary?${p.toString()}`),
      api.get(`/expenses/summary?${p.toString()}`),
    ]);
    setPnl(r.data);
    setSummary(s.data);
  }, [includeRent, month]);
  useEffect(() => { load(); }, [load]);

  const monthList = useMemo(() => buildMonthList([], "incurred_at"), []);
  const scopeLabel = month === "all" ? "all time" : monthLabel(month);
  const filtered = pnl.filter((p) => !q || p.property_name.toLowerCase().includes(q.toLowerCase()));

  const net = summary?.net || 0;
  const isLoss = net < 0;

  return (
    <div className="space-y-6">
      <div>
        <div className="tiny-label text-emerald-700">Books</div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight mt-2 flex items-center gap-2"><Receipt className="w-6 h-6 text-emerald-700" /> Expenditure by property</h1>
        <p className="text-slate-500 mt-1 text-sm sm:text-base">Track spending per property and see profitability at a glance.</p>
      </div>

      <MonthFilterBar value={month} onChange={setMonth} months={monthList} note={`Showing ${scopeLabel}. Use “All time” for the full total.`} />

      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="p-4 sm:p-5 border border-slate-200 bg-white" data-testid="expense-total-income">
            <div className="tiny-label">{includeRent ? "Total income" : "Bills income (rent excluded)"}</div>
            <div className="mt-2 font-display text-lg sm:text-2xl font-black text-emerald-700">{formatNaira(summary.income)}</div>
            <div className="text-[11px] text-slate-500 mt-1">{includeRent ? `Rent ${formatNaira(summary.rent_collected)} + Bills ${formatNaira(summary.bill_collected)}` : `Service charge + utility bills ${formatNaira(summary.bill_collected)}`}</div>
          </Card>
          <Card className="p-4 sm:p-5 border border-slate-200 bg-white" data-testid="expense-total-expenses">
            <div className="tiny-label">Total expenditure</div>
            <div className="mt-2 font-display text-lg sm:text-2xl font-black text-orange-700">{formatNaira(summary.total_expenses)}</div>
          </Card>
          <Card className={`p-4 sm:p-5 border-2 ${isLoss ? "border-red-300 bg-red-50" : "border-emerald-300 bg-emerald-50"}`} data-testid="expense-net">
            <div className="tiny-label flex items-center gap-1">{isLoss ? <TrendingDown className="w-3 h-3 text-red-600" /> : <TrendingUp className="w-3 h-3 text-emerald-700" />} {isLoss ? "Net loss" : "Net profit"}</div>
            <div className={`mt-2 font-display text-lg sm:text-2xl font-black ${isLoss ? "text-red-700" : "text-emerald-700"}`}>{formatNaira(Math.abs(net))}</div>
          </Card>
          <Card className="p-4 sm:p-5 border border-slate-200 bg-white">
            <div className="tiny-label">Top category</div>
            <div className="mt-2 font-display text-base sm:text-lg font-black text-slate-900 capitalize">{summary.by_category?.[0]?.category || "—"}</div>
            <div className="text-[11px] text-slate-500 mt-1">{summary.by_category?.[0] ? formatNaira(summary.by_category[0].amount) : "No expenses yet"}</div>
          </Card>
        </div>
      )}

      <Card className="p-4 border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3">
            <Switch checked={includeRent} onCheckedChange={setIncludeRent} data-testid="pnl-include-rent" id="pnl-include-rent" />
            <label htmlFor="pnl-include-rent" className="text-sm text-slate-700 cursor-pointer">
              <span className="font-semibold">Include rent</span> in income
            </label>
          </div>
          <div className="text-xs text-slate-500">Toggle off to compare utility bills + service charge only vs expenditure.</div>
        </div>
      </Card>

      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search property or estate…" className="pl-9" data-testid="expenses-property-search" />
      </div>

      {filtered.length === 0 ? (
        <Card className="p-10 border border-dashed border-slate-300 bg-white text-center">
          <Building2 className="w-10 h-10 text-slate-300 mx-auto" />
          <div className="mt-3 font-display font-bold text-lg">No properties</div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
          {filtered.map((p) => (
            <button
              key={p.property_id}
              onClick={() => nav(`/dashboard/expenses/property/${p.property_id}`)}
              data-testid={`expenses-property-card-${p.property_id}`}
              className={`group text-left rounded-2xl border p-5 hover:shadow-lg transition-all focus:outline-none focus:ring-2 focus:ring-emerald-400 ${p.is_loss ? "border-red-200 bg-red-50/40 hover:border-red-400" : "border-slate-200 bg-white hover:border-emerald-400"}`}
            >
              <div className="flex items-start gap-3">
                <div className={`w-11 h-11 rounded-xl grid place-items-center shrink-0 ${p.is_loss ? "bg-red-100 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
                  <Building2 className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-display font-bold text-lg text-slate-900 truncate flex items-center gap-2">
                    {p.property_name}
                    {p.is_loss && <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-red-200 text-red-800 font-semibold"><AlertTriangle className="w-3 h-3" /> Loss</span>}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">{p.tenant_count} tenant{p.tenant_count === 1 ? "" : "s"}</div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-all mt-1" />
              </div>

              <div className="mt-5 grid grid-cols-3 gap-3">
                <div>
                  <div className="tiny-label text-slate-500 flex items-center gap-1">Rent {!includeRent && <span className="text-[9px] px-1 py-px rounded bg-slate-200 text-slate-500 font-semibold">excluded</span>}</div>
                  <div className={`font-display font-bold text-sm mt-0.5 ${includeRent ? "text-emerald-700" : "text-slate-400 line-through"}`}>{formatNaira(p.collected)}</div>
                </div>
                <div>
                  <div className="tiny-label text-slate-500">Bills</div>
                  <div className="font-display font-bold text-blue-700 text-sm mt-0.5">{formatNaira(p.bills_collected)}</div>
                </div>
                <div>
                  <div className="tiny-label text-slate-500">Spent</div>
                  <div className="font-display font-bold text-orange-700 text-sm mt-0.5">{formatNaira(p.expenses_total)}</div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between">
                <span className="tiny-label text-slate-500">Net</span>
                <span className={`font-display font-black text-base ${p.net < 0 ? "text-red-700" : "text-emerald-700"}`}>{p.net < 0 ? "-" : ""}{formatNaira(Math.abs(p.net))}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
