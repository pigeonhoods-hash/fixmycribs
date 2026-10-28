import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNaira, formatDate } from "@/lib/format";
import { CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import EvidencePreview from "@/components/EvidencePreview";

export default function Payments() {
  const [items, setItems] = useState([]);
  const [reports, setReports] = useState([]);
  const loadReports = () => api.get("/payments/reports").then(r => setReports(r.data)).catch(() => {});
  useEffect(() => { loadReports(); }, []);
  const review = async (id, status) => {
    try { await api.patch(`/payments/reports/${id}`, { status }); toast.success(status === "verified" ? "Evidence verified. Record the payment separately to update the balance." : "Payment proof rejected"); loadReports(); }
    catch (err) { toast.error(err.response?.data?.detail || "Review failed"); }
  };

  useEffect(() => { api.get("/payments").then((r) => setItems(r.data)); }, []);

  return (
    <div className="space-y-6">
      <div>
        <div className="tiny-label text-emerald-700">Cashflow</div>
        <h1 className="font-display text-3xl font-bold tracking-tight mt-2">Payments</h1>
        <p className="text-slate-500 mt-1">Every payment recorded across your rental business.</p>
      </div>

      <Card className="p-4 space-y-3"><h2 className="font-semibold text-lg">Tenant payment notifications</h2><p className="text-sm text-slate-500">Review payment evidence. Verifying evidence does not automatically credit bills or rent; use the existing payment action after confirmation.</p>{reports.length === 0 ? <p className="text-sm text-slate-500">No notifications yet.</p> : reports.map(r => <div key={r.id} className="border rounded-lg p-3 space-y-2 text-sm"><div><strong>{r.kind === "bill" ? "Utility bill" : "Rent"}</strong> · {formatNaira(r.amount)} · <span className="capitalize">{r.status}</span></div><div className="text-xs text-slate-500">Tenant ID: {r.tenant_id} · Reference: {r.reference || "—"} · {formatDate(r.created_at)}</div><EvidencePreview files={r.evidence ? [r.evidence] : []} title="Tenant payment receipt" />{r.status === "pending" && <><Button size="sm" onClick={() => review(r.id, "verified")}>Verify evidence</Button><Button size="sm" variant="outline" onClick={() => review(r.id, "rejected")}>Reject</Button></>}</div>)}</Card>
      {items.length === 0 ? (
        <Card className="p-12 border border-dashed border-slate-300 bg-white text-center">
          <CreditCard className="w-10 h-10 text-slate-300 mx-auto" />
          <div className="mt-3 font-display font-bold text-lg">No payments yet</div>
          <p className="text-slate-500 mt-1">Record your first payment from a tenant profile.</p>
        </Card>
      ) : (
        <>
          {/* Mobile: cards */}
          <div className="md:hidden space-y-3">
            {items.map((p) => (
              <Card key={p.id} className="p-4 border border-slate-200 bg-white">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{p.tenant_name}</div>
                    <div className="text-xs text-slate-500 truncate">{p.property_name}</div>
                  </div>
                  <div className="font-display font-bold text-emerald-700 tabular-nums whitespace-nowrap">{formatNaira(p.amount)}</div>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2 text-xs text-slate-500">
                  <span className="font-mono">{p.receipt_number}</span>
                  <span className="capitalize">{(p.method || "").replace(/_/g, " ")} · {formatDate(p.payment_date)}</span>
                </div>
              </Card>
            ))}
          </div>

          {/* Desktop: table */}
          <Card className="hidden md:block border border-slate-200 bg-white overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead>Receipt</TableHead>
                <TableHead>Tenant</TableHead>
                <TableHead>Property</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">{p.receipt_number}</TableCell>
                  <TableCell className="font-medium">{p.tenant_name}</TableCell>
                  <TableCell className="text-slate-600">{p.property_name}</TableCell>
                  <TableCell className="capitalize">{(p.method || "").replace(/_/g, " ")}</TableCell>
                  <TableCell>{formatDate(p.payment_date)}</TableCell>
                  <TableCell className="text-right font-display font-bold text-emerald-700">{formatNaira(p.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
        </>
      )}
    </div>
  );
}
