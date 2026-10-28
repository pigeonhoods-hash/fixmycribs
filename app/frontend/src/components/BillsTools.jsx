import { useCallback, useEffect, useMemo, useState } from "react";
import { api, API } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { saveAs } from "file-saver";
import { formatNaira } from "@/lib/format";
import { Download, Upload, FileSpreadsheet, Sparkles, Check, X, Loader2, UserPlus } from "lucide-react";

const CUR_YEAR = new Date().getFullYear();
const CUR_MONTH = `${CUR_YEAR}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;

export default function BillsTools({ properties = [], defaultPropertyId = "all", defaultMonth, onImported }) {
  const [tenants, setTenants] = useState([]);
  useEffect(() => {
    api.get("/tenants").then((r) => setTenants(r.data)).catch(() => {});
  }, []);

  // ---------- Export ----------
  const [exportOpen, setExportOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [ex, setEx] = useState({
    property_id: defaultPropertyId || "all",
    period: "all",
    month: defaultMonth || CUR_MONTH,
    year: String(CUR_YEAR),
    tenant_id: "all",
  });

  const exTenants = useMemo(
    () => tenants.filter((t) => ex.property_id === "all" || t.property_id === ex.property_id),
    [tenants, ex.property_id]
  );

  const doExport = async () => {
    setDownloading(true);
    try {
      const params = { period: ex.period };
      if (ex.period === "month") params.month = ex.month;
      if (ex.period === "year") params.year = ex.year;
      if (ex.property_id !== "all") params.property_id = ex.property_id;
      if (ex.tenant_id !== "all") params.tenant_id = ex.tenant_id;
      const token = localStorage.getItem("fmc_token");
      const res = await api.get("/bills/export", {
        params,
        responseType: "blob",
        headers: { Authorization: `Bearer ${token}` },
      });
      const dispo = res.headers["content-disposition"] || "";
      const m = dispo.match(/filename="?([^"]+)"?/);
      saveAs(res.data, m ? m[1] : "bills.xlsx");
      toast.success("Spreadsheet downloaded");
      setExportOpen(false);
    } catch (e) {
      toast.error("Export failed");
    } finally {
      setDownloading(false);
    }
  };

  // ---------- Import ----------
  const [importOpen, setImportOpen] = useState(false);
  const [impProp, setImpProp] = useState(defaultPropertyId && defaultPropertyId !== "all" ? defaultPropertyId : (properties[0]?.id || ""));
  const [file, setFile] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [preview, setPreview] = useState(null); // { matched:[], unmatched:[], property_name }
  const [addFlags, setAddFlags] = useState({}); // index -> bool

  useEffect(() => {
    if (importOpen && (!impProp || impProp === "all")) {
      setImpProp(defaultPropertyId && defaultPropertyId !== "all" ? defaultPropertyId : (properties[0]?.id || ""));
    }
  }, [importOpen, defaultPropertyId, properties, impProp]);

  const resetImport = () => { setFile(null); setPreview(null); setAddFlags({}); };

  const analyze = async () => {
    if (!impProp) return toast.error("Select a property");
    if (!file) return toast.error("Choose an Excel file");
    setAnalyzing(true);
    setPreview(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("property_id", impProp);
      const { data } = await api.post("/bills/import/analyze", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setPreview(data);
      // default: add all unmatched
      const flags = {};
      (data.unmatched || []).forEach((_, i) => { flags[i] = true; });
      setAddFlags(flags);
      if ((data.summary?.total_rows || 0) === 0) toast.info("No bill rows detected in the file");
    } catch (e) {
      toast.error(e.response?.data?.detail || "The AI could not read this file");
    } finally {
      setAnalyzing(false);
    }
  };

  const commit = async () => {
    if (!preview) return;
    const rows = [];
    (preview.matched || []).forEach((r) => rows.push({ ...r, action: "import", create_tenant: false }));
    (preview.unmatched || []).forEach((r, i) =>
      rows.push({ ...r, action: addFlags[i] ? "import" : "skip", create_tenant: !!addFlags[i] })
    );
    setCommitting(true);
    try {
      const { data } = await api.post("/bills/import/commit", { property_id: preview.property_id, rows });
      toast.success(`Imported ${data.created_bills} bill(s)${data.created_tenants ? `, added ${data.created_tenants} tenant(s)` : ""}${data.skipped ? `, skipped ${data.skipped}` : ""}`);
      setImportOpen(false);
      resetImport();
      onImported && onImported();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Import failed");
    } finally {
      setCommitting(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setExportOpen(true)} className="border-emerald-300 text-emerald-700 hover:bg-emerald-50" data-testid="bills-export-btn">
          <Download className="w-4 h-4 mr-1.5" /> Export Excel
        </Button>
        <Button variant="outline" onClick={() => setImportOpen(true)} className="border-indigo-300 text-indigo-700 hover:bg-indigo-50" data-testid="bills-import-btn">
          <Sparkles className="w-4 h-4 mr-1.5" /> AI Import
        </Button>
      </div>

      {/* EXPORT DIALOG */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display text-xl sm:text-2xl flex items-center gap-2"><FileSpreadsheet className="w-5 h-5 text-emerald-600" /> Export bills to Excel</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Property</Label>
              <Select value={ex.property_id} onValueChange={(v) => setEx({ ...ex, property_id: v, tenant_id: "all" })}>
                <SelectTrigger className="mt-1.5" data-testid="export-property"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All properties (combined)</SelectItem>
                  {properties.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Period</Label>
                <Select value={ex.period} onValueChange={(v) => setEx({ ...ex, period: v })}>
                  <SelectTrigger className="mt-1.5" data-testid="export-period"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All time</SelectItem>
                    <SelectItem value="month">Specific month</SelectItem>
                    <SelectItem value="year">Specific year</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {ex.period === "month" && (
                <div>
                  <Label>Month</Label>
                  <Input type="month" value={ex.month} onChange={(e) => setEx({ ...ex, month: e.target.value })} className="mt-1.5" data-testid="export-month" />
                </div>
              )}
              {ex.period === "year" && (
                <div>
                  <Label>Year</Label>
                  <Input type="number" min="2000" max="2100" value={ex.year} onChange={(e) => setEx({ ...ex, year: e.target.value })} className="mt-1.5" data-testid="export-year" />
                </div>
              )}
            </div>
            {ex.property_id !== "all" && (
              <div>
                <Label>Tenant</Label>
                <Select value={ex.tenant_id} onValueChange={(v) => setEx({ ...ex, tenant_id: v })}>
                  <SelectTrigger className="mt-1.5" data-testid="export-tenant"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All tenants</SelectItem>
                    {exTenants.map((t) => <SelectItem key={t.id} value={t.id}>{t.full_name} · {t.apartment_number || "—"}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded p-2.5">
              Each month becomes its own sheet. Within a sheet, properties are listed one after another with a subtotal per property.
            </div>
          </div>
          <DialogFooter>
            <Button onClick={doExport} disabled={downloading} className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="export-download-btn">
              {downloading ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Preparing…</> : <><Download className="w-4 h-4 mr-1.5" /> Download</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* IMPORT DIALOG */}
      <Dialog open={importOpen} onOpenChange={(o) => { setImportOpen(o); if (!o) resetImport(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-xl sm:text-2xl flex items-center gap-2"><Sparkles className="w-5 h-5 text-indigo-600" /> AI Excel import</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Property to import into</Label>
              <Select value={impProp} onValueChange={(v) => { setImpProp(v); setPreview(null); }}>
                <SelectTrigger className="mt-1.5" data-testid="import-property"><SelectValue placeholder="Select property" /></SelectTrigger>
                <SelectContent>
                  {properties.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Excel file (.xlsx)</Label>
              <Input type="file" accept=".xlsx,.xls" onChange={(e) => { setFile(e.target.files?.[0] || null); setPreview(null); }} className="mt-1.5" data-testid="import-file" />
              <div className="text-xs text-slate-500 mt-1.5">The AI reads any layout — tenant names, bill type, amount, amount paid, usage and dates — and turns it into bills.</div>
            </div>
            {!preview && (
              <Button onClick={analyze} disabled={analyzing || !file || !impProp} className="bg-indigo-600 hover:bg-indigo-700 text-white w-full" data-testid="import-analyze-btn">
                {analyzing ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Reading file with AI…</> : <><Sparkles className="w-4 h-4 mr-1.5" /> Analyze with AI</>}
              </Button>
            )}

            {preview && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg border border-slate-200 p-2.5"><div className="text-lg font-bold">{preview.summary.total_rows}</div><div className="tiny-label text-slate-500">Rows</div></div>
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5"><div className="text-lg font-bold text-emerald-700">{preview.summary.matched_count}</div><div className="tiny-label text-emerald-700">Matched</div></div>
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5"><div className="text-lg font-bold text-amber-700">{preview.summary.unmatched_count}</div><div className="tiny-label text-amber-700">Unmatched</div></div>
                </div>

                {preview.matched.length > 0 && (
                  <div>
                    <div className="tiny-label text-emerald-700 mb-1.5 flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Ready to import</div>
                    <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-40 overflow-y-auto">
                      {preview.matched.map((r, i) => (
                        <div key={i} className="flex items-center justify-between px-3 py-2 text-sm" data-testid={`import-matched-${i}`}>
                          <div className="min-w-0"><span className="font-medium">{r.matched_tenant_name}</span> <span className="text-slate-400">· {r.title}</span></div>
                          <div className="text-slate-600 whitespace-nowrap">{formatNaira(r.amount_due)}{r.amount_paid > 0 ? ` · paid ${formatNaira(r.amount_paid)}` : ""}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {preview.unmatched.length > 0 && (
                  <div>
                    <div className="tiny-label text-amber-700 mb-1.5 flex items-center gap-1"><UserPlus className="w-3.5 h-3.5" /> Tenant not found — add to records?</div>
                    <div className="border border-amber-200 rounded-lg divide-y divide-amber-100 max-h-52 overflow-y-auto">
                      {preview.unmatched.map((r, i) => (
                        <div key={i} className="flex items-center justify-between gap-2 px-3 py-2 text-sm bg-amber-50/40" data-testid={`import-unmatched-${i}`}>
                          <div className="min-w-0">
                            <div className="font-medium truncate">{r.tenant_name || "(no name)"} {r.apartment_number ? <span className="text-slate-400">· {r.apartment_number}</span> : null}</div>
                            <div className="text-xs text-slate-500">{r.title} · {formatNaira(r.amount_due)}</div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => setAddFlags({ ...addFlags, [i]: true })}
                              className={`text-xs px-2 py-1 rounded border ${addFlags[i] ? "bg-emerald-600 text-white border-emerald-600" : "bg-white border-slate-200 text-slate-600"}`}
                              data-testid={`import-add-${i}`}
                            ><UserPlus className="w-3 h-3 inline mr-0.5" /> Add</button>
                            <button
                              onClick={() => setAddFlags({ ...addFlags, [i]: false })}
                              className={`text-xs px-2 py-1 rounded border ${!addFlags[i] ? "bg-slate-700 text-white border-slate-700" : "bg-white border-slate-200 text-slate-600"}`}
                              data-testid={`import-skip-${i}`}
                            ><X className="w-3 h-3 inline mr-0.5" /> Skip</button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="text-xs text-slate-500 mt-1.5">Adding creates a new tenant in <span className="font-medium">{preview.property_name}</span> with the bill. Skipped rows are left out.</div>
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            {preview && <Button variant="outline" onClick={resetImport} data-testid="import-reset-btn">Choose another file</Button>}
            {preview && (
              <Button onClick={commit} disabled={committing} className="bg-indigo-600 hover:bg-indigo-700 text-white" data-testid="import-commit-btn">
                {committing ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Importing…</> : <><Check className="w-4 h-4 mr-1.5" /> Confirm import</>}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
