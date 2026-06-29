export const money = (n: number | string) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 2 }).format(Number(n));

export const shortTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export const fullTime = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "medium" });

export const txTypeLabel = (t: string) => ({
  deposit: "Deposit", withdrawal: "Withdrawal", transfer_out: "Sent", transfer_in: "Received",
} as Record<string, string>)[t] ?? t;
