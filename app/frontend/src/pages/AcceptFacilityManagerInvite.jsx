import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { HardHat } from "lucide-react";
import PasswordChecklist from "@/components/PasswordChecklist";
import { isStrongPassword, formatApiError, PASSWORD_POLICY_TEXT } from "@/lib/password";

export default function AcceptFacilityManagerInvite() {
  const { token } = useParams();
  const { setSession } = useAuth();
  const nav = useNavigate();
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ full_name: "", password: "", confirm: "", phone: "" });

  useEffect(() => {
    api.get(`/fm-invites/${token}`).then((r) => {
      setInfo(r.data);
      setForm((f) => ({ ...f, full_name: r.data.full_name || "" }));
    }).catch((e) => setErr(formatApiError(e.response?.data?.detail, "Invite invalid or expired")));
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    if (!isStrongPassword(form.password)) return toast.error(PASSWORD_POLICY_TEXT);
    if (form.password !== form.confirm) return toast.error("Passwords do not match");
    setLoading(true);
    try {
      const { data } = await api.post(`/fm-invites/${token}/accept`, {
        full_name: form.full_name, password: form.password, phone: form.phone,
      });
      setSession(data.token, data.user);
      toast.success("Welcome!");
      nav("/facility-manager");
    } catch (er) { toast.error(formatApiError(er.response?.data?.detail, "Failed")); }
    finally { setLoading(false); }
  };

  if (err) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
        <Card className="w-full max-w-md p-8 border border-slate-200 bg-white text-center">
          <div className="text-4xl">⚠️</div>
          <h2 className="font-display text-2xl font-bold mt-4">Invite unavailable</h2>
          <p className="text-slate-500 mt-2">{err}</p>
          <Link to="/login" className="mt-6 inline-block text-blue-700 font-semibold hover:underline">Back to login</Link>
        </Card>
      </div>
    );
  }
  if (!info) return <div className="min-h-screen flex items-center justify-center text-slate-500">Loading invite…</div>;

  return (
    <div className="min-h-screen grid md:grid-cols-2 bg-slate-50">
      <div className="hidden md:flex flex-col justify-between p-12 bg-slate-900 text-white">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md bg-blue-600 text-white grid place-items-center"><HardHat className="w-4 h-4" /></div>
          <span className="font-display font-bold text-lg">FixMyCribs Field</span>
        </Link>
        <div>
          <div className="tiny-label text-blue-400">Facility manager invitation</div>
          <h1 className="font-display text-4xl lg:text-5xl font-black tracking-tighter mt-4">Welcome to the field, {info.full_name}!</h1>
          <div className="mt-6 text-slate-300">Invited by <span className="font-semibold text-white">{info.landlord_name}</span> to handle maintenance for their properties.</div>
        </div>
        <div className="text-sm text-slate-400">Set your own password below to get started.</div>
      </div>
      <div className="flex items-center justify-center p-6">
        <Card className="w-full max-w-md p-8 border border-slate-200 bg-white">
          <h2 className="font-display text-3xl font-bold tracking-tight">Create your access</h2>
          <p className="text-slate-500 mt-1">Signing in as <span className="font-semibold text-slate-900">{info.email}</span></p>
          <form className="mt-8 space-y-4" onSubmit={submit}>
            <div><Label>Full name</Label><Input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="mt-1.5" data-testid="fm-invite-name" /></div>
            <div><Label>Phone (optional)</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1.5" placeholder="+234…" /></div>
            <div><Label>Password</Label><PasswordInput required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="mt-1.5" data-testid="fm-invite-password" /><PasswordChecklist password={form.password} /></div>
            <div><Label>Confirm password</Label><PasswordInput required minLength={8} value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} className="mt-1.5" data-testid="fm-invite-confirm" /></div>
            <Button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white h-11" data-testid="fm-invite-submit">{loading ? "Creating…" : "Create account & sign in"}</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
