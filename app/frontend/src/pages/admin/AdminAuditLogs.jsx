import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function AdminAuditLogs() {
  const [logs, setLogs] = useState([]);
  useEffect(() => { api.get("/admin/audit-logs").then((r) => setLogs(r.data)); }, []);

  return (
    <div className="space-y-6">
      <div>
        <div className="tiny-label text-orange-400">Compliance</div>
        <h1 className="font-display text-3xl font-bold tracking-tight mt-2">Audit logs</h1>
        <p className="text-slate-400 mt-1">All admin-sensitive actions across the platform.</p>
      </div>
      <Card className="border border-slate-700 bg-slate-800/60 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-900/50 border-slate-700">
              <TableHead className="text-slate-300">When</TableHead>
              <TableHead className="text-slate-300">Actor</TableHead>
              <TableHead className="text-slate-300">Action</TableHead>
              <TableHead className="text-slate-300">Target</TableHead>
              <TableHead className="text-slate-300">Reason</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-slate-400 py-8">No audit logs yet.</TableCell></TableRow>}
            {logs.map((l) => (
              <TableRow key={l.id} className="border-slate-700 hover:bg-slate-800" data-testid={`audit-log-${l.id}`}>
                <TableCell className="text-slate-300 text-xs">{new Date(l.created_at).toLocaleString()}</TableCell>
                <TableCell className="text-slate-200 text-xs">{l.admin_email || l.admin_id || "system"}</TableCell>
                <TableCell><span className="text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-200">{l.action}</span></TableCell>
                <TableCell className="text-slate-300 text-xs">{l.target_type}: <span className="font-mono">{l.target_id?.slice(0, 12)}…</span></TableCell>
                <TableCell className="text-slate-400 text-xs">{l.reason || "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
