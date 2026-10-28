import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { ChevronsUpDown, Check, Search } from "lucide-react";

/**
 * Scalable, server-searched tenant picker (typeahead).
 * Queries /tenants?page=1&q=... (property-scoped) so it never loads every tenant.
 */
export default function TenantSelect({ propertyId, value, onChange, placeholder = "Select tenant", testId = "tenant-select" }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState([]);
  const [label, setLabel] = useState("");
  const [loading, setLoading] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    let active = true;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const qs = new URLSearchParams({ page: "1", page_size: "10", q: query });
        if (propertyId) qs.set("property_id", propertyId);
        const { data } = await api.get(`/tenants?${qs.toString()}`);
        if (active) setOptions(data.items || []);
      } finally {
        if (active) setLoading(false);
      }
    }, query ? 220 : 0);
    return () => { active = false; clearTimeout(t); };
  }, [query, propertyId, open]);

  // Resolve the label for a preselected value
  useEffect(() => {
    if (!value) { setLabel(""); return; }
    const found = options.find((o) => o.id === value);
    if (found) setLabel(`${found.full_name} · ${found.apartment_number || "—"}`);
  }, [value, options]);

  return (
    <div className="relative mt-1.5" ref={boxRef} data-testid={testId}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        data-testid={`${testId}-trigger`}
        className="w-full flex items-center justify-between gap-2 h-10 px-3 rounded-md border border-slate-200 bg-white text-sm text-left hover:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-400"
      >
        <span className={label ? "text-slate-900 truncate" : "text-slate-400"}>{label || placeholder}</span>
        <ChevronsUpDown className="w-4 h-4 text-slate-400 shrink-0" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-xl overflow-hidden">
          <div className="relative border-b border-slate-100">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tenant…" className="pl-9 border-0 focus-visible:ring-0 rounded-none" data-testid={`${testId}-input`} />
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {loading && <div className="px-3 py-2 text-xs text-slate-400">Searching…</div>}
            {!loading && options.length === 0 && <div className="px-3 py-2 text-xs text-slate-400">No tenants found</div>}
            {options.map((o) => (
              <button
                key={o.id}
                type="button"
                data-testid={`${testId}-option-${o.id}`}
                onClick={() => { onChange(o.id); setLabel(`${o.full_name} · ${o.apartment_number || "—"}`); setOpen(false); setQuery(""); }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-emerald-50 ${o.id === value ? "bg-emerald-50 text-emerald-700" : "text-slate-700"}`}
              >
                <Check className={`w-3.5 h-3.5 shrink-0 ${o.id === value ? "opacity-100 text-emerald-600" : "opacity-0"}`} />
                <span className="truncate">{o.full_name}</span>
                <span className="text-xs text-slate-400 ml-auto shrink-0">{o.apartment_number || "—"}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
