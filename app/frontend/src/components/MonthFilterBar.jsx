import { Card } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { monthLabel, todayMonth, shiftMonth } from "@/lib/monthUtils";

export default function MonthFilterBar({ value, onChange, months = [], note }) {
  const isAll = value === "all";
  const eff = isAll ? todayMonth() : value;
  const chipMonths = Array.from(new Set([todayMonth(), ...months])).sort().reverse().slice(0, 8);

  return (
    <Card className="p-3 sm:p-4 border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 border border-slate-200 rounded-md overflow-hidden">
          <button onClick={() => onChange(shiftMonth(eff, -1))} className="px-2 py-1.5 hover:bg-slate-100" data-testid="ovw-month-prev" aria-label="Previous month"><ChevronLeft className="w-4 h-4" /></button>
          <div className="px-3 py-1.5 text-sm font-semibold min-w-[150px] text-center flex items-center justify-center gap-1.5" data-testid="ovw-month-label"><Calendar className="w-3.5 h-3.5 text-slate-400" />{isAll ? "All time" : monthLabel(value)}</div>
          <button onClick={() => onChange(shiftMonth(eff, 1))} className="px-2 py-1.5 hover:bg-slate-100" data-testid="ovw-month-next" aria-label="Next month"><ChevronRight className="w-4 h-4" /></button>
        </div>
        <button onClick={() => onChange(todayMonth())} className={`text-xs px-2.5 py-1.5 rounded border ${value === todayMonth() ? "bg-emerald-600 text-white border-emerald-600" : "bg-white border-slate-200 text-slate-600 hover:border-emerald-300"}`} data-testid="ovw-month-today">This month</button>
        <button onClick={() => onChange("all")} className={`text-xs px-2.5 py-1.5 rounded border ${isAll ? "bg-slate-800 text-white border-slate-800" : "bg-white border-slate-200 text-slate-600 hover:border-slate-400"}`} data-testid="ovw-month-all">All time</button>
        <div className="flex-1" />
        {note && <div className="text-xs text-slate-500">{note}</div>}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {chipMonths.map((m) => (
          <button key={m} onClick={() => onChange(m)} data-testid={`ovw-month-chip-${m}`} className={`text-xs px-2.5 py-1 rounded-full border ${m === value ? "bg-emerald-600 text-white border-emerald-600" : "bg-white border-slate-200 text-slate-600 hover:border-emerald-300"}`}>{monthLabel(m)}</button>
        ))}
      </div>
    </Card>
  );
}
