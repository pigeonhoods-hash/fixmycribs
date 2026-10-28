import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Wrench, Plus, MessageSquare } from "lucide-react";
import { formatDate } from "@/lib/format";

const CATEGORIES = ["plumbing", "electrical", "security", "cleaning", "generator", "water", "structural", "other"];
const PRIORITIES = ["low", "normal", "high", "emergency"];

function statusColor(s) {
  return s === "completed" ? "bg-emerald-100 text-emerald-800" : s === "closed" ? "bg-slate-100 text-slate-700" : s === "pending" ? "bg-orange-100 text-orange-800" : s === "in_progress" ? "bg-blue-100 text-blue-800" : s === "assigned" ? "bg-indigo-100 text-indigo-800" : "bg-slate-100 text-slate-700";
}

export default function TenantComplaints() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState({ title: "", category: "plumbing", priority: "normal", description: "" });
  const [remark, setRemark] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data } = await api.get("/tenant/complaints");
    setItems(data);
  }, []);
  useEffect(() => { load(); }, [load]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.description.trim()) return toast.error("Description required");
    setSaving(true);
    try {
      const { data: complaint } = await api.post("/tenant/complaints", form);
      for (const file of attachments) { const fd = new FormData(); fd.append("file", file); await api.post(`/tenant/complaints/${complaint.id}/attachments`, fd); }
      setAttachments([]);
      toast.success("Complaint lodged");
      setOpen(false); setForm({ title: "", category: "plumbing", priority: "normal", description: "" });
      load();
    } catch (er) { toast.error(er.response?.data?.detail || "Failed"); }
    finally { setSaving(false); }
  };

  const openDetail = async (c) => {
    const { data } = await api.get(`/tenant/complaints/${c.id}`);
    setDetail(data);
    setRemark("");
  };

  const postRemark = async () => {
    if (!remark.trim()) return;
    try {
      await api.post(`/tenant/complaints/${detail.id}/remarks`, { message: remark });
      const { data } = await api.get(`/tenant/complaints/${detail.id}`);
      setDetail(data); setRemark("");
    } catch { toast.error("Failed"); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="tiny-label text-emerald-700">Maintenance</div>
          <h1 className="font-display text-3xl font-bold tracking-tight mt-2">My complaints</h1>
          <p className="text-slate-500 mt-1">Report issues in your apartment and track the resolution.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="lodge-complaint-btn"><Plus className="w-4 h-4 mr-1.5" /> Lodge complaint</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle className="font-display text-2xl">Lodge a complaint</DialogTitle></DialogHeader>
            <form onSubmit={submit} className="space-y-4">
              <div><Label>Title</Label><Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="mt-1.5" data-testid="complaint-title" placeholder="Bathroom tap leaking" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Category</Label>
                  <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                    <SelectTrigger className="mt-1.5" data-testid="complaint-category"><SelectValue /></SelectTrigger>
                    <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Priority</Label>
                  <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                    <SelectTrigger className="mt-1.5" data-testid="complaint-priority"><SelectValue /></SelectTrigger>
                    <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>Description</Label><Textarea required rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-1.5" data-testid="complaint-desc" placeholder="Describe the issue…" /></div>
              <div><Label>Photos or videos (up to 5 files, 25 MB each)</Label><Input type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" onChange={e => { const files = Array.from(e.target.files || []); if(files.length > 5) toast.error("Maximum 5 files"); else setAttachments(files); }} /></div>
              <DialogFooter><Button type="submit" disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="complaint-submit">{saving ? "…" : "Submit"}</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {items.length === 0 ? (
        <Card className="p-12 border border-dashed border-slate-300 bg-white text-center">
          <Wrench className="w-10 h-10 text-slate-300 mx-auto" />
          <div className="mt-3 font-display font-bold text-lg">No complaints yet</div>
        </Card>
      ) : (
        <div className="grid gap-3">
          {items.map((c) => (
            <button key={c.id} onClick={() => openDetail(c)} className="text-left" data-testid={`tenant-complaint-${c.id}`}>
              <Card className="p-4 border border-slate-200 bg-white hover:border-emerald-400 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-display font-bold">{c.title}</div>
                    <div className="text-xs text-slate-500 mt-0.5 capitalize">{c.category} · {formatDate(c.created_at)}</div>
                    <div className="text-sm text-slate-600 mt-2 line-clamp-2">{c.description}</div>
                  </div>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-semibold capitalize ${statusColor(c.status)}`}>{c.status.replace(/_/g, " ")}</span>
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
              <DialogHeader><DialogTitle className="font-display text-2xl">{detail.title}</DialogTitle></DialogHeader>
              <div className="space-y-4 text-sm">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-md">{detail.description}</div>
                {(detail.attachments || []).length > 0 && <div><strong>Evidence:</strong> {(detail.attachments || []).map(a => <button key={a.id} className="ml-2 underline text-emerald-700" onClick={async () => { const r = await api.get(`/evidence/${a.id}`, { responseType: "blob" }); const url = URL.createObjectURL(r.data); window.open(url, "_blank"); setTimeout(() => URL.revokeObjectURL(url), 60000); }}>{a.name}</button>)}</div>}
                <div>
                  <div className="tiny-label mb-2">Timeline</div>
                  <div className="space-y-2">
                    {detail.updates.map((u) => (
                      <div key={u.id} className="text-xs border-l-2 border-emerald-300 pl-3 py-1">
                        <div className="text-slate-500"><span className="font-semibold capitalize text-slate-700">{u.role.replace(/_/g, " ")}</span> · {formatDate(u.created_at)} · <span className="capitalize">{u.status_to}</span></div>
                        <div className="text-slate-800 mt-0.5 whitespace-pre-wrap">{u.message}</div>
                      </div>
                    ))}
                  </div>
                </div>
                {detail.status !== "closed" && (
                  <div className="flex gap-2">
                    <Textarea value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="Add a note or update…" className="flex-1" data-testid="tenant-remark-input" />
                    <Button onClick={postRemark} className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="tenant-remark-post"><MessageSquare className="w-4 h-4 mr-1" /> Post</Button>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
