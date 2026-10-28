import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { useConfirm } from "@/components/ConfirmDialog";
import { Search, Ban, RotateCcw, Trash2 } from "lucide-react";

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [role, setRole] = useState("all");
  const [q, setQ] = useState("");
  const nav = useNavigate();
  const [confirm, ConfirmDialog] = useConfirm();

  const load = useCallback(async () => {
    const params = role === "all" ? "" : `?role=${role}`;
    const { data } = await api.get(`/admin/users${params}`);
    setUsers(data);
  }, [role]);
  useEffect(() => { load(); }, [load]);

  const suspend = async (u) => {
    const ok = await confirm({
      title: `Suspend ${u.email}?`,
      description: "They will lose access immediately. You can restore them later.",
      confirmText: "Suspend",
      destructive: true,
    });
    if (!ok) return;
    try { await api.post(`/admin/users/${u.id}/suspend`); toast.success("Suspended"); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };
  const restore = async (u) => {
    try { await api.post(`/admin/users/${u.id}/restore`); toast.success("Restored"); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };
  const remove = async (u) => {
    const ok = await confirm({
      title: `Permanently delete ${u.email}?`,
      description: "This cannot be undone.\n\nTenant records belonging to this user will be preserved, but their portal access will be revoked.",
      confirmText: "Delete forever",
      destructive: true,
    });
    if (!ok) return;
    try { await api.delete(`/admin/users/${u.id}`); toast.success("Deleted"); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  const filtered = users.filter((u) =>
    !q || u.email.toLowerCase().includes(q.toLowerCase()) || (u.full_name || "").toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="tiny-label text-orange-400">Accounts</div>
          <h1 className="font-display text-3xl font-bold tracking-tight mt-2">Users</h1>
        </div>
        <div className="flex gap-2 items-center">
          <div className="relative">
            <Search className="w-4 h-4 absolute top-2.5 left-2.5 text-slate-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search email or name" className="pl-8 w-64 bg-slate-800 border-slate-700 text-white placeholder:text-slate-500" data-testid="admin-user-search" />
          </div>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger className="w-48 bg-slate-800 border-slate-700 text-white" data-testid="admin-user-role-filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="owner">Owner</SelectItem>
              <SelectItem value="tenant">Tenant</SelectItem>
              <SelectItem value="support">Support</SelectItem>
              <SelectItem value="facility_manager">Facility manager</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card className="border border-slate-700 bg-slate-800/60 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-900/50 border-slate-700">
              <TableHead className="text-slate-300">Name</TableHead>
              <TableHead className="text-slate-300">Email</TableHead>
              <TableHead className="text-slate-300">Role</TableHead>
              <TableHead className="text-slate-300">Plan</TableHead>
              <TableHead className="text-slate-300">Status</TableHead>
              <TableHead className="text-right text-slate-300">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((u) => (
              <TableRow key={u.id} className="border-slate-700 hover:bg-slate-800 cursor-pointer" onClick={() => nav(`/admin/users/${u.id}`)} data-testid={`admin-user-row-${u.id}`}>
                <TableCell className="text-white"><Link to={`/admin/users/${u.id}`} className="hover:text-orange-400 font-medium">{u.full_name}</Link></TableCell>
                <TableCell className="text-slate-300">{u.email}</TableCell>
                <TableCell><span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-200 capitalize">{u.role}</span></TableCell>
                <TableCell><span className="text-xs capitalize text-slate-300">{u.plan || "—"} ({u.plan_status || "—"})</span></TableCell>
                <TableCell><span className={`text-xs capitalize font-semibold ${u.account_status === "active" ? "text-emerald-400" : u.account_status === "suspended" ? "text-orange-400" : "text-red-400"}`}>{u.account_status}</span></TableCell>
                <TableCell className="text-right">
                  <div className="inline-flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    {u.account_status === "active" ? (
                      <button onClick={() => suspend(u)} className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold bg-orange-500/15 text-orange-300 hover:bg-orange-500/25 border border-orange-500/30" data-testid={`suspend-${u.id}`}>
                        <Ban className="w-3.5 h-3.5" /> Suspend
                      </button>
                    ) : (
                      <button onClick={() => restore(u)} className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 border border-emerald-500/30" data-testid={`restore-${u.id}`}>
                        <RotateCcw className="w-3.5 h-3.5" /> Restore
                      </button>
                    )}
                    <button onClick={() => remove(u)} className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold bg-red-500/15 text-red-300 hover:bg-red-500/25 border border-red-500/30" data-testid={`delete-${u.id}`}>
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <ConfirmDialog />
    </div>
  );
}
