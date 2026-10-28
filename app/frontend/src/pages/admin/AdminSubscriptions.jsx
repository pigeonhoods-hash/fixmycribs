import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "react-router-dom";

export default function AdminSubscriptions() {
  const [subs, setSubs] = useState([]);
  useEffect(() => { api.get("/admin/subscriptions").then((r) => setSubs(r.data)); }, []);

  return (
    <div className="space-y-6">
      <div>
        <div className="tiny-label text-orange-400">Revenue</div>
        <h1 className="font-display text-3xl font-bold tracking-tight mt-2">Subscriptions</h1>
      </div>
      <Card className="border border-slate-700 bg-slate-800/60 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-900/50 border-slate-700">
              <TableHead className="text-slate-300">Owner</TableHead>
              <TableHead className="text-slate-300">Plan</TableHead>
              <TableHead className="text-slate-300">Status</TableHead>
              <TableHead className="text-slate-300">Provider</TableHead>
              <TableHead className="text-slate-300">Period end</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {subs.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-slate-400 py-8">No subscriptions yet.</TableCell></TableRow>}
            {subs.map((s) => (
              <TableRow key={s.id} className="border-slate-700 hover:bg-slate-800" data-testid={`admin-sub-${s.owner_id}`}>
                <TableCell><Link to={`/admin/users/${s.owner_id}`} className="text-white hover:text-orange-400"><div className="font-medium">{s.owner_name || "—"}</div><div className="text-xs text-slate-400">{s.owner_email}</div></Link></TableCell>
                <TableCell className="capitalize text-slate-200">{s.plan}</TableCell>
                <TableCell><span className={`text-xs capitalize font-semibold ${s.status === "active" ? "text-emerald-400" : s.status === "gifted" ? "text-orange-400" : "text-slate-400"}`}>{s.status}</span></TableCell>
                <TableCell className="capitalize text-slate-300">{s.payment_provider}</TableCell>
                <TableCell className="text-slate-300">{s.current_period_end ? new Date(s.current_period_end).toLocaleDateString() : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
