import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { Bell, Sparkles } from "lucide-react";

const chanCls = (c) => ({
  whatsapp: "bg-emerald-100 text-emerald-800 border-emerald-300",
  sms: "bg-blue-100 text-blue-800 border-blue-300",
  email: "bg-slate-100 text-slate-800 border-slate-300",
  in_app: "bg-orange-100 text-orange-800 border-orange-300",
}[c] || "bg-slate-100 text-slate-700 border-slate-300");

export default function Reminders() {
  const [items, setItems] = useState([]);
  useEffect(() => { api.get("/reminders").then((r) => setItems(r.data)); }, []);

  return (
    <div className="space-y-6">
      <div>
        <div className="tiny-label text-orange-700">Automation log</div>
        <h1 className="font-display text-3xl font-bold tracking-tight mt-2">Reminders</h1>
        <p className="text-slate-500 mt-1">Every rent reminder logged across tenants.</p>
      </div>

      {items.length === 0 ? (
        <Card className="p-12 border border-dashed border-slate-300 bg-white text-center">
          <Bell className="w-10 h-10 text-slate-300 mx-auto" />
          <div className="mt-3 font-display font-bold text-lg">No reminders sent</div>
          <p className="text-slate-500 mt-1">Open any tenant profile and generate an AI reminder to log it here.</p>
        </Card>
      ) : (
        <Card className="border border-slate-200 bg-white overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead>Tenant</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Tone</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>Sent at</TableHead>
                <TableHead>AI</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.tenant_name}</TableCell>
                  <TableCell><span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold border capitalize ${chanCls(r.channel)}`}>{r.channel}</span></TableCell>
                  <TableCell className="capitalize text-slate-600">{r.tone}</TableCell>
                  <TableCell className="max-w-md truncate text-slate-700">{r.message}</TableCell>
                  <TableCell className="text-slate-500 text-sm">{formatDate(r.sent_at)}</TableCell>
                  <TableCell>{r.ai_generated ? <Sparkles className="w-4 h-4 text-orange-600" /> : null}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
