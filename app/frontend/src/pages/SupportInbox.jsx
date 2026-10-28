import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Ticket, Send } from "lucide-react";
import { formatDate } from "@/lib/format";

const CATEGORIES = ["billing", "login", "technical", "tenant_issue", "landlord_issue", "payment", "other"];

function statusChip(s) {
  return s === "resolved" ? "bg-emerald-100 text-emerald-800" : s === "closed" ? "bg-slate-200 text-slate-700" : "bg-blue-100 text-blue-800";
}

export default function SupportInbox() {
  const [tickets, setTickets] = useState([]);
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [reply, setReply] = useState("");
  const [form, setForm] = useState({ subject: "", category: "other", priority: "normal", message: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data } = await api.get("/support-tickets/my");
    setTickets(data);
  }, []);
  useEffect(() => { load(); }, [load]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.subject.trim() || !form.message.trim()) return toast.error("Subject and message required");
    setSaving(true);
    try {
      await api.post("/support-tickets", form);
      toast.success("Ticket submitted. Support will get back to you shortly.");
      setOpen(false); setForm({ subject: "", category: "other", priority: "normal", message: "" });
      load();
    } catch (er) { toast.error(er.response?.data?.detail || "Failed"); }
    finally { setSaving(false); }
  };

  const openDetail = async (t) => {
    const { data } = await api.get(`/support-tickets/${t.id}`);
    setDetail(data); setReply("");
  };

  const send = async () => {
    if (!reply.trim()) return;
    try {
      await api.post(`/support-tickets/${detail.id}/messages`, { message: reply });
      const { data } = await api.get(`/support-tickets/${detail.id}`);
      setDetail(data); setReply(""); load();
    } catch { toast.error("Failed"); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="tiny-label text-purple-700">Help</div>
          <h1 className="font-display text-3xl font-bold tracking-tight mt-2">Support</h1>
          <p className="text-slate-500 mt-1">Contact FixMyCribs support for billing, login, or technical questions.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-purple-600 hover:bg-purple-700 text-white" data-testid="new-ticket-btn"><Plus className="w-4 h-4 mr-1.5" /> New ticket</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle className="font-display text-2xl">New support ticket</DialogTitle></DialogHeader>
            <form onSubmit={submit} className="space-y-4">
              <div><Label>Subject</Label><Input required value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className="mt-1.5" data-testid="ticket-subject" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Category</Label>
                  <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                    <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                    <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c} className="capitalize">{c.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Priority</Label>
                  <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                    <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="normal">Normal</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="urgent">Urgent</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>Message</Label><Textarea required rows={5} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} className="mt-1.5" data-testid="ticket-message" /></div>
              <DialogFooter><Button type="submit" disabled={saving} className="bg-purple-600 hover:bg-purple-700 text-white" data-testid="ticket-submit">{saving ? "…" : "Submit"}</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {tickets.length === 0 ? (
        <Card className="p-12 border border-dashed border-slate-300 bg-white text-center">
          <Ticket className="w-10 h-10 text-slate-300 mx-auto" />
          <div className="mt-3 font-display font-bold text-lg">No support tickets</div>
          <p className="text-slate-500 mt-1">Open a new ticket if you need help.</p>
        </Card>
      ) : (
        <div className="grid gap-2">
          {tickets.map((t) => (
            <button key={t.id} onClick={() => openDetail(t)} className="text-left" data-testid={`my-ticket-${t.id}`}>
              <Card className="p-4 border border-slate-200 bg-white hover:border-purple-400">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-display font-bold">{t.subject}</div>
                    <div className="text-xs text-slate-500 mt-0.5 capitalize">{t.category.replace(/_/g, " ")} · {formatDate(t.created_at)}</div>
                    <div className="text-sm text-slate-600 mt-2 line-clamp-1">{t.message}</div>
                  </div>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-semibold capitalize ${statusChip(t.status)}`}>{t.status}</span>
                </div>
              </Card>
            </button>
          ))}
        </div>
      )}

      <Dialog open={!!detail} onOpenChange={(v) => !v && setDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {detail && (
            <>
              <DialogHeader><DialogTitle className="font-display text-2xl">{detail.subject}</DialogTitle></DialogHeader>
              <div className="text-xs text-slate-500"><span className="capitalize">{detail.category.replace(/_/g, " ")}</span> · <span className={`px-2 py-0.5 rounded capitalize ${statusChip(detail.status)}`}>{detail.status}</span></div>
              <div className="mt-4 space-y-2">
                {detail.messages.map((m) => (
                  <div key={m.id} className={`p-3 rounded-md text-sm ${m.sender_role === "support" || m.sender_role === "admin" ? "bg-purple-50 border border-purple-200" : "bg-slate-50 border border-slate-200"}`}>
                    <div className="text-xs text-slate-500 mb-1"><span className="capitalize font-semibold">{m.sender_role.replace(/_/g, " ")}</span> · {formatDate(m.created_at)}</div>
                    <div className="whitespace-pre-wrap">{m.message}</div>
                  </div>
                ))}
              </div>
              {detail.status !== "closed" && (
                <div className="mt-4 flex gap-2">
                  <Textarea rows={2} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply to support…" className="flex-1" data-testid="my-ticket-reply" />
                  <Button onClick={send} disabled={!reply.trim()} className="bg-purple-600 hover:bg-purple-700 text-white" data-testid="my-ticket-send"><Send className="w-4 h-4" /></Button>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
