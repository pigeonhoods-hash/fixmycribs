import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Wrench, Clock, CheckCircle2, AlertOctagon } from "lucide-react";
import { formatDate } from "@/lib/format";

function priorityColor(p) {
  return p === "emergency" ? "bg-red-100 text-red-800" : p === "high" ? "bg-orange-100 text-orange-800" : p === "low" ? "bg-slate-100 text-slate-700" : "bg-blue-100 text-blue-800";
}
function statusChip(s) {
  const map = { completed: "bg-emerald-100 text-emerald-800", closed: "bg-slate-200 text-slate-700", pending: "bg-orange-100 text-orange-800", in_progress: "bg-blue-100 text-blue-800", assigned: "bg-indigo-100 text-indigo-800", cannot_complete: "bg-red-100 text-red-800" };
  return map[s] || "bg-slate-100 text-slate-700";
}

export default function FacilityManagerDashboard() {
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [status, setStatus] = useState("in_progress");
  const [remark, setRemark] = useState("");
  const [pendingReason, setPendingReason] = useState("");
  const [completionNote, setCompletionNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data } = await api.get("/facility-manager/complaints");
    setItems(data);
  }, []);
  useEffect(() => { load(); }, [load]);

  const openDetail = async (c) => {
    const { data } = await api.get(`/facility-manager/complaints/${c.id}`);
    setSelected(data);
    setStatus(data.status === "assigned" ? "in_progress" : data.status);
    setRemark(""); setPendingReason(""); setCompletionNote("");
  };

  const updateStatus = async () => {
    if (status === "pending" && !pendingReason.trim()) return toast.error("Reason required when marking pending");
    if (status === "completed" && !completionNote.trim()) return toast.error("Completion note required");
    setSaving(true);
    try {
      await api.patch(`/facility-manager/complaints/${selected.id}/status`, {
        status, remark, pending_reason: pendingReason, completion_note: completionNote,
      });
      toast.success("Status updated");
      const { data } = await api.get(`/facility-manager/complaints/${selected.id}`);
      setSelected(data); load();
    } catch (er) { toast.error(er.response?.data?.detail || "Failed"); }
    finally { setSaving(false); }
  };

  const openCount = items.filter((c) => ["assigned", "in_progress", "pending"].includes(c.status)).length;
  const doneCount = items.filter((c) => c.status === "completed").length;

  return (
    <div className="space-y-6">
      <div>
        <div className="tiny-label text-blue-700">Field ops</div>
        <h1 className="font-display text-3xl font-bold tracking-tight mt-2">Assigned complaints</h1>
        <p className="text-slate-500 mt-1">Complaints assigned to you by your landlord.</p>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <Card className="p-5 border border-slate-200 bg-white"><div className="flex items-center gap-2 tiny-label text-orange-700"><Clock className="w-4 h-4" />Open</div><div className="font-display text-2xl font-bold mt-2">{openCount}</div></Card>
        <Card className="p-5 border border-slate-200 bg-white"><div className="flex items-center gap-2 tiny-label text-emerald-700"><CheckCircle2 className="w-4 h-4" />Completed</div><div className="font-display text-2xl font-bold mt-2">{doneCount}</div></Card>
        <Card className="p-5 border border-slate-200 bg-white"><div className="flex items-center gap-2 tiny-label text-slate-700"><Wrench className="w-4 h-4" />Total</div><div className="font-display text-2xl font-bold mt-2">{items.length}</div></Card>
      </div>

      {items.length === 0 ? (
        <Card className="p-12 border border-dashed border-slate-300 bg-white text-center">
          <Wrench className="w-10 h-10 text-slate-300 mx-auto" />
          <div className="mt-3 font-display font-bold text-lg">No assigned complaints</div>
        </Card>
      ) : (
        <div className="grid gap-3">
          {items.map((c) => (
            <button key={c.id} onClick={() => openDetail(c)} className="text-left" data-testid={`fm-complaint-${c.id}`}>
              <Card className="p-4 border border-slate-200 bg-white hover:border-blue-400 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="font-display font-bold">{c.title}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{c.tenant_name} · {c.apartment_number} · {formatDate(c.created_at)}</div>
                    <div className="text-sm text-slate-600 mt-2 line-clamp-2">{c.description}</div>
                  </div>
                  <div className="flex flex-col gap-1 items-end shrink-0">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-semibold capitalize ${statusChip(c.status)}`}>{c.status.replace(/_/g, " ")}</span>
                    <span className={`text-xs px-2 py-0.5 rounded capitalize ${priorityColor(c.priority)}`}>{c.priority}</span>
                  </div>
                </div>
              </Card>
            </button>
          ))}
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader><DialogTitle className="font-display text-2xl">{selected.title}</DialogTitle></DialogHeader>
              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-slate-500">Tenant:</span> <span className="font-semibold">{selected.tenant_name}</span></div>
                  <div><span className="text-slate-500">Apartment:</span> <span className="font-semibold">{selected.apartment_number}</span></div>
                  {selected.tenant_phone && <div className="col-span-2"><span className="text-slate-500">Phone:</span> <span className="font-semibold">{selected.tenant_phone}</span></div>}
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-md">{selected.description}</div>

                <div className="p-3 border border-slate-200 rounded-md space-y-3">
                  <div className="tiny-label">Update status</div>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger data-testid="fm-status-select"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="in_progress">In progress</SelectItem>
                      <SelectItem value="pending">Pending (blocked / need info)</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="cannot_complete">Cannot complete</SelectItem>
                    </SelectContent>
                  </Select>
                  {status === "pending" && (
                    <div><Label className="text-xs">Reason for pending *</Label><Textarea value={pendingReason} onChange={(e) => setPendingReason(e.target.value)} className="mt-1" data-testid="fm-pending-reason" /></div>
                  )}
                  {status === "completed" && (
                    <div><Label className="text-xs">Completion note *</Label><Textarea value={completionNote} onChange={(e) => setCompletionNote(e.target.value)} className="mt-1" data-testid="fm-completion-note" placeholder="What was done" /></div>
                  )}
                  <div><Label className="text-xs">Remark (optional)</Label><Textarea value={remark} onChange={(e) => setRemark(e.target.value)} className="mt-1" data-testid="fm-remark" /></div>
                  <Button onClick={updateStatus} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white w-full" data-testid="fm-update-btn">{saving ? "Updating…" : "Update status"}</Button>
                </div>

                <div>
                  <div className="tiny-label mb-2">Timeline</div>
                  <div className="space-y-2">
                    {selected.updates.map((u) => (
                      <div key={u.id} className="text-xs border-l-2 border-blue-300 pl-3 py-1">
                        <div className="text-slate-500"><span className="font-semibold capitalize text-slate-700">{u.role.replace(/_/g, " ")}</span> · {formatDate(u.created_at)} · <span className="capitalize">{u.status_to}</span></div>
                        <div className="text-slate-800 mt-0.5 whitespace-pre-wrap">{u.message}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
