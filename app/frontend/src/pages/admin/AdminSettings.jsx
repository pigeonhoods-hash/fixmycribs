import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Shield, KeyRound, Save, User } from "lucide-react";

export default function AdminSettings() {
  const { user, refreshUser } = useAuth();
  const [profile, setProfile] = useState({ full_name: "", email: "", phone: "" });
  const [pwd, setPwd] = useState({ current: "", next: "", confirm: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) setProfile({ full_name: user.full_name || "", email: user.email || "", phone: user.phone || "" });
  }, [user]);

  const saveProfile = async (e) => {
    e.preventDefault();
    if (!user?.id) return;
    setSaving(true);
    try {
      await api.patch(`/admin/users/${user.id}`, profile);
      toast.success("Profile updated");
      if (refreshUser) await refreshUser();
    } catch (er) {
      toast.error(er.response?.data?.detail || "Failed to save");
    } finally { setSaving(false); }
  };

  const changePwd = async (e) => {
    e.preventDefault();
    if (pwd.next.length < 8) return toast.error("Password must be at least 8 characters");
    if (pwd.next !== pwd.confirm) return toast.error("Passwords do not match");
    setSaving(true);
    try {
      await api.post("/auth/change-password", { current_password: pwd.current, new_password: pwd.next });
      toast.success("Password updated. Please remember it — you'll need it next login.");
      setPwd({ current: "", next: "", confirm: "" });
    } catch (er) {
      toast.error(er.response?.data?.detail || "Failed to change password");
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <div className="tiny-label text-orange-400">Account</div>
        <h1 className="font-display text-3xl font-bold tracking-tight mt-2 flex items-center gap-2 text-white"><Shield className="w-6 h-6 text-orange-400" /> Admin settings</h1>
        <p className="text-slate-400 text-sm mt-1">Change the seeded admin login so nobody with knowledge of the default credentials can access the platform.</p>
      </div>

      <Card className="p-6 bg-slate-800/60 border border-slate-700 text-white">
        <div className="flex items-center gap-2 mb-4"><User className="w-4 h-4 text-orange-400" /><div className="tiny-label !text-slate-400">Your profile</div></div>
        <form onSubmit={saveProfile} className="space-y-4">
          <div>
            <Label className="text-slate-300">Full name</Label>
            <Input value={profile.full_name} onChange={(e) => setProfile({ ...profile, full_name: e.target.value })} className="mt-1.5 bg-slate-900 border-slate-700 text-white" data-testid="admin-settings-name" />
          </div>
          <div>
            <Label className="text-slate-300">Email (used to log in)</Label>
            <Input type="email" required value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} className="mt-1.5 bg-slate-900 border-slate-700 text-white" data-testid="admin-settings-email" />
          </div>
          <div>
            <Label className="text-slate-300">Phone</Label>
            <Input value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} className="mt-1.5 bg-slate-900 border-slate-700 text-white" data-testid="admin-settings-phone" />
          </div>
          <Button type="submit" disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="admin-settings-save">
            <Save className="w-4 h-4 mr-1.5" /> {saving ? "Saving…" : "Save profile"}
          </Button>
        </form>
      </Card>

      <Card className="p-6 bg-slate-800/60 border border-slate-700 text-white">
        <div className="flex items-center gap-2 mb-4"><KeyRound className="w-4 h-4 text-amber-400" /><div className="tiny-label !text-slate-400">Change password</div></div>
        <form onSubmit={changePwd} className="space-y-4">
          <div>
            <Label className="text-slate-300">Current password</Label>
            <PasswordInput required value={pwd.current} onChange={(e) => setPwd({ ...pwd, current: e.target.value })} className="mt-1.5 bg-slate-900 border-slate-700 text-white" data-testid="admin-settings-current-password" />
          </div>
          <div>
            <Label className="text-slate-300">New password</Label>
            <PasswordInput required minLength={8} value={pwd.next} onChange={(e) => setPwd({ ...pwd, next: e.target.value })} className="mt-1.5 bg-slate-900 border-slate-700 text-white" data-testid="admin-settings-new-password" />
            <div className="text-xs text-slate-500 mt-1">Minimum 8 characters. Choose something only you know.</div>
          </div>
          <div>
            <Label className="text-slate-300">Confirm new password</Label>
            <PasswordInput required minLength={8} value={pwd.confirm} onChange={(e) => setPwd({ ...pwd, confirm: e.target.value })} className="mt-1.5 bg-slate-900 border-slate-700 text-white" data-testid="admin-settings-confirm-password" />
          </div>
          <Button type="submit" disabled={saving} className="bg-amber-600 hover:bg-amber-700 text-white" data-testid="admin-settings-change-password-submit">
            <KeyRound className="w-4 h-4 mr-1.5" /> {saving ? "Saving…" : "Update password"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
