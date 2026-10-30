import { useCallback, useEffect, useState, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { useConfirm } from "@/components/ConfirmDialog";
import { Plus, Users, Trash2, Pencil, Mail, Copy, Ban, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { formatNaira, formatDate, todayISO } from "@/lib/format";
import StatusBadge from "@/components/StatusBadge";

const FREQS = ["monthly", "quarterly", "bi_annually", "yearly"];

const emptyForm = {
  full_name: "", email: "", phone: "", whatsapp: "",
  property_id: "", apartment_number: "", rent_amount: "", rent_frequency: "monthly",
  due_date: todayISO(), lease_start: todayISO(), lease_end: "", notes: "",
};

// Extracted OUTSIDE parent to prevent re-mount / focus-loss on every keystroke.
function TenantFormFields({ form, setForm, properties, isEdit }) {
  const patch = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <>
      <div>
        <Label>Full name</Label>
        <Input required data-testid="tenant-name" value={form.full_name} onChange={patch("full_name")} className="mt-1.5" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Phone</Label>
          <Input value={form.phone} data-testid="tenant-phone" onChange={patch("phone")} className="mt-1.5" placeholder="+234…" />
        </div>
        <div>
          <Label>Email {!isEdit && <span className="text-xs text-slate-500">(invite will be sent)</span>}</Label>
          <Input type="email" value={form.email} onChange={patch("email")} className="mt-1.5" data-testid="tenant-email" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Property</Label>
          <Select value={form.property_id} onValueChange={(v) => setForm((f) => ({ ...f, property_id: v }))}>
            <SelectTrigger data-testid="tenant-property" className="mt-1.5"><SelectValue placeholder="Select property" /></SelectTrigger>
            <SelectContent>
              {properties.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Apartment / Unit no.</Label>
          <Input required value={form.apartment_number} onChange={patch("apartment_number")} className="mt-1.5" placeholder="Flat 2B" data-testid="tenant-apartment" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Rent amount (₦)</Label>
          <Input required type="number" min="0" step="1000" data-testid="tenant-rent" value={form.rent_amount} onChange={patch("rent_amount")} className="mt-1.5" />
        </div>
        <div>
          <Label>Frequency</Label>
          <Select value={form.rent_frequency} onValueChange={(v) => setForm((f) => ({ ...f, rent_frequency: v }))}>
            <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
            <SelectContent>
              {FREQS.map((f) => <SelectItem key={f} value={f}>{f.replace("_", " ")}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Rent due date</Label>
          <Input required type="date" data-testid="tenant-due-date" value={form.due_date} onChange={patch("due_date")} className="mt-1.5" />
        </div>
        <div>
          <Label>Lease start</Label>
          <Input type="date" value={form.lease_start} onChange={patch("lease_start")} className="mt-1.5" />
        </div>
      </div>
    </>
  );
}

export default function Tenants() {
  const [items, setItems] = useState([]);
  const [properties, setProperties] = useState([]);
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [lastInvite, setLastInvite] = useState(null);
  const [confirm, ConfirmDialog] = useConfirm();
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = searchParams.get("filter") || "";

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const PAGE_SIZE = 25;
  const paginated = filter !== "overdue";

  const visible = useMemo(() => {
    if (filter === "overdue") {
      return items.filter((t) => (t.current_rent?.status === "overdue"));
    }
    return items;
  }, [items, filter]);

  const loadProps = useCallback(async () => {
    const p = await api.get("/properties");
    setProperties(p.data);
    setForm((f) => (f.property_id || !p.data.length ? f : { ...f, property_id: p.data[0].id }));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (paginated) {
        const { data } = await api.get(`/tenants?page=${page}&page_size=${PAGE_SIZE}&q=${encodeURIComponent(search)}`);
        setItems(data.items);
        setTotalPages(data.total_pages);
        setTotal(data.total);
      } else {
        const { data } = await api.get(`/tenants`);
        setItems(data);
        setTotal(data.length);
        setTotalPages(1);
      }
    } finally { setLoading(false); }
  }, [paginated, page, search]);

  useEffect(() => { loadProps(); }, [loadProps]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [search, filter]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.property_id) return toast.error("Please add a property first");
    if (!form.apartment_number.trim()) return toast.error("Apartment/Unit number is required");
    setSaving(true);
    try {
      const payload = { ...form, rent_amount: parseFloat(form.rent_amount) };
      const { data } = await api.post("/tenants", payload);
      toast.success(data.invite_link ? "Tenant added — invite email logged" : "Tenant added");
      if (data.invite_link) setLastInvite({ name: data.full_name, link: data.invite_link });
      setOpen(false);
      setForm({ ...emptyForm, property_id: form.property_id });
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to add tenant");
    } finally { setSaving(false); }
  };

  const openEdit = (t) => {
    setEditing(t);
    setForm({
      full_name: t.full_name || "",
      email: t.email || "",
      phone: t.phone || "",
      whatsapp: t.whatsapp || "",
      property_id: t.property_id || "",
      apartment_number: t.apartment_number || "",
      rent_amount: String(t.rent_amount || ""),
      rent_frequency: t.rent_frequency || "monthly",
      due_date: t.due_date || todayISO(),
      lease_start: t.lease_start || "",
      lease_end: t.lease_end || "",
      notes: t.notes || "",
    });
    setEditOpen(true);
  };

  const submitEdit = async (e) => {
    e.preventDefault();
    if (!form.apartment_number.trim()) return toast.error("Apartment/Unit number is required");
    setSaving(true);
    try {
      const payload = { ...form, rent_amount: parseFloat(form.rent_amount) };
      await api.patch(`/tenants/${editing.id}`, payload);
      toast.success("Tenant updated");
      setEditOpen(false);
      setEditing(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to update");
    } finally { setSaving(false); }
  };

  const resend = async (t) => {
    try {
      const { data } = await api.post(`/tenants/${t.id}/resend-invite`);
      toast.success("Invite resent");
      if (data.invite_link) setLastInvite({ name: t.full_name, link: data.invite_link });
    } catch (er) {
      toast.error(er.response?.data?.detail || "Could not resend invite");
    }
  };

  const revoke = async (t) => {
    const ok = await confirm({
      title: `Revoke access for ${t.full_name}?`,
      description: "They will lose access to their tenant portal. History remains for your records and they move to Past tenants (auto-deleted after 6 months).",
      confirmText: "Revoke access",
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.post(`/tenants/${t.id}/revoke-access`);
      toast.success("Access revoked");
      load();
    } catch (er) { toast.error(er.response?.data?.detail || "Failed"); }
  };

  const archive = async (t) => {
    const ok = await confirm({
      title: `Archive ${t.full_name}?`,
      description: "History will be kept but they will be removed from active tenant lists and auto-deleted after 6 months.",
      confirmText: "Archive tenant",
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/tenants/${t.id}`);
      toast.success("Tenant archived");
      load();
    } catch (er) { toast.error(er.response?.data?.detail || "Failed"); }
  };

  const copyLink = (link) => {
    navigator.clipboard.writeText(link);
    toast.success("Invite link copied");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="tiny-label text-emerald-700">People</div>
          <h1 className="font-display text-3xl font-bold tracking-tight mt-2">Tenants</h1>
          <p className="text-slate-500 mt-1">All tenants across your properties.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="add-tenant-button" className="bg-emerald-600 hover:bg-emerald-700 text-white" disabled={properties.length === 0}>
              <Plus className="w-4 h-4 mr-1.5" /> Add tenant
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle className="font-display text-2xl">Add tenant</DialogTitle></DialogHeader>
            <form onSubmit={submit} className="space-y-4">
              <TenantFormFields form={form} setForm={setForm} properties={properties} isEdit={false} />
              <DialogFooter>
                <Button type="submit" data-testid="tenant-submit" disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">{saving ? "Saving…" : "Add tenant"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {paginated && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, phone, apartment…" className="pl-9" data-testid="tenants-search" />
          </div>
          <div className="text-sm text-slate-500" data-testid="tenants-count">{total} tenant{total === 1 ? "" : "s"}</div>
        </div>
      )}

      {lastInvite && (
        <Card className="p-4 border border-emerald-200 bg-emerald-50 flex items-start gap-3" data-testid="invite-link-banner">
          <Mail className="w-5 h-5 text-emerald-700 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="font-display font-bold text-emerald-900">Invite link for {lastInvite.name}</div>
            <div className="text-xs text-emerald-800 mt-1">In development, emails are logged. Copy this link and share with your tenant if needed.</div>
            <div className="mt-2 flex items-center gap-2">
              <code className="text-xs bg-white border border-emerald-300 rounded px-2 py-1 flex-1 truncate">{lastInvite.link}</code>
              <Button size="sm" variant="outline" onClick={() => copyLink(lastInvite.link)} className="border-emerald-300"><Copy className="w-3 h-3 mr-1" />Copy</Button>
              <Button size="sm" variant="ghost" onClick={() => setLastInvite(null)}>Dismiss</Button>
            </div>
          </div>
        </Card>
      )}

      {filter === "overdue" && (
        <div className="flex items-center justify-between p-3 rounded-lg border border-red-200 bg-red-50" data-testid="tenants-filter-banner">
          <div className="flex items-center gap-2 text-sm text-red-800">
            <span className="font-bold">Showing overdue tenants only.</span> {visible.length} of {items.length} tenant{items.length === 1 ? "" : "s"}.
          </div>
          <button onClick={() => setSearchParams({})} className="text-xs text-red-700 font-semibold hover:underline">Clear filter</button>
        </div>
      )}

      {visible.length === 0 ? (
        <Card className="p-12 border border-dashed border-slate-300 bg-white text-center">
          <Users className="w-10 h-10 text-slate-300 mx-auto" />
          <div className="mt-3 font-display font-bold text-lg">{filter === "overdue" ? "No overdue tenants" : "No tenants yet"}</div>
          <p className="text-slate-500 mt-1">{filter === "overdue" ? "Great — all tenants are up to date." : "Add your first tenant to start tracking rent."}</p>
        </Card>
      ) : (
        <>
          {/* Mobile: stacked cards */}
          <div className="md:hidden space-y-3">
            {visible.map((t) => (
              <Card key={t.id} className="p-4 border border-slate-200 bg-white" data-testid={`tenant-card-${t.id}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link to={`/dashboard/tenants/${t.id}`} className="font-semibold hover:text-emerald-700 block truncate">{t.full_name}</Link>
                    <div className="text-xs text-slate-500 truncate">{t.phone || t.email || "-"}</div>
                  </div>
                  <StatusBadge status={t.current_rent?.status || "upcoming"} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                  <div><div className="tiny-label text-slate-400">Apartment</div><div className="font-medium">{t.apartment_number || "—"}</div></div>
                  <div className="min-w-0"><div className="tiny-label text-slate-400">Property</div><div className="text-slate-600 truncate">{t.property_name}</div></div>
                  <div><div className="tiny-label text-slate-400">Rent</div><div className="font-medium tabular-nums">{t.rent_amount == null ? "Awaiting reconciliation" : formatNaira(t.rent_amount)}</div></div>
                  <div><div className="tiny-label text-slate-400">Due date</div><div className="text-slate-600">{formatDate(t.current_rent?.due_date || t.due_date)}</div></div>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${
                    t.invite_status === "accepted" ? "bg-emerald-100 text-emerald-800" :
                    t.invite_status === "sent" ? "bg-blue-100 text-blue-800" :
                    t.invite_status === "revoked" ? "bg-red-100 text-red-800" :
                    "bg-slate-100 text-slate-700"
                  }`}>{(t.invite_status || "not_sent").replace("_", " ")}</span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => openEdit(t)} className="p-2 text-slate-500 hover:text-emerald-700 hover:bg-slate-50 rounded" title="Edit" data-testid={`edit-tenant-m-${t.id}`}><Pencil className="w-4 h-4" /></button>
                    {t.email && t.invite_status !== "accepted" && t.status === "active" && (
                      <button onClick={() => resend(t)} className="p-2 text-slate-500 hover:text-blue-700 hover:bg-slate-50 rounded" title="Resend invite"><Mail className="w-4 h-4" /></button>
                    )}
                    {t.status === "active" && t.tenant_user_id && (
                      <button onClick={() => revoke(t)} className="p-2 text-slate-500 hover:text-orange-700 hover:bg-slate-50 rounded" title="Revoke access"><Ban className="w-4 h-4" /></button>
                    )}
                    <button onClick={() => archive(t)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-slate-50 rounded" title="Archive"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* Desktop: table */}
          <Card className="hidden md:block border border-slate-200 bg-white overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead>Tenant</TableHead>
                <TableHead>Apartment</TableHead>
                <TableHead>Property</TableHead>
                <TableHead>Rent</TableHead>
                <TableHead>Due date</TableHead>
                <TableHead>Invite</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((t) => (
                <TableRow key={t.id} data-testid={`tenant-row-${t.id}`}>
                  <TableCell>
                    <Link to={`/dashboard/tenants/${t.id}`} className="font-medium hover:text-emerald-700">{t.full_name}</Link>
                    <div className="text-xs text-slate-500">{t.phone || t.email || "-"}</div>
                  </TableCell>
                  <TableCell className="font-medium">{t.apartment_number || "—"}</TableCell>
                  <TableCell className="text-slate-600">{t.property_name}</TableCell>
                  <TableCell className="font-medium">{t.rent_amount == null ? "Awaiting reconciliation" : formatNaira(t.rent_amount)}</TableCell>
                  <TableCell className="text-slate-600">{formatDate(t.current_rent?.due_date || t.due_date)}</TableCell>
                  <TableCell>
                    <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${
                      t.invite_status === "accepted" ? "bg-emerald-100 text-emerald-800" :
                      t.invite_status === "sent" ? "bg-blue-100 text-blue-800" :
                      t.invite_status === "revoked" ? "bg-red-100 text-red-800" :
                      "bg-slate-100 text-slate-700"
                    }`}>{(t.invite_status || "not_sent").replace("_", " ")}</span>
                  </TableCell>
                  <TableCell><StatusBadge status={t.current_rent?.status || "upcoming"} /></TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => openEdit(t)} className="p-1.5 text-slate-500 hover:text-emerald-700 hover:bg-slate-50 rounded" title="Edit" data-testid={`edit-tenant-${t.id}`}>
                        <Pencil className="w-4 h-4" />
                      </button>
                      {t.email && t.invite_status !== "accepted" && t.status === "active" && (
                        <button onClick={() => resend(t)} className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-slate-50 rounded" title="Resend invite" data-testid={`resend-invite-${t.id}`}>
                          <Mail className="w-4 h-4" />
                        </button>
                      )}
                      {t.status === "active" && t.tenant_user_id && (
                        <button onClick={() => revoke(t)} className="p-1.5 text-slate-500 hover:text-orange-700 hover:bg-slate-50 rounded" title="Revoke access" data-testid={`revoke-tenant-${t.id}`}>
                          <Ban className="w-4 h-4" />
                        </button>
                      )}
                      <button onClick={() => archive(t)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-slate-50 rounded" title="Archive" data-testid={`archive-tenant-${t.id}`}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        {paginated && totalPages > 1 && (
          <div className="flex items-center justify-between gap-3 pt-1" data-testid="tenants-pagination">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || loading} data-testid="tenants-prev-page"
              className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:border-emerald-300 disabled:opacity-40 disabled:cursor-not-allowed">
              <ChevronLeft className="w-4 h-4" /> Previous
            </button>
            <span className="text-sm text-slate-500">Page <span className="font-semibold text-slate-800">{page}</span> of {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages || loading} data-testid="tenants-next-page"
              className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:border-emerald-300 disabled:opacity-40 disabled:cursor-not-allowed">
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
        </>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-display text-2xl">Edit tenant</DialogTitle></DialogHeader>
          <form onSubmit={submitEdit} className="space-y-4">
            <TenantFormFields form={form} setForm={setForm} properties={properties} isEdit={true} />
            {editing?.tenant_user_id && form.email !== (editing?.email || "") && (
              <div className="text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded p-2">
                Warning: This tenant has already accepted their invite. Changing the email here will NOT change their login email. Contact support to reissue access.
              </div>
            )}
            <DialogFooter>
              <Button type="submit" data-testid="tenant-edit-submit" disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog />
    </div>
  );
}

