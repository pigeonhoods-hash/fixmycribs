import { useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Lock, User } from "lucide-react";
import PasswordChecklist from "@/components/PasswordChecklist";
import { isStrongPassword, formatApiError, PASSWORD_POLICY_TEXT } from "@/lib/password";

export default function Settings() {
  const { user } = useAuth();
  const [pwd, setPwd] = useState({ current: "", next: "", confirm: "" });
  const [saving, setSaving] = useState(false);

  const submitPwd = async (e) => {
    e.preventDefault();
    if (pwd.next.length < 8) return toast.error("New password must be at least 8 characters");
    if (pwd.next !== pwd.confirm) return toast.error("Passwords do not match");
    setSaving(true);
    try {
      await api.post("/auth/change-password", { current_password: pwd.current, new_password: pwd.next });
      toast.success("Password updated");
      setPwd({ current: "", next: "", confirm: "" });
    } catch (er) {
      toast.error(er.response?.data?.detail || "Failed to change password");
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <div className="tiny-label text-emerald-700">Account</div>
        <h1 className="font-display text-3xl font-bold tracking-tight mt-2">Settings</h1>
      </div>

      <Card className="p-6 border border-slate-200 bg-white">
        <div className="flex items-center gap-2 mb-4">
          <User className="w-4 h-4 text-emerald-700" />
          <div className="tiny-label">Profile</div>
        </div>
        <div className="space-y-4">
          <div>
            <Label>Full name</Label>
            <Input value={user?.full_name || ""} readOnly className="mt-1.5 bg-slate-50" />
          </div>
          <div>
            <Label>Email</Label>
            <Input value={user?.email || ""} readOnly className="mt-1.5 bg-slate-50" />
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={user?.phone || ""} readOnly className="mt-1.5 bg-slate-50" />
          </div>
          <div>
            <Label>Role</Label>
            <Input value={user?.role || "owner"} readOnly className="mt-1.5 bg-slate-50 capitalize" />
          </div>
        </div>
      </Card>

      <Card className="p-6 border border-slate-200 bg-white">
        <div className="flex items-center gap-2 mb-4">
          <Lock className="w-4 h-4 text-emerald-700" />
          <div className="tiny-label">Change password</div>
        </div>
        <form onSubmit={submitPwd} className="space-y-4">
          <div>
            <Label>Current password</Label>
            <PasswordInput required value={pwd.current} onChange={(e) => setPwd({ ...pwd, current: e.target.value })} className="mt-1.5" data-testid="settings-current-password" />
          </div>
          <div>
            <Label>New password</Label>
            <PasswordInput required minLength={8} value={pwd.next} onChange={(e) => setPwd({ ...pwd, next: e.target.value })} className="mt-1.5" data-testid="settings-new-password" />
            <PasswordChecklist password={pwd.next} />
          </div>
          <div>
            <Label>Confirm new password</Label>
            <PasswordInput required minLength={8} value={pwd.confirm} onChange={(e) => setPwd({ ...pwd, confirm: e.target.value })} className="mt-1.5" data-testid="settings-confirm-password" />
          </div>
          <Button type="submit" disabled={saving} data-testid="settings-change-password-submit" className="bg-emerald-600 hover:bg-emerald-700 text-white">
            {saving ? "Saving…" : "Update password"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
