export function formatMoney(cents: number | null, currency: string | null) {
  if (cents === null) return null;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency ?? "USD",
      maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
    }).format(cents / 100);
  } catch {
    return (cents / 100).toFixed(2);
  }
}

/** Today's date in the user's own timezone, as YYYY-MM-DD. */
export function localToday() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function formatRelativeDay(date: string) {
  const today = localToday();
  if (date === today) return "today";
  const days = Math.round((Date.parse(today) - Date.parse(date)) / 86_400_000);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function parseMoneyToCents(value: string): number | null {
  const number = Number.parseFloat(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(number) ? Math.round(number * 100) : null;
}
