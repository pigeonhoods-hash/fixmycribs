import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Home, Pencil, Plus, Search } from "lucide-react";
import { formatNaira } from "@/lib/format";

const initial = { unit_name: "", unit_number: "", rent_amount: "", rent_frequency: "monthly", status: "vacant" };
const statuses = ["vacant", "occupied", "maintenance", "unavailable"];
const frequencies = ["monthly", "quarterly", "bi_annually", "yearly"];

export default function UnitManager({ property, onUpdated }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const edit = (unit = null) => {
    setEditing(unit);
    setForm(unit ? {
      unit_name: unit.unit_name || unit.unit_number || "",
      unit_number: unit.unit_number || "",
      rent_amount: unit.rent_amount == null ? "" : String(unit.rent_amount),
      rent_frequency: unit.rent_frequency || "monthly",
      status: unit.status || "vacant",
    } : { ...initial });
    setOpen(true);
  };
  const save = async (event) => {
    event.preventDefault();
    if (!form.unit_name.trim()) return toast.error("Apartment name is required");
    setSaving(true);
    try {
      const payload = {
        unit_name: form.unit_name.trim(),
        unit_number: form.unit_number.trim(),
        rent_frequency: form.rent_frequency,
        status: form.status,
      };
      if (form.rent_amount !== "") payload.rent_amount = Number(form.rent_amount);
      if (editing) await api.patch("/units/" + editing.id, payload);
      else await api.post("/properties/" + property.id + "/units", { ...payload, rent_amount: payload.rent_amount ?? 0 });
      await onUpdated();
      setOpen(false);
      toast.success(editing ? "Apartment updated" : "Apartment added");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not save apartment");
    } finally { setSaving(false); }
  };
  const units = (property.units || []).map(unit => {
    const name = unit.unit_number || unit.unit_name || "";
    const occupant = (property.tenants || []).find(t => t.status === "active" &&
      (t.unit_id === unit.id || (!t.unit_id && t.apartment_number?.toLowerCase() === name.toLowerCase())));
    return { ...unit, displayName: name, occupant };
  }).filter(unit => !search.trim() || [unit.displayName, unit.unit_name, unit.occupant?.full_name]
    .some(value => String(value || "").toLowerCase().includes(search.trim().toLowerCase())));

  return (
    <>
      <Card className="p-6 border border-slate-200 bg-white">
        <div className="flex flex-wrap justify-between items-center gap-3">
          <div><h2 className="font-semibold">Apartments and units</h2>
            <p className="text-sm text-slate-500 mt-1">Manage unit information without changing existing payment history.</p></div>
          <Button type="button" onClick={() => edit()} data-testid="add-unit" className="bg-emerald-600 hover:bg-emerald-700 text-white"><Plus className="w-4 h-4 mr-1" /> Add apartment</Button>
        </div>
        <div className="relative mt-4 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search apartment or occupant..." data-testid="unit-search" className="pl-9" />
        </div>
        <div className="overflow-x-auto mt-3">
          <table className="w-full text-sm text-left">
            <thead><tr><th className="p-2">Apartment</th><th className="p-2">Status</th><th className="p-2">Occupant</th><th className="p-2">Rent</th><th className="p-2 text-right">Action</th></tr></thead>
            <tbody>{units.map(unit => (
              <tr key={unit.id} className="border-t">
                <td className="p-2">{unit.displayName}</td><td className="p-2 capitalize">{unit.status || "vacant"}</td>
                <td className="p-2">{unit.occupant ? <Link to={"/dashboard/tenants/" + unit.occupant.id} className="text-emerald-700 hover:underline">{unit.occupant.full_name}</Link> : "—"}</td>
                <td className="p-2">{unit.rent_amount == null ? "Not set" : formatNaira(unit.rent_amount)}</td>
                <td className="p-2 text-right"><Button size="sm" variant="outline" onClick={() => edit(unit)} data-testid={"edit-unit-" + unit.id}><Pencil className="w-3.5 h-3.5 mr-1" /> Edit</Button></td>
              </tr>))}</tbody>
          </table>
          {units.length === 0 && <p className="py-4 text-center text-slate-500 text-sm">No apartments found.</p>}
        </div>
      </Card>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Edit apartment" : "Add apartment"}</DialogTitle></DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <div><Label>Apartment name</Label><Input required value={form.unit_name} onChange={e => setForm(f => ({ ...f, unit_name: e.target.value }))} data-testid="unit-name" placeholder="Flat 2B" className="mt-1.5" /></div>
            <div><Label>Unit number (optional)</Label><Input value={form.unit_number} onChange={e => setForm(f => ({ ...f, unit_number: e.target.value }))} data-testid="unit-number" className="mt-1.5" /></div>
            <div><Label>Rent amount (₦)</Label><Input type="number" min="0" step="0.01" value={form.rent_amount} onChange={e => setForm(f => ({ ...f, rent_amount: e.target.value }))} data-testid="unit-rent" placeholder="Not set" className="mt-1.5" /><p className="text-xs text-slate-500 mt-1">This does not change tenant rent invoices or payment history.</p></div>
            <div><Label>Rent frequency</Label><Select value={form.rent_frequency} onValueChange={v => setForm(f => ({ ...f, rent_frequency: v }))}><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent>{frequencies.map(v => <SelectItem key={v} value={v}>{v.replace("_", " ")}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Status</Label><Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}><SelectTrigger className="mt-1.5" data-testid="unit-status"><SelectValue /></SelectTrigger><SelectContent>{statuses.map(v => <SelectItem key={v} value={v}>{v.replace("_", " ")}</SelectItem>)}</SelectContent></Select><p className="text-xs text-slate-500 mt-1">Units with active tenants cannot be marked vacant.</p></div>
            <DialogFooter><Button disabled={saving} type="submit" data-testid="save-unit" className="bg-emerald-600 hover:bg-emerald-700 text-white">{saving ? "Saving…" : "Save apartment"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
