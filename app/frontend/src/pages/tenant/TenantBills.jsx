import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Fuel, Zap, FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatNaira, formatDate } from "@/lib/format";

function billIcon(type) {
  if (type === "diesel_deposit") return <Fuel className="w-4 h-4 text-orange-600" />;
  if (type === "electricity_postpaid") return <Zap className="w-4 h-4 text-emerald-700" />;
  return <FileText className="w-4 h-4 text-slate-600" />;
}

export default function TenantBills() {
  const [bills, setBills] = useState([]);
  const [reportId, setReportId] = useState(null);
  const [amount, setAmount] = useState("");
  const [file, setFile] = useState(null);
  const [reports, setReports] = useState([]);
  const [sending, setSending] = useState(false);
  const submitProof = async (e) => {
    e.preventDefault(); if (!file) return toast.error("Attach payment evidence");
    const fd = new FormData(); fd.append("kind", "bill"); fd.append("record_id", reportId); fd.append("amount", amount); fd.append("file", file);
    setSending(true);
    try { await api.post("/tenant/payments/report", fd); toast.success("Payment reported for landlord review"); setReportId(null); setFile(null); setAmount(""); const r = await api.get("/tenant/payments/reports"); setReports(r.data); }
    catch (err) { toast.error(err.response?.data?.detail || "Could not submit evidence"); }
    finally { setSending(false); }
  };
  useEffect(() => { api.get("/tenant/bills").then((r) => setBills(r.data)); api.get("/tenant/payments/reports").then((r) => setReports(r.data)).catch(() => {}); }, []);

  return (
    <div className="space-y-6">
      <div>
        <div className="tiny-label text-emerald-700">Your bills</div>
        <h1 className="font-display text-3xl font-bold tracking-tight mt-2">Bills</h1>
        <p className="text-slate-500 mt-1">Utility bills and deposits set by your landlord.</p>
      </div>

      {reportId && <Card className="p-4 space-y-3"><h3 className="font-semibold">Report bill payment</h3><p className="text-xs text-slate-500">Submitting proof does not mark a bill as paid until reviewed and recorded by your landlord.</p><form onSubmit={submitProof} className="space-y-3"><Input required type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount paid"/><Input required type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e => setFile(e.target.files?.[0] || null)}/><div className="flex gap-2"><Button disabled={sending} type="submit">{sending ? "Submitting…" : "Submit proof"}</Button><Button variant="outline" type="button" onClick={() => setReportId(null)}>Cancel</Button></div></form></Card>}
      {bills.length === 0 ? (
        <Card className="p-12 border border-dashed border-slate-300 bg-white text-center">
          <FileText className="w-10 h-10 text-slate-300 mx-auto" />
          <div className="mt-3 font-display font-bold text-lg">No bills yet</div>
          <p className="text-slate-500 mt-1">Your landlord hasn't issued any bills.</p>
        </Card>
      ) : (
        <div className="grid gap-3">
          {bills.map((b) => {
            const balance = Math.max(0, b.amount_due - b.amount_paid);
            const paid = b.status === "paid";
            return (
              <Card key={b.id} className="p-5 border border-slate-200 bg-white" data-testid={`tenant-bill-${b.id}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="mt-1">{billIcon(b.bill_type)}</div>
                    <div className="min-w-0">
                      <div className="font-display font-bold text-lg">{b.title}</div>
                      <div className="text-xs text-slate-500 capitalize mt-0.5">{b.bill_type.replace(/_/g, " ")} · Due {formatDate(b.due_date)}</div>
                      {b.bill_type === "diesel_deposit" && <div className="text-sm text-orange-700 mt-2">Diesel: {formatNaira(b.diesel_amount ?? b.amount_due)}</div>}
                      {b.bill_type === "electricity_postpaid" && (
                        <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                          <div><span className="text-slate-500">Previous reading:</span> <span className="font-medium">{b.previous_reading} kWh</span></div>
                          <div><span className="text-slate-500">Current reading:</span> <span className="font-medium">{b.current_reading} kWh</span></div>
                          <div><span className="text-slate-500">Units consumed:</span> <span className="font-medium">{b.units_consumed} kWh</span></div>
                          <div><span className="text-slate-500">Rate:</span> <span className="font-medium">{formatNaira(b.rate)}/kWh</span></div>
                          <div><span className="text-slate-500">Electricity:</span> <span className="font-medium">{formatNaira(b.electricity_amount ?? b.units_consumed * b.rate)}</span></div>
                          {b.diesel_amount > 0 && <div><span className="text-slate-500">Diesel:</span> <span className="font-medium">{formatNaira(b.diesel_amount)}</span></div>}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-display text-2xl font-bold">{formatNaira(b.amount_due)}</div>
                    <div className={`text-xs font-semibold capitalize mt-1 ${paid ? "text-emerald-700" : b.status === "overdue" ? "text-red-600" : "text-orange-600"}`}>{b.status.replace(/_/g, " ")}</div>
                    {!paid && <div className="text-xs text-slate-500 mt-1">Balance: {formatNaira(balance)}</div>}
                    {b.amount_paid > 0 && <div className="text-xs text-emerald-700 mt-0.5">Paid: {formatNaira(b.amount_paid)}</div>}
                    <Button size="sm" variant="outline" className="mt-2" onClick={() => { setReportId(b.id); setAmount(String(balance || b.amount_due)); }}>I've paid — upload proof</Button>
                    {reports.filter(r => r.kind === "bill" && r.record_id === b.id).map(r => <div key={r.id} className="text-xs mt-1">Payment report: {r.status}</div>)}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
