import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useConfirm } from "@/components/ConfirmDialog";
import { Plus, Building2, Trash2 } from "lucide-react";

const PROPERTY_TYPES = ["Apartment", "Flat", "Duplex", "Bungalow", "Self-contained", "Mini flat", "Office space", "Shop", "Warehouse", "Estate unit", "Commercial unit", "Other"];
const CAPACITY_TYPES = [
  { value: "occupants", label: "Occupants" },
  { value: "beds", label: "Beds" },
  { value: "flats", label: "Flats" },
  { value: "rooms", label: "Rooms" },
  { value: "units", label: "Units" },
];

function occColor(pct) {
  if (pct == null) return "bg-slate-300";
  if (pct >= 90) return "bg-red-500";
  if (pct >= 70) return "bg-orange-500";
  if (pct >= 40) return "bg-emerald-500";
  return "bg-blue-500";
}

export default function Properties() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", type: "Apartment", address: "", city: "", state: "", country: "Nigeria", notes: "", capacity_type: "occupants", capacity: "" });
  const [saving, setSaving] = useState(false);
  const [confirm, ConfirmDialog] = useConfirm();

  const load = useCallback(() => api.get("/properties").then((r) => setItems(r.data)), []);
  useEffect(() => { load(); }, [load]);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/properties", { ...form, capacity: parseInt(form.capacity || 0, 10) || 0 });
      toast.success("Property added");
      setOpen(false);
      setForm({ name: "", type: "Apartment", address: "", city: "", state: "", country: "Nigeria", notes: "", capacity_type: "occupants", capacity: "" });
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to add property");
    } finally { setSaving(false); }
  };

  const del = async (id) => {
    const ok = await confirm({
      title: "Delete this property?",
      description: "Tenants & units associated with this property will be affected. This action cannot be undone.",
      confirmText: "Delete property",
      destructive: true,
    });
    if (!ok) return;
    await api.delete(`/properties/${id}`);
    toast.success("Property deleted");
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="tiny-label text-emerald-700">Portfolio</div>
          <h1 className="font-display text-3xl font-bold tracking-tight mt-2">Properties</h1>
          <p className="text-slate-500 mt-1">Manage all your rental properties.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="add-property-button" className="bg-emerald-600 hover:bg-emerald-700 text-white">
              <Plus className="w-4 h-4 mr-1.5" /> Add property
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="font-display text-2xl">Add new property</DialogTitle>
            </DialogHeader>
            <form onSubmit={submit} className="space-y-4">
              <div>
                <Label>Property name</Label>
                <Input required data-testid="property-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Lekki Phase 1 Apartment" className="mt-1.5" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Type</Label>
                  <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                    <SelectTrigger data-testid="property-type" className="mt-1.5"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PROPERTY_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>City</Label>
                  <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Lagos" className="mt-1.5" />
                </div>
              </div>
              <div>
                <Label>Address</Label>
                <Input required value={form.address} data-testid="property-address" onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="12 Admiralty Way" className="mt-1.5" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>State</Label>
                  <Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} className="mt-1.5" />
                </div>
                <div>
                  <Label>Country</Label>
                  <Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} className="mt-1.5" />
                </div>
              </div>
              <div>
                <Label>Capacity</Label>
                <div className="grid grid-cols-2 gap-3 mt-1.5">
                  <Input
                    type="number" min="0"
                    data-testid="property-capacity"
                    value={form.capacity}
                    onChange={(e) => setForm({ ...form, capacity: e.target.value })}
                    placeholder="e.g. 10"
                  />
                  <Select value={form.capacity_type} onValueChange={(v) => setForm({ ...form, capacity_type: v })}>
                    <SelectTrigger data-testid="property-capacity-type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CAPACITY_TYPES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-slate-500 mt-1">How many {form.capacity_type} this property can hold. Used to show occupancy level.</p>
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1.5" rows={2} />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={saving} data-testid="property-submit" className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  {saving ? "Saving…" : "Add property"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {items.length === 0 ? (
        <Card className="p-12 border border-dashed border-slate-300 bg-white text-center">
          <Building2 className="w-10 h-10 text-slate-300 mx-auto" />
          <div className="mt-3 font-display font-bold text-lg">No properties yet</div>
          <p className="text-slate-500 mt-1">Add your first property to start tracking rent.</p>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((p) => (
            <Card key={p.id} className="p-5 border border-slate-200 bg-white hover:border-emerald-300 hover:-translate-y-0.5 transition-all duration-200" data-testid={`property-card-${p.id}`}>
              <div className="flex items-start justify-between">
                <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-700 grid place-items-center">
                  <Building2 className="w-5 h-5" strokeWidth={1.75} />
                </div>
                <button onClick={() => del(p.id)} className="text-slate-400 hover:text-red-600" data-testid={`delete-property-${p.id}`}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <Link to={`/dashboard/properties/${p.id}`} className="block mt-4">
                <div className="font-display font-bold text-lg tracking-tight">{p.name}</div>
                <div className="text-sm text-slate-500 mt-0.5">{p.type} • {p.city || p.state || p.address}</div>
                <div className="mt-4 flex gap-4 text-sm">
                  <div><span className="font-bold text-slate-900">{p.tenant_count}</span> <span className="text-slate-500">tenants</span></div>
                  <div><span className="font-bold text-slate-900">{p.unit_count}</span> <span className="text-slate-500">units</span></div>
                </div>
                {p.capacity > 0 && (
                  <div className="mt-4" data-testid={`property-occupancy-${p.id}`}>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-slate-500">Occupancy · {p.active_tenant_count}/{p.capacity} {p.capacity_type}</span>
                      <span className="font-bold text-slate-900">{p.occupancy_pct ?? 0}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${occColor(p.occupancy_pct)}`} style={{ width: `${Math.min(100, p.occupancy_pct ?? 0)}%` }} />
                    </div>
                  </div>
                )}
              </Link>
            </Card>
          ))}
        </div>
      )}
      <ConfirmDialog />
    </div>
  );
}
