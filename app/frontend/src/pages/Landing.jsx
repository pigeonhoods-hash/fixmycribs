import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useScroll, useTransform, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Building2, Users, Bell, Sparkles, CreditCard, AlertTriangle, Check, ArrowRight, Wrench, HardHat, MessageSquare, Zap, Shield, TrendingUp, ChevronRight } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";

const HERO_IMG = "https://images.unsplash.com/photo-1628144688607-c373d8e3f31b?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2ODh8MHwxfHNlYXJjaHwxfHxtb2Rlcm4lMjBob3VzZSUyMG5pZ2VyaWElMjByZWFsJTIwZXN0YXRlfGVufDB8fHx8MTc4MzM0NjQ3Nnww&ixlib=rb-4.1.0&q=85";

const features = [
  { icon: Building2, title: "Properties", desc: "Every building, unit, apartment in one clean board.", accent: "emerald" },
  { icon: Users, title: "Tenant portals", desc: "Invite tenants by email. They pay, chat, and see bills — you save hours.", accent: "orange" },
  { icon: Zap, title: "Postpaid electricity", desc: "Enter meter readings. We compute kWh × rate. Everyone knows the truth.", accent: "yellow" },
  { icon: Wrench, title: "Maintenance flow", desc: "Tenant lodges → landlord assigns → facility manager fixes. All tracked.", accent: "blue" },
  { icon: Sparkles, title: "AI reminders", desc: "Polite, firm, or final — Claude 4.5 writes it in your voice.", accent: "purple" },
  { icon: TrendingUp, title: "Never lose a naira", desc: "Overdue tracking, per-apartment ledger, exportable reports.", accent: "red" },
];

const plans = [
  { id: "starter", name: "Starter", price: "₦0", period: "forever", tag: "For 1 property",
    features: ["Up to 2 properties", "Up to 5 tenants", "Basic rent tracking", "10 AI reminders / mo", "Tenant portal"], accent: false },
  { id: "growth", name: "Growth", price: "₦5,000", period: "/ month", tag: "Most popular",
    features: ["Up to 20 properties", "Up to 100 tenants", "AI reminders", "Overdue tracking", "Utility bills (diesel + electricity)", "Maintenance workflow", "500 AI reminders / mo"], accent: true },
  { id: "pro", name: "Pro", price: "₦15,000", period: "/ month", tag: "For estates",
    features: ["Unlimited everything", "Facility manager seats", "Advanced analytics", "Priority support", "Unlimited AI", "White-glove onboarding"], accent: false },
];

const workflow = [
  { n: "01", title: "Add your property", desc: "One property or twenty — takes 30 seconds each." },
  { n: "02", title: "Invite your tenants", desc: "Email invites. They set their own password. You never handle theirs." },
  { n: "03", title: "Track rent + utility bills", desc: "Meter readings become bills. Bills become receipts. You just watch." },
  { n: "04", title: "Delegate maintenance", desc: "Tenants lodge, you assign, facility managers fix. All on one timeline." },
];

const stats = [
  { value: "₦0", label: "Money lost to spreadsheets" },
  { value: "24/7", label: "Tenants can pay + lodge" },
  { value: "5×", label: "Faster than WhatsApp chases" },
  { value: "100%", label: "Data you actually own" },
];

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
};

const stagger = { show: { transition: { staggerChildren: 0.08 } } };

const accentBg = {
  emerald: "bg-emerald-50 text-emerald-700 group-hover:bg-emerald-100",
  orange: "bg-orange-50 text-orange-700 group-hover:bg-orange-100",
  yellow: "bg-yellow-50 text-yellow-800 group-hover:bg-yellow-100",
  blue: "bg-blue-50 text-blue-700 group-hover:bg-blue-100",
  purple: "bg-purple-50 text-purple-700 group-hover:bg-purple-100",
  red: "bg-red-50 text-red-700 group-hover:bg-red-100",
};

