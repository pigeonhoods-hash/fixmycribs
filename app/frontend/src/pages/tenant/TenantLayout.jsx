import { useRef, useState } from "react";
import { NavLink, Outlet, Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth, getDefaultDashboard } from "@/lib/auth";
import { LayoutDashboard, MessageSquare, Settings, LogOut, ChevronDown, FileText, Wrench, LifeBuoy, Menu, X } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { NotificationBell } from "@/components/NotificationBell";
import ThemeToggle from "@/components/ThemeToggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AppFooter } from "@/components/DashboardLayout";

const links = [
  { to: "/tenant", icon: LayoutDashboard, label: "Overview", exact: true },
  { to: "/tenant/bills", icon: FileText, label: "Bills" },
  { to: "/tenant/complaints", icon: Wrench, label: "Complaints" },
  { to: "/tenant/messages", icon: MessageSquare, label: "Messages" },
  { to: "/tenant/support", icon: LifeBuoy, label: "Support" },
  { to: "/tenant/settings", icon: Settings, label: "Settings" },
];

export default function TenantLayout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const closeTimer = useRef(null);
  const initials = (user?.full_name || "T").split(" ").map(s => s[0]).slice(0, 2).join("").toUpperCase();
  const home = getDefaultDashboard(user);
  const doLogout = () => { logout(); nav("/login"); };
  const closeMenu = () => setOpen(false);
  const onEnter = () => { if (closeTimer.current) clearTimeout(closeTimer.current); };
  const onLeave = () => { if (closeTimer.current) clearTimeout(closeTimer.current); closeTimer.current = setTimeout(() => setOpen(false), 350); };

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col">
      <div onMouseEnter={() => setOpen(true)} className="fixed left-0 top-0 h-screen w-2 z-30 hidden lg:block" />
      <AnimatePresence>
        {open && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={closeMenu} className="fixed inset-0 bg-slate-900/40 z-30 backdrop-blur-sm lg:hidden" />}
      </AnimatePresence>
      <AnimatePresence>
        {open && (
          <motion.aside initial={{ x: -320 }} animate={{ x: 0 }} exit={{ x: -320 }} transition={{ type: "spring", damping: 24, stiffness: 220 }}
            onMouseEnter={onEnter} onMouseLeave={onLeave}
            className="fixed top-0 left-0 h-screen w-72 z-40 bg-emerald-950 text-emerald-50 border-r border-emerald-900 flex flex-col shadow-2xl">
            <div className="h-16 flex items-center justify-between px-5 border-b border-emerald-900">
              <Link to={home} onClick={closeMenu} className="flex items-center gap-2" data-testid="tenant-sidebar-logo">
                <div className="w-8 h-8 rounded-lg bg-emerald-500 text-white grid place-items-center font-bold font-display shadow-md shadow-emerald-500/40">F</div>
                <span className="font-display font-bold tracking-tight text-white">FixMyCribs<span className="text-orange-300"> NG</span></span>
              </Link>
              <button onClick={closeMenu} className="p-1.5 rounded hover:bg-emerald-900 lg:hidden" data-testid="tenant-sidebar-close"><X className="w-4 h-4" /></button>
            </div>
            <div className="tiny-label text-emerald-400 px-5 pt-5">Tenant portal</div>
            <nav className="flex-1 px-3 py-3 space-y-1 overflow-y-auto">
              {links.map((l) => (
                <NavLink key={l.to} to={l.to} end={l.exact} onClick={closeMenu} data-testid={`tenant-nav-${l.label.toLowerCase()}`}
                  className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${isActive ? "bg-emerald-800/60 text-white border border-emerald-700" : "text-emerald-100 hover:bg-emerald-900/70 hover:text-white"}`}>
                  <l.icon className="w-4 h-4" strokeWidth={1.75} /> {l.label}
                </NavLink>
              ))}
            </nav>
            <div className="p-3 border-t border-emerald-900 space-y-2">
              <div className="flex items-center justify-between px-3">
                <span className="tiny-label text-emerald-400">Appearance</span>
                <ThemeToggle />
              </div>
              <div className="px-3 py-2 rounded-lg bg-emerald-900/50 border border-emerald-800 text-xs">
                <div className="tiny-label text-emerald-300">Signed in as</div>
                <div className="text-sm font-semibold text-white mt-0.5">{user?.full_name}</div>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 border-b border-slate-200 bg-white/80 backdrop-blur-md flex items-center gap-3 px-6 sticky top-0 z-20">
          <button onClick={() => setOpen(true)} className="p-2 -ml-2 rounded-md hover:bg-slate-100" data-testid="tenant-menu-toggle"><Menu className="w-5 h-5 text-slate-700" /></button>
          <Link to={home} className="font-display font-bold tracking-tight" data-testid="tenant-header-logo">FixMyCribs<span className="text-orange-600"> NG</span></Link>
          <div className="flex-1" />
          <NotificationBell theme="light" />
          <DropdownMenu>
            <DropdownMenuTrigger data-testid="tenant-user-menu" className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-slate-100">
              <Avatar className="w-8 h-8 ring-2 ring-emerald-500/20"><AvatarFallback className="bg-gradient-to-br from-emerald-500 to-emerald-700 text-white text-xs font-bold">{initials}</AvatarFallback></Avatar>
              <div className="hidden sm:block text-left leading-tight">
                <div className="text-sm font-medium">{user?.full_name}</div>
                <div className="text-xs text-slate-500">Tenant</div>
              </div>
              <ChevronDown className="w-4 h-4 text-slate-400" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => nav("/tenant/settings")}><Settings className="w-4 h-4 mr-2" /> Settings</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={doLogout} data-testid="tenant-menu-logout" className="text-red-600"><LogOut className="w-4 h-4 mr-2" /> Log out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <main className="flex-1 p-6 md:p-8" data-testid="tenant-main"><Outlet /></main>
        <AppFooter />
      </div>
    </div>
  );
}
