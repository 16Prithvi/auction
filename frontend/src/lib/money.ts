export function toCents(amount: string): number | null {
  if (!/^\d+(\.\d{1,2})?$/.test(amount)) {
    return null;
  }
  const [whole, fraction = ""] = amount.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) {
    return null;
  }
  return cents;
}

export function formatInr(amount: string): string {
  const cents = toCents(amount);
  if (cents === null) {
    return amount;
  }
  const wholeRupees = cents % 100 === 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: wholeRupees ? 0 : 2,
    maximumFractionDigits: wholeRupees ? 0 : 2,
  }).format(cents / 100);
}

export function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

export function formatRemaining(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}