// ---- Rotating hero cards (cycles through live-feed style snapshots) ----
const slotA = [
  { icon: CreditCard, tint: "text-emerald-600", label: "Rent collected", big: "₦2.4m", sub: "↑ 12% this month", subCls: "text-emerald-700" },
  { icon: CreditCard, tint: "text-emerald-600", label: "Payment received", big: "₦600,000", sub: "Ngozi Okafor · Flat 2B", subCls: "text-slate-500" },
  { icon: Shield, tint: "text-blue-600", label: "Service charge", big: "₦100,000", sub: "Paid · Ikoyi Villas", subCls: "text-emerald-700" },
  { icon: Zap, tint: "text-orange-500", label: "Diesel deposit", big: "₦50,000", sub: "14 tenants funded", subCls: "text-slate-500" },
];
const slotB = [
  { icon: Wrench, tint: "text-orange-600", label: "New complaint", title: "Bathroom tap · Flat 3A", badge: "Assigned", badgeCls: "bg-blue-50 text-blue-700", tail: "to Fred F." },
  { icon: Check, tint: "text-emerald-600", label: "Maintenance done", title: "Leaking roof · Flat 1C", badge: "Completed", badgeCls: "bg-emerald-50 text-emerald-700", tail: "by Ola B." },
  { icon: Users, tint: "text-blue-600", label: "New tenant", title: "Emeka Bello joined", badge: "Active", badgeCls: "bg-emerald-50 text-emerald-700", tail: "Lekki Court" },
  { icon: Sparkles, tint: "text-purple-600", label: "AI reminder sent", title: "Polite rent nudge", badge: "Delivered", badgeCls: "bg-purple-50 text-purple-700", tail: "to Aisha A." },
];
const slotC = [
  { icon: Zap, tint: "text-emerald-400", label: "Electricity bill", line: "130 kWh × ₦225", big: "₦29,250" },
  { icon: AlertTriangle, tint: "text-red-400", label: "Overdue alert", line: "3 tenants · 12 days", big: "₦450,000" },
  { icon: TrendingUp, tint: "text-emerald-400", label: "Occupancy", line: "Ikoyi Villas", big: "82%" },
  { icon: Bell, tint: "text-amber-300", label: "Rent due soon", line: "In 3 days · Flat 4B", big: "₦800,000" },
];

const swap = {
  initial: { opacity: 0, y: 10, filter: "blur(6px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  exit: { opacity: 0, y: -10, filter: "blur(6px)" },
  transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] },
};

function RotatingHeroCards() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => x + 1), 2800);
    return () => clearInterval(t);
  }, []);
  const a = slotA[i % slotA.length];
  const b = slotB[i % slotB.length];
  const c = slotC[i % slotC.length];
  const AIcon = a.icon, BIcon = b.icon, CIcon = c.icon;
  return (
    <>
      <motion.div animate={{ y: [0, -12, 0] }} transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -left-8 top-14 bg-white rounded-2xl shadow-xl border border-slate-200 p-4 w-56 min-h-[108px]" data-testid="hero-card-a">
        <AnimatePresence mode="wait">
          <motion.div key={i % slotA.length} {...swap}>
            <div className="flex items-center gap-2 text-xs text-slate-500"><AIcon className={`w-3.5 h-3.5 ${a.tint}`} />{a.label}</div>
            <div className="mt-1 font-display text-2xl font-black">{a.big}</div>
            <div className={`mt-1 text-xs font-semibold ${a.subCls}`}>{a.sub}</div>
          </motion.div>
        </AnimatePresence>
      </motion.div>

      <motion.div animate={{ y: [0, 14, 0] }} transition={{ duration: 5.2, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -right-6 bottom-14 bg-white rounded-2xl shadow-xl border border-slate-200 p-4 w-60 min-h-[104px]" data-testid="hero-card-b">
        <AnimatePresence mode="wait">
          <motion.div key={i % slotB.length} {...swap}>
            <div className="flex items-center gap-2 text-xs text-slate-500"><BIcon className={`w-3.5 h-3.5 ${b.tint}`} />{b.label}</div>
            <div className="mt-1 font-semibold text-sm">{b.title}</div>
            <div className="mt-2 flex items-center gap-1 text-xs">
              <div className={`px-1.5 py-0.5 rounded font-semibold ${b.badgeCls}`}>{b.badge}</div>
              <span className="text-slate-500">{b.tail}</span>
            </div>
          </motion.div>
        </AnimatePresence>
      </motion.div>

      <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 1 }}
        className="absolute -right-2 -top-4 bg-slate-900 text-white rounded-2xl shadow-2xl p-3 w-48 min-h-[92px]" data-testid="hero-card-c">
        <AnimatePresence mode="wait">
          <motion.div key={i % slotC.length} {...swap}>
            <div className={`flex items-center gap-2 text-xs ${c.tint}`}><CIcon className="w-3.5 h-3.5" />{c.label}</div>
            <div className="mt-1 text-sm text-slate-200">{c.line}</div>
            <div className="mt-0.5 font-display text-lg font-black">{c.big}</div>
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </>
  );
}

