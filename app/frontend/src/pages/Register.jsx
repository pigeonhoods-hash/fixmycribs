import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Mail, Lock, User, Phone, ArrowRight, Loader2 } from "lucide-react";
import AuthShell from "@/components/AuthShell";
import PasswordChecklist from "@/components/PasswordChecklist";
import { isStrongPassword, formatApiError, PASSWORD_POLICY_TEXT } from "@/lib/password";

export default function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", password: "" });
  const [loading, setLoading] = useState(false);

  const change = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (!isStrongPassword(form.password)) {
      toast.error(PASSWORD_POLICY_TEXT);
      return;
    }
    setLoading(true);
    try {
      const result = await register(form);
      if (result?.email_delivery_failed) {
        toast.error("Account created, but the verification email was rejected. The email service needs attention.");
      } else {
        toast.success("Account created! Please check your inbox to verify your email.");
      }
      nav("/verify-email");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail, "Registration failed"));
    } finally {
      setLoading(false);
    }
  };

  const field = (delay, node) => (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}>{node}</motion.div>
  );

  return (
    <AuthShell
      eyebrow="Free forever plan"
      title="Start managing rent"
      highlight="the smart way."
      subtitle="Set up your first property in 30 seconds. No spreadsheets, no WhatsApp chaos, no card required."
      bullets={["Up to 2 properties & 5 tenants — free", "AI reminders + overdue tracking", "Upgrade to Growth or Pro anytime"]}
    >
      <div className="rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-300/40 p-8">
        <h2 className="font-display text-3xl font-bold tracking-tight">Create your account</h2>
        <p className="text-slate-500 mt-1">Free forever. No card needed.</p>

        <form className="mt-7 space-y-4" onSubmit={submit}>
          {field(0.08, (
            <div>
              <Label htmlFor="name">Full name</Label>
              <div className="relative mt-1.5">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <Input id="name" data-testid="register-name" required value={form.full_name} onChange={change("full_name")} className="pl-9 h-11" placeholder="Adaeze Okafor" />
              </div>
            </div>
          ))}
          {field(0.14, (
            <div>
              <Label htmlFor="email">Email</Label>
              <div className="relative mt-1.5">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <Input id="email" data-testid="register-email" type="email" required value={form.email} onChange={change("email")} className="pl-9 h-11" placeholder="you@example.com" />
              </div>
            </div>
          ))}
          {field(0.2, (
            <div>
              <Label htmlFor="phone">Phone <span className="text-slate-400 font-normal">(optional)</span></Label>
              <div className="relative mt-1.5">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <Input id="phone" data-testid="register-phone" value={form.phone} onChange={change("phone")} className="pl-9 h-11" placeholder="+234…" />
              </div>
            </div>
          ))}
          {field(0.26, (
            <div>
              <Label htmlFor="password">Password</Label>
              <div className="relative mt-1.5">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 z-10 pointer-events-none" />
                <PasswordInput id="password" data-testid="register-password" required minLength={8} value={form.password} onChange={change("password")} className="pl-9 h-11" />
              </div>
              <PasswordChecklist password={form.password} />
            </div>
          ))}
          {field(0.32, (
            <motion.div whileTap={{ scale: 0.98 }}>
              <Button type="submit" disabled={loading} data-testid="register-submit"
                className="group w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-white text-base font-semibold shadow-lg shadow-emerald-600/25 transition-all">
                {loading ? (
                  <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Creating…</span>
                ) : (
                  <span className="flex items-center gap-2">Create free account <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" /></span>
                )}
              </Button>
            </motion.div>
          ))}
        </form>

        <div className="mt-6 text-center text-sm text-slate-600">
          Already have an account? <Link to="/login" className="text-emerald-700 font-semibold hover:underline" data-testid="link-login">Log in</Link>
        </div>
      </div>
    </AuthShell>
  );
}
