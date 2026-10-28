import { useRef, useState } from "react";
import { NavLink, Outlet, Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth, getDefaultDashboard } from "@/lib/auth";
import { LayoutDashboard, Wrench, LogOut, ChevronDown, Settings, HardHat, Menu, X, Receipt } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { NotificationBell } from "@/components/NotificationBell";
import ThemeToggle from "@/components/ThemeToggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AppFooter } from "@/components/DashboardLayout";

const links = [
  { to: "/facility-manager", icon: LayoutDashboard, label: "Overview", exact: true },
  { to: "/facility-manager/complaints", icon: Wrench, label: "Complaints" },
  { to: "/facility-manager/expenses", icon: Receipt, label: "Expenses" },
  { to: "/facility-manager/settings", icon: Settings, label: "Settings" },
];

export default function FacilityManagerLayout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const closeTimer = useRef(null);
  const onEnter = () => { if (closeTimer.current) clearTimeout(closeTimer.current); };
  const onLeave = () => { if (closeTimer.current) clearTimeout(closeTimer.current); closeTimer.current = setTimeout(() => setOpen(false), 350); };
  const initials = (user?.full_name || "F").split(" ").map(s => s[0]).slice(0, 2).join("").toUpperCase();
  const home = getDefaultDashboard(user);
  const doLogout = () => { logout(); nav("/login"); };
  const closeMenu = () => setOpen(false);

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
            className="fixed top-0 left-0 h-screen w-72 z-40 bg-slate-950 text-slate-100 border-r border-slate-800 flex flex-col shadow-2xl">
        <div className="h-16 flex items-center justify-between px-5 border-b border-slate-800">
          <Link to={home} onClick={closeMenu} className="flex items-center gap-2" data-testid="fm-sidebar-logo">
            <div className="w-8 h-8 rounded-md bg-blue-600 text-white grid place-items-center"><HardHat className="w-4 h-4" /></div>
            <span className="font-display font-bold tracking-tight">FixMyCribs<span className="text-blue-400"> Field</span></span>
          </Link>
          <button onClick={closeMenu} className="p-1.5 rounded hover:bg-slate-800" data-testid="fm-sidebar-close"><X className="w-4 h-4" /></button>
        </div>
        <nav className="flex-1 px-3 py-6 space-y-1">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.exact} onClick={closeMenu} data-testid={`fm-nav-${l.label.toLowerCase()}`}
              className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium ${isActive ? "bg-blue-600/20 text-blue-300 border border-blue-600/40" : "text-slate-300 hover:bg-slate-800 hover:text-white"}`}>
              <l.icon className="w-4 h-4" strokeWidth={1.75} /> {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-slate-800 space-y-2">
          <div className="flex items-center justify-between px-3">
            <span className="tiny-label text-blue-300">Appearance</span>
            <ThemeToggle />
          </div>
          <div className="px-3 py-2 rounded-md bg-blue-900/30 border border-blue-800/40 text-xs">
            <div className="tiny-label text-blue-300">Facility manager</div>
            <div className="text-sm font-semibold text-white mt-0.5">{user?.full_name}</div>
          </div>
        </div>
      </motion.aside>
      )}
      </AnimatePresence>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 border-b border-slate-200 bg-white flex items-center gap-3 px-6 sticky top-0 z-20">
          <button onClick={() => setOpen(true)} className="p-2 -ml-2 rounded-md hover:bg-slate-100" data-testid="fm-menu-toggle"><Menu className="w-5 h-5 text-slate-700" /></button>
          <Link to={home} className="font-display font-bold tracking-tight" data-testid="fm-header-logo">FixMyCribs<span className="text-blue-600"> Field</span></Link>
          <div className="flex-1" />
          <NotificationBell theme="light" />
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-slate-50" data-testid="fm-user-menu">
              <Avatar className="w-8 h-8"><AvatarFallback className="bg-blue-600 text-white text-xs font-bold">{initials}</AvatarFallback></Avatar>
              <div className="hidden sm:block text-left leading-tight">
                <div className="text-sm font-medium">{user?.full_name}</div>
                <div className="text-xs text-slate-500">Facility manager</div>
              </div>
              <ChevronDown className="w-4 h-4 text-slate-400" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => nav("/facility-manager/settings")}><Settings className="w-4 h-4 mr-2" /> Settings</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={doLogout} data-testid="fm-menu-logout" className="text-red-600"><LogOut className="w-4 h-4 mr-2" /> Log out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <main className="flex-1 p-6 md:p-8" data-testid="fm-main"><Outlet /></main>
        <AppFooter />
      </div>
    </div>
  );
}
