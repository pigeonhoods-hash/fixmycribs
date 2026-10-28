import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [devLink, setDevLink] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post("/auth/forgot-password", { email });
      setSent(true);
      if (data.dev_link) setDevLink(data.dev_link);
      toast.success("If the email exists, a reset link has been sent");
    } catch {
      toast.error("Something went wrong. Try again.");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen grid md:grid-cols-2">
      <div className="hidden md:flex flex-col justify-between p-12 bg-slate-900 text-white">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md bg-emerald-500 text-white grid place-items-center font-bold font-display">F</div>
          <span className="font-display font-bold text-lg">FixMyCribs NG</span>
        </Link>
        <div>
          <div className="tiny-label text-emerald-400">Password reset</div>
          <h1 className="font-display text-4xl lg:text-5xl font-black tracking-tighter mt-4">Trouble signing in? We'll help you back in.</h1>
        </div>
        <div className="text-sm text-slate-400">Reset links expire in 2 hours for your security.</div>
      </div>
      <div className="flex items-center justify-center p-6">
        <Card className="w-full max-w-md p-8 border border-slate-200 bg-white">
          <h2 className="font-display text-3xl font-bold tracking-tight">Forgot password</h2>
          <p className="text-slate-500 mt-1">Enter your account email and we'll send you a reset link.</p>
          <form className="mt-8 space-y-5" onSubmit={submit}>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" data-testid="forgot-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1.5" placeholder="you@example.com" />
            </div>
            <Button type="submit" disabled={loading} data-testid="forgot-submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white h-11">
              {loading ? "Sending…" : "Send reset link"}
            </Button>
          </form>
          {sent && (
            <div className="mt-6 p-4 rounded-md bg-emerald-50 border border-emerald-200 text-sm text-emerald-900" data-testid="forgot-success">
              If <span className="font-semibold">{email}</span> matches an account, a reset link has been sent. Check your inbox.
              {devLink && (
                <div className="mt-3 text-xs">
                  <div className="tiny-label text-slate-600">Dev link (development only)</div>
                  <a href={devLink} className="text-emerald-700 break-all hover:underline" data-testid="dev-reset-link">{devLink}</a>
                </div>
              )}
            </div>
          )}
          <div className="mt-6 text-center text-sm text-slate-600">
            <Link to="/login" className="text-emerald-700 font-semibold hover:underline">Back to login</Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
