import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { NavLink, Outlet, Link, useNavigate } from "react-router-dom";
import { useAuth, getDefaultDashboard } from "@/lib/auth";
import { LayoutDashboard, Users, CreditCard, Package, Scroll, LogOut, ChevronDown, Shield, Menu, X, Ticket, Settings as SettingsIcon } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { NotificationBell } from "@/components/NotificationBell";
import ThemeToggle from "@/components/ThemeToggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AppFooter } from "@/components/DashboardLayout";

const links = [
  { to: "/admin", icon: LayoutDashboard, label: "Overview", exact: true },
  { to: "/admin/users", icon: Users, label: "Users" },
  { to: "/admin/support-tickets", icon: Ticket, label: "Support tickets" },
  { to: "/admin/support-staff", icon: Users, label: "Support Staff" },
  { to: "/admin/subscriptions", icon: CreditCard, label: "Subscriptions" },
  { to: "/admin/plans", icon: Package, label: "Plans" },
  { to: "/admin/audit-logs", icon: Scroll, label: "Audit logs" },
  { to: "/admin/settings", icon: SettingsIcon, label: "Settings" },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const closeTimer = useRef(null);
  const onEnter = () => { if (closeTimer.current) clearTimeout(closeTimer.current); };
  const onLeave = () => { if (closeTimer.current) clearTimeout(closeTimer.current); closeTimer.current = setTimeout(() => setOpen(false), 350); };
  const initials = (user?.full_name || "A").split(" ").map(s => s[0]).slice(0, 2).join("").toUpperCase();
  const home = getDefaultDashboard(user);
  const doLogout = () => { logout(); nav("/login"); };
  const closeMenu = () => setOpen(false);

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col text-white">
      <div onMouseEnter={() => setOpen(true)} className="fixed left-0 top-0 h-screen w-2 z-30 hidden lg:block" />
      <AnimatePresence>
        {open && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={closeMenu} className="fixed inset-0 bg-black/60 z-30 backdrop-blur-sm lg:hidden" />}
      </AnimatePresence>
      <AnimatePresence>
        {open && (
      <motion.aside initial={{ x: -320 }} animate={{ x: 0 }} exit={{ x: -320 }} transition={{ type: "spring", damping: 24, stiffness: 220 }} onMouseEnter={onEnter} onMouseLeave={onLeave} className="fixed top-0 left-0 h-screen w-72 z-40 bg-slate-950 text-slate-100 border-r border-slate-800 flex flex-col shadow-2xl">
        <div className="h-16 flex items-center justify-between px-5 border-b border-slate-800">
          <Link to={home} onClick={closeMenu} className="flex items-center gap-2" data-testid="admin-sidebar-logo">
            <div className="w-8 h-8 rounded-md bg-orange-600 text-white grid place-items-center"><Shield className="w-4 h-4" /></div>
            <span className="font-display font-bold tracking-tight">FixMyCribs<span className="text-orange-400"> Admin</span></span>
          </Link>
          <button onClick={closeMenu} className="p-1.5 rounded hover:bg-slate-800" data-testid="admin-sidebar-close"><X className="w-4 h-4" /></button>
        </div>
        <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.exact} onClick={closeMenu} data-testid={`admin-nav-${l.label.toLowerCase().replace(/ /g, "-")}`}
              className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium ${isActive ? "bg-orange-600/20 text-orange-300 border border-orange-600/40" : "text-slate-300 hover:bg-slate-800 hover:text-white"}`}>
              <l.icon className="w-4 h-4" strokeWidth={1.75} /> {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-slate-800 space-y-2">
          <div className="flex items-center justify-between px-3">
            <span className="tiny-label text-orange-300">Appearance</span>
            <ThemeToggle />
          </div>
          <div className="px-3 py-2 rounded-md bg-orange-900/30 border border-orange-800/50 text-xs">
            <div className="tiny-label text-orange-300">Admin</div>
            <div className="text-sm font-semibold mt-0.5 text-white truncate">{user?.email}</div>
          </div>
        </div>
      </motion.aside>
      )}
      </AnimatePresence>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 border-b border-slate-800 bg-slate-950 flex items-center gap-3 px-6 sticky top-0 z-20">
          <button onClick={() => setOpen(true)} className="p-2 -ml-2 rounded-md hover:bg-slate-800" data-testid="admin-menu-toggle" aria-label="Open menu"><Menu className="w-5 h-5 text-slate-200" /></button>
          <Link to={home} className="font-display font-bold tracking-tight" data-testid="admin-header-logo">FixMyCribs<span className="text-orange-400"> Admin</span></Link>
          <div className="flex-1" />
          <NotificationBell theme="dark" />
          <DropdownMenu>
            <DropdownMenuTrigger data-testid="admin-user-menu" className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-slate-800">
              <Avatar className="w-8 h-8"><AvatarFallback className="bg-orange-600 text-white text-xs font-bold">{initials}</AvatarFallback></Avatar>
              <div className="hidden sm:block text-left leading-tight">
                <div className="text-sm font-medium text-white">{user?.full_name}</div>
                <div className="text-xs text-slate-400">Administrator</div>
              </div>
              <ChevronDown className="w-4 h-4 text-slate-400" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => nav("/admin/settings")} data-testid="admin-menu-settings"><SettingsIcon className="w-4 h-4 mr-2" /> Settings</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={doLogout} data-testid="admin-menu-logout" className="text-red-600 focus:text-red-700"><LogOut className="w-4 h-4 mr-2" /> Log out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <main className="flex-1 p-6 md:p-8 bg-slate-900 text-slate-100" data-testid="admin-main"><Outlet /></main>
        <AppFooter />
      </div>
    </div>
  );
}