function NavBar() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 12);
    window.addEventListener("scroll", on);
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <motion.nav initial={{ y: -80 }} animate={{ y: 0 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className={`fixed top-0 inset-x-0 z-50 transition-all ${scrolled ? "bg-white/80 backdrop-blur-md border-b border-slate-200/60 shadow-sm" : "bg-transparent"}`}>
      <div className="max-w-7xl mx-auto px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5 group">
          <motion.div whileHover={{ rotate: -8, scale: 1.08 }} className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white grid place-items-center font-display font-black text-lg shadow-lg shadow-emerald-500/40 ring-1 ring-emerald-400/50">F</motion.div>
          <span className="font-display font-black tracking-tighter text-xl bg-gradient-to-br from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">FixMyCribs<span className="text-orange-600 dark:text-orange-400 ml-0.5">NG</span></span>
        </Link>
        <div className="hidden md:flex items-center gap-8 text-sm text-slate-700">
          <a href="#features" className="hover:text-emerald-700 transition-colors">Features</a>
          <a href="#how" className="hover:text-emerald-700 transition-colors">How it works</a>
          <a href="#pricing" className="hover:text-emerald-700 transition-colors">Pricing</a>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/login" className="text-sm text-slate-700 hover:text-slate-900 px-3 hidden sm:inline">Sign in</Link>
          <Link to="/register"><Button className="bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-700 text-white rounded-full">Get started</Button></Link>
        </div>
      </div>
    </motion.nav>
  );
}

