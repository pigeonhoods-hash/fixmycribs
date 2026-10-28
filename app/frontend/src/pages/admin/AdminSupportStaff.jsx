import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Shield, UserPlus, RefreshCw } from "lucide-react";

const initial = { full_name: "", email: "", phone: "", password: "", role: "support" };

export default function AdminSupportStaff() {
  const [staff, setStaff] = useState([]);
  const [form, setForm] = useState(initial);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      setError("");
      const { data } = await api.get("/admin/users?role=support");
      setStaff(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.response?.data?.detail || "Could not load support users");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async (e) => {
    e.preventDefault();
    if (submitting) return;
    if (form.password.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    setSubmitting(true);
    try {
      await api.post("/admin/support-users", form);
      toast.success("Support account created");
      setForm(initial);
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not create support user");
    } finally { setSubmitting(false); }
  };

  const updateStatus = async (person) => {
    try {
      const suspended = person.account_status === "suspended";
      await api.post(`/admin/users/${person.id}/${suspended ? "restore" : "suspend"}`);
      toast.success(suspended ? "Support account restored" : "Support account suspended");
      await load();
    } catch (e) { toast.error(e.response?.data?.detail || "Could not update account"); }
  };
  const fieldClass = "w-full rounded-md bg-slate-950 border border-slate-600 px-3 py-2.5 text-white placeholder:text-slate-500 focus:outline-none focus:border-orange-500";

  return (
    <div className="space-y-6 max-w-5xl" data-testid="admin-support-staff">
      <div>
        <div className="text-xs font-semibold uppercase tracking-widest text-orange-400">Platform administration</div>
        <h1 className="font-display text-3xl font-bold mt-2 flex items-center gap-2"><Shield className="text-orange-400" /> Support Staff</h1>
        <p className="text-slate-400 text-sm mt-2">Create and manage support agents. Support agents use the separate /support portal.</p>
      </div>
      <div className="rounded-xl bg-slate-800 border border-slate-700 p-5">
        <h2 className="font-semibold flex items-center gap-2 mb-4"><UserPlus className="w-5 h-5 text-orange-400" /> Create support account</h2>
        <form className="grid grid-cols-1 md:grid-cols-2 gap-4" onSubmit={create}>
          <label className="text-sm text-slate-300">Full name<input className={fieldClass + " mt-1"} required value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} /></label>
          <label className="text-sm text-slate-300">Email<input type="email" autoComplete="off" className={fieldClass + " mt-1"} required value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></label>
          <label className="text-sm text-slate-300">Phone (optional)<input className={fieldClass + " mt-1"} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></label>
          <label className="text-sm text-slate-300">Temporary password<input type="password" autoComplete="new-password" minLength={8} className={fieldClass + " mt-1"} required value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} /></label>
          <div className="md:col-span-2"><button type="submit" disabled={submitting} className="rounded-md bg-orange-600 hover:bg-orange-500 disabled:opacity-50 px-5 py-2.5 font-semibold text-white">{submitting ? "Creating..." : "Create support user"}</button></div>
        </form>
      </div>
      <div className="rounded-xl bg-slate-800 border border-slate-700 p-5">
        <div className="flex items-center justify-between gap-3 mb-4"><h2 className="font-semibold">Existing support staff ({staff.length})</h2><button onClick={load} className="text-slate-300 hover:text-white flex gap-2 items-center text-sm"><RefreshCw className="w-4 h-4" /> Refresh</button></div>
        {loading ? <p className="text-slate-400">Loading...</p> : error ? <p className="text-red-300">{error}</p> : staff.length === 0 ? <p className="text-slate-400">No support accounts yet. Create one above.</p> : (
          <div className="divide-y divide-slate-700">
            {staff.map(person => <div key={person.id} className="flex flex-wrap justify-between items-center gap-3 py-3">
              <div><div className="font-medium">{person.full_name}</div><div className="text-sm text-slate-400">{person.email}</div><div className="text-xs text-slate-400 mt-1">{person.account_status || "active"}</div></div>
              <button onClick={() => updateStatus(person)} className="border border-slate-600 rounded-md px-3 py-2 text-sm hover:bg-slate-700">{person.account_status === "suspended" ? "Restore access" : "Suspend access"}</button>
            </div>)}
          </div>
        )}
      </div>
    </div>
  );
}
