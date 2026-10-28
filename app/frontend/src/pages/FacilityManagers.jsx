import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { useConfirm } from "@/components/ConfirmDialog";
import { Plus, Ban, Mail, Copy, HardHat } from "lucide-react";

export default function FacilityManagers() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ full_name: "", email: "", phone: "" });
  const [lastInvite, setLastInvite] = useState(null);
  const [confirm, ConfirmDialog] = useConfirm();

  const load = useCallback(async () => {
    const { data } = await api.get("/facility-managers");
    setItems(data);
  }, []);
  useEffect(() => { load(); }, [load]);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.post("/facility-managers", form);
      toast.success("Facility manager invited");
      if (data.invite_link) setLastInvite({ name: form.full_name, link: data.invite_link });
      setOpen(false); setForm({ full_name: "", email: "", phone: "" });
      load();
    } catch (er) { toast.error(er.response?.data?.detail || "Failed"); }
    finally { setSaving(false); }
  };

  const resend = async (fm) => {
    try {
      const { data } = await api.post(`/facility-managers/${fm.id}/resend-invite`);
      toast.success("Invite resent");
      if (data.invite_link) setLastInvite({ name: fm.full_name, link: data.invite_link });
    } catch (er) { toast.error(er.response?.data?.detail || "Failed"); }
  };

  const revoke = async (fm) => {
    const ok = await confirm({
      title: `Revoke access for ${fm.full_name}?`,
      description: "They will lose access to the facility-manager portal. You can re-invite later if needed.",
      confirmText: "Revoke access",
      destructive: true,
    });
    if (!ok) return;
    try { await api.delete(`/facility-managers/${fm.id}`); toast.success("Access revoked"); load(); }
    catch (er) { toast.error(er.response?.data?.detail || "Failed"); }
  };

  const copyLink = (link) => { navigator.clipboard.writeText(link); toast.success("Copied"); };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="tiny-label text-emerald-700">Team</div>
          <h1 className="font-display text-3xl font-bold tracking-tight mt-2">Facility Managers</h1>
          <p className="text-slate-500 mt-1">Invite technicians to handle assigned maintenance requests.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="add-fm-btn"><Plus className="w-4 h-4 mr-1.5" /> Invite manager</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle className="font-display text-2xl">Invite facility manager</DialogTitle></DialogHeader>
            <form onSubmit={submit} className="space-y-4">
              <div><Label>Full name</Label><Input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="mt-1.5" data-testid="fm-name" /></div>
              <div><Label>Email</Label><Input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1.5" data-testid="fm-email" /></div>
              <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1.5" placeholder="+234…" /></div>
              <DialogFooter><Button type="submit" disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="fm-submit">{saving ? "…" : "Send invite"}</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {lastInvite && (
        <Card className="p-4 border border-emerald-200 bg-emerald-50 flex items-start gap-3">
          <Mail className="w-5 h-5 text-emerald-700 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="font-display font-bold text-emerald-900">Invite link for {lastInvite.name}</div>
            <div className="text-xs text-emerald-800 mt-1">In dev, emails are logged. Copy this link if needed.</div>
            <div className="mt-2 flex items-center gap-2">
              <code className="text-xs bg-white border border-emerald-300 rounded px-2 py-1 flex-1 truncate">{lastInvite.link}</code>
              <Button size="sm" variant="outline" onClick={() => copyLink(lastInvite.link)}><Copy className="w-3 h-3 mr-1" />Copy</Button>
              <Button size="sm" variant="ghost" onClick={() => setLastInvite(null)}>Dismiss</Button>
            </div>
          </div>
        </Card>
      )}

      {items.length === 0 ? (
        <Card className="p-12 border border-dashed border-slate-300 bg-white text-center">
          <HardHat className="w-10 h-10 text-slate-300 mx-auto" />
          <div className="mt-3 font-display font-bold text-lg">No facility managers yet</div>
          <p className="text-slate-500 mt-1">Invite a facility manager to start assigning complaints.</p>
        </Card>
      ) : (
        <Card className="border border-slate-200 bg-white overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((fm) => (
                <TableRow key={fm.id} data-testid={`fm-row-${fm.id}`}>
                  <TableCell className="font-medium">{fm.full_name}</TableCell>
                  <TableCell className="text-slate-600">{fm.email}</TableCell>
                  <TableCell className="text-slate-600">{fm.phone || "—"}</TableCell>
                  <TableCell><span className={`text-xs px-2 py-0.5 rounded capitalize ${fm.status === "active" ? "bg-emerald-100 text-emerald-800" : fm.status === "revoked" ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-700"}`}>{fm.status.replace(/_/g, " ")}</span></TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center gap-1 justify-end">
                      {fm.status === "pending_invite" && <button onClick={() => resend(fm)} className="p-1.5 text-slate-500 hover:text-emerald-700" title="Resend"><Mail className="w-4 h-4" /></button>}
                      {fm.status !== "revoked" && <button onClick={() => revoke(fm)} className="p-1.5 text-slate-500 hover:text-red-600" title="Revoke" data-testid={`revoke-fm-${fm.id}`}><Ban className="w-4 h-4" /></button>}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      <ConfirmDialog />
    </div>
  );
}
