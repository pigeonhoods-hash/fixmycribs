import { useCallback, useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Wallet, Bell, CheckCircle2, Copy, Trash2, RotateCcw, Check } from "lucide-react";
import { formatNaira, formatDate } from "@/lib/format";
import StatusBadge from "@/components/StatusBadge";
import { toast } from "sonner";
import { useConfirm } from "@/components/ConfirmDialog";

const TONES = [
  { v: "polite", label: "Polite" },
  { v: "friendly", label: "Friendly" },
  { v: "professional", label: "Professional" },
  { v: "firm", label: "Firm" },
  { v: "urgent", label: "Urgent" },
  { v: "final", label: "Final notice" },
];

export default function TenantDetail() {
  const { id } = useParams();
  const [tenant, setTenant] = useState(null);
  const [payOpen, setPayOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [payForm, setPayForm] = useState({ amount: "", method: "bank_transfer", reference: "", notes: "" });
  const [tone, setTone] = useState("polite");
  const [aiMessage, setAiMessage] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirm, ConfirmDialog] = useConfirm();

  const load = useCallback(() => api.get(`/tenants/${id}`).then((r) => setTenant(r.data)).catch(() => {}), [id]);
  useEffect(() => { load(); }, [load]);

  const currentRent = tenant?.rent_records?.[0];
  const payments = tenant?.payments || [];
  const currentPayments = currentRent ? payments.filter((p) => p.rent_record_id === currentRent.id) : [];

  const markFullyPaid = async () => {
    if (!currentRent) return;
    const ok = await confirm({
      title: "Mark as fully paid?",
      description: `This will record a payment for the remaining ₦${(currentRent.balance || 0).toLocaleString()} and set the record to PAID.`,
      confirmText: "Yes, mark as paid",
    });
    if (!ok) return;
    try {
      await api.post(`/rent-records/${currentRent.id}/mark-fully-paid`);
      toast.success("Marked as fully paid");
      load();
    } catch (er) { toast.error(er.response?.data?.detail || "Failed"); }
  };

  const markUnpaid = async () => {
    if (!currentRent) return;
    const ok = await confirm({
      title: "Reset to unpaid?",
      description: "Every recorded payment for this rent record will be deleted and the balance reset to the full amount. This cannot be undone.",
      confirmText: "Reset all payments",
      destructive: true,
    });
    if (!ok) return;
    try {
      const { data } = await api.post(`/rent-records/${currentRent.id}/mark-unpaid`);
      toast.success(`Reset — ${data.deleted_payments} payment${data.deleted_payments === 1 ? "" : "s"} removed`);
      load();
    } catch (er) { toast.error(er.response?.data?.detail || "Failed"); }
  };

  const deletePayment = async (p) => {
    const ok = await confirm({
      title: "Delete this payment?",
      description: `₦${p.amount.toLocaleString()} on ${p.payment_date} via ${p.method.replace(/_/g, " ")}. The rent balance will be recomputed.`,
      confirmText: "Delete payment",
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/payments/${p.id}`);
      toast.success("Payment deleted");
      load();
    } catch (er) { toast.error(er.response?.data?.detail || "Failed"); }
  };

  const recordPayment = async (e) => {
    e.preventDefault();
    if (!currentRent) return;
    setSaving(true);
    try {
      await api.post("/payments", {
        tenant_id: tenant.id,
        rent_record_id: currentRent.id,
        amount: parseFloat(payForm.amount),
        method: payForm.method,
        reference: payForm.reference,
        notes: payForm.notes,
      });
      toast.success("Payment recorded");
      setPayOpen(false);
      setPayForm({ amount: "", method: "bank_transfer", reference: "", notes: "" });
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed");
    } finally { setSaving(false); }
  };

  const generateAI = async () => {
    setAiLoading(true);
    setAiMessage("");
    try {
      const { data } = await api.post("/reminders/generate-ai", {
        tenant_id: tenant.id,
        rent_record_id: currentRent?.id,
        tone,
      });
      setAiMessage(data.message);
    } catch (err) {
      toast.error("AI generation failed");
    } finally { setAiLoading(false); }
  };

  const logReminder = async (channel) => {
    if (!aiMessage) return;
    try {
      await api.post("/reminders", {
        tenant_id: tenant.id,
        rent_record_id: currentRent?.id,
        message: aiMessage,
        channel,
        tone,
        ai_generated: true,
      });
      toast.success("Reminder logged");
      setAiOpen(false);
      setAiMessage("");
    } catch { toast.error("Failed to log"); }
  };

  const copyMsg = () => {
    navigator.clipboard.writeText(aiMessage);
    toast.success("Copied to clipboard");
  };

  if (!tenant) return <div className="text-slate-500">Loading…</div>;

  return (
    <div className="space-y-6">
      <Link to="/dashboard/tenants" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
        <ArrowLeft className="w-4 h-4" /> Back to tenants
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="tiny-label text-emerald-700">Tenant profile</div>
          <h1 className="font-display text-3xl font-bold tracking-tight mt-2">{tenant.full_name}</h1>
          <p className="text-slate-500 mt-1">{tenant.property?.name} • {tenant.phone || tenant.email || "-"}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={() => setAiOpen(true)} variant="outline" data-testid="tenant-ai-reminder" className="border-orange-300 text-orange-700 hover:bg-orange-50">
            <Bell className="w-4 h-4 mr-1.5" /> AI Reminder
          </Button>
          <Button onClick={markUnpaid} variant="outline" disabled={!currentRent || currentPayments.length === 0} data-testid="tenant-mark-unpaid" className="border-red-300 text-red-700 hover:bg-red-50">
            <RotateCcw className="w-4 h-4 mr-1.5" /> Mark unpaid
          </Button>
          <Button onClick={() => setPayOpen(true)} variant="outline" data-testid="tenant-record-partial" disabled={!currentRent || (currentRent.balance || 0) <= 0} className="border-amber-300 text-amber-700 hover:bg-amber-50">
            <Wallet className="w-4 h-4 mr-1.5" /> Add partial payment
          </Button>
          <Button onClick={markFullyPaid} data-testid="tenant-mark-paid" className="bg-emerald-600 hover:bg-emerald-700 text-white" disabled={!currentRent || (currentRent.balance || 0) <= 0}>
            <Check className="w-4 h-4 mr-1.5" /> Mark fully paid
          </Button>
        </div>
      </div>

      <div className="grid md:grid-cols-4 gap-4">
        <Card className="p-6 border border-slate-200 bg-white">
          <div className="tiny-label">Rent amount</div>
          <div className="mt-2 font-display text-2xl font-bold">{formatNaira(tenant.rent_amount)}</div>
          <div className="text-xs text-slate-500 mt-1">{tenant.rent_frequency}</div>
        </Card>
        <Card className="p-6 border border-slate-200 bg-white" data-testid="tenant-paid-card">
          <div className="tiny-label">Paid so far</div>
          <div className="mt-2 font-display text-2xl font-bold text-emerald-700">{formatNaira(currentRent?.amount_paid || 0)}</div>
          <div className="text-xs text-slate-500 mt-1">{currentPayments.length} payment{currentPayments.length === 1 ? "" : "s"}</div>
        </Card>
        <Card className="p-6 border border-slate-200 bg-white" data-testid="tenant-balance-card">
          <div className="tiny-label">Outstanding</div>
          <div className={`mt-2 font-display text-2xl font-bold ${(currentRent?.balance || 0) > 0 ? "text-red-600" : "text-emerald-700"}`}>{formatNaira(currentRent?.balance || 0)}</div>
          <div className="text-xs text-slate-500 mt-1">Due {formatDate(currentRent?.due_date)}</div>
        </Card>
        <Card className="p-6 border border-slate-200 bg-white">
          <div className="tiny-label">Status</div>
          <div className="mt-3"><StatusBadge status={currentRent?.status || "upcoming"} /></div>
        </Card>
      </div>

      <Card className="p-6 border border-slate-200 bg-white">
        <div className="flex items-center gap-2 mb-4">
          <CheckCircle2 className="w-4 h-4 text-emerald-700" />
          <div className="tiny-label">Payment history</div>
        </div>
        {tenant.payments.length === 0 ? (
          <div className="text-sm text-slate-500 py-8 text-center border border-dashed border-slate-200 rounded-md">No payments yet.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {tenant.payments.map((p) => (
              <div key={p.id} className="py-3 flex items-center justify-between gap-3" data-testid={`payment-row-${p.id}`}>
                <div className="min-w-0">
                  <div className="font-medium">{formatDate(p.payment_date)}</div>
                  <div className="text-xs text-slate-500 truncate">{p.method.replace(/_/g, " ")} • {p.receipt_number}{p.reference ? ` • ${p.reference}` : ""}</div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="font-display font-bold text-emerald-700">{formatNaira(p.amount)}</div>
                  <button onClick={() => deletePayment(p)} data-testid={`delete-payment-${p.id}`} title="Delete payment (mistake?)" className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Payment dialog */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-display text-2xl">Record payment</DialogTitle></DialogHeader>
          <form onSubmit={recordPayment} className="space-y-4">
            <div>
              <Label>Amount (₦)</Label>
              <Input type="number" step="1" required data-testid="payment-amount" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} className="mt-1.5" placeholder={String(currentRent?.balance || 0)} />
              <div className="text-xs text-slate-500 mt-1">Outstanding: {formatNaira(currentRent?.balance || 0)}</div>
              {payForm.amount && parseFloat(payForm.amount) > 0 && currentRent && (
                <div className="mt-2 text-xs rounded-md border border-slate-200 bg-slate-50 p-2.5 space-y-0.5" data-testid="payment-preview">
                  <div><span className="text-slate-500">Already paid:</span> <span className="font-medium">{formatNaira(currentRent.amount_paid || 0)}</span></div>
                  <div><span className="text-slate-500">Adding now:</span> <span className="font-medium text-emerald-700">+ {formatNaira(parseFloat(payForm.amount) || 0)}</span></div>
                  <div className="pt-1 border-t border-slate-200"><span className="text-slate-500">New balance:</span> <span className={`font-bold ${Math.max(0, currentRent.amount_due - ((currentRent.amount_paid || 0) + (parseFloat(payForm.amount) || 0))) === 0 ? "text-emerald-700" : "text-red-600"}`}>{formatNaira(Math.max(0, currentRent.amount_due - ((currentRent.amount_paid || 0) + (parseFloat(payForm.amount) || 0))))}</span></div>
                </div>
              )}
            </div>
            <div>
              <Label>Payment method</Label>
              <Select value={payForm.method} onValueChange={(v) => setPayForm({ ...payForm, method: v })}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="pos">POS</SelectItem>
                  <SelectItem value="mobile_transfer">Mobile transfer</SelectItem>
                  <SelectItem value="ussd">USSD</SelectItem>
                  <SelectItem value="online">Online payment</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Reference (optional)</Label>
              <Input value={payForm.reference} onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })} className="mt-1.5" placeholder="Transaction ref" />
            </div>
            <DialogFooter>
              <Button type="submit" data-testid="payment-submit" disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                {saving ? "Saving…" : "Record payment"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* AI Reminder dialog */}
      <Dialog open={aiOpen} onOpenChange={setAiOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="font-display text-2xl">AI Rent Reminder</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Tone</Label>
              <Select value={tone} onValueChange={setTone}>
                <SelectTrigger data-testid="ai-tone" className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TONES.map((t) => <SelectItem key={t.v} value={t.v}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={generateAI} disabled={aiLoading} data-testid="ai-generate" className="w-full bg-orange-600 hover:bg-orange-700 text-white">
              {aiLoading ? "Generating…" : "Generate with AI"}
            </Button>
            {aiMessage && (
              <div>
                <Label>Generated message</Label>
                <Textarea value={aiMessage} onChange={(e) => setAiMessage(e.target.value)} rows={7} className="mt-1.5" data-testid="ai-message" />
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="outline" onClick={copyMsg}><Copy className="w-4 h-4 mr-1.5" /> Copy</Button>
                  <Button onClick={() => logReminder("whatsapp")} className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="log-whatsapp">Log as WhatsApp sent</Button>
                  <Button onClick={() => logReminder("sms")} variant="outline">Log as SMS</Button>
                  <Button onClick={() => logReminder("email")} variant="outline">Log as email</Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <ConfirmDialog />
    </div>
  );
}
