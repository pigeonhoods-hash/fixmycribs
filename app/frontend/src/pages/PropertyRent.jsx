import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { useConfirm } from "@/components/ConfirmDialog";
import { formatNaira, formatDate, todayISO } from "@/lib/format";
import StatusBadge from "@/components/StatusBadge";
import { ArrowLeft, Building2, Receipt, Plus, Check, RotateCcw } from "lucide-react";

const STATUSES = ["all", "upcoming", "due_today", "paid", "partially_paid", "overdue"];

export default function PropertyRent() {
  const { propertyId } = useParams();
  const nav = useNavigate();
  const [property, setProperty] = useState(null);
  const [records, setRecords] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirm, ConfirmDialog] = useConfirm();

  const [payRec, setPayRec] = useState(null);
  const [payForm, setPayForm] = useState({ amount: "", method: "cash", reference: "" });

  const load = useCallback(async () => {
    const [p, r, t] = await Promise.all([
      api.get("/properties"),
      api.get("/rent-records"),
      api.get("/tenants"),
    ]);
    const prop = p.data.find((x) => x.id === propertyId);
    if (!prop) { toast.error("Property not found"); nav("/dashboard/rent"); return; }
    setProperty(prop);
    setTenants(t.data.filter((x) => x.property_id === propertyId));
    const tenantIds = new Set(t.data.filter((x) => x.property_id === propertyId).map((x) => x.id));
    setRecords(r.data.filter((rec) => tenantIds.has(rec.tenant_id)));
  }, [propertyId, nav]);
  useEffect(() => { load(); }, [load]);

  const totals = useMemo(() => {
    let expected = 0, collected = 0, balance = 0;
    records.forEach((r) => { expected += r.amount_due || 0; collected += r.amount_paid || 0; balance += r.balance || 0; });
    return { expected, collected, balance };
  }, [records]);

  const filtered = records.filter((r) => {
    if (status !== "all" && r.status !== status) return false;
    if (q && !`${r.tenant_name || ""}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const openPay = (rec) => {
    setPayRec(rec);
    setPayForm({ amount: String(rec.balance || 0), method: "cash", reference: "" });
  };

  const submitPay = async (e) => {
    e.preventDefault();
    if (!payRec) return;
    const amt = parseFloat(payForm.amount);
    if (!(amt > 0)) return toast.error("Enter a valid amount");
    setSaving(true);
    try {
      await api.post("/payments", {
        tenant_id: payRec.tenant_id,
        rent_record_id: payRec.id,
        amount: amt,
        method: payForm.method,
        reference: payForm.reference,
      });
      toast.success("Payment recorded");
      setPayRec(null);
      load();
    } catch (er) { toast.error(er.response?.data?.detail || "Failed"); }
    finally { setSaving(false); }
  };

  const markFullyPaid = async (r) => {
    const ok = await confirm({
      title: `Mark "${r.tenant_name}" rent fully paid?`,
      description: `₦${(r.balance || 0).toLocaleString()} will be recorded as paid.`,
      confirmText: "Yes, mark paid",
    });
    if (!ok) return;
    try { await api.post(`/rent-records/${r.id}/mark-fully-paid`); toast.success("Marked paid"); load(); }
    catch (er) { toast.error(er.response?.data?.detail || "Failed"); }
  };

  const markUnpaid = async (r) => {
    const ok = await confirm({
      title: `Reset rent to unpaid?`,
      description: "All payments recorded for this cycle will be deleted.",
      confirmText: "Reset",
      destructive: true,
    });
    if (!ok) return;
    try { await api.post(`/rent-records/${r.id}/mark-unpaid`); toast.success("Reset"); load(); }
    catch (er) { toast.error(er.response?.data?.detail || "Failed"); }
  };

  if (!property) return <div className="text-slate-500 text-sm">Loading…</div>;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/dashboard/rent" className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-emerald-700 transition-colors" data-testid="back-to-rent">
          <ArrowLeft className="w-4 h-4" /> All properties
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3 mt-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-700 grid place-items-center shrink-0"><Building2 className="w-5 h-5" /></div>
            <div className="min-w-0">
              <div className="tiny-label text-emerald-700">Rent records</div>
              <h1 className="font-display text-xl sm:text-2xl md:text-3xl font-bold tracking-tight mt-1 truncate">{property.name}</h1>
              <p className="text-slate-500 mt-1 text-xs sm:text-sm">{property.address || property.city || "—"} · {tenants.filter((x) => x.status === "active").length} active tenant{tenants.filter((x) => x.status === "active").length === 1 ? "" : "s"}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
        <Card className="p-4 border border-slate-200 bg-white">
          <div className="tiny-label text-slate-600">Outstanding</div>
          <div className="font-display text-lg sm:text-xl font-bold mt-2 text-red-600">{formatNaira(totals.balance)}</div>
        </Card>
        <Card className="p-4 border border-slate-200 bg-white">
          <div className="tiny-label text-slate-600">Collected</div>
          <div className="font-display text-lg sm:text-xl font-bold mt-2 text-emerald-700">{formatNaira(totals.collected)}</div>
        </Card>
        <Card className="p-4 border border-slate-200 bg-white">
          <div className="tiny-label text-slate-600">Expected</div>
          <div className="font-display text-lg sm:text-xl font-bold mt-2 text-slate-900">{formatNaira(totals.expected)}</div>
        </Card>
      </div>

      <div className="flex flex-wrap gap-3">
        <Input placeholder="Search tenant…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" data-testid="rent-search" />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-48" data-testid="rent-status-filter"><SelectValue /></SelectTrigger>
          <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <Card className="p-10 border border-dashed border-slate-300 bg-white text-center">
          <Receipt className="w-10 h-10 text-slate-300 mx-auto" />
          <div className="mt-3 font-display font-bold text-lg">No rent records</div>
          <p className="text-slate-500 mt-1 text-sm">Rent records are auto-generated when you add tenants.</p>
        </Card>
      ) : (
        <>
          {/* Desktop table */}
          <Card className="hidden md:block border border-slate-200 bg-white overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead>Tenant</TableHead>
                  <TableHead>Due date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead>Balance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.id} data-testid={`rent-row-${r.id}`}>
                    <TableCell className="font-medium">{r.tenant_name}</TableCell>
                    <TableCell>{formatDate(r.due_date)}</TableCell>
                    <TableCell>{formatNaira(r.amount_due)}</TableCell>
                    <TableCell className="text-emerald-700">{formatNaira(r.amount_paid)}</TableCell>
                    <TableCell className="font-medium">{formatNaira(r.balance)}</TableCell>
                    <TableCell><StatusBadge status={r.status} /></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 justify-end">
                        <Button size="sm" variant="ghost" onClick={() => openPay(r)} className="text-emerald-700 h-8 px-2" data-testid={`rent-pay-${r.id}`} disabled={r.status === "paid"}><Plus className="w-3 h-3" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => markFullyPaid(r)} className="text-emerald-700 h-8 px-2" data-testid={`rent-mark-paid-${r.id}`} disabled={r.status === "paid"}><Check className="w-3 h-3" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => markUnpaid(r)} className="text-red-600 h-8 px-2" data-testid={`rent-mark-unpaid-${r.id}`} disabled={(r.amount_paid || 0) === 0}><RotateCcw className="w-3 h-3" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {/* Mobile card list */}
          <div className="md:hidden space-y-3">
            {filtered.map((r) => (
              <Card key={r.id} className="p-4 border border-slate-200 bg-white" data-testid={`rent-card-${r.id}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate">{r.tenant_name}</div>
                    <div className="text-xs text-slate-500 mt-0.5">Due {formatDate(r.due_date)}</div>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div><div className="text-slate-500">Amount</div><div className="font-semibold">{formatNaira(r.amount_due)}</div></div>
                  <div><div className="text-slate-500">Paid</div><div className="font-semibold text-emerald-700">{formatNaira(r.amount_paid)}</div></div>
                  <div><div className="text-slate-500">Balance</div><div className="font-semibold text-red-600">{formatNaira(r.balance)}</div></div>
                </div>
                <div className="mt-3 flex items-center gap-1 justify-end">
                  <Button size="sm" variant="ghost" onClick={() => openPay(r)} className="text-emerald-700 h-8 px-2" disabled={r.status === "paid"}><Plus className="w-3.5 h-3.5" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => markFullyPaid(r)} className="text-emerald-700 h-8 px-2" disabled={r.status === "paid"}><Check className="w-3.5 h-3.5" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => markUnpaid(r)} className="text-red-600 h-8 px-2" disabled={(r.amount_paid || 0) === 0}><RotateCcw className="w-3.5 h-3.5" /></Button>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      <Dialog open={!!payRec} onOpenChange={(o) => !o && setPayRec(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-display text-xl sm:text-2xl">Record rent payment</DialogTitle></DialogHeader>
          {payRec && (
            <form onSubmit={submitPay} className="space-y-4">
              <div className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded p-3">
                <div><span className="text-slate-500">Tenant:</span> <span className="font-medium">{payRec.tenant_name}</span></div>
                <div><span className="text-slate-500">Balance:</span> <span className="font-medium text-red-600">{formatNaira(payRec.balance)}</span></div>
              </div>
              <div><Label>Amount (₦)</Label><Input required type="number" min="0" step="1" data-testid="rent-payment-amount" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} className="mt-1.5" /></div>
              <div>
                <Label>Payment method</Label>
                <Select value={payForm.method} onValueChange={(v) => setPayForm({ ...payForm, method: v })}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                    <SelectItem value="pos">POS</SelectItem>
                    <SelectItem value="mobile_transfer">Mobile transfer</SelectItem>
                    <SelectItem value="ussd">USSD</SelectItem>
                    <SelectItem value="online">Online payment</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Reference (optional)</Label><Input value={payForm.reference} onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })} className="mt-1.5" /></div>
              <DialogFooter><Button type="submit" disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="rent-payment-submit">{saving ? "Saving…" : "Record payment"}</Button></DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog />
    </div>
  );
}
