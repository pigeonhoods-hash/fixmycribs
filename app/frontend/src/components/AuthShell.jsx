import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Shield, Sparkles, Zap, Users, CreditCard, TrendingUp } from "lucide-react";

const FEED = [
  { icon: CreditCard, tint: "text-emerald-300", label: "Rent collected", value: "₦2.4m", meta: "↑ 12% this month" },
  { icon: Zap, tint: "text-yellow-300", label: "Electricity billed", value: "₦29,250", meta: "130 kWh · Flat 3A" },
  { icon: Users, tint: "text-sky-300", label: "New tenant joined", value: "Emeka Bello", meta: "Lekki Court · Active" },
  { icon: Sparkles, tint: "text-fuchsia-300", label: "AI reminder sent", value: "Polite nudge", meta: "to Aisha A." },
  { icon: TrendingUp, tint: "text-emerald-300", label: "Occupancy", value: "82%", meta: "Ikoyi Villas" },
];

function LiveFeed() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => x + 1), 2600);
    return () => clearInterval(t);
  }, []);
  const f = FEED[i % FEED.length];
  const Icon = f.icon;
  return (
    <div className="relative h-[96px] w-full max-w-xs" data-testid="auth-live-feed">
      <AnimatePresence mode="wait">
        <motion.div
          key={i % FEED.length}
          initial={{ opacity: 0, y: 14, filter: "blur(8px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -14, filter: "blur(8px)" }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="absolute inset-0 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-4 shadow-2xl"
        >
          <div className={`flex items-center gap-2 text-xs font-semibold ${f.tint}`}><Icon className="w-3.5 h-3.5" />{f.label}</div>
          <div className="mt-1 font-display text-2xl font-black text-white">{f.value}</div>
          <div className="mt-0.5 text-xs text-white/50">{f.meta}</div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export default function AuthShell({ eyebrow, title, highlight, subtitle, bullets = [], children }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-slate-50">
      {/* LEFT — immersive branded panel (desktop) */}
      <div className="relative hidden lg:flex flex-col justify-between p-12 overflow-hidden bg-slate-950 text-white">
        <motion.div aria-hidden className="absolute -top-24 -left-16 w-96 h-96 rounded-full bg-emerald-500/30 blur-3xl"
          animate={{ x: [0, 40, 0], y: [0, 30, 0], scale: [1, 1.1, 1] }} transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }} />
        <motion.div aria-hidden className="absolute bottom-[-6rem] right-[-4rem] w-[30rem] h-[30rem] rounded-full bg-teal-400/20 blur-3xl"
          animate={{ x: [0, -40, 0], y: [0, -30, 0], scale: [1, 1.15, 1] }} transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }} />
        <div aria-hidden className="absolute inset-0 opacity-[0.05]"
          style={{ backgroundImage: "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)", backgroundSize: "42px 42px" }} />

        <div className="relative">
          <Link to="/" className="inline-flex items-center gap-2" data-testid="auth-brand">
            <div className="w-9 h-9 rounded-lg bg-emerald-500 grid place-items-center font-black font-display text-white">F</div>
            <span className="font-display font-bold text-lg">FixMyCribs <span className="text-emerald-400">NG</span></span>
          </Link>
        </div>

        <div className="relative">
          <motion.div initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}>
            <div className="inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.18em] uppercase text-emerald-300">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> {eyebrow}
            </div>
            <h1 className="font-display text-4xl xl:text-5xl font-black tracking-tight mt-4 leading-[1.05]">
              {title} {highlight && <span className="text-emerald-400">{highlight}</span>}
            </h1>
            <p className="mt-5 text-white/60 max-w-md">{subtitle}</p>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.15 }} className="mt-8">
            <LiveFeed />
          </motion.div>

          <ul className="mt-8 space-y-2.5">
            {bullets.map((b, idx) => (
              <motion.li key={idx} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.35 + idx * 0.08 }}
                className="flex items-center gap-2.5 text-sm text-white/80">
                <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-300 grid place-items-center shrink-0"><Check className="w-3 h-3" /></span>{b}
              </motion.li>
            ))}
          </ul>
        </div>

        <div className="relative flex items-center gap-2 text-xs text-white/40">
          <Shield className="w-3.5 h-3.5" /> Bank-grade encryption · Data you actually own
        </div>
      </div>

      {/* RIGHT — form */}
      <div className="relative flex flex-col md:items-center md:justify-center p-6 sm:p-10">
        {/* Mobile branded header */}
        <div className="lg:hidden relative mb-6 mt-1 overflow-hidden rounded-3xl bg-slate-950 text-white p-6" data-testid="auth-mobile-header">
          <motion.div aria-hidden className="absolute -top-12 -right-8 w-44 h-44 rounded-full bg-emerald-500/40 blur-2xl"
            animate={{ scale: [1, 1.25, 1] }} transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }} />
          <Link to="/" className="relative inline-flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-emerald-500 grid place-items-center font-black font-display text-white">F</div>
            <span className="font-display font-bold">FixMyCribs <span className="text-emerald-400">NG</span></span>
          </Link>
          <h1 className="relative font-display text-2xl font-black tracking-tight mt-4 leading-tight">{title} {highlight && <span className="text-emerald-400">{highlight}</span>}</h1>
          <p className="relative text-sm text-white/60 mt-1.5">{subtitle}</p>
        </div>

        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} className="w-full max-w-md">
          {children}
        </motion.div>
      </div>
    </div>
  );
}
