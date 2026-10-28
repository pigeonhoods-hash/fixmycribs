import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Users, Home } from "lucide-react";
import { formatNaira } from "@/lib/format";
import StatusBadge from "@/components/StatusBadge";

export default function PropertyDetail() {
  const { id } = useParams();
  const [prop, setProp] = useState(null);

  useEffect(() => {
    api.get(`/properties/${id}`).then((r) => setProp(r.data)).catch(() => {});
  }, [id]);

  if (!prop) return <div className="text-slate-500">Loading…</div>;

  return (
    <div className="space-y-6">
      <Link to="/dashboard/properties" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
        <ArrowLeft className="w-4 h-4" /> Back to properties
      </Link>
      <div>
        <div className="tiny-label text-emerald-700">{prop.type}</div>
        <h1 className="font-display text-3xl font-bold tracking-tight mt-2">{prop.name}</h1>
        <p className="text-slate-500 mt-1">{prop.address}{prop.city ? `, ${prop.city}` : ""}{prop.state ? `, ${prop.state}` : ""}</p>
      </div>

      {prop.capacity > 0 && (
        <Card className="p-5 border border-slate-200 bg-white" data-testid="property-detail-occupancy">
          <div className="flex items-center justify-between">
            <div className="tiny-label text-emerald-700">Occupancy</div>
            <div className="text-sm text-slate-500">{prop.active_tenant_count}/{prop.capacity} {prop.capacity_type}</div>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <div className="h-2.5 flex-1 rounded-full bg-slate-100 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${(prop.occupancy_pct ?? 0) >= 90 ? "bg-red-500" : (prop.occupancy_pct ?? 0) >= 70 ? "bg-orange-500" : (prop.occupancy_pct ?? 0) >= 40 ? "bg-emerald-500" : "bg-blue-500"}`}
                style={{ width: `${Math.min(100, prop.occupancy_pct ?? 0)}%` }}
              />
            </div>
            <div className="font-display text-2xl font-bold text-slate-900">{prop.occupancy_pct ?? 0}%</div>
          </div>
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="p-6 border border-slate-200 bg-white">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-emerald-700" />
            <div className="tiny-label">Tenants</div>
          </div>
          <div className="mt-4">
            {prop.tenants.length === 0 ? (
              <div className="text-sm text-slate-500 py-4">No tenants yet in this property.</div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {prop.tenants.map((t) => (
                  <li key={t.id} className="py-3 flex items-center justify-between">
                    <div>
                      <Link to={`/dashboard/tenants/${t.id}`} className="font-medium hover:text-emerald-700">{t.full_name}</Link>
                      <div className="text-xs text-slate-500">{formatNaira(t.rent_amount)} • {t.rent_frequency}</div>
                    </div>
                    <StatusBadge status={t.status} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        <Card className="p-6 border border-slate-200 bg-white">
          <div className="flex items-center gap-2">
            <Home className="w-4 h-4 text-emerald-700" />
            <div className="tiny-label">Notes</div>
          </div>
          <p className="mt-4 text-sm text-slate-600 whitespace-pre-wrap">{prop.notes || "No notes."}</p>
        </Card>
      </div>
    </div>
  );
}
