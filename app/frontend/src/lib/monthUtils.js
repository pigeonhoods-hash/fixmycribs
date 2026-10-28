// Utilities for month-based grouping of bills/expenses

export function monthKey(iso) {
  if (!iso) return "";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (isNaN(d)) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(key) {
  if (!key) return "";
  const [y, m] = key.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-NG", { month: "long", year: "numeric" });
}

export function monthShortLabel(key) {
  if (!key) return "";
  const [y, m] = key.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-NG", { month: "short", year: "numeric" });
}

export function todayMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function shiftMonth(key, delta) {
  if (!key) return todayMonth();
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function firstOfMonth(key) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1);
}

// Build list of months to show in the picker: all months present in items + current month + last 6 months
export function buildMonthList(items, dateField) {
  const set = new Set([todayMonth()]);
  items.forEach((it) => {
    const k = monthKey(it[dateField]);
    if (k) set.add(k);
  });
  // Include the 5 months before current for easy back-navigation
  let cur = todayMonth();
  for (let i = 0; i < 5; i++) {
    cur = shiftMonth(cur, -1);
    set.add(cur);
  }
  return Array.from(set).sort().reverse();
}
