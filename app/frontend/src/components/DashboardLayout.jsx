import { useState, useRef, useEffect } from "react";
import { NavLink, Outlet, Link, useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth, getDefaultDashboard } from "@/lib/auth";
import { useSubscription } from "@/lib/subscription";
import { LayoutDashboard, Building2, Users, UsersRound, Archive, Receipt, CreditCard, AlertTriangle, Bell, BarChart3, Sparkles, Settings, LogOut, ChevronDown, MessageSquare, Fuel, Wrench, HardHat, LifeBuoy, Menu, X, Wallet, Ticket, Zap, Lock } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { NotificationBell } from "@/components/NotificationBell";
import ThemeToggle from "@/components/ThemeToggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

// Grouped navigation with parent → child structure
const groups = [
  { label: "Overview", to: "/dashboard", icon: LayoutDashboard, exact: true },
  { label: "Properties", to: "/dashboard/properties", icon: Building2 },
  { label: "Tenants", icon: Users, children: [
    { label: "Current tenants", to: "/dashboard/tenants", icon: UsersRound },
    { label: "Past tenants", to: "/dashboard/past-tenants", icon: Archive },
  ]},
  { label: "Financials", icon: Wallet, children: [
    { label: "Rent records", to: "/dashboard/rent", icon: Receipt },
    { label: "Payments", to: "/dashboard/payments", icon: CreditCard },
    { label: "Utility bills", to: "/dashboard/bills", icon: Zap, feature: "bills" },
    { label: "Expenses & P&L", to: "/dashboard/expenses", icon: Receipt },
    { label: "Overdue", to: "/dashboard/overdue", icon: AlertTriangle },
  ]},
  { label: "Maintenance", icon: Wrench, feature: "maintenance", children: [
    { label: "Complaints", to: "/dashboard/maintenance", icon: Wrench },
    { label: "Facility managers", to: "/dashboard/facility-managers", icon: HardHat },
  ]},
  { label: "Communication", icon: MessageSquare, children: [
    { label: "Messages", to: "/dashboard/messages", icon: MessageSquare },
    { label: "AI reminders", to: "/dashboard/reminders", icon: Bell },
    { label: "Support", to: "/dashboard/support", icon: LifeBuoy },
  ]},
  { label: "Reports", to: "/dashboard/reports", icon: BarChart3, feature: "reports" },
];

const bottomGroups = [
  { label: "Billing & Plan", to: "/dashboard/billing", icon: Sparkles },
  { label: "Settings", to: "/dashboard/settings", icon: Settings },
];

function isChildActive(children, pathname) {
  return children?.some((c) => pathname === c.to || pathname.startsWith(c.to + "/"));
}

