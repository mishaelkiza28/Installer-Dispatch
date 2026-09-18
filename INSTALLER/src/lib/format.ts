import type { Priority, WorkOrderStatus } from "../types";

export const TZ = "Africa/Kampala";

export function ref(refNo: number | null | undefined): string {
  return refNo == null ? "WO-…" : "WO-" + String(refNo).padStart(4, "0");
}

export const STATUS_LABEL: Record<WorkOrderStatus, string> = {
  unassigned: "Unassigned",
  dispatched: "Dispatched",
  accepted: "Accepted",
  on_site: "On site",
  completed: "Completed",
  verified: "Verified",
  cancelled: "Cancelled",
};

export const PRIORITY_LABEL: Record<Priority, string> = { low: "Low", normal: "Normal", urgent: "Urgent" };

export const JOB_TYPES = [
  "Installation",
  "Plug-and-play install",
  "Maintenance",
  "Repair / fault",
  "Site survey",
  "Commissioning",
  "Removal",
];

/** "2026-09-21" → "Mon 21 Sep 2026" */
export function fmtDate(d: string | null | undefined): string {
  if (!d) return "";
  const date = new Date(d + "T00:00:00Z");
  if (isNaN(date.getTime())) return d;
  return date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function fmtDateTime(ts: string | null | undefined): string {
  if (!ts) return "";
  return new Date(ts).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  });
}

export function timeAgo(ts: string | null | undefined): string {
  if (!ts) return "";
  const s = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const days = Math.floor(s / 86400);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

/** Today's date in Kampala as YYYY-MM-DD. */
export function todayIso(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}

export function isOverdue(scheduled: string | null, status: WorkOrderStatus): boolean {
  if (!scheduled) return false;
  if (["completed", "verified", "cancelled"].includes(status)) return false;
  return scheduled < todayIso();
}

export function isUrl(s: string | null | undefined): s is string {
  return !!s && /^https?:\/\//i.test(s.trim());
}

/** A pasted Google Maps pin is used as-is; otherwise search the address. */
export function mapsUrl(address: string | null, district: string | null): string | null {
  if (isUrl(address)) return address.trim();
  const q = [address, district].filter(Boolean).join(", ");
  return q ? "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q) : null;
}

/** Address text without a pasted map link. */
export function siteText(address: string | null, district: string | null): string {
  return [isUrl(address) ? null : address, district].filter(Boolean).join(", ");
}

export function telHref(phone: string | null): string | null {
  return phone ? "tel:" + phone.replace(/[^\d+]/g, "") : null;
}
