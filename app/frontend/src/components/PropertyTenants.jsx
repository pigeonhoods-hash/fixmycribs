import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Users, Pencil, Search, Archive } from "lucide-react";
import { formatNaira } from "@/lib/format";
import TenantQuickEdit from "@/components/TenantQuickEdit";

export default function PropertyTenants({ property, onUpdated }) {
  const [tab, setTab] = useState("current");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(null);
  const tenants = property.tenants || [];
  const current = tenants.filter(t => t.status === "active");
  const past = tenants.filter(t => t.status !== "active");
  const visible = useMemo(() => {
    const list = tab === "current" ? current : past;
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(t => [t.full_name, t.apartment_number, t.phone, t.email]
      .some(s => String(s || "").toLowerCase().includes(q)));
  }, [tenants, query, tab]);

  return (
    <>
      <Card className="p-5 md:p-6 border border-slate-200 bg-white" data-testid="property-occupants">
        <div className="flex flex-wrap justify-between items-start gap-3">
          <div><div className="flex items-center gap-2"><Users className="w-4 h-4 text-emerald-700" /><h2 className="font-semibold">Tenants and occupancy</h2></div>
            <p className="text-sm text-slate-500 mt-1">Current occupants are separate from past tenant history.</p></div>
          <Link className="text-sm text-emerald-700 hover:underline" to={"/dashboard/tenants?property=" + encodeURIComponent(property.id)}>Manage all current tenants</Link>
        </div>
        <div className="flex flex-wrap gap-2 mt-4" role="tablist" aria-label="Tenant occupancy">
          <button type="button" role="tab" aria-selected={tab === "current"} onClick={() => setTab("current")}
            data-testid="property-current-tenants"
            className={"rounded-lg px-3 py-2 text-sm font-semibold border " + (tab === "current" ? "bg-emerald-50 border-emerald-300 text-emerald-800" : "bg-white border-slate-200 text-slate-600")}>
            Current tenants ({current.length})
          </button>
          <button type="button" role="tab" aria-selected={tab === "past"} onClick={() => setTab("past")}
            data-testid="property-past-tenants"
            className={"rounded-lg px-3 py-2 text-sm font-semibold border " + (tab === "past" ? "bg-emerald-50 border-emerald-300 text-emerald-800" : "bg-white border-slate-200 text-slate-600")}>
            Past / inactive tenants ({past.length})
          </button>
        </div>
        <div className="relative mt-4 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input className="pl-9" placeholder="Find by tenant, apartment, email or phone" value={query} onChange={e => setQuery(e.target.value)} data-testid="property-tenant-search" />
        </div>
        <div className="mt-4">
          {visible.length === 0 ? <div className="py-8 text-center text-sm text-slate-500">
            {query.trim() ? "No matching records in this category." : (tab === "current" ? "No tenants currently marked active in this estate." : "No past tenant records for this estate.")}
          </div> : (
            <div className="divide-y divide-slate-100">
              {visible.map(t => (
                <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 py-3" data-testid={"property-tenant-" + t.id}>
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900">{t.full_name || "Name not provided"}</div>
                    <div className="text-sm text-slate-600">
                      Apartment: <span className="font-semibold">{t.apartment_number || "Not assigned"}</span>
                      {" · "}{t.rent_amount == null ? "Rent awaiting reconciliation" : formatNaira(t.rent_amount)}
                    </div>
                    <div className="text-xs text-slate-500">{tab === "current" ? (t.phone || t.email || "No contact recorded") : ("Status: " + String(t.status || "inactive").replaceAll("_", " "))}</div>
                  </div>
                  <div className="flex gap-2 items-center">
                    {tab === "current" ? (
                      <Link to={"/dashboard/tenants/" + t.id} className="text-sm text-emerald-700 hover:underline">Open tenant</Link>
                    ) : (
                      <span className="text-xs text-slate-500 flex gap-1 items-center"><Archive className="w-3 h-3" /> Historical</span>
                    )}
                    <Button type="button" size="sm" variant="outline" onClick={() => setEditing(t)} data-testid={"property-edit-tenant-" + t.id}>
                      <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <p className="text-xs text-slate-500 mt-4 border-t pt-3">
          The current list uses accounts marked active; historical records are not treated as current occupants. If a tenant has moved out but is still marked active, update their status through tenant management. Archived profiles may be subject to the application's retention policy.
        </p>
      </Card>
      <TenantQuickEdit tenant={editing} open={!!editing} onOpenChange={value => { if (!value) setEditing(null); }} onSaved={onUpdated} />
    </>
  );
}
