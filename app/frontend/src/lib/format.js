export const formatNaira = (n) =>
  "₦" + Number(n || 0).toLocaleString("en-NG", { maximumFractionDigits: 0 });

export const formatDate = (d) => {
  if (!d) return "-";
  try {
    const date = typeof d === "string" ? new Date(d) : d;
    return date.toLocaleDateString("en-NG", { year: "numeric", month: "short", day: "numeric" });
  } catch { return d; }
};

export const todayISO = () => new Date().toISOString().split("T")[0];

export const statusStyles = {
  paid: "bg-emerald-100 text-emerald-800 border-emerald-300",
  partially_paid: "bg-amber-100 text-amber-800 border-amber-300",
  pending: "bg-amber-100 text-amber-800 border-amber-300",
  upcoming: "bg-slate-100 text-slate-700 border-slate-300",
  due_today: "bg-orange-100 text-orange-800 border-orange-300",
  overdue: "bg-red-100 text-red-800 border-red-300",
  active: "bg-emerald-100 text-emerald-800 border-emerald-300",
  vacant: "bg-slate-100 text-slate-700 border-slate-300",
  archived: "bg-slate-100 text-slate-500 border-slate-300",
};

export const statusLabel = (s) => {
  if (!s) return "-";
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
};
