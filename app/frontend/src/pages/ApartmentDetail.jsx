import { useCallback, useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { useConfirm } from "@/components/ConfirmDialog";
import { ArrowLeft, Plus, Trash2, Pencil, Check, RotateCcw, Wallet } from "lucide-react";
import { formatNaira, formatDate, todayISO } from "@/lib/format";

const BILL_TYPES = [
  { key: "electricity_postpaid", label: "Electricity" },
  { key: "diesel_deposit", label: "Diesel" },
  { key: "service_charge", label: "Service charge" },
  { key: "other", label: "Other" },
];

const FREQS = [
  { key: "one_time", label: "One-time" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
  { key: "quarterly", label: "Quarterly" },
  { key: "yearly", label: "Yearly" },
];

const EXP_CATS = ["maintenance", "utilities", "staff", "security", "cleaning", "taxes", "insurance", "renovation", "furnishing", "legal", "supplies", "other"];

export default function ApartmentDetail() {
  const { tenantId } = useParams();
  const [tenant, setTenant] = useState(null);
  const [bills, setBills] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [confirm, ConfirmDialog] = useConfirm();

  // Add bill dialog
  const [billOpen, setBillOpen] = useState(false);
  const [bt, setBt] = useState("service_charge");
  const [billForm, setBillForm] = useState({ title: "", description: "", fixed_amount: "", due_date: todayISO(), previous_reading: "", current_reading: "", rate: "", frequency: "monthly", occurrences: 12 });
  const [saving, setSaving] = useState(false);

  // Edit bill dialog
  const [editBill, setEditBill] = useState(null);
  const [editForm, setEditForm] = useState({ title: "", description: "", amount_due: "", due_date: "" });

  // Add expense dialog
  const [expOpen, setExpOpen] = useState(false);
  const [expForm, setExpForm] = useState({ category: "maintenance", amount: "", description: "", vendor: "", incurred_at: todayISO() });

  const load = useCallback(async () => {
    const [t, b] = await Promise.all([
      api.get(`/tenants/${tenantId}`),
      api.get(`/bills?tenant_id=${tenantId}`),
    ]);
    setTenant(t.data);
    setBills(b.data);
    // Property-scoped expenses (best-effort — property_id lives on tenant)
    if (t.data?.property_id) {
      const ex = await api.get(`/expenses?property_id=${t.data.property_id}`);
      setExpenses(ex.data);
    }
  }, [tenantId]);
  useEffect(() => { load(); }, [load]);

  const submitBill = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (bt === "electricity_postpaid") {
        await api.post("/bills", {
          tenant_id: tenantId,
          bill_type: "electricity_postpaid",
          title: billForm.title || "Electricity",
          previous_reading: parseFloat(billForm.previous_reading),
          current_reading: parseFloat(billForm.current_reading),
          rate: parseFloat(billForm.rate),
          due_date: billForm.due_date,
        });
      } else if (bt === "service_charge" && billForm.frequency !== "one_time") {
        await api.post("/bills/bulk/service-charge", {
          tenant_id: tenantId,
          title: billForm.title || "Service charge",
          description: billForm.description,
          fixed_amount: parseFloat(billForm.fixed_amount),
          start_date: billForm.due_date,
          frequency: billForm.frequency,
          occurrences: parseInt(billForm.occurrences || "12", 10),
        });
      } else {
        await api.post("/bills", {
          tenant_id: tenantId,
          bill_type: bt,
          title: billForm.title || (bt === "diesel_deposit" ? "Diesel deposit" : bt === "service_charge" ? "Service charge" : "Bill"),
          description: billForm.description,
          fixed_amount: parseFloat(billForm.fixed_amount),
          due_date: billForm.due_date,
        });
      }
      toast.success("Bill created");
      setBillOpen(false);
      setBillForm({ title: "", description: "", fixed_amount: "", due_date: todayISO(), previous_reading: "", current_reading: "", rate: "", frequency: "monthly", occurrences: 12 });
      load();
    } catch (er) { toast.error(er.response?.data?.detail || "Failed"); }
    finally { setSaving(false); }
  };

  const openEdit = (b) => { setEditBill(b); setEditForm({ title: b.title, description: b.description || "", amount_due: String(b.amount_due), due_date: b.due_date }); };
  const submitEdit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try { await api.patch(`/bills/${editBill.id}`, { title: editForm.title, description: editForm.description, amount_due: parseFloat(editForm.amount_due), due_date: editForm.due_date }); toast.success("Updated"); setEditBill(null); load(); }
    catch (er) { toast.error(er.response?.data?.detail || "Failed"); } finally { setSaving(false); }
  };
  const delBill = async (b) => {
    const ok = await confirm({ title: `Delete "${b.title}"?`, description: "All payments recorded against this bill will also be removed.", confirmText: "Delete", destructive: true });
    if (!ok) return;
    try { await api.delete(`/bills/${b.id}`); toast.success("Deleted"); load(); } catch (er) { toast.error(er.response?.data?.detail || "Failed"); }
  };
  const markPaid = async (b) => {
    const ok = await confirm({ title: `Mark "${b.title}" fully paid?`, description: `A payment of ₦${(b.balance || 0).toLocaleString()} will settle this bill.`, confirmText: "Mark paid" });
    if (!ok) return;
    try { await api.post(`/bills/${b.id}/mark-fully-paid`); toast.success("Marked paid"); load(); } catch (er) { toast.error(er.response?.data?.detail || "Failed"); }
  };
  const markUnpaid = async (b) => {
    const ok = await confirm({ title: `Reset "${b.title}"?`, description: "Every payment on this bill will be deleted.", confirmText: "Reset", destructive: true });
    if (!ok) return;
    try { await api.post(`/bills/${b.id}/mark-unpaid`); toast.success("Reset"); load(); } catch (er) { toast.error(er.response?.data?.detail || "Failed"); }
  };

  // Expenses
  const submitExpense = async (e) => {
    e.preventDefault();
    if (!tenant?.property_id) return;
    setSaving(true);
    try {
      await api.post("/expenses", { property_id: tenant.property_id, category: expForm.category, amount: parseFloat(expForm.amount), description: expForm.description, vendor: expForm.vendor, incurred_at: expForm.incurred_at });
      toast.success("Expense logged");
      setExpOpen(false);
      setExpForm({ category: "maintenance", amount: "", description: "", vendor: "", incurred_at: todayISO() });
      load();
    } catch (er) { toast.error(er.response?.data?.detail || "Failed"); }
    finally { setSaving(false); }
  };
  const delExpense = async (e) => {
    const ok = await confirm({ title: "Delete this expense?", description: "This cannot be undone.", confirmText: "Delete", destructive: true });
    if (!ok) return;
    try { await api.delete(`/expenses/${e.id}`); toast.success("Deleted"); load(); } catch (er) { toast.error(er.response?.data?.detail || "Failed"); }
  };

  if (!tenant) return <div className="text-slate-500">Loading…</div>;

  const currentRent = tenant.rent_records?.[0];
  const rentBills = bills.filter((b) => false); // rent is on rent_records, not bills
  const utilBills = bills.filter((b) => ["electricity_postpaid", "diesel_deposit", "other"].includes(b.bill_type));
  const svcBills = bills.filter((b) => b.bill_type === "service_charge");

  const renderBills = (rows, emptyLabel) => (
    rows.length === 0 ? <div className="p-8 text-center text-slate-500 text-sm">{emptyLabel}</div> : (
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50">
            <TableHead>Title</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Paid</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Due</TableHead>
            <TableHead className="text-right"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((b) => (
            <TableRow key={b.id} data-testid={`apt-bill-row-${b.id}`}>
              <TableCell><div className="font-medium">{b.title}</div>{b.bill_type === "electricity_postpaid" && <div className="text-xs text-slate-500">{b.units_consumed} kWh × ₦{b.rate}</div>}</TableCell>
              <TableCell>{formatNaira(b.amount_due)}</TableCell>
              <TableCell className="text-emerald-700">{formatNaira(b.amount_paid)}</TableCell>
              <TableCell><span className={`text-xs capitalize font-semibold ${b.status === "paid" ? "text-emerald-700" : b.status === "overdue" ? "text-red-600" : b.status === "partially_paid" ? "text-orange-600" : "text-slate-600"}`}>{b.status.replace(/_/g, " ")}</span></TableCell>
              <TableCell>{formatDate(b.due_date)}</TableCell>
              <TableCell className="text-right">
                <div className="inline-flex items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => markPaid(b)} className="text-emerald-700 h-8 px-2" data-testid={`apt-mark-paid-${b.id}`} disabled={b.status === "paid"}><Check className="w-3 h-3" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => markUnpaid(b)} className="text-red-600 h-8 px-2" data-testid={`apt-mark-unpaid-${b.id}`} disabled={(b.amount_paid || 0) === 0}><RotateCcw className="w-3 h-3" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(b)} className="text-slate-600 h-8 px-2" data-testid={`apt-edit-${b.id}`}><Pencil className="w-3 h-3" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => delBill(b)} className="text-red-600 h-8 px-2" data-testid={`apt-del-${b.id}`}><Trash2 className="w-3 h-3" /></Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <Link to="/dashboard/apartments" className="text-xs text-slate-500 hover:text-slate-800 inline-flex items-center gap-1" data-testid="apt-back"><ArrowLeft className="w-3 h-3" /> Back to apartments</Link>
          <h1 className="font-display text-3xl font-bold tracking-tight mt-2">Apt {tenant.apartment_number || "-"}</h1>
          <p className="text-slate-500 mt-1">{tenant.full_name} · {tenant.property?.name || "-"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => { setBt("electricity_postpaid"); setBillOpen(true); }} variant="outline" data-testid="apt-add-electricity"><Plus className="w-4 h-4 mr-1.5" /> Electricity</Button>
          <Button onClick={() => { setBt("diesel_deposit"); setBillOpen(true); }} variant="outline" data-testid="apt-add-diesel"><Plus className="w-4 h-4 mr-1.5" /> Diesel</Button>
          <Button onClick={() => { setBt("service_charge"); setBillOpen(true); }} data-testid="apt-add-service" className="bg-blue-600 hover:bg-blue-700 text-white"><Plus className="w-4 h-4 mr-1.5" /> Service charge</Button>
          <Button onClick={() => setExpOpen(true)} variant="outline" data-testid="apt-add-expense" className="border-orange-300 text-orange-700"><Plus className="w-4 h-4 mr-1.5" /> Expense</Button>
        </div>
      </div>

      <Tabs defaultValue="utility" className="space-y-4">
        <TabsList data-testid="apt-tabs">
          <TabsTrigger value="rent" data-testid="apt-tab-rent">Rent</TabsTrigger>
          <TabsTrigger value="utility" data-testid="apt-tab-utility">Utility</TabsTrigger>
          <TabsTrigger value="service" data-testid="apt-tab-service">Service charge</TabsTrigger>
          <TabsTrigger value="expenses" data-testid="apt-tab-expenses">Expenses</TabsTrigger>
        </TabsList>

        <TabsContent value="rent">
          <Card className="border border-slate-200 bg-white">
            <div className="p-6 grid sm:grid-cols-3 gap-4">
              <div><div className="tiny-label">Rent amount</div><div className="mt-2 font-display text-2xl font-bold">{formatNaira(tenant.rent_amount)}</div><div className="text-xs text-slate-500 mt-1">{tenant.rent_frequency}</div></div>
              <div><div className="tiny-label">Paid so far</div><div className="mt-2 font-display text-2xl font-bold text-emerald-700">{formatNaira(currentRent?.amount_paid || 0)}</div></div>
              <div><div className="tiny-label">Outstanding</div><div className={`mt-2 font-display text-2xl font-bold ${(currentRent?.balance || 0) > 0 ? "text-red-600" : "text-emerald-700"}`}>{formatNaira(currentRent?.balance || 0)}</div><div className="text-xs text-slate-500 mt-1">Status: {currentRent?.status?.replace(/_/g, " ") || "-"}</div></div>
            </div>
            <div className="p-4 border-t border-slate-200 text-sm text-slate-500 flex items-center justify-between">
              <span>Detailed rent history and payment actions are on the tenant detail page.</span>
              <Link to={`/dashboard/tenants/${tenant.id}`} className="text-emerald-700 font-semibold hover:underline" data-testid="apt-tenant-link">Open tenant view →</Link>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="utility">
          <Card className="border border-slate-200 bg-white overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <div className="tiny-label">Electricity, diesel & other utility bills</div>
              <div className="text-xs text-slate-500">{utilBills.length} entr{utilBills.length === 1 ? "y" : "ies"}</div>
            </div>
            {renderBills(utilBills, "No utility bills yet. Add electricity or diesel above.")}
          </Card>
        </TabsContent>

        <TabsContent value="service">
          <Card className="border border-slate-200 bg-white overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <div className="tiny-label">Service charge (monthly / weekly / quarterly / yearly)</div>
              <div className="text-xs text-slate-500">{svcBills.length} entr{svcBills.length === 1 ? "y" : "ies"}</div>
            </div>
            {renderBills(svcBills, "No service charges yet. Use the button above to add a schedule.")}
          </Card>
        </TabsContent>

        <TabsContent value="expenses">
          <Card className="border border-slate-200 bg-white overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <div className="tiny-label">Expenses on {tenant.property?.name || "this property"}</div>
              <div className="text-xs text-slate-500">Property-wide</div>
            </div>
            {expenses.length === 0 ? <div className="p-8 text-center text-slate-500 text-sm">No expenses logged for this property.</div> : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead>Date</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead className="text-right"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.map((e) => (
                    <TableRow key={e.id} data-testid={`apt-exp-row-${e.id}`}>
                      <TableCell>{formatDate(e.incurred_at)}</TableCell>
                      <TableCell><span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700 capitalize">{e.category}</span></TableCell>
                      <TableCell className="text-sm">{e.description || "-"}</TableCell>
                      <TableCell className="text-orange-700 font-medium">{formatNaira(e.amount)}</TableCell>
                      <TableCell className="text-right"><button onClick={() => delExpense(e)} className="text-red-500 hover:text-red-700 p-1.5" data-testid={`apt-exp-del-${e.id}`}><Trash2 className="w-4 h-4" /></button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add bill dialog */}
      <Dialog open={billOpen} onOpenChange={setBillOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-display text-2xl">Add {BILL_TYPES.find((x) => x.key === bt)?.label}</DialogTitle></DialogHeader>
          <form onSubmit={submitBill} className="space-y-3">
            <div>
              <Label>Title</Label>
              <Input value={billForm.title} onChange={(e) => setBillForm({ ...billForm, title: e.target.value })} className="mt-1.5" data-testid="apt-bill-title" placeholder={BILL_TYPES.find((x) => x.key === bt)?.label} />
            </div>
            {bt === "electricity_postpaid" ? (
              <div className="grid grid-cols-3 gap-2">
                <div><Label>Previous</Label><Input required type="number" step="0.1" value={billForm.previous_reading} onChange={(e) => setBillForm({ ...billForm, previous_reading: e.target.value })} className="mt-1.5" data-testid="apt-el-prev" /></div>
                <div><Label>Current</Label><Input required type="number" step="0.1" value={billForm.current_reading} onChange={(e) => setBillForm({ ...billForm, current_reading: e.target.value })} className="mt-1.5" data-testid="apt-el-curr" /></div>
                <div><Label>Rate (₦/kWh)</Label><Input required type="number" step="0.1" value={billForm.rate} onChange={(e) => setBillForm({ ...billForm, rate: e.target.value })} className="mt-1.5" data-testid="apt-el-rate" /></div>
              </div>
            ) : (
              <div>
                <Label>Amount (₦)</Label>
                <Input required type="number" min="0" step="1" value={billForm.fixed_amount} onChange={(e) => setBillForm({ ...billForm, fixed_amount: e.target.value })} className="mt-1.5" data-testid="apt-bill-amount" />
              </div>
            )}
            <div>
              <Label>{bt === "service_charge" ? "Start date" : "Due date"}</Label>
              <Input required type="date" value={billForm.due_date} onChange={(e) => setBillForm({ ...billForm, due_date: e.target.value })} className="mt-1.5" data-testid="apt-bill-due" />
            </div>
            {bt === "service_charge" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Frequency</Label>
                  <Select value={billForm.frequency} onValueChange={(v) => setBillForm({ ...billForm, frequency: v })}>
                    <SelectTrigger className="mt-1.5" data-testid="apt-sc-frequency"><SelectValue /></SelectTrigger>
                    <SelectContent>{FREQS.map((f) => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Occurrences</Label>
                  <Input type="number" min="1" max="24" value={billForm.occurrences} onChange={(e) => setBillForm({ ...billForm, occurrences: e.target.value })} className="mt-1.5" disabled={billForm.frequency === "one_time"} data-testid="apt-sc-occurrences" />
                  <div className="text-xs text-slate-500 mt-1">{billForm.frequency === "one_time" ? "Single bill" : `Will generate ${billForm.occurrences} bills`}</div>
                </div>
              </div>
            )}
            <div>
              <Label>Description</Label>
              <Textarea rows={2} value={billForm.description} onChange={(e) => setBillForm({ ...billForm, description: e.target.value })} className="mt-1.5" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setBillOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="apt-bill-submit"><Wallet className="w-4 h-4 mr-1.5" /> {saving ? "Saving…" : "Create bill"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editBill} onOpenChange={(o) => !o && setEditBill(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-display text-2xl">Edit bill</DialogTitle></DialogHeader>
          {editBill && (
            <form onSubmit={submitEdit} className="space-y-3">
              <div><Label>Title</Label><Input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} className="mt-1.5" data-testid="apt-edit-title" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Amount</Label><Input required type="number" value={editForm.amount_due} onChange={(e) => setEditForm({ ...editForm, amount_due: e.target.value })} className="mt-1.5" data-testid="apt-edit-amount" /></div>
                <div><Label>Due date</Label><Input required type="date" value={editForm.due_date} onChange={(e) => setEditForm({ ...editForm, due_date: e.target.value })} className="mt-1.5" data-testid="apt-edit-due" /></div>
              </div>
              <div><Label>Description</Label><Input value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} className="mt-1.5" /></div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditBill(null)}>Cancel</Button>
                <Button type="submit" disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="apt-edit-submit">{saving ? "Saving…" : "Save"}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Add expense dialog */}
      <Dialog open={expOpen} onOpenChange={setExpOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-display text-2xl">Log expense for {tenant.property?.name}</DialogTitle></DialogHeader>
          <form onSubmit={submitExpense} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Category</Label>
                <Select value={expForm.category} onValueChange={(v) => setExpForm({ ...expForm, category: v })}>
                  <SelectTrigger className="mt-1.5" data-testid="apt-exp-category"><SelectValue /></SelectTrigger>
                  <SelectContent>{EXP_CATS.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Amount (₦)</Label>
                <Input required type="number" min="0" step="1" value={expForm.amount} onChange={(e) => setExpForm({ ...expForm, amount: e.target.value })} className="mt-1.5" data-testid="apt-exp-amount" />
              </div>
            </div>
            <div><Label>Description</Label><Textarea rows={2} value={expForm.description} onChange={(e) => setExpForm({ ...expForm, description: e.target.value })} className="mt-1.5" data-testid="apt-exp-desc" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Vendor</Label><Input value={expForm.vendor} onChange={(e) => setExpForm({ ...expForm, vendor: e.target.value })} className="mt-1.5" /></div>
              <div><Label>Date</Label><Input required type="date" value={expForm.incurred_at} onChange={(e) => setExpForm({ ...expForm, incurred_at: e.target.value })} className="mt-1.5" data-testid="apt-exp-date" /></div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setExpOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="apt-exp-submit"><Wallet className="w-4 h-4 mr-1.5" /> {saving ? "Saving…" : "Log expense"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog />
    </div>
  );
}
