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
  const [roster, setRoster] = useState("");
  const [preview, setPreview] = useState(null);
  const [importError, setImportError] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [importResult, setImportResult] = useState(null);

  async function runImport(commit) {
    setImportBusy(true);
    setImportError("");
    try {
      const payload = JSON.parse(roster);
      const response = await api.post(`/properties/${id}/roster-import?dry_run=${!commit}`, payload);
      if (commit) {
        setImportResult(response.data);
        setPreview(null);
        const updated = await api.get(`/properties/${id}`);
        setProp(updated.data);
      } else {
        setPreview(response.data);
      }
    } catch (err) {
      setImportError(err.response?.data?.detail || err.message || "Import failed");
      setPreview(null);
    } finally {
      setImportBusy(false);
    }
  }

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
        <Link to={`/dashboard/imported-records?property=${id}`} className="inline-block mt-2 text-sm text-emerald-700 underline">Receipt and utility history</Link>
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
                      <div className="text-xs text-slate-500">{t.rent_amount == null ? "Rent awaiting reconciliation" : `${formatNaira(t.rent_amount)} • ${t.rent_frequency || ""}`}</div>
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
      <Card className="p-6 border border-slate-200 bg-white">
        <h2 className="font-semibold">Apartments and units</h2>
        <div className="overflow-x-auto mt-3">
          <table className="w-full text-sm text-left">
            <thead><tr><th className="p-2">Unit</th><th className="p-2">Status</th><th className="p-2">Occupant</th></tr></thead>
            <tbody>{(prop.units || []).map((unit) => <tr key={unit.id} className="border-t"><td className="p-2">{unit.unit_number || unit.unit_name}</td><td className="p-2">{unit.status}</td><td className="p-2">{prop.tenants.find(t => t.unit_id === unit.id && t.status === "active")?.full_name || "—"}</td></tr>)}</tbody>
          </table>
        </div>
      </Card>
      <Card className="p-6 border border-slate-200 bg-white space-y-3">
        <h2 className="font-semibold">Import existing occupancy records</h2>
        <p className="text-sm text-slate-600">Adds units and occupants without sending invitations or creating rent charges. Unknown rent and lease dates remain unentered. Existing records are preserved.</p>
        <label htmlFor="roster-json" className="block text-sm font-medium">Roster JSON</label>
        <textarea id="roster-json" className="w-full h-36 border rounded-lg p-3 font-mono text-xs" value={roster} onChange={e => { setRoster(e.target.value); setPreview(null); setImportResult(null); }} placeholder={'{"source":"Tenant register","as_of":"2026-10-30","rows":[{"unit_number":"1A","occupant_name":"","source_row":"1"}]}'} />
        {importError && <p role="alert" className="text-sm text-red-700">{String(importError)}</p>}
        {preview && <p role="status" className="text-sm">Preview: {preview.units_to_add} units and {preview.tenants_to_add} occupants to add. {preview.already_imported} already imported. No invitations or financial entries.</p>}
        {importResult && <p role="status" className="text-sm text-emerald-700">Import complete: {importResult.units_to_add} units and {importResult.tenants_to_add} occupants added. {importResult.already_imported} already imported. Rent and payments still require reconciliation.</p>}
        <div className="flex gap-3"><Button disabled={importBusy || !roster.trim()} onClick={() => runImport(false)}>Preview roster</Button><Button disabled={importBusy || !preview} onClick={() => runImport(true)}>Import reviewed roster</Button></div>
      </Card>
    </div>
  );
}

