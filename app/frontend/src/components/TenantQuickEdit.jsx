import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Pencil } from "lucide-react";

const FREQUENCIES = ["monthly", "quarterly", "bi_annually", "yearly"];

export default function TenantQuickEdit({ tenant, open, onOpenChange, onSaved }) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!tenant || !open) return;
    setForm({
      full_name: tenant.full_name || "",
      email: tenant.email || "",
      phone: tenant.phone || "",
      whatsapp: tenant.whatsapp || "",
      apartment_number: tenant.apartment_number || "",
      rent_amount: tenant.rent_amount == null ? "" : String(tenant.rent_amount),
      rent_frequency: tenant.rent_frequency || "monthly",
      due_date: tenant.due_date || "",
      lease_start: tenant.lease_start || "",
      lease_end: tenant.lease_end || "",
      notes: tenant.notes || "",
    });
  }, [tenant, open]);

  const patch = (name) => (event) => setForm(f => ({ ...f, [name]: event.target.value }));
  const save = async (event) => {
    event.preventDefault();
    if (!tenant) return;
    if (!form.full_name.trim() || !form.apartment_number.trim()) return toast.error("Tenant name and apartment are required");
    if (form.rent_amount !== "" && (!Number.isFinite(Number(form.rent_amount)) || Number(form.rent_amount) < 0)) return toast.error("Enter a valid rent amount");

    const payload = {
      full_name: form.full_name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      whatsapp: form.whatsapp.trim(),
      apartment_number: form.apartment_number.trim(),
      rent_frequency: form.rent_frequency,
      notes: form.notes,
    };
    if (form.rent_amount !== "") payload.rent_amount = Number(form.rent_amount);
    for (const name of ["due_date", "lease_start", "lease_end"]) {
      if (form[name]) payload[name] = form[name];
    }

    setSaving(true);
    try {
      await api.patch("/tenants/" + tenant.id, payload);
      await onSaved();
      onOpenChange(false);
      toast.success("Tenant information updated");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not update tenant");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Edit tenant information</DialogTitle></DialogHeader>
        {tenant && <form onSubmit={save} className="space-y-4">
          <div><Label>Full name</Label><Input required data-testid="property-tenant-name" value={form.full_name || ""} onChange={patch("full_name")} className="mt-1.5" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Phone</Label><Input data-testid="property-tenant-phone" value={form.phone || ""} onChange={patch("phone")} className="mt-1.5" /></div>
            <div><Label>Email</Label><Input type="email" value={form.email || ""} onChange={patch("email")} className="mt-1.5" /></div>
          </div>
          <div><Label>WhatsApp</Label><Input value={form.whatsapp || ""} onChange={patch("whatsapp")} className="mt-1.5" /></div>
          <div><Label>Apartment / unit number</Label><Input required data-testid="property-tenant-apartment" value={form.apartment_number || ""} onChange={patch("apartment_number")} className="mt-1.5" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Rent amount (₦)</Label><Input type="number" step="0.01" min="0" data-testid="property-tenant-rent" value={form.rent_amount ?? ""} onChange={patch("rent_amount")} className="mt-1.5" placeholder="Not yet reconciled" /></div>
            <div><Label>Rent frequency</Label>
              <Select value={form.rent_frequency || "monthly"} onValueChange={v => setForm(f => ({ ...f, rent_frequency: v }))}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>{FREQUENCIES.map(v => <SelectItem key={v} value={v}>{v.replace("_", " ")}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Rent due date</Label><Input type="date" value={form.due_date || ""} onChange={patch("due_date")} className="mt-1.5" /></div>
            <div><Label>Lease start</Label><Input type="date" value={form.lease_start || ""} onChange={patch("lease_start")} className="mt-1.5" /></div>
          </div>
          <div><Label>Lease end</Label><Input type="date" value={form.lease_end || ""} onChange={patch("lease_end")} className="mt-1.5" /></div>
          <div><Label>Notes</Label><textarea value={form.notes || ""} onChange={patch("notes")} className="mt-1.5 w-full rounded-md border border-slate-200 p-3 text-sm" rows={3} /></div>
          {tenant.tenant_user_id && form.email !== (tenant.email || "") && (
            <p className="text-xs text-amber-800 border border-amber-300 bg-amber-50 p-2 rounded">
              Changing the tenant record's email will not change an existing portal login email.
            </p>
          )}
          <p className="text-xs text-slate-500">
            Changes update tenant profile fields only, not historical invoices, rent ledger balances, receipts, or payment records. Past/current status is managed separately.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving} data-testid="save-property-tenant" className="bg-emerald-600 hover:bg-emerald-700 text-white">
              <Pencil className="w-4 h-4 mr-1.5" />{saving ? "Saving…" : "Save tenant"}
            </Button>
          </DialogFooter>
        </form>}
      </DialogContent>
    </Dialog>
  );
}
