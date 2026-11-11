import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Pencil } from "lucide-react";

const propertyTypes = ["Apartment", "Flat", "Duplex", "Bungalow", "Self-contained", "Mini flat", "Office space", "Shop", "Warehouse", "Estate unit", "Commercial unit", "Other"];
const capacityTypes = ["occupants", "beds", "flats", "rooms", "units"];

export default function PropertyEditDialog({ property, onUpdated }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open || !property) return;
    setForm({
      name: property.name || "", type: property.type || "Apartment", address: property.address || "",
      city: property.city || "", state: property.state || "", country: property.country || "Nigeria",
      status: property.status || "active", notes: property.notes || "",
      capacity_type: property.capacity_type || "occupants",
      capacity: property.capacity == null ? "0" : String(property.capacity),
    });
  }, [property, open]);

  const patch = key => event => setForm(current => ({ ...current, [key]: event.target.value }));
  const save = async event => {
    event.preventDefault();
    const capacity = Number(form.capacity);
    if (!Number.isInteger(capacity) || capacity < 0) return toast.error("Capacity must be a non-negative whole number");
    setSaving(true);
    try {
      await api.patch("/properties/" + property.id, {
        ...form, name: form.name.trim(), address: form.address.trim(),
        capacity,
      });
      await onUpdated();
      setOpen(false);
      toast.success("Property updated");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not update property");
    } finally { setSaving(false); }
  };
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} data-testid="edit-property"><Pencil className="w-4 h-4 mr-1.5" /> Edit property</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit property information</DialogTitle></DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <div><Label>Property / estate name</Label><Input data-testid="property-edit-name" required value={form.name || ""} onChange={patch("name")} className="mt-1.5" /></div>
            <div><Label>Address</Label><Input required value={form.address || ""} onChange={patch("address")} className="mt-1.5" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Type</Label><Select value={form.type || "Apartment"} onValueChange={v => setForm(f => ({ ...f, type: v }))}><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent>{propertyTypes.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>City</Label><Input value={form.city || ""} onChange={patch("city")} className="mt-1.5" /></div>
              <div><Label>State</Label><Input value={form.state || ""} onChange={patch("state")} className="mt-1.5" /></div>
              <div><Label>Country</Label><Input value={form.country || ""} onChange={patch("country")} className="mt-1.5" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Capacity</Label><Input type="number" min="0" step="1" data-testid="property-edit-capacity" value={form.capacity ?? "0"} onChange={patch("capacity")} className="mt-1.5" /></div>
              <div><Label>Capacity measured in</Label><Select value={form.capacity_type || "occupants"} onValueChange={v => setForm(f => ({ ...f, capacity_type: v }))}><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent>{capacityTypes.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div><Label>Notes</Label><textarea className="mt-1.5 w-full border border-slate-200 rounded-md p-3 text-sm" rows={4} value={form.notes || ""} onChange={patch("notes")} /></div>
            <p className="text-xs text-slate-500">Editing estate details does not change rent ledgers, bills, payment receipts, or tenant history.</p>
            <DialogFooter><Button variant="outline" type="button" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={saving} type="submit" data-testid="save-property-details" className="bg-emerald-600 hover:bg-emerald-700 text-white">{saving ? "Saving…" : "Save property"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
