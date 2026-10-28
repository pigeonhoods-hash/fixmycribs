import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Archive, ArrowRight, Wallet, FileText, Clock } from "lucide-react";
import { formatNaira, formatDate } from "@/lib/format";
import StatusBadge from "@/components/StatusBadge";

export default function PastTenants() {
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    const { data } = await api.get("/tenants/archived");
    setItems(data);
  }, []);
  useEffect(() => { load(); }, [load]);

  const openDetail = async (t) => {
    const { data } = await api.get(`/tenants/archived/${t.id}`);
    setSelected(data);
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="tiny-label text-slate-700">History</div>
        <h1 className="font-display text-3xl font-bold tracking-tight mt-2">Past Tenants</h1>
        <p className="text-slate-500 mt-1">Archived and revoked tenants — kept separately so your active list stays clean. All their bills and history remain here.</p>
      </div>

      <div className="flex items-start gap-3 p-4 rounded-lg border border-amber-200 bg-amber-50" data-testid="retention-banner">
        <Clock className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
        <div className="text-sm">
          <div className="font-display font-bold text-amber-900">6-month retention policy</div>
          <p className="text-amber-800 mt-0.5">Past tenants are stored here for <span className="font-bold">6 months</span> from the date they were archived or revoked. After that, their records (rent history, bills, complaints) are <span className="font-bold">permanently deleted</span>. Export anything you need to keep before then.</p>
        </div>
      </div>

      {items.length === 0 ? (
        <Card className="p-12 border border-dashed border-slate-300 bg-white text-center">
          <Archive className="w-10 h-10 text-slate-300 mx-auto" />
          <div className="mt-3 font-display font-bold text-lg">No past tenants</div>
          <p className="text-slate-500 mt-1">When you archive or revoke a tenant, they move here with their full history.</p>
        </Card>
      ) : (
        <Card className="border border-slate-200 bg-white overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead>Name</TableHead>
                <TableHead>Apartment</TableHead>
                <TableHead>Property</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Rent (paid / expected)</TableHead>
                <TableHead>Bills (paid / expected)</TableHead>
                <TableHead>Outstanding</TableHead>
                <TableHead>Purge in</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((t) => (
                <TableRow key={t.id} data-testid={`past-tenant-${t.id}`}>
                  <TableCell><div className="font-medium">{t.full_name}</div><div className="text-xs text-slate-500">{t.email || t.phone || "—"}</div></TableCell>
                  <TableCell>{t.apartment_number || "—"}</TableCell>
                  <TableCell className="text-slate-600">{t.property_name}</TableCell>
                  <TableCell><span className={`text-xs px-2 py-0.5 rounded capitalize ${t.status === "archived" ? "bg-slate-100 text-slate-700" : "bg-red-100 text-red-800"}`}>{t.status.replace(/_/g, " ")}</span></TableCell>
                  <TableCell className="text-sm">{formatNaira(t.rent_paid)} / {formatNaira(t.rent_expected)}</TableCell>
                  <TableCell className="text-sm">{formatNaira(t.bills_paid)} / {formatNaira(t.bills_expected)}</TableCell>
                  <TableCell className={`font-medium ${t.total_outstanding > 0 ? "text-red-600" : "text-emerald-700"}`}>{formatNaira(t.total_outstanding)}</TableCell>
                  <TableCell className="text-xs">
                    {t.days_until_purge == null ? <span className="text-slate-400">—</span> : t.days_until_purge <= 0 ? <span className="text-red-600 font-semibold">Purging soon</span> : <span className={`${t.days_until_purge < 30 ? "text-red-600" : t.days_until_purge < 60 ? "text-amber-700" : "text-slate-600"} font-medium`}>{t.days_until_purge} days</span>}
                  </TableCell>
                  <TableCell><Button size="sm" variant="outline" onClick={() => openDetail(t)} data-testid={`open-past-${t.id}`}>View <ArrowRight className="w-3 h-3 ml-1" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="font-display text-2xl">{selected.full_name}</DialogTitle>
              </DialogHeader>
              <div className="text-xs text-slate-500">{selected.apartment_number} · {selected.property?.name} · <span className="capitalize">{selected.status.replace(/_/g, " ")}</span></div>

              <div className="mt-4 grid sm:grid-cols-2 gap-3 text-sm">
                <div className="p-3 border border-slate-200 rounded"><div className="tiny-label text-slate-500">Email</div><div className="font-medium">{selected.email || "—"}</div></div>
                <div className="p-3 border border-slate-200 rounded"><div className="tiny-label text-slate-500">Phone</div><div className="font-medium">{selected.phone || "—"}</div></div>
                <div className="p-3 border border-slate-200 rounded"><div className="tiny-label text-slate-500">Lease period</div><div className="font-medium">{selected.lease_start || "—"} → {selected.lease_end || "—"}</div></div>
                <div className="p-3 border border-slate-200 rounded"><div className="tiny-label text-slate-500">Rent amount</div><div className="font-medium">{formatNaira(selected.rent_amount)} / {selected.rent_frequency}</div></div>
              </div>

              <div className="mt-6">
                <div className="flex items-center gap-2 mb-2"><Wallet className="w-4 h-4 text-emerald-700" /><div className="tiny-label">Rent records</div></div>
                {selected.rent_records.length === 0 ? <div className="text-sm text-slate-500 py-2">No rent records.</div> : (
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded">
                    {selected.rent_records.map((r) => (
                      <div key={r.id} className="p-3 grid grid-cols-4 items-center gap-2 text-sm">
                        <div>{formatDate(r.due_date)}</div>
                        <div>{formatNaira(r.amount_due)}</div>
                        <div className="text-emerald-700">Paid: {formatNaira(r.amount_paid)}</div>
                        <div className="text-right"><StatusBadge status={r.status} /></div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-6">
                <div className="flex items-center gap-2 mb-2"><FileText className="w-4 h-4 text-orange-700" /><div className="tiny-label">Utility bills</div></div>
                {selected.bills.length === 0 ? <div className="text-sm text-slate-500 py-2">No bills.</div> : (
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded">
                    {selected.bills.map((b) => (
                      <div key={b.id} className="p-3 flex items-center justify-between text-sm">
                        <div>
                          <div className="font-medium">{b.title}</div>
                          <div className="text-xs text-slate-500 capitalize">{b.bill_type.replace(/_/g, " ")} · Due {formatDate(b.due_date)}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-medium">{formatNaira(b.amount_due)}</div>
                          <div className={`text-xs capitalize font-semibold ${b.status === "paid" ? "text-emerald-700" : "text-red-600"}`}>{b.status.replace(/_/g, " ")}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {selected.complaints.length > 0 && (
                <div className="mt-6">
                  <div className="tiny-label mb-2">Complaints raised</div>
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded">
                    {selected.complaints.map((c) => (
                      <div key={c.id} className="p-3 text-sm"><span className="font-medium">{c.title}</span> <span className="text-xs text-slate-500 capitalize">— {c.status.replace(/_/g, " ")} · {formatDate(c.created_at)}</span></div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
