import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Building2, Users, Wallet, TrendingUp, Receipt, TrendingDown } from "lucide-react";
import { formatNaira, formatDate } from "@/lib/format";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";
import { Link } from "react-router-dom";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const StatCard = ({ icon: Icon, label, value, accent, testId, to, subtitle }) => {
  const inner = (
    <div className="min-w-0">
      <div className="flex items-start justify-between gap-2">
        <div className="tiny-label">{label}</div>
        <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg grid place-items-center shrink-0 ${accent}`}>
          <Icon className="w-4 h-4" strokeWidth={1.75} />
        </div>
      </div>
      <div className="mt-3 sm:mt-4 font-display text-lg sm:text-2xl lg:text-3xl font-black tracking-tight text-slate-900 tabular-nums break-words leading-tight">{value}</div>
      {subtitle && <div className="text-xs text-slate-500 mt-1">{subtitle}</div>}
    </div>
  );
  const base = "p-4 sm:p-6 border border-slate-200 bg-white hover:shadow-md transition-all duration-200 block";
  return to ? (
    <Link to={to} data-testid={testId} className={`${base} rounded-lg hover:border-emerald-300`}>{inner}</Link>
  ) : (
    <Card className={base} data-testid={testId}>{inner}</Card>
  );
};

const RANGES = [
  { key: 1, label: "Last month" },
  { key: 3, label: "Last 3 months" },
  { key: 6, label: "Last 6 months" },
  { key: 12, label: "Last 12 months" },
  { key: 24, label: "Last 24 months" },
];

export default function DashboardHome() {
  const [summary, setSummary] = useState(null);
  const [chart, setChart] = useState([]);
  const [recent, setRecent] = useState([]);
  const [months, setMonths] = useState(6);
  const [expSummary, setExpSummary] = useState(null);

  const loadChart = useCallback(async (m) => {
    const { data } = await api.get(`/dashboard/chart?months=${m}`);
    setChart(data);
  }, []);

  useEffect(() => {
    Promise.all([
      api.get("/dashboard/summary"),
      api.get(`/dashboard/chart?months=${months}`),
      api.get("/dashboard/recent-payments"),
      api.get("/expenses/summary"),
    ]).then(([s, c, r, ex]) => {
      setSummary(s.data);
      setChart(c.data);
      setRecent(r.data);
      setExpSummary(ex.data);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { loadChart(months); }, [months, loadChart]);

  if (!summary) return <div className="text-slate-500">Loading…</div>;

  const pieData = [
    { name: "Collected", value: summary.rent_collected },
    { name: "Pending", value: summary.pending_rent },
    { name: "Overdue", value: summary.overdue_rent },
  ];
  const pieColors = ["#16A34A", "#F59E0B", "#DC2626"];
  const net = expSummary?.net || 0;
  const isLoss = net < 0;

  return (
    <div className="space-y-6">
      <div>
        <div className="tiny-label text-emerald-700">Overview</div>
        <h1 className="font-display text-3xl lg:text-4xl font-bold tracking-tight mt-2">Welcome back.</h1>
        <p className="text-slate-500 mt-1">Here is what is happening across your rentals.</p>
      </div>

      {summary.source_import_notice && <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">Figures include imported opening balances. Receipt dates are accounting references; lease dates remain unconfirmed. Mixed receipts were allocated to rent first, then fees. Review editable entries and unresolved sources in <Link className="underline" to="/dashboard/imported-records">Receipt and utility history</Link>.</p>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard testId="stat-properties" to="/dashboard/properties" icon={Building2} label="Properties" value={summary.total_properties} accent="bg-emerald-50 text-emerald-700" />
        <StatCard testId="stat-tenants" to="/dashboard/tenants" icon={Users} label="Tenants" value={summary.total_tenants} accent="bg-blue-50 text-blue-700" />
        <StatCard testId="stat-collected" to="/dashboard/payments" icon={Wallet} label="Rent Collected" value={formatNaira(summary.rent_collected)} accent="bg-emerald-50 text-emerald-700" />
        <StatCard testId="stat-pending" to="/dashboard/rent" icon={Wallet} label="Pending Rent" value={formatNaira(summary.pending_rent)} accent="bg-amber-50 text-amber-700" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard testId="stat-bills" to="/dashboard/bills" icon={Wallet} label="Utility & bills" value={formatNaira(summary.bills_outstanding || 0)} accent="bg-slate-100 text-slate-700" subtitle="Diesel, electricity, service" />
        {expSummary && (
          <>
            <StatCard testId="stat-income" to="/dashboard/expenses" icon={Wallet} label="Total Income" value={formatNaira(expSummary.income)} accent="bg-emerald-50 text-emerald-700" subtitle="Rent + bills collected" />
            <StatCard testId="stat-expenses" to="/dashboard/expenses" icon={Receipt} label="Total Expenses" value={formatNaira(expSummary.total_expenses)} accent="bg-orange-50 text-orange-700" subtitle="All properties" />
            <StatCard testId="stat-net" to="/dashboard/expenses" icon={isLoss ? TrendingDown : TrendingUp} label={isLoss ? "Net loss" : "Net profit"} value={formatNaira(Math.abs(net))} accent={isLoss ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"} subtitle={isLoss ? "You are running at a loss" : "You are profitable"} />
          </>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 p-6 border border-slate-200 bg-white">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div>
              <div className="tiny-label">Collection trend</div>
              <div className="font-display font-bold text-lg mt-1">Rent, bills & expenses</div>
            </div>
            <Select value={String(months)} onValueChange={(v) => setMonths(Number(v))}>
              <SelectTrigger className="w-48" data-testid="chart-range-select"><SelectValue /></SelectTrigger>
              <SelectContent>
                {RANGES.map((r) => <SelectItem key={r.key} value={String(r.key)}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                <XAxis dataKey="month" stroke="#6B7280" fontSize={12} />
                <YAxis stroke="#6B7280" fontSize={12} tickFormatter={(v) => `₦${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => formatNaira(v)} contentStyle={{ borderRadius: 8, border: "1px solid #E5E7EB" }} />
                <Legend />
                <Bar dataKey="expected" fill="#F59E0B" radius={[4, 4, 0, 0]} name="Expected" />
                <Bar dataKey="collected" fill="#16A34A" radius={[4, 4, 0, 0]} name="Collected" />
                <Bar dataKey="expenses" fill="#DC2626" radius={[4, 4, 0, 0]} name="Expenses" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-6 border border-slate-200 bg-white">
          <div className="tiny-label">Rent breakdown</div>
          <div className="font-display font-bold text-lg mt-1">Payment status</div>
          <div className="h-56 mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} dataKey="value" innerRadius={45} outerRadius={80} paddingAngle={2}>
                  {pieData.map((entry) => <Cell key={entry.name} fill={pieColors[pieData.indexOf(entry)]} />)}
                </Pie>
                <Tooltip formatter={(v) => formatNaira(v)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card className="p-6 border border-slate-200 bg-white">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="tiny-label">Latest activity</div>
            <div className="font-display font-bold text-lg mt-1">Recent payments</div>
          </div>
          <Link to="/dashboard/payments" className="text-sm text-emerald-700 font-semibold hover:underline">View all →</Link>
        </div>
        {recent.length === 0 ? (
          <div className="text-slate-500 text-sm py-8 text-center border border-dashed border-slate-200 rounded-md">
            No payments recorded yet. Add tenants and record their first payment.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {recent.map((p) => (
              <div key={p.id} className="py-3 flex items-center justify-between">
                <div>
                  <div className="font-medium">{p.tenant_name}</div>
                  <div className="text-xs text-slate-500">{formatDate(p.payment_date)} • {p.method.replace(/_/g, " ")}</div>
                </div>
                <div className="font-display font-bold text-emerald-700">{formatNaira(p.amount)}</div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

