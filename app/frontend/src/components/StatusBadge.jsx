import { statusStyles, statusLabel } from "@/lib/format";

export default function StatusBadge({ status, className = "" }) {
  const cls = statusStyles[status] || "bg-slate-100 text-slate-700 border-slate-300";
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${cls} ${className}`}>
      {statusLabel(status)}
    </span>
  );
}
