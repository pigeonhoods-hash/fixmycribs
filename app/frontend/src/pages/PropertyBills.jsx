import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { useConfirm } from "@/components/ConfirmDialog";
import { Fuel, Zap, Plus, Wallet, ArrowLeft, Check, RotateCcw, Pencil, Trash2, Building2, ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { formatNaira, formatDate, todayISO } from "@/lib/format";
import { monthKey, monthLabel, todayMonth, shiftMonth, buildMonthList } from "@/lib/monthUtils";
import BillsTools from "@/components/BillsTools";
import TenantSelect from "@/components/TenantSelect";

const FREQUENCIES = [
  { value: "one_time", label: "One-time" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
];

function Stat({ label, value, color = "slate" }) {
  const colors = {
    slate: "text-slate-900",
    red: "text-red-600",
    emerald: "text-emerald-700",
    orange: "text-orange-700",
    blue: "text-blue-700",
  };
  return (
    <Card className="p-4 border border-slate-200 bg-white">
      <div className="tiny-label text-slate-600">{label}</div>
      <div className={`font-display text-lg sm:text-xl font-bold mt-2 ${colors[color]}`}>{formatNaira(value || 0)}</div>
    </Card>
  );
}

export default function PropertyBills() {
  const { propertyId } = useParams();
  const nav = useNavigate();
  const [property, setProperty] = useState(null);
  const [rows, setRows] = useState([]);
  const [activeTenants, setActiveTenants] = useState([]);
  const [summary, setSummary] = useState({ months: [], totals: {}, counts: {} });
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirm, ConfirmDialog] = useConfirm();
  const PAGE_SIZE = 50;

  const [tab, setTab] = useState("all"); // all | electricity_postpaid | diesel_deposit | service_charge | other
  const [month, setMonth] = useState(todayMonth());

  // Dialogs
  const [dieselOpen, setDieselOpen] = useState(false);
  const [elecOpen, setElecOpen] = useState(false);
  const [scOpen, setScOpen] = useState(false);
  const [otherOpen, setOtherOpen] = useState(false);

  const [diesel, setDiesel] = useState({ title: "Monthly diesel deposit", amount_per_tenant: "", due_date: todayISO() });
  const [elec, setElec] = useState({ rate: "", due_date: todayISO(), title: "Postpaid electricity" });
  const [readings, setReadings] = useState({});
  const [sc, setSc] = useState({ tenant_id: "", title: "Service charge", amount: "", due_date: todayISO(), description: "", frequency: "monthly", occurrences: 1 });
  const [other, setOther] = useState({ tenant_id: "", title: "", description: "", amount: "", due_date: todayISO() });

  const [payBill, setPayBill] = useState(null);
  const [payForm, setPayForm] = useState({ amount: "", method: "cash", reference: "" });
  const [editBill, setEditBill] = useState(null);
  const [editForm, setEditForm] = useState({ title: "", description: "", amount_due: "", due_date: "" });

  const loadSummary = useCallback(async () => {
    const { data } = await api.get(`/bills/property/${propertyId}/summary?month=${month}`);
    if (!data.property) { toast.error("Property not found"); nav("/dashboard/bills"); return; }
    setProperty(data.property);
    setSummary({ months: data.months || [], totals: data.totals || {}, counts: data.counts || {} });
  }, [propertyId, month, nav]);

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/bills?property_id=${propertyId}&month=${month}&bill_type=${tab}&page=${page}&page_size=${PAGE_SIZE}`);
      setRows(data.items || []); setTotal(data.total || 0); setTotalPages(data.total_pages || 1);
    } finally { setLoading(false); }
  }, [propertyId, month, tab, page]);

  const loadTenants = useCallback(async () => {
    const { data } = await api.get(`/tenants?page=1&page_size=500&property_id=${propertyId}`);
    setActiveTenants((data.items || []).filter((t) => t.status === "active"));
  }, [propertyId]);

  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => { loadRows(); }, [loadRows]);
  useEffect(() => { loadTenants(); }, [loadTenants]);
  useEffect(() => { setPage(1); }, [month, tab]);

  // Reload used by mutation handlers (create/edit/delete/pay)
  const load = useCallback(async () => {
    await Promise.all([loadSummary(), loadRows(), loadTenants()]);
  }, [loadSummary, loadRows, loadTenants]);

  useEffect(() => {
    if (activeTenants.length && !sc.tenant_id) setSc((s) => ({ ...s, tenant_id: activeTenants[0].id }));
    if (activeTenants.length && !other.tenant_id) setOther((o) => ({ ...o, tenant_id: activeTenants[0].id }));
  }, [activeTenants, sc.tenant_id, other.tenant_id]);

  const filtered = rows;
  const monthList = summary.months || [];
  const _t = summary.totals || {};
  const monthTotals = {
    expected: _t.expected || 0, collected: _t.collected || 0, outstanding: _t.outstanding || 0,
    diesel: _t.diesel || 0, elec: _t.elec || 0, svc: _t.svc || 0, other: _t.other || 0,
  };
  const counts = summary.counts || {};

  const submitDiesel = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.post("/bills/bulk/diesel-deposit", {
        property_id: propertyId,
        title: diesel.title,
        amount_per_tenant: parseFloat(diesel.amount_per_tenant),
        due_date: diesel.due_date,
      });
      toast.success(`Created ${data.created_count} diesel deposit bills`);
      setDieselOpen(false);
      setDiesel({ ...diesel, amount_per_tenant: "" });
      load();
    } catch (er) { toast.error(er.response?.data?.detail || "Failed"); }
    finally { setSaving(false); }
  };

  const submitElec = async (e) => {
    e.preventDefault();
    const readingList = activeTenants.map((t) => readings[t.id]).filter((r) => r && ((r.include_electricity !== false && r.curr !== "" && r.prev !== "") || (r.include_electricity === false && Number(r.diesel || 0) > 0)));
    if (readingList.length === 0) return toast.error("Enter at least one meter reading");
    for (const r of readingList) {
      if (r.include_electricity !== false && parseFloat(r.curr) < parseFloat(r.prev)) return toast.error("Current reading must be >= previous");
      if (Number(r.diesel || 0) < 0) return toast.error("Diesel cannot be negative");
    }
    setSaving(true);
    try {
      const { data } = await api.post("/bills/bulk/electricity-postpaid", {
        property_id: propertyId,
        rate: parseFloat(elec.rate),
        due_date: elec.due_date,
        title: elec.title,
        readings: activeTenants.filter((t) => readings[t.id] && ((readings[t.id].include_electricity !== false && readings[t.id].curr !== "") || (readings[t.id].include_electricity === false && Number(readings[t.id].diesel || 0) > 0))).map((t) => ({
          tenant_id: t.id,
          previous_reading: parseFloat(readings[t.id].prev || 0),
          current_reading: parseFloat(readings[t.id].curr || 0),
          include_electricity: readings[t.id].include_electricity !== false,
          diesel_amount: Number(readings[t.id].diesel || 0),
        })),
      });
      toast.success(`Created ${data.created_count} itemized utility bills`);
      setElecOpen(false);
      setReadings({});
      load();
    } catch (er) { toast.error(er.response?.data?.detail || "Failed"); }
    finally { setSaving(false); }
  };

  const submitSc = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.post("/bills/service-charge", {
        tenant_id: sc.tenant_id,
        title: sc.title || "Service charge",
        description: sc.description,
        amount: parseFloat(sc.amount),
        due_date: sc.due_date,
        frequency: sc.frequency,
        occurrences: sc.frequency === "one_time" ? 1 : parseInt(sc.occurrences || 1, 10),
      });
      toast.success(`Created ${data.created_count} service charge bill${data.created_count === 1 ? "" : "s"}`);
      setScOpen(false);
      setSc({ ...sc, amount: "", description: "" });
      load();
    } catch (er) { toast.error(er.response?.data?.detail || "Failed"); }
    finally { setSaving(false); }
  };

  const submitOther = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/bills", {
        tenant_id: other.tenant_id,
        bill_type: "other",
        title: other.title,
        description: other.description,
        fixed_amount: parseFloat(other.amount),
        due_date: other.due_date,
      });
      toast.success("Bill added");
      setOtherOpen(false);
      setOther({ ...other, title: "", description: "", amount: "" });
      load();
    } catch (er) { toast.error(er.response?.data?.detail || "Failed"); }
    finally { setSaving(false); }
  };

  const openEdit = (b) => {
    setEditBill(b);
    setEditForm({ title: b.title || "", description: b.description || "", amount_due: String(b.amount_due || 0), due_date: b.due_date || "" });
  };
  const submitEdit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.patch(`/bills/${editBill.id}`, {
        title: editForm.title,
        description: editForm.description,
        amount_due: parseFloat(editForm.amount_due),
        due_date: editForm.due_date,
      });
      toast.success("Bill updated");
      setEditBill(null);
      load();
    } catch (er) { toast.error(er.response?.data?.detail || "Failed"); }
    finally { setSaving(false); }
  };

  const delBill = async (b) => {
    const ok = await confirm({
      title: `Delete "${b.title}"?`,
      description: "All payments recorded against this bill will also be removed. This cannot be undone.",
      confirmText: "Delete bill",
      destructive: true,
    });
    if (!ok) return;
    try { await api.delete(`/bills/${b.id}`); toast.success("Bill deleted"); load(); }
    catch (er) { toast.error(er.response?.data?.detail || "Failed"); }
  };

  const markPaidFull = async (b) => {
    const ok = await confirm({
      title: `Mark "${b.title}" as fully paid?`,
      description: `A payment of ₦${(b.balance || 0).toLocaleString()} will be recorded to settle the bill.`,
      confirmText: "Yes, mark as paid",
    });
    if (!ok) return;
    try { await api.post(`/bills/${b.id}/mark-fully-paid`); toast.success("Bill marked as paid"); load(); }
    catch (er) { toast.error(er.response?.data?.detail || "Failed"); }
  };

  const markBillUnpaid = async (b) => {
    const ok = await confirm({
      title: `Reset "${b.title}" to unpaid?`,
      description: "Every payment recorded against this bill will be deleted and the balance reset.",
      confirmText: "Reset",
      destructive: true,
    });
    if (!ok) return;
    try { await api.post(`/bills/${b.id}/mark-unpaid`); toast.success("Reset"); load(); }
    catch (er) { toast.error(er.response?.data?.detail || "Failed"); }
  };

  const openPay = (bill) => {
    setPayBill(bill);
    setPayForm({ amount: String(bill.balance || 0), method: "cash", reference: "" });
  };
  const submitPay = async (e) => {
    e.preventDefault();
    if (!payBill) return;
    const amt = parseFloat(payForm.amount);
    if (!(amt > 0)) return toast.error("Enter a valid amount");
    setSaving(true);
    try {
      await api.post(`/bills/${payBill.id}/payments`, { amount: amt, method: payForm.method, reference: payForm.reference });
      toast.success("Payment recorded");
      setPayBill(null);
      load();
    } catch (er) { toast.error(er.response?.data?.detail || "Failed"); }
    finally { setSaving(false); }
  };

  if (!property) return <div className="text-slate-500 text-sm">Loading…</div>;

  const tabs = [
    { id: "all", label: "All", count: counts.all || 0 },
    { id: "electricity_postpaid", label: "Electricity", count: counts.electricity_postpaid || 0 },
    { id: "diesel_deposit", label: "Diesel", count: counts.diesel_deposit || 0 },
    { id: "service_charge", label: "Service charge", count: counts.service_charge || 0 },
    { id: "other", label: "Other", count: counts.other || 0 },
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link to="/dashboard/bills" className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-emerald-700 transition-colors" data-testid="back-to-bills">
          <ArrowLeft className="w-4 h-4" /> All properties
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3 mt-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-700 grid place-items-center shrink-0"><Building2 className="w-5 h-5" /></div>
            <div className="min-w-0">
              <div className="tiny-label text-emerald-700">Utility bills</div>
              <h1 className="font-display text-xl sm:text-2xl md:text-3xl font-bold tracking-tight mt-1 truncate">{property.name}</h1>
              <p className="text-slate-500 mt-1 text-xs sm:text-sm">{property.address || property.city || "—"} · {activeTenants.length} active tenant{activeTenants.length === 1 ? "" : "s"}</p>
            </div>
          </div>
          <BillsTools properties={[property]} defaultPropertyId={propertyId} defaultMonth={month} onImported={load} />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <Stat label="Outstanding" value={monthTotals.outstanding} color="red" />
        <Stat label="Collected" value={monthTotals.collected} color="emerald" />
        <Stat label="Expected" value={monthTotals.expected} color="slate" />
        <Stat label="Bills" value={counts.all || 0} color="blue" />
      </div>
      <span className="hidden" data-testid="bills-total-count">{total}</span>

      {/* Month selector */}
      <Card className="p-3 sm:p-4 border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 border border-slate-200 rounded-md overflow-hidden">
            <button onClick={() => setMonth(shiftMonth(month, -1))} className="px-2 py-1.5 hover:bg-slate-100" data-testid="bills-month-prev" aria-label="Previous month"><ChevronLeft className="w-4 h-4" /></button>
            <div className="px-3 py-1.5 text-sm font-semibold min-w-[160px] text-center flex items-center justify-center gap-1.5" data-testid="bills-month-label"><Calendar className="w-3.5 h-3.5 text-slate-400" />{monthLabel(month)}</div>
            <button onClick={() => setMonth(shiftMonth(month, 1))} className="px-2 py-1.5 hover:bg-slate-100" data-testid="bills-month-next" aria-label="Next month"><ChevronRight className="w-4 h-4" /></button>
          </div>
          <button onClick={() => setMonth(todayMonth())} className={`text-xs px-2.5 py-1.5 rounded border ${month === todayMonth() ? "bg-emerald-600 text-white border-emerald-600" : "bg-white border-slate-200 text-slate-600 hover:border-emerald-300"}`} data-testid="bills-month-today">This month</button>
          <div className="flex-1" />
          <div className="text-xs text-slate-500">Bills grouped by due month. Utility & electricity bills renew monthly — add for a new month here.</div>
        </div>
        {monthList.length > 1 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {monthList.slice(0, 8).map((m) => (
              <button key={m} onClick={() => setMonth(m)} data-testid={`bills-month-chip-${m}`} className={`text-xs px-2.5 py-1 rounded-full border ${m === month ? "bg-emerald-600 text-white border-emerald-600" : "bg-white border-slate-200 text-slate-600 hover:border-emerald-300"}`}>{monthLabel(m)}</button>
            ))}
          </div>
        )}
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setElecOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="add-electricity-btn"><Zap className="w-4 h-4 mr-1.5" /> Electricity</Button>
        <Button onClick={() => setDieselOpen(true)} variant="outline" className="border-orange-300 text-orange-700 hover:bg-orange-50" data-testid="add-diesel-btn"><Fuel className="w-4 h-4 mr-1.5" /> Diesel</Button>
        <Button onClick={() => setScOpen(true)} variant="outline" className="border-blue-300 text-blue-700 hover:bg-blue-50" data-testid="add-service-charge-btn"><Wallet className="w-4 h-4 mr-1.5" /> Service charge</Button>
        <Button onClick={() => setOtherOpen(true)} variant="outline" className="border-slate-300 text-slate-700 hover:bg-slate-50" data-testid="add-other-bill-btn"><Plus className="w-4 h-4 mr-1.5" /> Other bill</Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 flex-wrap border-b border-slate-200 pb-0.5">
        {tabs.map((tb) => (
          <button key={tb.id} onClick={() => setTab(tb.id)} data-testid={`tab-${tb.id}`}
            className={`px-3 py-2 text-sm font-medium rounded-t-md transition-colors border-b-2 -mb-[1px] ${tab === tb.id ? "border-emerald-600 text-emerald-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
            {tb.label} <span className="ml-1 text-xs text-slate-400">({tb.count})</span>
          </button>
        ))}
      </div>

      {/* Desktop table */}
      <Card className="hidden md:block border border-slate-200 bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>Title</TableHead>
              <TableHead>Tenant</TableHead>
              <TableHead>Apt</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Paid</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Due</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-slate-500 py-8">No bills for {monthLabel(month)} in this filter.</TableCell></TableRow>}
            {filtered.map((b) => (
              <TableRow key={b.id} data-testid={`bill-row-${b.id}`}>
                <TableCell><div className="font-medium">{b.title}</div>{b.bill_type === "electricity_postpaid" && <div className="text-xs text-slate-500">{b.units_consumed} kWh × ₦{b.rate} = {formatNaira(b.electricity_amount ?? (b.units_consumed * b.rate))}{b.diesel_amount > 0 && <div>Diesel: {formatNaira(b.diesel_amount)}</div>}</div>}{b.frequency && b.frequency !== "one_time" && <div className="text-xs text-blue-600 capitalize">{b.frequency}</div>}</TableCell>
                <TableCell>{b.tenant_name}</TableCell>
                <TableCell>{b.apartment_number || "—"}</TableCell>
                <TableCell><span className={`text-xs px-2 py-0.5 rounded ${b.bill_type === "diesel_deposit" ? "bg-orange-100 text-orange-800" : b.bill_type === "electricity_postpaid" ? "bg-emerald-100 text-emerald-800" : b.bill_type === "service_charge" ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-700"}`}>{b.bill_type.replace(/_/g, " ")}</span></TableCell>
                <TableCell className="font-medium">{formatNaira(b.amount_due)}</TableCell>
                <TableCell className="text-emerald-700">{formatNaira(b.amount_paid)}</TableCell>
                <TableCell><span className={`text-xs capitalize font-semibold ${b.status === "paid" ? "text-emerald-700" : b.status === "overdue" ? "text-red-600" : b.status === "partially_paid" ? "text-orange-600" : "text-slate-600"}`}>{b.status.replace(/_/g, " ")}</span></TableCell>
                <TableCell>{formatDate(b.due_date)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1 justify-end">
                    <Button size="sm" variant="ghost" onClick={() => openPay(b)} className="text-emerald-700 h-8 px-2" data-testid={`bill-pay-${b.id}`} disabled={b.status === "paid"} title="Add payment"><Plus className="w-3 h-3" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => markPaidFull(b)} className="text-emerald-700 h-8 px-2" data-testid={`bill-mark-paid-${b.id}`} disabled={b.status === "paid"} title="Mark fully paid"><Check className="w-3 h-3" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => markBillUnpaid(b)} className="text-red-600 h-8 px-2" data-testid={`bill-mark-unpaid-${b.id}`} disabled={(b.amount_paid || 0) === 0} title="Reset"><RotateCcw className="w-3 h-3" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(b)} className="text-slate-600 h-8 px-2" data-testid={`bill-edit-${b.id}`} title="Edit"><Pencil className="w-3 h-3" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => delBill(b)} className="text-red-600 h-8 px-2" data-testid={`bill-delete-${b.id}`} title="Delete"><Trash2 className="w-3 h-3" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Mobile card list */}
      <div className="md:hidden space-y-3">
        {filtered.length === 0 && (
          <Card className="p-6 text-center text-slate-500 text-sm border border-slate-200 bg-white">No bills for {monthLabel(month)} in this filter.</Card>
        )}
        {filtered.map((b) => (
          <Card key={b.id} className="p-4 border border-slate-200 bg-white" data-testid={`bill-card-${b.id}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold text-sm truncate">{b.title}</div>
                <div className="text-xs text-slate-500 mt-0.5">{b.tenant_name} · {b.apartment_number || "—"}</div>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded whitespace-nowrap ${b.bill_type === "diesel_deposit" ? "bg-orange-100 text-orange-800" : b.bill_type === "electricity_postpaid" ? "bg-emerald-100 text-emerald-800" : b.bill_type === "service_charge" ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-700"}`}>{b.bill_type.replace(/_/g, " ")}</span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <div><div className="text-slate-500">Amount</div><div className="font-semibold">{formatNaira(b.amount_due)}</div></div>
              <div><div className="text-slate-500">Paid</div><div className="font-semibold text-emerald-700">{formatNaira(b.amount_paid)}</div></div>
              <div><div className="text-slate-500">Due</div><div className="font-semibold">{formatDate(b.due_date)}</div></div>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className={`text-xs capitalize font-semibold ${b.status === "paid" ? "text-emerald-700" : b.status === "overdue" ? "text-red-600" : b.status === "partially_paid" ? "text-orange-600" : "text-slate-600"}`}>{b.status.replace(/_/g, " ")}</span>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => openPay(b)} className="text-emerald-700 h-8 px-2" disabled={b.status === "paid"}><Plus className="w-3.5 h-3.5" /></Button>
                <Button size="sm" variant="ghost" onClick={() => markPaidFull(b)} className="text-emerald-700 h-8 px-2" disabled={b.status === "paid"}><Check className="w-3.5 h-3.5" /></Button>
                <Button size="sm" variant="ghost" onClick={() => openEdit(b)} className="text-slate-600 h-8 px-2"><Pencil className="w-3.5 h-3.5" /></Button>
                <Button size="sm" variant="ghost" onClick={() => delBill(b)} className="text-red-600 h-8 px-2"><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-3" data-testid="bills-pagination">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || loading} data-testid="bills-prev-page"
            className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:border-emerald-300 disabled:opacity-40 disabled:cursor-not-allowed">
            <ChevronLeft className="w-4 h-4" /> Previous
          </button>
          <span className="text-sm text-slate-500">Page <span className="font-semibold text-slate-800">{page}</span> of {totalPages} · {total} bill{total === 1 ? "" : "s"}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages || loading} data-testid="bills-next-page"
            className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:border-emerald-300 disabled:opacity-40 disabled:cursor-not-allowed">
            Next <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Diesel dialog */}
      <Dialog open={dieselOpen} onOpenChange={setDieselOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-display text-xl sm:text-2xl">Create diesel deposit bills</DialogTitle></DialogHeader>
          <form onSubmit={submitDiesel} className="space-y-4">
            <div><Label>Title</Label><Input value={diesel.title} onChange={(e) => setDiesel({ ...diesel, title: e.target.value })} className="mt-1.5" /></div>
            <div><Label>Amount per tenant (₦)</Label><Input required type="number" min="0" step="1000" value={diesel.amount_per_tenant} onChange={(e) => setDiesel({ ...diesel, amount_per_tenant: e.target.value })} className="mt-1.5" data-testid="diesel-amount" /></div>
            <div><Label>Due date</Label><Input required type="date" value={diesel.due_date} onChange={(e) => setDiesel({ ...diesel, due_date: e.target.value })} className="mt-1.5" data-testid="diesel-due" /></div>
            <div className="text-xs text-slate-500">One bill will be created per active tenant in {property.name} ({activeTenants.length} tenant{activeTenants.length === 1 ? "" : "s"}).</div>
            <DialogFooter><Button type="submit" disabled={saving} className="bg-orange-600 hover:bg-orange-700 text-white" data-testid="diesel-submit">{saving ? "Creating…" : "Create bills"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Electricity dialog */}
      <Dialog open={elecOpen} onOpenChange={setElecOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-display text-xl sm:text-2xl">Postpaid electricity bills</DialogTitle></DialogHeader>
          <form onSubmit={submitElec} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>Rate (₦/kWh)</Label><Input required type="number" min="0" step="1" value={elec.rate} onChange={(e) => setElec({ ...elec, rate: e.target.value })} className="mt-1.5" data-testid="elec-rate" /></div>
              <div><Label>Due date</Label><Input required type="date" value={elec.due_date} onChange={(e) => setElec({ ...elec, due_date: e.target.value })} className="mt-1.5" /></div>
            </div>
            <div className="border border-slate-200 rounded-md p-3 bg-slate-50">
              <div className="tiny-label mb-2">Electricity and optional diesel per tenant — enter diesel amount individually. Uncheck Electricity for diesel-only billing.</div>
              {activeTenants.length === 0 ? <div className="text-sm text-slate-500">No active tenants.</div> : (
                <div className="space-y-2">
                  {activeTenants.map((t) => {
                    const r = readings[t.id] || { prev: "", curr: "" };
                    const consumed = r.curr && r.prev ? Math.max(0, parseFloat(r.curr) - parseFloat(r.prev)) : 0;
                    const includeElectricity = r.include_electricity !== false;
                    const electricityAmount = includeElectricity ? consumed * (parseFloat(elec.rate) || 0) : 0;
                    const amount = electricityAmount + Number(r.diesel || 0);
                    return (
                      <div key={t.id} className="grid grid-cols-2 sm:grid-cols-8 gap-2 items-center bg-white border border-slate-200 rounded p-2 text-sm">
                        <div className="sm:col-span-2">
                          <div className="font-medium">{t.full_name}</div>
                          <div className="text-xs text-slate-500">{t.apartment_number}</div>
                        </div>
                        <Input type="number" disabled={!includeElectricity} placeholder="Previous" value={r.prev} onChange={(e) => setReadings({ ...readings, [t.id]: { ...r, prev: e.target.value } })} data-testid={`elec-prev-${t.id}`} />
                        <Input type="number" disabled={!includeElectricity} placeholder="Current" value={r.curr} onChange={(e) => setReadings({ ...readings, [t.id]: { ...r, curr: e.target.value } })} data-testid={`elec-curr-${t.id}`} />
                        <label className="flex gap-1 text-xs items-center"><input type="checkbox" checked={includeElectricity} onChange={(e) => setReadings({ ...readings, [t.id]: { ...r, include_electricity: e.target.checked } })} /> Electricity</label>
                        <label className="text-xs">Diesel (₦)<Input type="number" min="0" step="0.01" placeholder="0" value={r.diesel || ""} onChange={(e) => setReadings({ ...readings, [t.id]: { ...r, diesel: e.target.value } })}/></label>
                        <div className="text-xs text-slate-600">{includeElectricity ? `${consumed} kWh · ${formatNaira(electricityAmount)}` : "Diesel only"}</div>
                        <div className="text-right font-semibold text-sm">Total {formatNaira(amount)}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <DialogFooter><Button type="submit" disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="elec-submit">{saving ? "Creating…" : "Create bills"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Service charge dialog */}
      <Dialog open={scOpen} onOpenChange={setScOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-display text-xl sm:text-2xl">Log service charge</DialogTitle></DialogHeader>
          <form onSubmit={submitSc} className="space-y-4">
            <div>
              <Label>Tenant</Label>
              <TenantSelect propertyId={propertyId} value={sc.tenant_id} onChange={(v) => setSc({ ...sc, tenant_id: v })} testId="sc-tenant" />
            </div>
            <div><Label>Title</Label><Input value={sc.title} onChange={(e) => setSc({ ...sc, title: e.target.value })} className="mt-1.5" data-testid="sc-title" /></div>
            <div><Label>Description (optional)</Label><Input value={sc.description} onChange={(e) => setSc({ ...sc, description: e.target.value })} className="mt-1.5" placeholder="e.g. Q3 estate service charge" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Amount (₦)</Label><Input required type="number" min="0" step="1" value={sc.amount} onChange={(e) => setSc({ ...sc, amount: e.target.value })} className="mt-1.5" data-testid="sc-amount" /></div>
              <div><Label>First due date</Label><Input required type="date" value={sc.due_date} onChange={(e) => setSc({ ...sc, due_date: e.target.value })} className="mt-1.5" data-testid="sc-due" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Frequency</Label>
                <Select value={sc.frequency} onValueChange={(v) => setSc({ ...sc, frequency: v })}>
                  <SelectTrigger data-testid="sc-frequency" className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>{FREQUENCIES.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {sc.frequency !== "one_time" && (
                <div>
                  <Label>Number of bills</Label>
                  <Input type="number" min="1" max="24" value={sc.occurrences} onChange={(e) => setSc({ ...sc, occurrences: e.target.value })} className="mt-1.5" data-testid="sc-occurrences" />
                </div>
              )}
            </div>
            <div className="text-xs text-slate-500">{sc.frequency === "one_time" ? "A single service charge bill will be created." : `${sc.occurrences || 1} bills will be generated, one every ${sc.frequency}.`}</div>
            <DialogFooter><Button type="submit" disabled={saving || !sc.tenant_id} className="bg-blue-600 hover:bg-blue-700 text-white" data-testid="sc-submit">{saving ? "Creating…" : "Create service charge"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Other bill dialog */}
      <Dialog open={otherOpen} onOpenChange={setOtherOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-display text-xl sm:text-2xl">Add other bill</DialogTitle></DialogHeader>
          <form onSubmit={submitOther} className="space-y-4">
            <div>
              <Label>Tenant</Label>
              <TenantSelect propertyId={propertyId} value={other.tenant_id} onChange={(v) => setOther({ ...other, tenant_id: v })} testId="other-tenant" />
            </div>
            <div><Label>Title</Label><Input required value={other.title} onChange={(e) => setOther({ ...other, title: e.target.value })} className="mt-1.5" placeholder="e.g. Water bill" data-testid="other-bill-title" /></div>
            <div><Label>Description (optional)</Label><Input value={other.description} onChange={(e) => setOther({ ...other, description: e.target.value })} className="mt-1.5" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Amount (₦)</Label><Input required type="number" min="0" step="1" value={other.amount} onChange={(e) => setOther({ ...other, amount: e.target.value })} className="mt-1.5" data-testid="other-bill-amount" /></div>
              <div><Label>Due date</Label><Input required type="date" value={other.due_date} onChange={(e) => setOther({ ...other, due_date: e.target.value })} className="mt-1.5" /></div>
            </div>
            <DialogFooter><Button type="submit" disabled={saving || !other.tenant_id} className="bg-slate-800 hover:bg-slate-900 text-white" data-testid="other-bill-submit">{saving ? "Adding…" : "Add bill"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Pay dialog */}
      <Dialog open={!!payBill} onOpenChange={(o) => !o && setPayBill(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-display text-xl sm:text-2xl">Record bill payment</DialogTitle></DialogHeader>
          {payBill && (
            <form onSubmit={submitPay} className="space-y-4">
              <div className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded p-3">
                <div><span className="text-slate-500">Bill:</span> <span className="font-medium">{payBill.title}</span></div>
                <div><span className="text-slate-500">Balance:</span> <span className="font-medium text-red-600">{formatNaira(payBill.balance)}</span></div>
              </div>
              <div><Label>Amount (₦)</Label><Input required type="number" min="0" step="1" data-testid="bill-payment-amount" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} className="mt-1.5" /></div>
              <div>
                <Label>Payment method</Label>
                <Select value={payForm.method} onValueChange={(v) => setPayForm({ ...payForm, method: v })}>
                  <SelectTrigger className="mt-1.5" data-testid="bill-payment-method"><SelectValue /></SelectTrigger>
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
              <DialogFooter><Button type="submit" disabled={saving} data-testid="bill-payment-submit" className="bg-emerald-600 hover:bg-emerald-700 text-white">{saving ? "Saving…" : "Record payment"}</Button></DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editBill} onOpenChange={(o) => !o && setEditBill(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-display text-xl sm:text-2xl">Edit bill</DialogTitle></DialogHeader>
          {editBill && (
            <form onSubmit={submitEdit} className="space-y-4">
              <div><Label>Title</Label><Input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} className="mt-1.5" data-testid="edit-bill-title" /></div>
              <div><Label>Description</Label><Input value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} className="mt-1.5" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Amount (₦)</Label><Input required type="number" min="0" step="1" value={editForm.amount_due} onChange={(e) => setEditForm({ ...editForm, amount_due: e.target.value })} className="mt-1.5" data-testid="edit-bill-amount" /></div>
                <div><Label>Due date</Label><Input required type="date" value={editForm.due_date} onChange={(e) => setEditForm({ ...editForm, due_date: e.target.value })} className="mt-1.5" /></div>
              </div>
              <DialogFooter><Button type="button" variant="outline" onClick={() => setEditBill(null)}>Cancel</Button><Button type="submit" disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="edit-bill-submit">{saving ? "Saving…" : "Save changes"}</Button></DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog />
    </div>
  );
}
