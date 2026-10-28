import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sun, Moon } from "lucide-react";

const KEY = "fmc_theme";

function currentIsDark() {
  return document.documentElement.classList.contains("dark");
}

export function applyTheme(dark) {
  const el = document.documentElement;
  el.classList.add("theme-anim");
  if (dark) el.classList.add("dark");
  else el.classList.remove("dark");
  try { localStorage.setItem(KEY, dark ? "dark" : "light"); } catch (e) {}
  window.setTimeout(() => el.classList.remove("theme-anim"), 400);
}

export function useTheme() {
  const [dark, setDark] = useState(currentIsDark());
  useEffect(() => {
    // keep in sync if changed elsewhere
    setDark(currentIsDark());
  }, []);
  const toggle = useCallback(() => {
    const next = !currentIsDark();
    applyTheme(next);
    setDark(next);
  }, []);
  return { dark, toggle };
}

/**
 * Sleek segmented sun/moon theme switch. One click flips the whole app.
 */
export default function ThemeToggle({ className = "" }) {
  const { dark, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      data-testid="theme-toggle"
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
      className={`relative inline-flex items-center h-7 w-[52px] rounded-full p-0.5 transition-colors duration-300 overflow-hidden shrink-0
        ${dark ? "bg-slate-800 border border-slate-700" : "bg-amber-100/70 border border-amber-200"} ${className}`}
    >
      {/* decorative track icons */}
      <Sun className={`absolute left-1.5 w-3 h-3 transition-opacity ${dark ? "opacity-30 text-slate-500" : "opacity-0"}`} />
      <Moon className={`absolute right-1.5 w-3 h-3 transition-opacity ${dark ? "opacity-0" : "opacity-40 text-amber-500"}`} />
      {/* sliding knob */}
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 500, damping: 32 }}
        className={`relative z-10 grid place-items-center w-5 h-5 rounded-full shadow-md ${dark ? "ml-auto bg-slate-950 ring-1 ring-emerald-500/40" : "bg-white"}`}
      >
        <AnimatePresence mode="wait" initial={false}>
          {dark ? (
            <motion.span key="moon" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.2 }}>
              <Moon className="w-3 h-3 text-emerald-400" fill="currentColor" />
            </motion.span>
          ) : (
            <motion.span key="sun" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.2 }}>
              <Sun className="w-3 h-3 text-amber-500" fill="currentColor" />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.span>
    </button>
  );
}
