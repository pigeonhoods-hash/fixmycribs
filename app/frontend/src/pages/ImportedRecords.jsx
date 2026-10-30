import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { formatNaira } from "@/lib/format";

const moneyFields = ["rent_amount", "service_charge", "total_amount", "amount_paid", "balance"];
const label = key => key.replaceAll("_", " ");
const amount = value => value == null ? "Not stated" : formatNaira(value);

export default function ImportedRecords() {
  const [params] = useSearchParams();
  const [data, setData] = useState({ records: [], properties: [] });
  const [filter, setFilter] = useState(params.get("property") || "all");
  const [query, setQuery] = useState("");
  const [payload, setPayload] = useState(null);
  const [preview, setPreview] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [page, setPage] = useState(0);
  const [detail, setDetail] = useState(null);
  const [financialPayload, setFinancialPayload] = useState(null);
  const [financialPreview, setFinancialPreview] = useState(null);
  const [financialState, setFinancialState] = useState({posted_entries:0,review_items:[]});
  const load = useCallback(async () => { const [r,f] = await Promise.all([api.get("/imported-records"),api.get("/financial-source-import")]); setData(r.data); setFinancialState(f.data); }, []);
  useEffect(() => { load().catch(e => setError(e.response?.data?.detail || "Could not load history")); }, [load]);
  async function selectFile(event) {
    setError(""); setPreview(null); setPayload(null); setMessage("");
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setError("Use a JSON file smaller than 2 MB"); return; }
    try { const value = JSON.parse(await file.text()); setPayload(value); }
    catch { setError("The file is not valid JSON"); }
  }
  async function runImport(commit) {
    setBusy(true); setError("");
    try {
      const r = await api.post(`/portfolio-source-import?dry_run=${!commit}`, payload);
      if (commit) { setMessage(`Saved ${r.data.receipts_to_add} source records, ${r.data.properties_to_add} properties and ${r.data.occupants_to_add} occupants. ${r.data.already_imported} already imported. No invitations or new charges created.`); setPreview(null); await load(); }
      else setPreview(r.data);
    } catch(e) { setError(String(e.response?.data?.detail || e.message)); setPreview(null); }
    finally { setBusy(false); }
  }
  async function selectFinances(event) {
    setError(""); setFinancialPreview(null); setFinancialPayload(null);
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setError("Use a JSON file smaller than 2 MB"); return; }
    try { setFinancialPayload(JSON.parse(await file.text())); }
    catch { setError("Invalid financial JSON"); }
  }
  async function postFinances(commit) {
    setBusy(true); setError("");
    try {
      const r = await api.post(`/financial-source-import?dry_run=${!commit}`, financialPayload);
      if (commit) { setMessage(`Posted ${r.data.entries_to_add} financial entries. ${r.data.already_posted} already posted. No invitations sent.`); setFinancialPreview(null); await load(); }
      else setFinancialPreview(r.data);
    } catch(e) { setError(String(e.response?.data?.detail || e.message)); setFinancialPreview(null); }
    finally { setBusy(false); }
  }
  function startEdit(record) {
    setEditing(record);
    setForm(Object.fromEntries(["tenant_name", "unit_number", "receipt_date", "payment_label", "notes", "occupancy_status", ...moneyFields].map(k => [k, record[k] ?? ""])));
  }
  async function save() {
    setBusy(true); setError("");
    try {
      const changes = { ...form, receipt_date: form.receipt_date || null };
      for (const key of moneyFields) changes[key] = form[key] === "" ? null : Number(form[key]);
      await api.patch(`/imported-records/${editing.id}`, changes);
      setEditing(null); setMessage("Changes saved. Original source values are retained."); await load();
    } catch(e) { setError(String(e.response?.data?.detail || e.message)); }
    finally { setBusy(false); }
  }
  const names = Object.fromEntries(data.properties.map(p => [p.id, p.name]));
  const matches = data.records.filter(r => (filter === "all" || (filter === "unassigned" ? !r.property_id : r.property_id === filter)) && `${r.tenant_name} ${r.receipt_number} ${r.source_sheet} ${r.unit_number}`.toLowerCase().includes(query.toLowerCase()));
  const shown = matches.slice(page * 40, page * 40 + 40);
  return <div className="space-y-6">
    <Link to="/dashboard/properties" className="text-sm text-emerald-700">Back to properties</Link>
    <h1 className="font-display text-3xl font-bold">Receipt and utility history</h1>
    <p className="text-slate-600">Editable records from your original files. Dates are receipt or payment references, not confirmed lease dates. Cumulative amounts, duplicate candidates and carried-forward balances must not be added as separate payments. These records do not generate new rent charges or invitations.</p>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {message && <p role="status" className="text-emerald-700">{message}</p>}
    <Card className="p-5 space-y-3">
      <h2 className="font-semibold">Import original records</h2>
      <label htmlFor="source-file" className="block text-sm">Source import JSON</label>
      <input id="source-file" type="file" accept=".json,application/json" onChange={selectFile} disabled={busy} />
      {payload && <p className="text-sm">{payload.receipts?.length || 0} source records loaded.</p>}
      {preview && <div role="status" className="text-sm"><p>Preview: {preview.properties_to_add} properties, {preview.occupants_to_add} occupants and {preview.receipts_to_add} source records to add. {preview.already_imported} already imported.</p><p>{preview.properties.join(", ")}</p></div>}
      <div className="flex gap-3"><Button disabled={!payload || busy} onClick={() => runImport(false)}>Preview records</Button><Button disabled={!preview || busy} onClick={() => runImport(true)}>Import reviewed records</Button></div>
    </Card>
    <Card className="p-5 space-y-3">
      <h2 className="font-semibold">Post reconciled finances</h2>
      <p className="text-sm text-slate-600">Post source-backed rent, fee and utility entries to the financial ledger. Receipt dates are provisional accounting references; lease dates remain unconfirmed. Opening utility balances replace carried-forward observations. Mixed receipt payments use the allocation stated in each entry. Posted figures can be corrected in rent and bills.</p>
      <label htmlFor="financial-file" className="block text-sm">Reconciled financial import JSON</label>
      <input id="financial-file" type="file" accept=".json,application/json" onChange={selectFinances} disabled={busy} />
      {financialPayload && <p>{financialPayload.entries?.length || 0} reconciled entries loaded.</p>}
      {financialPreview && <div role="status" className="text-sm space-y-1">
        <p>Financial preview: {financialPreview.entries_to_add} entries, {financialPreview.historical_profiles_to_add} historical profiles, {financialPreview.already_posted} already posted.</p>
        <p>Rent: {amount(financialPreview.totals.rent_due)} expected; {amount(financialPreview.totals.rent_paid)} paid.</p>
        <p>Fees and utilities: {amount(financialPreview.totals.bills_due)} expected; {amount(financialPreview.totals.bills_paid)} paid.</p>
      </div>}
      <div className="flex gap-3"><Button disabled={!financialPayload || busy} onClick={()=>postFinances(false)}>Preview finances</Button><Button disabled={!financialPreview || busy} onClick={()=>postFinances(true)}>Post financial entries</Button></div>
      <p>{financialState.posted_entries} financial entries posted.</p>
      {financialState.review_items.length > 0 && <details><summary>{financialState.review_items.length} source items require review</summary><ul className="list-disc pl-5 text-sm">{financialState.review_items.map((item,index)=><li key={`${item[0]}-${index}`}>{item[0]}: {item[1]}</li>)}</ul></details>}
      <div className="flex gap-3 text-sm text-emerald-700"><Link to="/dashboard/payments">Payments</Link><Link to="/dashboard/bills">Bills</Link><Link to="/dashboard/past-tenants">Historical profiles</Link></div>
    </Card>
    <div className="flex flex-wrap gap-3 items-center">
      <label>Property <select aria-label="Filter property" value={filter} onChange={e => {setFilter(e.target.value);setPage(0);}} className="border p-2 rounded"><option value="all">All properties</option><option value="unassigned">Property not identified</option>{data.properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <Input aria-label="Search receipt history" placeholder="Search name, receipt or unit" value={query} onChange={e => {setQuery(e.target.value);setPage(0);}} className="max-w-sm" />
      <p>{matches.length} source records</p>
    </div>
    <div className="overflow-x-auto border rounded-xl bg-white"><table className="w-full text-sm text-left"><thead><tr>{["Name / source", "Property / unit", "Source date", "Total", "Paid", "Balance", "Actions"].map(x => <th className="p-3" key={x}>{x}</th>)}</tr></thead><tbody>{shown.map(r => <tr key={r.id} className="border-t"><td className="p-3"><div>{r.tenant_name}</div><div className="text-xs text-slate-500">{r.receipt_number || r.source_sheet}</div></td><td className="p-3">{names[r.property_id] || "Not identified"}<div className="text-xs">{r.unit_number || "Unit not stated"}</div></td><td className="p-3">{r.receipt_date || r.receipt_date_text || "Not stated"}</td><td className="p-3 whitespace-nowrap">{amount(r.total_amount)}</td><td className="p-3 whitespace-nowrap">{amount(r.amount_paid)}</td><td className="p-3 whitespace-nowrap">{amount(r.balance)}</td><td className="p-3"><Button variant="outline" onClick={() => startEdit(r)}>Edit</Button><Button variant="ghost" onClick={() => setDetail(r)}>Source</Button></td></tr>)}</tbody></table></div>
    <div className="flex gap-3 items-center"><Button disabled={page === 0} onClick={() => setPage(p => p-1)}>Previous</Button><span>Page {page+1} of {Math.max(1,Math.ceil(matches.length/40))}</span><Button disabled={(page+1)*40 >= matches.length} onClick={() => setPage(p => p+1)}>Next</Button></div>
    {editing && <Card className="p-6 space-y-3" role="region" aria-label="Edit historical record"><h2 className="font-semibold">Edit historical record</h2><div className="grid md:grid-cols-3 gap-4">{["tenant_name", "unit_number", "receipt_date", ...moneyFields, "payment_label"].map(k => <label key={k} className="text-sm capitalize">{label(k)}<Input type={moneyFields.includes(k) ? "number" : k === "receipt_date" ? "date" : "text"} step={moneyFields.includes(k) ? "0.01" : undefined} value={form[k]} onChange={e => setForm(f => ({...f,[k]:e.target.value}))} /></label>)}</div><label className="block">Occupancy status <select value={form.occupancy_status} onChange={e=>setForm(f=>({...f,occupancy_status:e.target.value}))} className="border rounded p-2"><option value="unconfirmed">Unconfirmed</option><option value="current">Current</option><option value="past">Past</option></select></label><label className="block">Notes<textarea className="w-full border rounded p-2 h-28" value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} /></label><div className="flex gap-3"><Button disabled={busy} onClick={save}>Save changes</Button><Button variant="outline" onClick={()=>setEditing(null)}>Cancel</Button></div></Card>}
    {detail && <Card className="p-6 space-y-3"><h2 className="font-semibold">Original source: {detail.source_sheet}</h2><p>{detail.notes}</p><p>{detail.payment_label}</p><pre className="text-xs whitespace-pre-wrap max-h-96 overflow-auto">{JSON.stringify(detail.source_original,null,2)}</pre><Button variant="outline" onClick={()=>setDetail(null)}>Close source</Button></Card>}
  </div>;
}
