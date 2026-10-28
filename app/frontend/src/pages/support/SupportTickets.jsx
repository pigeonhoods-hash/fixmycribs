import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Ticket, Send } from "lucide-react";
import { formatDate } from "@/lib/format";

function statusChip(s) {
  return s === "resolved" ? "bg-emerald-100 text-emerald-800" : s === "closed" ? "bg-slate-200 text-slate-700" : s === "pending" ? "bg-orange-100 text-orange-800" : "bg-blue-100 text-blue-800";
}

export default function SupportTickets() {
  const [tickets, setTickets] = useState([]);
  const [selected, setSelected] = useState(null);
  const [reply, setReply] = useState("");
  const [internal, setInternal] = useState(false);
  const [filter, setFilter] = useState("all");

  const load = useCallback(async () => {
    const url = filter && filter !== "all" ? `/support/tickets?status=${filter}` : "/support/tickets";
    const { data } = await api.get(url);
    setTickets(data);
  }, [filter]);
  useEffect(() => { load(); }, [load]);

  const openT = async (t) => {
    const { data } = await api.get(`/support-tickets/${t.id}`);
    setSelected(data); setReply(""); setInternal(false);
  };

  const send = async () => {
    if (!reply.trim()) return;
    try {
      await api.post(`/support-tickets/${selected.id}/messages`, { message: reply, internal });
      const { data } = await api.get(`/support-tickets/${selected.id}`);
      setSelected(data); setReply("");
    } catch { toast.error("Failed"); }
  };

  const patchStatus = async (status) => {
    try {
      await api.patch(`/support/tickets/${selected.id}`, { status });
      const { data } = await api.get(`/support-tickets/${selected.id}`);
      setSelected(data); load();
      toast.success(`Marked ${status}`);
    } catch { toast.error("Failed"); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="tiny-label text-purple-700">Inbox</div>
          <h1 className="font-display text-3xl font-bold tracking-tight mt-2">Support tickets</h1>
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-48" data-testid="support-filter"><SelectValue placeholder="All statuses" /></SelectTrigger>
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
        <Card className="p-12 border border-dashed border-slate-300 bg-white text-center">
          <Ticket className="w-10 h-10 text-slate-300 mx-auto" />
          <div className="mt-3 font-display font-bold text-lg">No tickets</div>
        </Card>
      ) : (
        <div className="grid gap-2">
          {tickets.map((t) => (
            <button key={t.id} onClick={() => openT(t)} className="text-left" data-testid={`support-ticket-${t.id}`}>
              <Card className="p-4 border border-slate-200 bg-white hover:border-purple-400">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-display font-bold">{t.subject}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{t.created_by_name} ({t.created_by_role}) · {formatDate(t.created_at)}</div>
                    <div className="text-sm text-slate-600 mt-2 line-clamp-1">{t.message}</div>
                  </div>
                  <div className="flex flex-col gap-1 items-end shrink-0">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-semibold capitalize ${statusChip(t.status)}`}>{t.status}</span>
                    <span className="text-xs text-slate-500 capitalize">{t.priority}</span>
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
              <DialogHeader><DialogTitle className="font-display text-2xl">{selected.subject}</DialogTitle></DialogHeader>
              <div className="text-xs text-slate-500">{selected.created_by_name} ({selected.created_by_role}) · <span className="capitalize">{selected.category}</span> · <span className={`px-2 py-0.5 rounded ${statusChip(selected.status)} capitalize`}>{selected.status}</span></div>
              <div className="space-y-3 mt-4">
                {selected.messages.map((m) => (
                  <div key={m.id} className={`p-3 rounded-md text-sm ${m.internal ? "bg-yellow-50 border border-yellow-200" : m.sender_role === "support" || m.sender_role === "admin" ? "bg-purple-50 border border-purple-200" : "bg-slate-50 border border-slate-200"}`}>
                    <div className="text-xs text-slate-500 mb-1"><span className="capitalize font-semibold">{m.sender_role}</span> · {formatDate(m.created_at)}{m.internal && <span className="ml-2 text-yellow-800 font-semibold">Internal note</span>}</div>
                    <div className="whitespace-pre-wrap">{m.message}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4 space-y-2">
                <Textarea rows={3} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply…" data-testid="support-reply-input" />
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs text-slate-600">
                    <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} data-testid="support-internal-checkbox" /> Internal note
                  </label>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => patchStatus("resolved")} data-testid="support-resolve">Mark resolved</Button>
                    <Button onClick={send} disabled={!reply.trim()} className="bg-purple-600 hover:bg-purple-700 text-white" data-testid="support-send"><Send className="w-4 h-4 mr-1" /> Send</Button>
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
