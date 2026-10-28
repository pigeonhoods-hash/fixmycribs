import { useCallback, useEffect, useMemo, useState } from "react";
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
import { Plus, Trash2, Wallet, Receipt, ChevronLeft, ChevronRight, Building2 } from "lucide-react";
import { formatNaira, formatDate, todayISO } from "@/lib/format";

const CATEGORIES = [
  "maintenance", "utilities", "staff", "security", "cleaning",
  "taxes", "insurance", "renovation", "furnishing", "legal", "supplies", "other",
];

function monthKey(iso) {
  if (!iso) return "";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(key) {
  if (!key) return "";
  const [y, m] = key.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-NG", { month: "long", year: "numeric" });
}
function todayMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function shiftMonth(key, delta) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function FacilityManagerExpenses() {
  const [properties, setProperties] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [propId, setPropId] = useState("all");
  const [month, setMonth] = useState(todayMonth());
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ property_id: "", category: "maintenance", amount: "", description: "", vendor: "", incurred_at: todayISO() });
  const [confirm, ConfirmDialog] = useConfirm();

  const load = useCallback(async () => {
    try {
      const [p, ex] = await Promise.all([api.get("/properties"), api.get("/expenses")]);
      setProperties(p.data);
      setExpenses(ex.data);
      if (p.data.length && !form.property_id) setForm((f) => ({ ...f, property_id: p.data[0].id }));
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to load");
    }
  }, [form.property_id]);
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const monthsWithData = useMemo(() => {
    const set = new Set([todayMonth()]);
    expenses.forEach((e) => set.add(monthKey(e.incurred_at)));
    return Array.from(set).sort().reverse();
  }, [expenses]);

  const filtered = useMemo(() => {
    return expenses.filter((e) => (propId === "all" || e.property_id === propId) && monthKey(e.incurred_at) === month);
  }, [expenses, propId, month]);

  const monthTotal = filtered.reduce((s, e) => s + (e.amount || 0), 0);

  const submit = async (e) => {
    e.preventDefault();
    const amt = parseFloat(form.amount);
    if (!(amt > 0)) return toast.error("Enter a valid amount");
    if (!form.property_id) return toast.error("Pick a property");
    setSaving(true);
    try {
      await api.post("/expenses", { ...form, amount: amt });
      toast.success("Expense logged — landlord can see it");
      setOpen(false);
      setForm({ ...form, amount: "", description: "", vendor: "" });
      load();
    } catch (er) { toast.error(er.response?.data?.detail || "Failed"); }
    finally { setSaving(false); }
  };

  const del = async (e) => {
    const ok = await confirm({ title: "Delete this expense?", description: "This will remove it from the landlord's books too.", confirmText: "Delete", destructive: true });
    if (!ok) return;
    try { await api.delete(`/expenses/${e.id}`); toast.success("Deleted"); load(); }
    catch (er) { toast.error(er.response?.data?.detail || "Failed"); }
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="tiny-label text-blue-700">Field ops</div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight mt-2 flex items-center gap-2"><Receipt className="w-6 h-6 text-blue-700" /> Expenditure log</h1>
        <p className="text-slate-500 mt-1 text-sm sm:text-base">Log expenses per property, per month. Your landlord can review and edit anything you submit.</p>
      </div>

      <Card className="p-4 border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 border border-slate-200 rounded-md overflow-hidden bg-white">
            <button onClick={() => setMonth(shiftMonth(month, -1))} className="px-2 py-1.5 hover:bg-slate-100" data-testid="fm-month-prev"><ChevronLeft className="w-4 h-4" /></button>
            <div className="px-3 py-1.5 text-sm font-semibold min-w-[160px] text-center" data-testid="fm-month-label">{monthLabel(month)}</div>
            <button onClick={() => setMonth(shiftMonth(month, 1))} className="px-2 py-1.5 hover:bg-slate-100" data-testid="fm-month-next"><ChevronRight className="w-4 h-4" /></button>
          </div>
          <Select value={propId} onValueChange={setPropId}>
            <SelectTrigger className="w-56" data-testid="fm-prop-filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All properties</SelectItem>
              {properties.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex-1" />
          <div className="text-xs text-slate-500">Total this month: <span className="font-display font-bold text-orange-700 text-base">{formatNaira(monthTotal)}</span></div>
          <Button onClick={() => setOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white" data-testid="fm-add-expense-btn"><Plus className="w-4 h-4 mr-1.5" /> Log expense</Button>
        </div>
        {monthsWithData.length > 1 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {monthsWithData.slice(0, 6).map((m) => (
              <button key={m} onClick={() => setMonth(m)} data-testid={`fm-month-chip-${m}`} className={`text-xs px-2.5 py-1 rounded-full border ${m === month ? "bg-blue-600 text-white border-blue-600" : "bg-white border-slate-200 text-slate-600 hover:border-blue-300"}`}>{monthLabel(m)}</button>
            ))}
          </div>
        )}
      </Card>

      {/* Desktop */}
      <Card className="hidden md:block border border-slate-200 bg-white overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">No expenses for {monthLabel(month)}.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead>Date</TableHead>
                <TableHead>Property</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((e) => (
                <TableRow key={e.id} data-testid={`fm-expense-row-${e.id}`}>
                  <TableCell>{formatDate(e.incurred_at)}</TableCell>
                  <TableCell><span className="inline-flex items-center gap-1 text-xs"><Building2 className="w-3 h-3 text-slate-400" /> {e.property_name}</span></TableCell>
                  <TableCell><span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700 capitalize">{e.category}</span></TableCell>
                  <TableCell className="text-sm text-slate-700">{e.description || "-"}</TableCell>
                  <TableCell className="text-sm text-slate-500">{e.vendor || "-"}</TableCell>
                  <TableCell className="font-medium text-orange-700">{formatNaira(e.amount)}</TableCell>
                  <TableCell className="text-right">
                    <button onClick={() => del(e)} className="text-red-500 hover:text-red-700 p-1.5" data-testid={`fm-delete-expense-${e.id}`}><Trash2 className="w-4 h-4" /></button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Mobile */}
      <div className="md:hidden space-y-3">
        {filtered.length === 0 && <Card className="p-6 text-center text-slate-500 text-sm border border-slate-200 bg-white">No expenses for {monthLabel(month)}.</Card>}
        {filtered.map((e) => (
          <Card key={e.id} className="p-4 border border-slate-200 bg-white" data-testid={`fm-expense-card-${e.id}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold text-sm capitalize">{e.category}</div>
                <div className="text-xs text-slate-500 mt-0.5">{e.property_name} · {formatDate(e.incurred_at)}</div>
                {e.description && <div className="text-xs text-slate-700 mt-1.5">{e.description}</div>}
              </div>
              <div className="text-right">
                <div className="font-display font-bold text-orange-700 text-base">{formatNaira(e.amount)}</div>
                <button onClick={() => del(e)} className="text-red-500 hover:text-red-700 mt-1 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="font-display text-xl sm:text-2xl">Log expense</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label>Property</Label>
              <Select value={form.property_id} onValueChange={(v) => setForm({ ...form, property_id: v })}>
                <SelectTrigger className="mt-1.5" data-testid="fm-expense-property"><SelectValue placeholder="Select property" /></SelectTrigger>
                <SelectContent>{properties.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger className="mt-1.5" data-testid="fm-expense-category"><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Amount (₦)</Label><Input required type="number" min="0" step="1" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="mt-1.5" data-testid="fm-expense-amount" /></div>
            </div>
            <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className="mt-1.5" placeholder="What was purchased / done?" data-testid="fm-expense-description" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Vendor</Label><Input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} className="mt-1.5" data-testid="fm-expense-vendor" /></div>
              <div><Label>Date</Label><Input type="date" required value={form.incurred_at} onChange={(e) => setForm({ ...form, incurred_at: e.target.value })} className="mt-1.5" data-testid="fm-expense-date" /></div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white" data-testid="fm-expense-submit"><Wallet className="w-4 h-4 mr-2" /> {saving ? "Saving…" : "Log expense"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog />
    </div>
  );
}
