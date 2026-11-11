import { useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Pencil } from "lucide-react";

const FREQUENCIES = ["monthly", "quarterly", "bi_annually", "yearly"];
const STATUSES = ["vacant", "occupied", "maintenance", "unavailable"];

export default function ApartmentEditDialog({ tenant, onUpdated }) {
  const [open, setOpen] = useState(false);
  const [linkedUnit, setLinkedUnit] = useState(null);
  const [form, setForm] = useState({ unit_name: "", unit_number: "", rent_amount: "", rent_frequency: "monthly", status: "occupied" });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const openEditor = async () => {
    setLoading(true);
    try {
      let unit = null;
      if (tenant?.unit_id && tenant?.property_id) {
        const response = await api.get("/properties/" + tenant.property_id + "/units");
        unit = response.data.find(item => item.id === tenant.unit_id) || null;
        if (!unit) {
          toast.error("The apartment record could not be found. Please check this tenant's unit assignment.");
          return;
        }
      }
      setLinkedUnit(unit);
      setForm({
        unit_name: unit?.unit_name || unit?.unit_number || tenant.apartment_number || "",
        unit_number: unit?.unit_number || (unit ? "" : tenant.apartment_number || ""),
        rent_amount: (unit ? unit.rent_amount : tenant.rent_amount) == null ? "" : String(unit ? unit.rent_amount : tenant.rent_amount),
        rent_frequency: (unit ? unit.rent_frequency : tenant.rent_frequency) || "monthly",
        status: unit?.status || "occupied",
      });
      setOpen(true);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not load apartment information");
    } finally { setLoading(false); }
  };

  const save = async event => {
    event.preventDefault();
    const apartment = (form.unit_number || form.unit_name).trim();
    if (!apartment || !form.unit_name.trim()) return toast.error("Apartment name or number is required");
    if (form.rent_amount !== "" && (!Number.isFinite(Number(form.rent_amount)) || Number(form.rent_amount) < 0)) {
      return toast.error("Enter a valid rent amount");
    }
    setSaving(true);
    try {
      if (linkedUnit) {
        const data = {
          unit_name: form.unit_name.trim(),
          unit_number: form.unit_number.trim(),
          rent_frequency: form.rent_frequency,
          status: form.status,
        };
        if (form.rent_amount !== "") data.rent_amount = Number(form.rent_amount);
        await api.patch("/units/" + linkedUnit.id, data);
      } else {
        // Imported and older apartments can exist as tenant records without a unit_id.
        // Do not create a duplicate unit or alter the historical financial ledger.
        const data = {
          apartment_number: apartment,
          rent_frequency: form.rent_frequency,
        };
        if (form.rent_amount !== "") data.rent_amount = Number(form.rent_amount);
        await api.patch("/tenants/" + tenant.id, data);
      }
      await onUpdated();
      setOpen(false);
      toast.success("Apartment information updated");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not update apartment");
    } finally { setSaving(false); }
  };

  return (
    <>
      <Button type="button" variant="outline" onClick={openEditor} disabled={loading} data-testid="edit-current-apartment">
        <Pencil className="w-4 h-4 mr-1.5" /> {loading ? "Loading…" : "Edit apartment"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Edit apartment information</DialogTitle></DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <div>
              <Label>Apartment name</Label>
              <Input required value={form.unit_name} onChange={e => setForm(f => ({ ...f, unit_name: e.target.value }))} data-testid="current-apartment-name" className="mt-1.5" />
            </div>
            <div>
              <Label>Apartment / Unit number</Label>
              <Input value={form.unit_number} onChange={e => setForm(f => ({ ...f, unit_number: e.target.value }))} data-testid="current-apartment-number" className="mt-1.5" />
            </div>
            <div>
              <Label>Rent amount (₦)</Label>
              <Input type="number" min="0" step="0.01" value={form.rent_amount} onChange={e => setForm(f => ({ ...f, rent_amount: e.target.value }))} data-testid="current-apartment-rent" className="mt-1.5" placeholder="Not set" />
            </div>
            <div>
              <Label>Rent frequency</Label>
              <Select value={form.rent_frequency} onValueChange={value => setForm(f => ({ ...f, rent_frequency: value }))}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>{FREQUENCIES.map(value => <SelectItem key={value} value={value}>{value.replaceAll("_", " ")}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {linkedUnit ? (
              <div>
                <Label>Apartment status</Label>
                <Select value={form.status} onValueChange={value => setForm(f => ({ ...f, status: value }))}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUSES.map(value => <SelectItem key={value} value={value}>{value.replaceAll("_", " ")}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            ) : (
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
                This older apartment is linked directly to its tenant, without a separate unit record. You can edit its apartment number and rent details here. To mark it vacant, first manage the tenant's occupancy from the tenant page.
              </p>
            )}
            <p className="text-xs text-slate-500">
              Updating apartment information does not rewrite existing rent invoices, utility bills, receipts, or payment history.
            </p>
            <DialogFooter><Button type="submit" disabled={saving} data-testid="save-current-apartment" className="bg-emerald-600 hover:bg-emerald-700 text-white">{saving ? "Saving…" : "Save changes"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
