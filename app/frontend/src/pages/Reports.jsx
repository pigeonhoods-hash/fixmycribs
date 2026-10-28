import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNaira } from "@/lib/format";
import { BarChart3 } from "lucide-react";

export default function Reports() {
  const [items, setItems] = useState([]);
  useEffect(() => { api.get("/reports/summary").then((r) => setItems(r.data)); }, []);

  const totals = items.reduce((acc, r) => {
    acc.expected += r.expected; acc.collected += r.collected; acc.outstanding += r.outstanding;
    return acc;
  }, { expected: 0, collected: 0, outstanding: 0 });

  return (
    <div className="space-y-6">
      <div>
        <div className="tiny-label text-emerald-700">Insights</div>
        <h1 className="font-display text-3xl font-bold tracking-tight mt-2">Reports</h1>
        <p className="text-slate-500 mt-1">Property-level performance and totals.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Card className="p-6 border border-slate-200 bg-white">
          <div className="tiny-label">Total expected</div>
          <div className="font-display text-2xl font-bold mt-2">{formatNaira(totals.expected)}</div>
        </Card>
        <Card className="p-6 border border-emerald-200 bg-emerald-50">
          <div className="tiny-label text-emerald-700">Total collected</div>
          <div className="font-display text-2xl font-bold mt-2 text-emerald-800">{formatNaira(totals.collected)}</div>
        </Card>
        <Card className="p-6 border border-red-200 bg-red-50">
          <div className="tiny-label text-red-700">Outstanding</div>
          <div className="font-display text-2xl font-bold mt-2 text-red-800">{formatNaira(totals.outstanding)}</div>
        </Card>
      </div>

      {items.length === 0 ? (
        <Card className="p-12 border border-dashed border-slate-300 bg-white text-center">
          <BarChart3 className="w-10 h-10 text-slate-300 mx-auto" />
          <div className="mt-3 font-display font-bold text-lg">No data to report yet</div>
        </Card>
      ) : (
        <Card className="border border-slate-200 bg-white overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead>Property</TableHead>
                <TableHead>Tenants</TableHead>
                <TableHead>Expected</TableHead>
                <TableHead>Collected</TableHead>
                <TableHead>Outstanding</TableHead>
                <TableHead>Collection %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((r) => {
                const pct = r.expected ? Math.round((r.collected / r.expected) * 100) : 0;
                return (
                  <TableRow key={r.property_id}>
                    <TableCell className="font-medium">{r.property_name}</TableCell>
                    <TableCell>{r.tenant_count}</TableCell>
                    <TableCell>{formatNaira(r.expected)}</TableCell>
                    <TableCell className="text-emerald-700">{formatNaira(r.collected)}</TableCell>
                    <TableCell className="text-red-700">{formatNaira(r.outstanding)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <div className="h-full bg-emerald-600" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs font-medium">{pct}%</span>
                      </div>
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
