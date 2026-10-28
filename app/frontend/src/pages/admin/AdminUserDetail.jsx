import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useConfirm } from "@/components/ConfirmDialog";
import { PasswordInput } from "@/components/ui/password-input";
import { ArrowLeft, Gift, X, Wrench, Ban, RotateCcw, Trash2, Save, KeyRound } from "lucide-react";

export default function AdminUserDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [user, setUser] = useState(null);
  const [gift, setGift] = useState({ months: 1, plan: "growth", reason: "" });
  const [manual, setManual] = useState({ plan: "growth", months: 1, reason: "" });
  const [profile, setProfile] = useState({ full_name: "", email: "", phone: "" });
  const [newPwd, setNewPwd] = useState("");
  const [confirm, ConfirmDialog] = useConfirm();

  const load = () => api.get(`/admin/users/${id}`).then((r) => {
    setUser(r.data);
    setProfile({ full_name: r.data.full_name || "", email: r.data.email || "", phone: r.data.phone || "" });
  });
  useEffect(() => { load(); }, [id]);

  const giftPlan = async () => {
    try {
      await api.post(`/admin/subscriptions/${id}/gift`, gift);
      toast.success(`Gifted ${gift.months} month(s) of ${gift.plan}`);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };
  const cancelPlan = async () => {
    const ok = await confirm({ title: "Cancel this user's plan?", description: "The user will be downgraded to Starter at end of period.", confirmText: "Cancel plan", destructive: true });
    if (!ok) return;
    try { await api.post(`/admin/subscriptions/${id}/cancel`); toast.success("Cancelled"); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };
  const manualUpgrade = async () => {
    try {
      await api.post(`/admin/subscriptions/${id}/manual-upgrade`, manual);
      toast.success(`Set plan to ${manual.plan}`);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };
  const saveProfile = async () => {
    try {
      await api.patch(`/admin/users/${id}`, profile);
      toast.success("Profile updated");
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };
  const resetPwd = async () => {
    if (newPwd.length < 8) return toast.error("Password must be at least 8 characters");
    const ok = await confirm({ title: `Reset password for ${user.email}?`, description: "The user will need this new password next time they log in.", confirmText: "Reset password", destructive: true });
    if (!ok) return;
    try {
      await api.post(`/admin/users/${id}/reset-password`, { new_password: newPwd });
      toast.success("Password reset");
      setNewPwd("");
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };
  const suspend = async () => {
    const ok = await confirm({ title: `Suspend ${user.email}?`, description: "They will lose access immediately. You can restore later.", confirmText: "Suspend", destructive: true });
    if (!ok) return;
    try { await api.post(`/admin/users/${id}/suspend`); toast.success("Suspended"); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };
  const restore = async () => {
    try { await api.post(`/admin/users/${id}/restore`); toast.success("Restored"); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };
  const remove = async () => {
    const ok = await confirm({ title: `Permanently delete ${user.email}?`, description: "This cannot be undone.", confirmText: "Delete forever", destructive: true });
    if (!ok) return;
    try {
      await api.delete(`/admin/users/${id}`);
      toast.success("Deleted");
      nav("/admin/users");
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  if (!user) return <div className="text-slate-400">Loading…</div>;

  return (
    <div className="space-y-6">
      <Link to="/admin/users" className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white"><ArrowLeft className="w-4 h-4" /> Back</Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="tiny-label text-orange-400">User</div>
          <h1 className="font-display text-3xl font-bold tracking-tight mt-2">{user.full_name}</h1>
          <p className="text-slate-400 mt-1">{user.email} · <span className="capitalize">{user.role}</span> · <span className={`font-semibold capitalize ${user.account_status === "active" ? "text-emerald-400" : user.account_status === "suspended" ? "text-orange-400" : "text-red-400"}`}>{user.account_status}</span></p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {user.account_status === "active" ? (
            <Button onClick={suspend} variant="outline" className="border-orange-600 text-orange-300 hover:bg-orange-600/10" data-testid="user-suspend-btn"><Ban className="w-4 h-4 mr-1.5" /> Suspend</Button>
          ) : (
            <Button onClick={restore} variant="outline" className="border-emerald-600 text-emerald-300 hover:bg-emerald-600/10" data-testid="user-restore-btn"><RotateCcw className="w-4 h-4 mr-1.5" /> Restore</Button>
          )}
          <Button onClick={remove} variant="outline" className="border-red-600 text-red-300 hover:bg-red-600/10" data-testid="user-delete-btn"><Trash2 className="w-4 h-4 mr-1.5" /> Delete</Button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="p-6 bg-slate-800/60 border border-slate-700 text-white">
          <div className="tiny-label !text-slate-400">Edit profile</div>
          <div className="mt-3 space-y-3">
            <div>
              <Label className="text-slate-300">Full name</Label>
              <Input value={profile.full_name} onChange={(e) => setProfile({ ...profile, full_name: e.target.value })} className="mt-1.5 bg-slate-900 border-slate-700 text-white" data-testid="user-edit-name" />
            </div>
            <div>
              <Label className="text-slate-300">Email</Label>
              <Input type="email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} className="mt-1.5 bg-slate-900 border-slate-700 text-white" data-testid="user-edit-email" />
            </div>
            <div>
              <Label className="text-slate-300">Phone</Label>
              <Input value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} className="mt-1.5 bg-slate-900 border-slate-700 text-white" data-testid="user-edit-phone" />
            </div>
            <Button onClick={saveProfile} className="bg-emerald-600 hover:bg-emerald-700 text-white w-full" data-testid="user-edit-save"><Save className="w-4 h-4 mr-1.5" /> Save profile</Button>
          </div>
        </Card>

        <Card className="p-6 bg-slate-800/60 border border-slate-700 text-white">
          <div className="flex items-center gap-2"><KeyRound className="w-4 h-4 text-amber-400" /><div className="tiny-label !text-slate-400">Reset password</div></div>
          <p className="text-xs text-slate-400 mt-2">Force-set this user&apos;s password. Use this to change your own admin password too (open your own profile).</p>
          <div className="mt-3 space-y-3">
            <div>
              <Label className="text-slate-300">New password</Label>
              <PasswordInput value={newPwd} onChange={(e) => setNewPwd(e.target.value)} placeholder="min 8 characters" className="mt-1.5 bg-slate-900 border-slate-700 text-white" data-testid="user-reset-password-input" />
            </div>
            <Button onClick={resetPwd} className="bg-amber-600 hover:bg-amber-700 text-white w-full" data-testid="user-reset-password-btn"><KeyRound className="w-4 h-4 mr-1.5" /> Reset password</Button>
          </div>
        </Card>

        <Card className="p-6 bg-slate-800/60 border border-slate-700 text-white">
          <div className="tiny-label !text-slate-400">Profile</div>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-slate-400">Role</dt><dd className="font-semibold capitalize">{user.role}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-400">Status</dt><dd className="font-semibold capitalize">{user.account_status}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-400">Plan</dt><dd className="font-semibold capitalize">{user.plan} ({user.plan_status})</dd></div>
            <div className="flex justify-between"><dt className="text-slate-400">Phone</dt><dd className="font-semibold">{user.phone || "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-400">Created</dt><dd className="font-semibold">{new Date(user.created_at).toLocaleDateString()}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-400">Plan expires</dt><dd className="font-semibold">{user.plan_expires_at ? new Date(user.plan_expires_at).toLocaleDateString() : "—"}</dd></div>
          </dl>
        </Card>

        {user.role === "owner" && (
          <Card className="p-6 bg-slate-800/60 border border-slate-700 text-white">
            <div className="flex items-center gap-2"><Gift className="w-4 h-4 text-orange-400" /><div className="tiny-label !text-slate-400">Gift free months</div></div>
            <div className="mt-3 space-y-3">
              <div>
                <Label className="text-slate-300">Plan</Label>
                <Select value={gift.plan} onValueChange={(v) => setGift({ ...gift, plan: v })}>
                  <SelectTrigger className="mt-1.5 bg-slate-900 border-slate-700 text-white"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="growth">Growth</SelectItem><SelectItem value="pro">Pro</SelectItem></SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-slate-300">Months</Label>
                <Input type="number" min="1" max="60" value={gift.months} onChange={(e) => setGift({ ...gift, months: parseInt(e.target.value || "1") })} className="mt-1.5 bg-slate-900 border-slate-700 text-white" data-testid="gift-months" />
              </div>
              <div>
                <Label className="text-slate-300">Reason</Label>
                <Input value={gift.reason} onChange={(e) => setGift({ ...gift, reason: e.target.value })} placeholder="e.g. Compensation" className="mt-1.5 bg-slate-900 border-slate-700 text-white" data-testid="gift-reason" />
              </div>
              <Button onClick={giftPlan} className="bg-orange-600 hover:bg-orange-700 text-white w-full" data-testid="gift-submit">
                <Gift className="w-4 h-4 mr-1.5" /> Gift plan
              </Button>
            </div>
          </Card>
        )}

        {user.role === "owner" && (
          <Card className="p-6 bg-slate-800/60 border border-slate-700 text-white">
            <div className="flex items-center gap-2"><Wrench className="w-4 h-4 text-blue-400" /><div className="tiny-label !text-slate-400">Manual plan update</div></div>
            <div className="mt-3 space-y-3">
              <div>
                <Label className="text-slate-300">Plan</Label>
                <Select value={manual.plan} onValueChange={(v) => setManual({ ...manual, plan: v })}>
                  <SelectTrigger className="mt-1.5 bg-slate-900 border-slate-700 text-white"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="starter">Starter</SelectItem><SelectItem value="growth">Growth</SelectItem><SelectItem value="pro">Pro</SelectItem></SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-slate-300">Months</Label>
                <Input type="number" min="1" value={manual.months} onChange={(e) => setManual({ ...manual, months: parseInt(e.target.value || "1") })} className="mt-1.5 bg-slate-900 border-slate-700 text-white" />
              </div>
              <Button onClick={manualUpgrade} className="bg-blue-600 hover:bg-blue-700 text-white w-full" data-testid="manual-upgrade-submit">Apply</Button>
            </div>
          </Card>
        )}

        {user.role === "owner" && user.subscription && (
          <Card className="p-6 bg-slate-800/60 border border-slate-700 text-white">
            <div className="tiny-label !text-slate-400">Active subscription</div>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-slate-400">Status</dt><dd className="font-semibold capitalize">{user.subscription.status}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-400">Plan</dt><dd className="font-semibold capitalize">{user.subscription.plan}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-400">Provider</dt><dd className="font-semibold capitalize">{user.subscription.payment_provider}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-400">Period end</dt><dd className="font-semibold">{user.subscription.current_period_end ? new Date(user.subscription.current_period_end).toLocaleDateString() : "—"}</dd></div>
            </dl>
            <Button onClick={cancelPlan} variant="outline" className="mt-4 border-red-600 text-red-400 hover:bg-red-600/10 w-full" data-testid="cancel-plan-btn">
              <X className="w-4 h-4 mr-1.5" /> Cancel subscription
            </Button>
          </Card>
        )}
      </div>
      <ConfirmDialog />
    </div>
  );
}