function AnimatedBlobs() {
  return (
    <div className="absolute inset-0 overflow-hidden -z-10 pointer-events-none">
      <motion.div
        className="absolute -top-32 -left-32 w-[560px] h-[560px] rounded-full bg-emerald-300/40 blur-3xl"
        animate={{ x: [0, 40, 0], y: [0, 30, 0], scale: [1, 1.05, 1] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -bottom-32 -right-32 w-[560px] h-[560px] rounded-full bg-orange-300/40 blur-3xl"
        animate={{ x: [0, -30, 0], y: [0, -40, 0], scale: [1, 1.08, 1] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute top-1/3 left-1/2 w-[380px] h-[380px] rounded-full bg-yellow-200/40 blur-3xl"
        animate={{ x: [-30, 30, -30], y: [0, 40, 0] }}
        transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}

function GridBackground() {
  return (
    <div className="absolute inset-0 -z-10 [background-image:linear-gradient(to_right,#0f172a08_1px,transparent_1px),linear-gradient(to_bottom,#0f172a08_1px,transparent_1px)] [background-size:32px_32px]" />
  );
}

function Marquee() {
  const items = ["Rent tracking", "Tenant portals", "Utility bills", "Maintenance", "AI reminders", "Facility managers", "Support tickets", "Diesel deposits", "Postpaid electricity", "Complaints", "Reports", "Overdue alerts"];
  return (
    <div className="relative py-6 overflow-hidden border-y border-slate-200 bg-slate-50">
      <motion.div className="flex gap-12 whitespace-nowrap will-change-transform"
        animate={{ x: ["0%", "-50%"] }} transition={{ duration: 30, repeat: Infinity, ease: "linear" }}>
        {[...items, ...items, ...items].map((t, i) => (
          <div key={i} className="flex items-center gap-3 text-slate-500 shrink-0">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="font-display font-semibold tracking-tight text-lg">{t}</span>
          </div>
        ))}
      </motion.div>
    </div>
  );
}

export default function Landing() {
  const { scrollYProgress } = useScroll();
  const heroY = useTransform(scrollYProgress, [0, 0.3], [0, 80]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.25], [1, 0.3]);

  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      <NavBar />

      {/* HERO */}
      <section className="relative pt-32 pb-24 lg:pt-40 lg:pb-32">
        <AnimatedBlobs />
        <GridBackground />
        <motion.div style={{ y: heroY, opacity: heroOpacity }} className="max-w-7xl mx-auto px-6 lg:px-8 grid lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-7">
            <motion.div initial="hidden" animate="show" variants={stagger}>
              <motion.div variants={fadeUp} className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100 border border-emerald-200 text-emerald-800 text-xs font-semibold tracking-wide">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                LIVE FOR NIGERIAN LANDLORDS · 2026
              </motion.div>
              <motion.h1 variants={fadeUp} className="mt-6 font-display text-5xl md:text-6xl lg:text-7xl font-black tracking-tighter leading-[1.02]">
                Rent, bills, and{" "}
                <span className="relative inline-block">
                  <span className="relative z-10 text-emerald-700 dark:text-emerald-400">tenant chases</span>
                  <motion.span initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 0.7, duration: 0.6 }}
                    className="absolute inset-x-0 bottom-1 h-3 bg-orange-300/70 -z-0 origin-left" />
                </span>
                <br />all on one calm dashboard.
              </motion.h1>
              <motion.p variants={fadeUp} className="mt-6 text-lg text-slate-600 max-w-xl leading-relaxed">
                FixMyCribs is the property, rent, and utility manager for Nigerian landlords. Invite tenants by email. Bill diesel deposits and postpaid electricity by meter reading. Delegate maintenance to your facility managers. Skip the WhatsApp chaos.
              </motion.p>
              <motion.div variants={fadeUp} className="mt-8 flex flex-wrap items-center gap-3">
                <Link to="/register">
                  <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                    <Button data-testid="hero-cta" className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-full px-7 h-12 shadow-lg shadow-emerald-600/25">
                      Start free — no card <ArrowRight className="w-4 h-4 ml-1.5" />
                    </Button>
                  </motion.div>
                </Link>
                <a href="#how">
                  <Button variant="outline" className="rounded-full px-6 h-12 border-slate-300 hover:bg-slate-50">See how it works</Button>
                </a>
              </motion.div>
              <motion.div variants={fadeUp} className="mt-8 flex flex-wrap items-center gap-5 text-xs text-slate-500">
                <div className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-600" /> Free Starter tier</div>
                <div className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-600" /> Naira-native pricing</div>
                <div className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-600" /> Bank-grade encryption</div>
              </motion.div>
            </motion.div>
          </div>
          <div className="lg:col-span-5">
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 40 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
              className="relative">
              <div className="relative rounded-3xl overflow-hidden shadow-2xl border-4 border-white ring-1 ring-slate-200">
                <img src={HERO_IMG} alt="Modern property" className="w-full h-[440px] object-cover" />
              </div>
              {/* Floating cards — rotate through live-feed snapshots */}
              <RotatingHeroCards />
            </motion.div>
          </div>
        </motion.div>
      </section>

      <Marquee />

      {/* STATS */}
      <section className="py-20">
        <motion.div initial="hidden" whileInView="show" viewport={{ once: true, margin: "-80px" }} variants={stagger}
          className="max-w-7xl mx-auto px-6 lg:px-8 grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((s) => (
            <motion.div key={s.label} variants={fadeUp} className="text-center">
              <div className="font-display text-5xl md:text-6xl font-black tracking-tighter bg-gradient-to-br from-slate-900 to-emerald-700 dark:from-white dark:to-emerald-400 bg-clip-text text-transparent">{s.value}</div>
              <div className="mt-2 text-sm text-slate-500">{s.label}</div>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* FEATURES */}
      <section id="features" className="py-24 bg-gradient-to-b from-white to-slate-50 dark:from-transparent dark:to-transparent">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <motion.div initial="hidden" whileInView="show" viewport={{ once: true }} variants={stagger} className="max-w-2xl">
            <motion.div variants={fadeUp} className="tiny-label text-emerald-700">Everything you actually need</motion.div>
            <motion.h2 variants={fadeUp} className="mt-3 font-display text-4xl md:text-5xl font-black tracking-tighter">Built for the way Nigerian landlords <span className="text-orange-600 dark:text-orange-400">really</span> collect rent.</motion.h2>
            <motion.p variants={fadeUp} className="mt-4 text-slate-600">Not a US clone. Diesel deposits. Postpaid electricity meters. Facility managers. WhatsApp-first tenants. This is FixMyCribs.</motion.p>
          </motion.div>

          <motion.div initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }} variants={stagger}
            className="mt-14 grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map((f) => (
              <motion.div key={f.title} variants={fadeUp} whileHover={{ y: -6 }} transition={{ type: "spring", stiffness: 300 }}
                className="group">
                <Card className="p-6 border border-slate-200 bg-white hover:border-emerald-400 hover:shadow-xl hover:shadow-emerald-500/5 transition-all h-full">
                  <div className={`w-11 h-11 rounded-xl grid place-items-center transition-colors ${accentBg[f.accent]}`}>
                    <f.icon className="w-5 h-5" strokeWidth={1.75} />
                  </div>
                  <h3 className="mt-5 font-display font-bold text-xl tracking-tight">{f.title}</h3>
                  <p className="mt-2 text-sm text-slate-600 leading-relaxed">{f.desc}</p>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" className="py-24 bg-slate-900 text-white relative overflow-hidden">
        <div className="absolute inset-0 [background-image:radial-gradient(circle_at_20%_10%,rgba(16,185,129,0.15),transparent_50%),radial-gradient(circle_at_80%_80%,rgba(249,115,22,0.15),transparent_50%)]" />
        <div className="max-w-7xl mx-auto px-6 lg:px-8 relative">
          <motion.div initial="hidden" whileInView="show" viewport={{ once: true }} variants={stagger}>
            <motion.div variants={fadeUp} className="tiny-label text-emerald-400">How it flows</motion.div>
            <motion.h2 variants={fadeUp} className="mt-3 font-display text-4xl md:text-5xl font-black tracking-tighter max-w-2xl">Four steps and you're running your whole portfolio from your phone.</motion.h2>
          </motion.div>
          <motion.div initial="hidden" whileInView="show" viewport={{ once: true, margin: "-80px" }} variants={stagger}
            className="mt-14 grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {workflow.map((w, idx) => (
              <motion.div key={w.n} variants={fadeUp} whileHover={{ y: -4 }} className="relative">
                <Card className="p-6 bg-slate-800/50 backdrop-blur border border-slate-700 hover:border-emerald-500 transition-all h-full">
                  <div className="font-display text-5xl font-black tracking-tighter bg-gradient-to-br from-emerald-400 to-emerald-600 bg-clip-text text-transparent">{w.n}</div>
                  <div className="mt-4 font-display font-bold text-lg tracking-tight text-white">{w.title}</div>
                  <div className="mt-2 text-sm text-slate-400 leading-relaxed">{w.desc}</div>
                </Card>
                {idx < workflow.length - 1 && (
                  <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: 0.3 + idx * 0.1 }}
                    className="hidden lg:block absolute top-1/2 -right-2 z-10">
                    <ChevronRight className="w-5 h-5 text-emerald-500" />
                  </motion.div>
                )}
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="py-24">
        <div className="max-w-6xl mx-auto px-6 lg:px-8">
          <motion.div initial="hidden" whileInView="show" viewport={{ once: true }} variants={stagger} className="text-center">
            <motion.div variants={fadeUp} className="tiny-label text-emerald-700">Naira-first pricing</motion.div>
            <motion.h2 variants={fadeUp} className="mt-3 font-display text-4xl md:text-5xl font-black tracking-tighter">Start free. Scale when you're ready.</motion.h2>
          </motion.div>
          <motion.div initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }} variants={stagger}
            className="mt-14 grid md:grid-cols-3 gap-4">
            {plans.map((p) => (
              <motion.div key={p.id} variants={fadeUp} whileHover={{ y: -6 }} transition={{ type: "spring", stiffness: 300 }}>
                <Card className={`p-8 h-full relative ${p.accent ? "bg-slate-900 text-white border-2 border-emerald-500 shadow-2xl shadow-emerald-500/20 scale-[1.03]" : "border border-slate-200 bg-white"}`}>
                  {p.accent && <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-500 text-slate-900 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-widest">{p.tag}</div>}
                  <div className={`tiny-label ${p.accent ? "text-emerald-400" : "text-slate-500"}`}>{p.name}</div>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="font-display text-5xl font-black tracking-tighter">{p.price}</span>
                    <span className={`${p.accent ? "text-slate-400" : "text-slate-500"} text-sm`}>{p.period}</span>
                  </div>
                  {!p.accent && <div className="mt-1 text-xs text-slate-500">{p.tag}</div>}
                  <ul className="mt-6 space-y-2.5 text-sm">
                    {p.features.map((f) => (
                      <li key={f} className="flex gap-2">
                        <Check className={`w-4 h-4 shrink-0 mt-0.5 ${p.accent ? "text-emerald-400" : "text-emerald-600"}`} />
                        <span className={p.accent ? "text-slate-200" : "text-slate-700"}>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <Link to="/register" className="block mt-8">
                    <Button className={`w-full h-11 rounded-full ${p.accent ? "bg-emerald-500 hover:bg-emerald-400 text-slate-900" : "bg-slate-900 hover:bg-slate-800 text-white"}`}>
                      {p.id === "starter" ? "Start free" : `Choose ${p.name}`}
                    </Button>
                  </Link>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* CTA STRIP */}
      <section className="py-20">
        <div className="max-w-6xl mx-auto px-6 lg:px-8">
          <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.7 }}
            className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-600 via-emerald-700 to-slate-900 p-12 md:p-16 text-white">
            <motion.div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-orange-400/30 blur-3xl"
              animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 8, repeat: Infinity }} />
            <div className="relative max-w-2xl">
              <h2 className="font-display text-4xl md:text-5xl font-black tracking-tighter">Your tenants deserve better than a WhatsApp group.</h2>
              <p className="mt-4 text-emerald-100 text-lg">And you deserve to stop chasing rent every 1st of the month.</p>
              <Link to="/register" className="inline-block mt-8">
                <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
                  <Button data-testid="footer-cta" className="bg-white hover:bg-slate-100 text-slate-900 rounded-full px-8 h-12 font-semibold">
                    Get started free <ArrowRight className="w-4 h-4 ml-1.5" />
                  </Button>
                </motion.div>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-slate-950 text-slate-300 py-14" data-testid="landing-footer">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 grid md:grid-cols-4 gap-8">
          <div>
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-white grid place-items-center font-display font-black text-lg shadow-lg shadow-emerald-500/40">F</div>
              <span className="font-display font-black text-white text-xl tracking-tighter">FixMyCribs<span className="text-orange-400 ml-0.5">NG</span></span>
            </div>
            <p className="text-sm text-slate-400 leading-relaxed">Property & rent management built for Nigerian landlords. Track rent, collect utility bills, manage maintenance, and communicate with tenants — all in one place.</p>
          </div>
          <div>
            <div className="tiny-label text-slate-500 mb-4">Company</div>
            <ul className="space-y-2 text-sm">
              <li className="text-slate-300 font-medium">FixMyCribs Technologies Ltd</li>
              <li className="text-slate-500 text-xs">RC No: pending registration</li>
              <li className="text-slate-500 text-xs">Lagos, Nigeria</li>
              <li><a href="#pricing" className="text-slate-400 hover:text-white transition-colors">Pricing</a></li>
              <li><Link to="/login" className="text-slate-400 hover:text-white transition-colors">Log in</Link></li>
            </ul>
          </div>
          <div>
            <div className="tiny-label text-slate-500 mb-4">Contact</div>
            <ul className="space-y-2 text-sm">
              <li><a href="mailto:support@fixmycribs.com" className="text-slate-400 hover:text-white transition-colors">support@fixmycribs.com</a></li>
              <li><a href="mailto:hello@fixmycribs.com" className="text-slate-400 hover:text-white transition-colors">hello@fixmycribs.com</a></li>
              <li><a href="tel:+2348000000000" className="text-slate-400 hover:text-white transition-colors">+234 800 000 0000</a></li>
              <li className="text-slate-500 text-xs">Mon–Fri, 9am–6pm WAT</li>
            </ul>
          </div>
          <div>
            <div className="tiny-label text-slate-500 mb-4">Legal</div>
            <ul className="space-y-2 text-sm">
              <li><Link to="/legal/terms" className="text-slate-400 hover:text-white transition-colors">Terms of Service</Link></li>
              <li><Link to="/legal/privacy" className="text-slate-400 hover:text-white transition-colors">Privacy Policy</Link></li>
              <li><Link to="/legal/refund" className="text-slate-400 hover:text-white transition-colors">Refund Policy</Link></li>
            </ul>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-6 lg:px-8 mt-12 pt-6 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
          <div>© {new Date().getFullYear()} FixMyCribs Technologies Ltd. All rights reserved.</div>
          <div>Built with love in Lagos 🇳🇬</div>
        </div>
      </footer>

      {/* Floating theme switch — bottom right */}
      <div className="fixed bottom-20 right-5 z-50 flex items-center gap-2 rounded-full bg-white/90 dark:bg-slate-900/90 backdrop-blur border border-slate-200 dark:border-slate-700 shadow-xl px-2.5 py-1.5" data-testid="landing-theme-float">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400 hidden sm:inline">Theme</span>
        <ThemeToggle />
      </div>
    </div>
  );
}
