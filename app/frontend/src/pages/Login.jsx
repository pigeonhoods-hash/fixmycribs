import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth, getDefaultDashboard } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Mail, Lock, ArrowRight, Loader2 } from "lucide-react";
import AuthShell from "@/components/AuthShell";

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const u = await login(email, password);
      toast.success("Welcome back!");
      nav(getDefaultDashboard(u));
    } catch (err) {
      toast.error(err.response?.data?.detail || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      eyebrow="Welcome back"
      title="Log in and run your rentals"
      highlight="on autopilot."
      subtitle="Rent tracking, AI reminders, utility bills and tenant portals — all in one calm dashboard."
      bullets={["Track rent & utility bills", "AI-written reminders in your voice", "Tenant & facility-manager portals"]}
    >
      <div className="rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-300/40 p-8">
        <h2 className="font-display text-3xl font-bold tracking-tight">Log in</h2>
        <p className="text-slate-500 mt-1">Access your FixMyCribs dashboard.</p>

        <form className="mt-8 space-y-5" onSubmit={submit}>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Label htmlFor="email">Email</Label>
            <div className="relative mt-1.5">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <Input id="email" data-testid="login-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="pl-9 h-11" placeholder="you@example.com" />
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}>
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link to="/forgot-password" className="text-xs text-emerald-700 hover:underline" data-testid="link-forgot-password">Forgot password?</Link>
            </div>
            <div className="relative mt-1.5">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 z-10 pointer-events-none" />
              <PasswordInput id="password" data-testid="login-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="pl-9 h-11" />
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.26 }} whileTap={{ scale: 0.98 }}>
            <Button type="submit" disabled={loading} data-testid="login-submit"
              className="group w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-white text-base font-semibold shadow-lg shadow-emerald-600/25 transition-all">
              {loading ? (
                <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Signing in…</span>
              ) : (
                <span className="flex items-center gap-2">Sign in <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" /></span>
              )}
            </Button>
          </motion.div>
        </form>

        <div className="mt-6 text-center text-sm text-slate-600">
          No account yet? <Link to="/register" className="text-emerald-700 font-semibold hover:underline" data-testid="link-register">Create one free</Link>
        </div>
      </div>
    </AuthShell>
  );
}
