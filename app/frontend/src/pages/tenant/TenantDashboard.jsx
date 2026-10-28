import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Home, Wallet, Calendar, MessageSquare, CheckCircle2 } from "lucide-react";
import { formatNaira, formatDate } from "@/lib/format";
import StatusBadge from "@/components/StatusBadge";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function TenantDashboard() {
  const [data, setData] = useState(null);
  const [rentReport, setRentReport] = useState(null);
  const [proof, setProof] = useState(null);
  const [amount, setAmount] = useState("");
  const [reports, setReports] = useState([]);
  useEffect(() => { api.get("/tenant/payments/reports").then(r => setReports(r.data)).catch(() => {}); }, []);
  const notifyRentPaid = async (e) => {
    e.preventDefault();
    const fd = new FormData(); fd.append("kind", "rent"); fd.append("record_id", rentReport); fd.append("amount", amount); fd.append("file", proof);
    try { await api.post("/tenant/payments/report", fd); toast.success("Rent payment reported for landlord review"); setRentReport(null); setProof(null); setAmount(""); api.get("/tenant/payments/reports").then(r => setReports(r.data)); }
    catch (err) { toast.error(err.response?.data?.detail || "Failed to submit proof"); }
  };

  useEffect(() => { api.get("/tenant/dashboard").then((r) => setData(r.data)).catch(() => {}); }, []);

  if (!data) return <div className="text-slate-500">Loading…</div>;
  const { tenant, property, landlord, current_rent, rent_records, payments, outstanding_rent, total_paid, unread_messages } = data;

  return (
    <div className="space-y-6">
      <div>
        <div className="tiny-label text-emerald-700">Welcome</div>
        <h1 className="font-display text-3xl font-bold tracking-tight mt-2" data-testid="tenant-greeting">Hi {tenant.full_name} 👋</h1>
        <p className="text-slate-500 mt-1">{property?.name} · {tenant.apartment_number}</p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-5 border border-slate-200 bg-white" data-testid="tenant-outstanding-card">
          <div className="flex items-center gap-2"><Wallet className="w-4 h-4 text-orange-600" /><div className="tiny-label">Outstanding rent</div></div>
          <div className="font-display text-2xl font-bold mt-2">{formatNaira(outstanding_rent)}</div>
          <div className="text-xs text-slate-500 mt-1">across {rent_records.length} record{rent_records.length !== 1 && "s"}</div>
        </Card>
        <Card className="p-5 border border-slate-200 bg-white">
          <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-700" /><div className="tiny-label">Total paid</div></div>
          <div className="font-display text-2xl font-bold mt-2">{formatNaira(total_paid)}</div>
          <div className="text-xs text-slate-500 mt-1">{payments.length} payment{payments.length !== 1 && "s"}</div>
        </Card>
        <Card className="p-5 border border-slate-200 bg-white">
          <div className="flex items-center gap-2"><Calendar className="w-4 h-4 text-blue-700" /><div className="tiny-label">Next due date</div></div>
          <div className="font-display text-2xl font-bold mt-2">{current_rent ? formatDate(current_rent.due_date) : "—"}</div>
          <div className="text-xs mt-1">{current_rent && <StatusBadge status={current_rent.status} />}</div>
        </Card>
        <Link to="/tenant/messages" className="block">
          <Card className="p-5 border border-slate-200 bg-white hover:border-emerald-500 transition-colors h-full">
            <div className="flex items-center gap-2"><MessageSquare className="w-4 h-4 text-emerald-700" /><div className="tiny-label">Messages</div></div>
            <div className="font-display text-2xl font-bold mt-2">{unread_messages}</div>
            <div className="text-xs text-slate-500 mt-1">unread from your landlord</div>
          </Card>
        </Link>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="p-6 border border-slate-200 bg-white">
          <div className="flex items-center gap-2 mb-4"><Home className="w-4 h-4 text-emerald-700" /><div className="tiny-label">Your rental</div></div>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Property</dt><dd className="font-semibold">{property?.name || "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Apartment</dt><dd className="font-semibold">{tenant.apartment_number || "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Rent amount</dt><dd className="font-semibold">{formatNaira(tenant.rent_amount)} / {tenant.rent_frequency}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Address</dt><dd className="font-semibold text-right">{property?.address || "—"}</dd></div>
          </dl>
        </Card>
        <Card className="p-6 border border-slate-200 bg-white">
          <div className="tiny-label mb-4">Your landlord</div>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Name</dt><dd className="font-semibold">{landlord?.full_name || "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Email</dt><dd className="font-semibold">{landlord?.email || "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Phone</dt><dd className="font-semibold">{landlord?.phone || "—"}</dd></div>
          </dl>
        </Card>
      </div>

      {rentReport && <Card className="p-4 space-y-2"><h3 className="font-semibold">Notify landlord of rent payment</h3><p className="text-xs text-slate-500">The landlord must review the evidence and record the payment. This notification does not change your rent balance.</p><form onSubmit={notifyRentPaid} className="space-y-2"><Input required type="number" min="0.01" step="0.01" placeholder="Amount paid" value={amount} onChange={e => setAmount(e.target.value)} /><Input required type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e => setProof(e.target.files?.[0] || null)} /><Button type="submit">Submit payment evidence</Button> <Button type="button" variant="outline" onClick={() => setRentReport(null)}>Cancel</Button></form></Card>}
      <Card className="p-6 border border-slate-200 bg-white">
        <div className="tiny-label mb-4">Rent records</div>
        {rent_records.length === 0 ? (
          <div className="text-sm text-slate-500 py-8 text-center">No rent records yet.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {rent_records.map((r) => (
              <div key={r.id} className="py-3 grid grid-cols-4 items-center gap-2 text-sm" data-testid={`rent-record-${r.id}`}>
                <div className="font-medium">{formatDate(r.due_date)}</div>
                <div>{formatNaira(r.amount_due)}</div>
                <div className="text-emerald-700">Paid: {formatNaira(r.amount_paid)}</div>
                <div className="text-right"><StatusBadge status={r.status} /><Button size="sm" variant="outline" onClick={() => { setRentReport(r.id); setAmount(String(Math.max(0, r.amount_due - r.amount_paid))); }} className="mt-1">I've paid</Button>{reports.filter(x => x.kind === "rent" && x.record_id === r.id).map(x => <div key={x.id} className="text-xs">Proof: {x.status}</div>)}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-6 border border-slate-200 bg-white">
        <div className="tiny-label mb-4">Payment history</div>
        {payments.length === 0 ? (
          <div className="text-sm text-slate-500 py-8 text-center">No payments recorded yet.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {payments.map((p) => (
              <div key={p.id} className="py-3 flex items-center justify-between text-sm">
                <div>
                  <div className="font-medium">{formatDate(p.payment_date)}</div>
                  <div className="text-xs text-slate-500">{p.method.replace(/_/g, " ")} · {p.receipt_number}</div>
                </div>
                <div className="font-display font-bold text-emerald-700">{formatNaira(p.amount)}</div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
