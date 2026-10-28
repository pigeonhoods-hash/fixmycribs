import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Ticket, Send, Shield } from "lucide-react";
import { formatDate } from "@/lib/format";

function statusChip(s) {
  return s === "resolved" ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
    : s === "closed" ? "bg-slate-600/40 text-slate-300 border-slate-500/40"
    : s === "pending" ? "bg-orange-500/20 text-orange-300 border-orange-500/40"
    : "bg-blue-500/20 text-blue-300 border-blue-500/40";
}

function roleChip(r) {
  return r === "owner" ? "bg-emerald-500/15 text-emerald-300"
    : r === "tenant" ? "bg-purple-500/15 text-purple-300"
    : r === "facility_manager" ? "bg-blue-500/15 text-blue-300"
    : r === "support" ? "bg-orange-500/15 text-orange-300"
    : "bg-slate-500/15 text-slate-300";
}

export default function AdminSupportTickets() {
  const [tickets, setTickets] = useState([]);
  const [selected, setSelected] = useState(null);
  const [reply, setReply] = useState("");
  const [filter, setFilter] = useState("all");

  const load = useCallback(async () => {
    const url = filter && filter !== "all" ? `/support/tickets?status=${filter}` : "/support/tickets";
    const { data } = await api.get(url);
    setTickets(data);
  }, [filter]);
  useEffect(() => { load(); }, [load]);

  const openT = async (t) => {
    const { data } = await api.get(`/support-tickets/${t.id}`);
    setSelected({ ...data, created_by_name: t.created_by_name, created_by_email: t.created_by_email, created_by_role: t.created_by_role, assigned_to_name: t.assigned_to_name });
    setReply("");
  };

  const send = async () => {
    if (!reply.trim()) return;
    try {
      await api.post(`/support-tickets/${selected.id}/messages`, { message: reply, internal: false });
      const { data } = await api.get(`/support-tickets/${selected.id}`);
      setSelected({ ...selected, ...data });
      setReply("");
      load();
    } catch { toast.error("Failed to send reply"); }
  };

  const patchStatus = async (status) => {
    try {
      await api.patch(`/support/tickets/${selected.id}`, { status });
      const { data } = await api.get(`/support-tickets/${selected.id}`);
      setSelected({ ...selected, ...data });
      load();
      toast.success(`Marked ${status}`);
    } catch { toast.error("Failed"); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="tiny-label text-orange-400">All support tickets</div>
          <h1 className="font-display text-3xl font-bold tracking-tight mt-2 flex items-center gap-2 text-white">
            <Shield className="w-6 h-6 text-orange-400" /> Support inbox <span className="text-sm font-normal text-slate-400">(admin view)</span>
          </h1>
          <p className="text-slate-400 text-sm mt-1">Every ticket raised by owners, tenants, and facility managers.</p>
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-48 bg-slate-800 border-slate-700 text-white" data-testid="admin-support-filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {tickets.length === 0 ? (
        <Card className="p-12 border border-dashed border-slate-700 bg-slate-800/40 text-center">
          <Ticket className="w-10 h-10 text-slate-500 mx-auto" />
          <div className="mt-3 font-display font-bold text-lg text-white">No tickets yet</div>
          <div className="text-slate-400 text-sm mt-1">When users open a support ticket, it shows up here.</div>
        </Card>
      ) : (
        <div className="grid gap-2">
          {tickets.map((t) => (
            <button key={t.id} onClick={() => openT(t)} className="text-left" data-testid={`admin-support-ticket-${t.id}`}>
              <Card className="p-4 bg-slate-800/60 border border-slate-700 hover:border-orange-500/50 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-display font-bold text-white truncate">{t.subject}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold uppercase ${statusChip(t.status)}`}>{t.status}</span>
                      {t.priority && t.priority !== "normal" && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/40 uppercase font-semibold">{t.priority}</span>
                      )}
                    </div>
                    <div className="mt-1.5 text-xs text-slate-400 flex items-center gap-2 flex-wrap">
                      <span>Opened by</span>
                      <span className="text-white font-medium">{t.created_by_name || "Unknown"}</span>
                      <span className="text-slate-500">·</span>
                      <span>{t.created_by_email || ""}</span>
                      {t.created_by_role && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${roleChip(t.created_by_role)}`}>{t.created_by_role.replace("_", " ")}</span>
                      )}
                      <span className="text-slate-500">·</span>
                      <span>{formatDate(t.created_at)}</span>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      Assigned to: <span className="text-slate-300">{t.assigned_to_name || "Unassigned"}</span>
                    </div>
                  </div>
                </div>
              </Card>
            </button>
          ))}
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl bg-slate-900 border border-slate-700 text-white">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="text-white">{selected.subject}</DialogTitle>
              </DialogHeader>
              <div className="text-xs text-slate-400 flex flex-wrap items-center gap-2">
                <span>Opened by</span>
                <span className="text-white font-semibold">{selected.created_by_name}</span>
                <span>({selected.created_by_email})</span>
                {selected.created_by_role && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${roleChip(selected.created_by_role)}`}>{selected.created_by_role.replace("_", " ")}</span>
                )}
                <span className="text-slate-500">·</span>
                <span className={`px-2 py-0.5 rounded-full border font-semibold uppercase ${statusChip(selected.status)}`}>{selected.status}</span>
              </div>
              <div className="max-h-72 overflow-y-auto space-y-2 border border-slate-700 rounded p-3 bg-slate-950">
                {(selected.messages || []).map((m) => (
                  <div key={m.id} className="text-sm">
                    <div className="text-[11px] text-slate-500">{formatDate(m.created_at)}{m.internal ? " · internal note" : ""}</div>
                    <div className={`${m.internal ? "text-orange-300" : "text-white"}`}>{m.message}</div>
                  </div>
                ))}
              </div>
              <Textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Type your reply..." className="bg-slate-950 border-slate-700 text-white" data-testid="admin-support-reply" />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex gap-2">
                  <Button onClick={() => patchStatus("pending")} variant="outline" size="sm" className="border-slate-700 text-slate-200">Mark pending</Button>
                  <Button onClick={() => patchStatus("resolved")} variant="outline" size="sm" className="border-emerald-600 text-emerald-300 hover:bg-emerald-600/10">Resolve</Button>
                  <Button onClick={() => patchStatus("closed")} variant="outline" size="sm" className="border-slate-600 text-slate-300">Close</Button>
                </div>
                <Button onClick={send} className="bg-orange-600 hover:bg-orange-700 text-white" data-testid="admin-support-send"><Send className="w-4 h-4 mr-1.5" /> Send</Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
