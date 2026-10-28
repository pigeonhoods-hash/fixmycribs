import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNaira, formatDate } from "@/lib/format";
import { AlertTriangle, Bell } from "lucide-react";

const severity = (days) => {
  if (days <= 3) return { label: "Soft", cls: "bg-amber-100 text-amber-800 border-amber-300" };
  if (days <= 7) return { label: "Firm", cls: "bg-orange-100 text-orange-800 border-orange-300" };
  if (days <= 14) return { label: "Strong", cls: "bg-red-100 text-red-800 border-red-300" };
  if (days <= 30) return { label: "Escalation", cls: "bg-red-200 text-red-900 border-red-400" };
  return { label: "Critical", cls: "bg-red-600 text-white border-red-700" };
};

export default function Overdue() {
  const [items, setItems] = useState([]);

  useEffect(() => { api.get("/rent-records/overdue").then((r) => setItems(r.data)); }, []);

  const totalOverdue = items.reduce((s, i) => s + (i.amount_due - i.amount_paid), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="tiny-label text-red-700">Attention required</div>
          <h1 className="font-display text-3xl font-bold tracking-tight mt-2">Overdue Tenants</h1>
          <p className="text-slate-500 mt-1">Tenants who missed their rent due date.</p>
        </div>
        <Card className="p-4 border border-red-200 bg-red-50">
          <div className="tiny-label text-red-700">Total overdue</div>
          <div className="font-display text-2xl font-bold text-red-800 mt-1">{formatNaira(totalOverdue)}</div>
        </Card>
      </div>

      {items.length === 0 ? (
        <Card className="p-12 border border-dashed border-emerald-300 bg-emerald-50 text-center">
          <div className="w-12 h-12 rounded-full bg-emerald-100 grid place-items-center mx-auto">✓</div>
          <div className="mt-3 font-display font-bold text-lg text-emerald-800">All rent paid on time</div>
          <p className="text-emerald-700 mt-1">No tenant is overdue at the moment. Great work.</p>
        </Card>
      ) : (
        <Card className="border border-slate-200 bg-white overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead>Tenant</TableHead>
                <TableHead>Property</TableHead>
                <TableHead>Due date</TableHead>
                <TableHead>Days overdue</TableHead>
                <TableHead>Balance</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((r) => {
                const sev = severity(r.days_overdue);
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.tenant?.full_name}</TableCell>
                    <TableCell className="text-slate-600">{r.property_name}</TableCell>
                    <TableCell>{formatDate(r.due_date)}</TableCell>
                    <TableCell><span className="font-display font-bold text-red-700">{r.days_overdue}</span> days</TableCell>
                    <TableCell className="font-medium">{formatNaira(r.amount_due - r.amount_paid)}</TableCell>
                    <TableCell><span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold border ${sev.cls}`}>{sev.label}</span></TableCell>
                    <TableCell className="text-right">
                      <Link to={`/dashboard/tenants/${r.tenant?.id}`}>
                        <Button size="sm" variant="outline" className="border-orange-300 text-orange-700 hover:bg-orange-50" data-testid={`overdue-action-${r.id}`}>
                          <Bell className="w-3.5 h-3.5 mr-1" /> Follow up
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