function SidebarGroup({ g, open, onLinkClick, pathname, can }) {
  const locked = g.feature && !can(g.feature);
  const active = g.to
    ? (g.exact ? pathname === g.to : pathname.startsWith(g.to))
    : isChildActive(g.children, pathname);
  const [expanded, setExpanded] = useState(active);
  useEffect(() => { if (active) setExpanded(true); }, [active]);

  // Locked leaf or locked group -> route to billing with a lock indicator
  if (locked) {
    return (
      <NavLink to="/dashboard/billing" onClick={onLinkClick}
        data-testid={`nav-locked-${g.label.toLowerCase().replace(/ /g, "-")}`}
        title={`${g.label} is available on a paid plan`}
        className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-500 hover:bg-slate-800/50 hover:text-slate-300 transition-all">
        <g.icon className="w-4 h-4 shrink-0" strokeWidth={1.75} />
        <span className="truncate flex-1">{g.label}</span>
        <Lock className="w-3.5 h-3.5 text-amber-400/80" />
      </NavLink>
    );
  }

  if (!g.children) {
    return (
      <NavLink to={g.to} end={g.exact} onClick={onLinkClick}
        data-testid={`nav-${g.label.toLowerCase().replace(/ /g, "-")}`}
        className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${isActive ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shadow-sm shadow-emerald-500/10" : "text-slate-300 hover:bg-slate-800/70 hover:text-white"}`}>
        <g.icon className="w-4 h-4 shrink-0" strokeWidth={1.75} />
        <span className="truncate">{g.label}</span>
      </NavLink>
    );
  }

  return (
    <div>
      <button onClick={() => setExpanded((v) => !v)}
        data-testid={`nav-group-${g.label.toLowerCase()}`}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${active ? "text-emerald-300" : "text-slate-300 hover:text-white"} hover:bg-slate-800/70`}>
        <g.icon className="w-4 h-4 shrink-0" strokeWidth={1.75} />
        <span className="truncate flex-1 text-left">{g.label}</span>
        <motion.div animate={{ rotate: expanded ? 0 : -90 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
        </motion.div>
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
            <div className="ml-3 mt-1 pl-4 border-l border-slate-800 space-y-0.5 py-1">
              {g.children.map((c) => {
                const childLocked = c.feature && !can(c.feature);
                if (childLocked) {
                  return (
                    <NavLink key={c.to} to="/dashboard/billing" onClick={onLinkClick}
                      data-testid={`nav-locked-${c.label.toLowerCase().replace(/ /g, "-")}`}
                      title={`${c.label} is available on a paid plan`}
                      className="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs font-medium text-slate-500 hover:text-slate-300 hover:bg-slate-800/40 transition-all">
                      <c.icon className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
                      <span className="truncate flex-1">{c.label}</span>
                      <Lock className="w-3 h-3 text-amber-400/80" />
                    </NavLink>
                  );
                }
                return (
                  <NavLink key={c.to} to={c.to} onClick={onLinkClick}
                    data-testid={`nav-${c.label.toLowerCase().replace(/ /g, "-")}`}
                    className={({ isActive }) => `flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs font-medium transition-all ${isActive ? "bg-emerald-500/15 text-emerald-300" : "text-slate-400 hover:text-white hover:bg-slate-800/50"}`}>
                    <c.icon className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
                    <span className="truncate">{c.label}</span>
                  </NavLink>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function DashboardLayout() {
  const { user, logout } = useAuth();
  const { can } = useSubscription();
  const nav = useNavigate();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  const closeTimer = useRef(null);
  const initials = (user?.full_name || "U").split(" ").map(s => s[0]).slice(0, 2).join("").toUpperCase();
  const home = getDefaultDashboard(user);
  const doLogout = () => { logout(); nav("/login"); };
  const closeMenu = () => setOpen(false);

  // Auto-hide when cursor leaves sidebar (small delay to be forgiving)
  const onMouseEnter = () => { if (closeTimer.current) clearTimeout(closeTimer.current); };
  const onMouseLeave = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 350);
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col">
      {/* Hover-hotzone strip on the left edge to invite the sidebar */}
      <div onMouseEnter={() => setOpen(true)}
        className="fixed left-0 top-0 h-screen w-2 z-30 hidden lg:block" aria-hidden="true" />

      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={closeMenu}
            className="fixed inset-0 bg-slate-900/40 z-30 backdrop-blur-sm lg:hidden" />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.aside
            initial={{ x: -320 }}
            animate={{ x: 0 }}
            exit={{ x: -320 }}
            transition={{ type: "spring", damping: 24, stiffness: 220 }}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            data-testid="sidebar"
            className="fixed top-0 left-0 h-screen w-72 z-40 bg-slate-950 text-slate-100 border-r border-slate-800 flex flex-col shadow-2xl">
            <div className="h-16 flex items-center justify-between px-5 border-b border-slate-800">
              <Link to={home} onClick={closeMenu} className="flex items-center gap-2.5 group" data-testid="sidebar-logo">
                <motion.div whileHover={{ rotate: -8, scale: 1.1 }} className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-white grid place-items-center font-display font-black text-lg shadow-lg shadow-emerald-500/50 ring-1 ring-emerald-300/40">F</motion.div>
                <span className="font-display font-black tracking-tighter text-lg text-white">FixMyCribs<span className="text-orange-400 ml-0.5">NG</span></span>
              </Link>
              <button onClick={closeMenu} className="p-1.5 rounded-md hover:bg-slate-800 lg:hidden" data-testid="sidebar-close">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>
            <div className="tiny-label text-slate-500 px-5 pt-5">Workspace</div>
            <nav className="flex-1 px-3 py-3 space-y-1 overflow-y-auto">
              {groups.map((g) => <SidebarGroup key={g.label} g={g} open={open} onLinkClick={closeMenu} pathname={loc.pathname} can={can} />)}
              <div className="pt-4 mt-4 border-t border-slate-800 space-y-1">
                <div className="tiny-label text-slate-500 px-3 pb-2">Account</div>
                {bottomGroups.map((g) => <SidebarGroup key={g.label} g={g} open={open} onLinkClick={closeMenu} pathname={loc.pathname} can={can} />)}
              </div>
            </nav>
            <div className="p-3 border-t border-slate-800 space-y-3">
              <div className="flex items-center justify-between px-1">
                <span className="tiny-label text-slate-500">Appearance</span>
                <ThemeToggle />
              </div>
              <div className="px-3 py-2.5 rounded-lg bg-gradient-to-br from-emerald-900/40 to-slate-900 border border-emerald-800/40 text-xs">
                <div className="tiny-label text-emerald-400">Current plan</div>
                <div className="text-sm font-bold text-white capitalize mt-0.5">{user?.plan || "starter"}</div>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main content */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 border-b border-slate-200 bg-white/80 backdrop-blur-md flex items-center gap-3 px-6 sticky top-0 z-20">
          <button onClick={() => setOpen(true)} className="p-2 -ml-2 rounded-md hover:bg-slate-100 transition-colors" data-testid="menu-toggle" aria-label="Open menu">
            <Menu className="w-5 h-5 text-slate-700" />
          </button>
          <Link to={home} className="flex items-center gap-2 group" data-testid="header-logo">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-700 text-white grid place-items-center font-display font-black shadow-md shadow-emerald-500/40 ring-1 ring-emerald-400/40">F</div>
            <span className="font-display font-black tracking-tighter text-lg text-slate-900">
              FixMyCribs<span className="text-orange-600 ml-0.5">NG</span>
            </span>
          </Link>
          <div className="flex-1" />
          <NotificationBell theme="light" />
          <DropdownMenu>
            <DropdownMenuTrigger data-testid="user-menu-trigger" className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-slate-100 transition-colors">
              <Avatar className="w-8 h-8 ring-2 ring-emerald-500/20"><AvatarFallback className="bg-gradient-to-br from-emerald-500 to-emerald-700 text-white text-xs font-bold">{initials}</AvatarFallback></Avatar>
              <div className="hidden sm:block text-left leading-tight">
                <div className="text-sm font-medium">{user?.full_name}</div>
                <div className="text-xs text-slate-500">{user?.email}</div>
              </div>
              <ChevronDown className="w-4 h-4 text-slate-400" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => nav("/dashboard/settings")} data-testid="menu-settings"><Settings className="w-4 h-4 mr-2" /> Settings</DropdownMenuItem>
              <DropdownMenuItem onClick={() => nav("/dashboard/billing")} data-testid="menu-billing"><Sparkles className="w-4 h-4 mr-2" /> Billing & Plan</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={doLogout} data-testid="menu-logout" className="text-red-600 focus:text-red-700"><LogOut className="w-4 h-4 mr-2" /> Log out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <motion.main key={loc.pathname} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="flex-1 p-6 md:p-8" data-testid="dashboard-main">
          <Outlet />
        </motion.main>
        <AppFooter />
      </div>
    </div>
  );
}

export function AppFooter() {
  return (
    <footer className="border-t border-slate-200 bg-slate-950 text-slate-300 py-10 px-6 md:px-8" data-testid="app-footer">
      <div className="max-w-7xl mx-auto grid md:grid-cols-4 gap-8 text-sm">
        <div>
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-white grid place-items-center font-display font-black text-lg shadow-lg shadow-emerald-500/40">F</div>
            <span className="font-display font-black tracking-tighter text-white text-xl">FixMyCribs<span className="text-orange-400 ml-0.5">NG</span></span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">Property & rent management built for Nigerian landlords.</p>
        </div>
        <div>
          <div className="tiny-label text-slate-500 mb-3">Company</div>
          <ul className="space-y-1.5 text-xs">
            <li className="text-slate-300 font-medium">FixMyCribs Technologies Ltd</li>
            <li className="text-slate-500">RC No: pending registration</li>
            <li className="text-slate-500">Lagos, Nigeria</li>
          </ul>
        </div>
        <div>
          <div className="tiny-label text-slate-500 mb-3">Contact</div>
          <ul className="space-y-1.5 text-xs">
            <li><a href="mailto:support@fixmycribs.com" className="text-slate-400 hover:text-white transition-colors">support@fixmycribs.com</a></li>
            <li><a href="mailto:hello@fixmycribs.com" className="text-slate-400 hover:text-white transition-colors">hello@fixmycribs.com</a></li>
            <li><a href="tel:+2348000000000" className="text-slate-400 hover:text-white transition-colors">+234 800 000 0000</a></li>
          </ul>
        </div>
        <div>
          <div className="tiny-label text-slate-500 mb-3">Legal</div>
          <ul className="space-y-1.5 text-xs">
            <li><Link to="/legal/terms" className="text-slate-400 hover:text-white transition-colors">Terms of Service</Link></li>
            <li><Link to="/legal/privacy" className="text-slate-400 hover:text-white transition-colors">Privacy Policy</Link></li>
            <li><Link to="/legal/refund" className="text-slate-400 hover:text-white transition-colors">Refund Policy</Link></li>
          </ul>
        </div>
      </div>
      <div className="max-w-7xl mx-auto mt-8 pt-4 border-t border-slate-800 text-xs text-slate-500 text-center">
        © {new Date().getFullYear()} FixMyCribs Technologies Ltd · All rights reserved
      </div>
    </footer>
  );
}
