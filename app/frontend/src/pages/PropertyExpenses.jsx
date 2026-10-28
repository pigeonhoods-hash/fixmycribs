import { useCallback, useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useConfirm } from "@/components/ConfirmDialog";
import { Plus, Trash2, Wallet, ArrowLeft, Building2, Receipt, TrendingDown, TrendingUp, ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { formatNaira, formatDate, todayISO } from "@/lib/format";
import { monthKey, monthLabel, todayMonth, shiftMonth, buildMonthList } from "@/lib/monthUtils";

const CATEGORIES = [
  "maintenance", "utilities", "staff", "security", "cleaning",
  "taxes", "insurance", "renovation", "furnishing", "legal", "supplies", "other",
];

export default function PropertyExpenses() {
  const { propertyId } = useParams();
  const nav = useNavigate();
  const [property, setProperty] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [pnl, setPnl] = useState(null);
  const [month, setMonth] = useState(todayMonth());
  const [form, setForm] = useState({ category: "maintenance", amount: "", description: "", vendor: "", incurred_at: todayISO() });
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirm, ConfirmDialog] = useConfirm();

  const load = useCallback(async () => {
    const [p, ex, r] = await Promise.all([
      api.get("/properties"),
      api.get(`/expenses?property_id=${propertyId}`),
      api.get("/reports/summary"),
    ]);
    const prop = p.data.find((x) => x.id === propertyId);
    if (!prop) { toast.error("Property not found"); nav("/dashboard/expenses"); return; }
    setProperty(prop);
    setExpenses(ex.data);
    setPnl(r.data.find((x) => x.property_id === propertyId) || null);
  }, [propertyId, nav]);
  useEffect(() => { load(); }, [load]);

  const submit = async (e) => {
    e.preventDefault();
    const amt = parseFloat(form.amount);
    if (!(amt > 0)) return toast.error("Enter a valid amount");
    setSaving(true);
    try {
      await api.post("/expenses", { ...form, amount: amt, property_id: propertyId });
      toast.success("Expense recorded");
      setOpen(false);
      setForm({ category: "maintenance", amount: "", description: "", vendor: "", incurred_at: todayISO() });
      load();
    } catch (er) { toast.error(er.response?.data?.detail || "Failed"); }
    finally { setSaving(false); }
  };

  const del = async (e) => {
    const ok = await confirm({ title: "Delete this expense?", description: "This cannot be undone.", confirmText: "Delete", destructive: true });
    if (!ok) return;
    try { await api.delete(`/expenses/${e.id}`); toast.success("Expense deleted"); load(); }
    catch (er) { toast.error(er.response?.data?.detail || "Failed"); }
  };

  if (!property) return <div className="text-slate-500 text-sm">Loading…</div>;

  const isLoss = pnl?.net < 0;
  const monthExpenses = expenses.filter((e) => monthKey(e.incurred_at) === month);
  const monthList = buildMonthList(expenses, "incurred_at");

  return (
    <div className="space-y-6">
      <div>
        <Link to="/dashboard/expenses" className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-emerald-700 transition-colors" data-testid="back-to-expenses">
          <ArrowLeft className="w-4 h-4" /> All properties
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3 mt-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-700 grid place-items-center shrink-0"><Building2 className="w-5 h-5" /></div>
            <div className="min-w-0">
              <div className="tiny-label text-emerald-700">Expenditure</div>
              <h1 className="font-display text-xl sm:text-2xl md:text-3xl font-bold tracking-tight mt-1 truncate">{property.name}</h1>
              <p className="text-slate-500 mt-1 text-xs sm:text-sm">{property.address || property.city || "—"}</p>
            </div>
          </div>
          <Button onClick={() => setOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="add-expense-btn"><Plus className="w-4 h-4 mr-1.5" /> Log expense</Button>
        </div>
      </div>

      {pnl && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          <Card className="p-4 border border-slate-200 bg-white">
            <div className="tiny-label text-slate-600">Rent collected</div>
            <div className="font-display text-lg sm:text-xl font-bold mt-2 text-emerald-700">{formatNaira(pnl.collected)}</div>
          </Card>
          <Card className="p-4 border border-slate-200 bg-white">
            <div className="tiny-label text-slate-600">Bills collected</div>
            <div className="font-display text-lg sm:text-xl font-bold mt-2 text-blue-700">{formatNaira(pnl.bills_collected)}</div>
          </Card>
          <Card className="p-4 border border-slate-200 bg-white">
            <div className="tiny-label text-slate-600">Expenditure</div>
            <div className="font-display text-lg sm:text-xl font-bold mt-2 text-orange-700">{formatNaira(pnl.expenses_total)}</div>
          </Card>
          <Card className={`p-4 border-2 ${isLoss ? "border-red-300 bg-red-50" : "border-emerald-300 bg-emerald-50"}`}>
            <div className="tiny-label flex items-center gap-1">{isLoss ? <TrendingDown className="w-3 h-3 text-red-600" /> : <TrendingUp className="w-3 h-3 text-emerald-700" />} Net</div>
            <div className={`font-display text-lg sm:text-xl font-black mt-2 ${isLoss ? "text-red-700" : "text-emerald-700"}`}>{isLoss ? "-" : ""}{formatNaira(Math.abs(pnl.net))}</div>
          </Card>
        </div>
      )}

      {/* Month selector */}
      <Card className="p-3 sm:p-4 border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 border border-slate-200 rounded-md overflow-hidden">
            <button onClick={() => setMonth(shiftMonth(month, -1))} className="px-2 py-1.5 hover:bg-slate-100" data-testid="exp-month-prev" aria-label="Previous month"><ChevronLeft className="w-4 h-4" /></button>
            <div className="px-3 py-1.5 text-sm font-semibold min-w-[160px] text-center flex items-center justify-center gap-1.5" data-testid="exp-month-label"><Calendar className="w-3.5 h-3.5 text-slate-400" />{monthLabel(month)}</div>
            <button onClick={() => setMonth(shiftMonth(month, 1))} className="px-2 py-1.5 hover:bg-slate-100" data-testid="exp-month-next" aria-label="Next month"><ChevronRight className="w-4 h-4" /></button>
          </div>
          <button onClick={() => setMonth(todayMonth())} className={`text-xs px-2.5 py-1.5 rounded border ${month === todayMonth() ? "bg-emerald-600 text-white border-emerald-600" : "bg-white border-slate-200 text-slate-600 hover:border-emerald-300"}`} data-testid="exp-month-today">This month</button>
          <div className="flex-1" />
          <div className="text-xs text-slate-500">Spent in {monthLabel(month)}: <span className="font-display font-bold text-orange-700 text-base">{formatNaira(monthExpenses.reduce((s, e) => s + (e.amount || 0), 0))}</span></div>
        </div>
        {monthList.length > 1 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {monthList.slice(0, 8).map((m) => (
              <button key={m} onClick={() => setMonth(m)} data-testid={`exp-month-chip-${m}`} className={`text-xs px-2.5 py-1 rounded-full border ${m === month ? "bg-emerald-600 text-white border-emerald-600" : "bg-white border-slate-200 text-slate-600 hover:border-emerald-300"}`}>{monthLabel(m)}</button>
            ))}
          </div>
        )}
      </Card>

      {/* Desktop table */}
      <Card className="hidden md:block border border-slate-200 bg-white overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center gap-2">
          <Receipt className="w-4 h-4 text-slate-500" />
          <div className="font-display font-bold text-lg">Expenses ledger — {monthLabel(month)}</div>
        </div>
        {monthExpenses.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">No expenses logged for {monthLabel(month)}.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead>Date</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Logged by</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {monthExpenses.map((e) => (
                <TableRow key={e.id} data-testid={`expense-row-${e.id}`}>
                  <TableCell className="text-slate-600">{formatDate(e.incurred_at)}</TableCell>
                  <TableCell><span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700 capitalize">{e.category}</span></TableCell>
                  <TableCell className="text-sm text-slate-700">{e.description || "-"}</TableCell>
                  <TableCell className="text-sm text-slate-500">{e.vendor || "-"}</TableCell>
                  <TableCell className="text-xs text-slate-500 capitalize">{(e.logged_by || e.created_by_role || "owner").replace(/_/g, " ")}</TableCell>
                  <TableCell className="font-medium text-orange-700">{formatNaira(e.amount)}</TableCell>
                  <TableCell className="text-right">
                    <button onClick={() => del(e)} className="text-red-500 hover:text-red-700 p-1.5" data-testid={`delete-expense-${e.id}`}><Trash2 className="w-4 h-4" /></button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Mobile card list */}
      <div className="md:hidden space-y-3">
        {monthExpenses.length === 0 && (
          <Card className="p-6 text-center text-slate-500 text-sm border border-slate-200 bg-white">No expenses logged for {monthLabel(month)}.</Card>
        )}
        {monthExpenses.map((e) => (
          <Card key={e.id} className="p-4 border border-slate-200 bg-white" data-testid={`expense-card-${e.id}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold text-sm capitalize">{e.category}</div>
                <div className="text-xs text-slate-500 mt-0.5">{formatDate(e.incurred_at)} · {e.vendor || "—"}</div>
                {e.description && <div className="text-xs text-slate-700 mt-1.5">{e.description}</div>}
                <div className="text-[10px] text-slate-400 mt-1 capitalize">by {(e.logged_by || e.created_by_role || "owner").replace(/_/g, " ")}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-display font-bold text-orange-700 text-base">{formatNaira(e.amount)}</div>
                <button onClick={() => del(e)} className="text-red-500 hover:text-red-700 mt-1 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="font-display text-xl sm:text-2xl">Log expense — {property.name}</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger className="mt-1.5" data-testid="expense-category"><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Amount (₦)</Label>
                <Input required type="number" min="0" step="1" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="mt-1.5" data-testid="expense-amount" />
              </div>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className="mt-1.5" placeholder="What was purchased / done?" data-testid="expense-description" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Vendor / Contractor</Label>
                <Input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} className="mt-1.5" data-testid="expense-vendor" />
              </div>
              <div>
                <Label>Date</Label>
                <Input type="date" required value={form.incurred_at} onChange={(e) => setForm({ ...form, incurred_at: e.target.value })} className="mt-1.5" data-testid="expense-date" />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="expense-submit"><Wallet className="w-4 h-4 mr-2" /> {saving ? "Saving…" : "Log expense"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog />
    </div>
  );
}
