import { useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import PasswordChecklist from "@/components/PasswordChecklist";
import { isStrongPassword, formatApiError, PASSWORD_POLICY_TEXT } from "@/lib/password";

export default function ResetPassword() {
  const { token } = useParams();
  const nav = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!isStrongPassword(password)) return toast.error(PASSWORD_POLICY_TEXT);
    if (password !== confirm) return toast.error("Passwords do not match");
    setLoading(true);
    try {
      await api.post("/auth/reset-password", { token, password });
      toast.success("Password updated. Please log in.");
      nav("/login");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail, "Invalid or expired reset link"));
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <Card className="w-full max-w-md p-8 border border-slate-200 bg-white">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md bg-emerald-600 text-white grid place-items-center font-bold font-display">F</div>
          <span className="font-display font-bold">FixMyCribs NG</span>
        </Link>
        <h2 className="font-display text-3xl font-bold tracking-tight mt-6">Set new password</h2>
        <p className="text-slate-500 mt-1">Enter a new password for your account.</p>
        <form className="mt-8 space-y-5" onSubmit={submit}>
          <div>
            <Label>New password</Label>
            <PasswordInput required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1.5" data-testid="reset-password" />
            <PasswordChecklist password={password} />
          </div>
          <div>
            <Label>Confirm password</Label>
            <PasswordInput required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} className="mt-1.5" data-testid="reset-password-confirm" />
          </div>
          <Button type="submit" disabled={loading} data-testid="reset-submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white h-11">
            {loading ? "Saving…" : "Update password"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
