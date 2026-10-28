import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { useConfirm } from "@/components/ConfirmDialog";
import { Wrench, UserPlus, MessageSquare, CheckCircle2, Building2 } from "lucide-react";
import { formatDate } from "@/lib/format";
import EvidencePreview from "@/components/EvidencePreview";

const CATEGORIES = ["plumbing", "electrical", "security", "cleaning", "generator", "water", "structural", "other"];
const PRIORITIES = ["low", "normal", "high", "emergency"];

function priorityColor(p) {
  return p === "emergency" ? "bg-red-100 text-red-800" : p === "high" ? "bg-orange-100 text-orange-800" : p === "low" ? "bg-slate-100 text-slate-700" : "bg-blue-100 text-blue-800";
}
function statusColor(s) {
  return s === "completed" ? "text-emerald-700" : s === "closed" ? "text-slate-500" : s === "pending" ? "text-orange-600" : s === "in_progress" ? "text-blue-600" : s === "assigned" ? "text-indigo-600" : "text-slate-700";
}

export default function Maintenance() {
  const [items, setItems] = useState([]);
  const [fms, setFms] = useState([]);
  const [properties, setProperties] = useState([]);
  const [propFilter, setPropFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const [assigning, setAssigning] = useState(false);
  const [assignFmId, setAssignFmId] = useState("");
  const [remark, setRemark] = useState("");
  const [confirm, ConfirmDialog] = useConfirm();

  const load = useCallback(async () => {
    const [c, f, p] = await Promise.all([api.get("/maintenance/complaints"), api.get("/facility-managers"), api.get("/properties")]);
    setItems(c.data);
    setFms(f.data.filter((x) => x.status === "active"));
    setProperties(p.data);
  }, []);
  useEffect(() => { load(); }, [load]);

  const openDetail = async (c) => {
    const { data } = await api.get(`/maintenance/complaints/${c.id}`);
    setSelected(data);
    setAssignFmId(data.assigned_to_facility_manager_id || "");
    setRemark("");
  };

  const doAssign = async () => {
    if (!assignFmId) return toast.error("Select a facility manager");
    setAssigning(true);
    try {
      await api.post(`/maintenance/complaints/${selected.id}/assign`, { facility_manager_id: assignFmId });
      toast.success("Assigned");
      const { data } = await api.get(`/maintenance/complaints/${selected.id}`);
      setSelected(data);
      load();
    } catch (er) { toast.error(er.response?.data?.detail || "Failed"); }
    finally { setAssigning(false); }
  };

  const postRemark = async () => {
    if (!remark.trim()) return;
    try {
      await api.post(`/maintenance/complaints/${selected.id}/remarks`, { message: remark });
      const { data } = await api.get(`/maintenance/complaints/${selected.id}`);
      setSelected(data); setRemark("");
    } catch { toast.error("Failed"); }
  };

  const closeC = async () => {
    const ok = await confirm({
      title: "Close this complaint?",
      description: "The complaint will be marked closed. You can reopen from the tenant portal if needed.",
      confirmText: "Close complaint",
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.post(`/maintenance/complaints/${selected.id}/close`);
      toast.success("Closed");
      const { data } = await api.get(`/maintenance/complaints/${selected.id}`);
      setSelected(data);
      load();
    } catch (er) { toast.error(er.response?.data?.detail || "Failed"); }
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="tiny-label text-emerald-700">Facility</div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight mt-2">Maintenance & Complaints</h1>
        <p className="text-slate-500 mt-1 text-sm sm:text-base">All complaints raised by your tenants — grouped by property for clarity.</p>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="min-w-[220px]">
          <Select value={propFilter} onValueChange={setPropFilter}>
            <SelectTrigger data-testid="maintenance-property-filter"><SelectValue placeholder="All properties" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All properties</SelectItem>
              {properties.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="text-xs text-slate-500">Showing {items.filter((c) => propFilter === "all" || c.property_id === propFilter).length} complaint{items.filter((c) => propFilter === "all" || c.property_id === propFilter).length === 1 ? "" : "s"}</div>
      </div>

      <Card className="hidden md:block border border-slate-200 bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>Complaint</TableHead>
              <TableHead>Property / Estate</TableHead>
              <TableHead>Tenant / Apt</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Assigned to</TableHead>
              <TableHead>Created</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.filter((c) => propFilter === "all" || c.property_id === propFilter).length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-slate-500 py-8">No complaints for this filter — tenants will raise from their portal.</TableCell></TableRow>}
            {items.filter((c) => propFilter === "all" || c.property_id === propFilter).map((c) => (
              <TableRow key={c.id} data-testid={`complaint-row-${c.id}`}>
                <TableCell><div className="font-medium">{c.title}</div><div className="text-xs text-slate-500 line-clamp-1">{c.description}</div></TableCell>
                <TableCell><div className="font-semibold text-emerald-700 flex items-center gap-1"><Building2 className="w-3.5 h-3.5" />{c.property_name || "—"}</div></TableCell>
                <TableCell><div className="font-medium">{c.tenant_name}</div><div className="text-xs text-slate-500">{c.apartment_number}</div></TableCell>
                <TableCell className="capitalize text-slate-600">{c.category}</TableCell>
                <TableCell><span className={`text-xs px-2 py-0.5 rounded capitalize ${priorityColor(c.priority)}`}>{c.priority}</span></TableCell>
                <TableCell><span className={`text-xs capitalize font-semibold ${statusColor(c.status)}`}>{c.status.replace(/_/g, " ")}</span></TableCell>
                <TableCell className="text-sm">{c.assigned_to_name || <span className="text-slate-400 italic">unassigned</span>}</TableCell>
                <TableCell className="text-xs text-slate-500">{formatDate(c.created_at)}</TableCell>
                <TableCell><Button size="sm" variant="outline" onClick={() => openDetail(c)} data-testid={`open-complaint-${c.id}`}>Open</Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Mobile card list */}
      <div className="md:hidden space-y-3">
        {items.filter((c) => propFilter === "all" || c.property_id === propFilter).length === 0 && (
          <Card className="p-6 text-center text-slate-500 text-sm border border-slate-200 bg-white">No complaints for this filter.</Card>
        )}
        {items.filter((c) => propFilter === "all" || c.property_id === propFilter).map((c) => (
          <Card key={c.id} className="p-4 border border-slate-200 bg-white" data-testid={`complaint-card-${c.id}`} onClick={() => openDetail(c)}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold text-sm truncate">{c.title}</div>
                <div className="text-xs text-emerald-700 mt-1 flex items-center gap-1"><Building2 className="w-3 h-3" /> {c.property_name || "—"}</div>
                <div className="text-xs text-slate-500 mt-0.5">{c.tenant_name} · {c.apartment_number}</div>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded capitalize whitespace-nowrap ${priorityColor(c.priority)}`}>{c.priority}</span>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs">
              <span className={`capitalize font-semibold ${statusColor(c.status)}`}>{c.status.replace(/_/g, " ")}</span>
              <span className="text-slate-500">{formatDate(c.created_at)}</span>
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader><DialogTitle className="font-display text-2xl">{selected.title}</DialogTitle></DialogHeader>
              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div><span className="text-slate-500">Property:</span> <span className="font-semibold text-emerald-700">{selected.property_name || "—"}</span></div>
                  <div><span className="text-slate-500">Tenant:</span> <span className="font-semibold">{selected.tenant?.full_name || selected.tenant_name} — {selected.apartment_number}</span></div>
                  <div><span className="text-slate-500">Category:</span> <span className="font-semibold capitalize">{selected.category}</span></div>
                  <div><span className="text-slate-500">Priority:</span> <span className={`px-2 py-0.5 rounded capitalize ${priorityColor(selected.priority)}`}>{selected.priority}</span></div>
                  <div><span className="text-slate-500">Status:</span> <span className={`font-semibold capitalize ${statusColor(selected.status)}`}>{selected.status.replace(/_/g, " ")}</span></div>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-md">
                  <div className="tiny-label mb-1">Description</div>
                  <div className="text-slate-700 whitespace-pre-wrap">{selected.description}</div>
                </div>

                <EvidencePreview files={selected.attachments || []} title="Tenant complaint evidence" />

                {selected.status !== "closed" && (
                  <div className="p-3 border border-slate-200 rounded-md">
                    <div className="tiny-label mb-2"><UserPlus className="w-3 h-3 inline mr-1" /> Assign to facility manager</div>
                    <div className="flex gap-2">
                      <Select value={assignFmId} onValueChange={setAssignFmId}>
                        <SelectTrigger data-testid="assign-fm-select"><SelectValue placeholder="Select facility manager" /></SelectTrigger>
                        <SelectContent>
                          {fms.length === 0 && <div className="p-2 text-xs text-slate-500">No active facility managers. Invite one first.</div>}
                          {fms.map((f) => <SelectItem key={f.id} value={f.id}>{f.full_name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Button onClick={doAssign} disabled={assigning || !assignFmId} className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="assign-fm-btn">{assigning ? "…" : "Assign"}</Button>
                    </div>
                  </div>
                )}

                <div>
                  <div className="tiny-label mb-2">Timeline</div>
                  <div className="space-y-2">
                    {selected.updates.map((u) => (
                      <div key={u.id} className="text-xs border-l-2 border-emerald-300 pl-3 py-1">
                        <div className="text-slate-500"><span className="font-semibold capitalize text-slate-700">{u.role}</span> · {formatDate(u.created_at)} · <span className="capitalize">{u.status_to}</span></div>
                        <div className="text-slate-800 mt-0.5 whitespace-pre-wrap">{u.message}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {selected.status !== "closed" && (
                  <div className="flex gap-2">
                    <Textarea value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="Add a remark…" className="flex-1" data-testid="complaint-remark-input" />
                    <Button onClick={postRemark} className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="complaint-remark-post"><MessageSquare className="w-4 h-4 mr-1" /> Post</Button>
                  </div>
                )}
                {selected.status !== "closed" && (
                  <DialogFooter>
                    <Button variant="outline" onClick={closeC} className="border-red-300 text-red-600" data-testid="complaint-close-btn"><CheckCircle2 className="w-4 h-4 mr-1" /> Close complaint</Button>
                  </DialogFooter>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog />
    </div>
  );
}
