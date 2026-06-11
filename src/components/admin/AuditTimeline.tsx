"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Briefcase,
  Brush,
  CalendarCheck,
  ChevronDown,
  CreditCard,
  Heart,
  Home,
  Loader2,
  LogIn,
  MapPin,
  MessageSquare,
  Pencil,
  Plus,
  ShieldCheck,
  Sparkles,
  Star,
  Ticket,
  Trash2,
  UserRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import type { AuditEvent } from "@/app/api/admin/logs/route";

interface AuditTimelineProps {
  userId?: string;
  propertyId?: string;
  serviceId?: string;
  pageSize?: number;
  /** Tighter paddings + capped height — for embedding in modals. */
  compact?: boolean;
}

const TABLE_ICONS: Record<string, LucideIcon> = {
  "auth.users": LogIn,
  transactions: CreditCard,
  balances: Wallet,
  profiles: UserRound,
  properties: Home,
  services: Briefcase,
  bookings: CalendarCheck,
  manual_bookings: CalendarCheck,
  calendar_blocks: CalendarCheck,
  verifications: ShieldCheck,
  reviews: Star,
  favorites: Heart,
  smart_match_requests: Sparkles,
  smart_match_offers: Sparkles,
  cleaning_tasks: Brush,
  sms_outbound: MessageSquare,
  sms_messages: MessageSquare,
  sms_broadcasts: MessageSquare,
  promocodes: Ticket,
  zones: MapPin,
};

const OP_ICONS: Record<AuditEvent["operation"], LucideIcon> = {
  INSERT: Plus,
  UPDATE: Pencil,
  DELETE: Trash2,
  LOGIN: LogIn,
};

const OP_BADGE_CLASSES: Record<AuditEvent["operation"], string> = {
  INSERT: "bg-[#ECFDF5] text-[#10B981]",
  UPDATE: "bg-[#EFF6FF] text-[#2563EB]",
  DELETE: "bg-[#FEF2F2] text-[#EF4444]",
  LOGIN: "bg-[#F3E8FF] text-[#7E22CE]",
};

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (value === "[omitted]") return "…";
  const text =
    typeof value === "object" ? JSON.stringify(value) : String(value);
  return text.length > 140 ? `${text.slice(0, 140)}…` : text;
}

export function AuditTimeline({
  userId,
  propertyId,
  serviceId,
  pageSize = 50,
  compact = false,
}: AuditTimelineProps) {
  const t = useTranslations("AdminLogs");
  const locale = useLocale();
  // null = first page still loading
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    [locale],
  );

  const fetchPage = useCallback(
    async (cursor: string | null) => {
      const params = new URLSearchParams();
      if (userId) params.set("user", userId);
      if (propertyId) params.set("property", propertyId);
      if (serviceId) params.set("service", serviceId);
      params.set("limit", String(pageSize));
      if (cursor) params.set("cursor", cursor);
      const res = await fetch(`/api/admin/logs?${params}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("load failed");
      return (await res.json()) as {
        events: AuditEvent[];
        nextCursor: string | null;
      };
    },
    [userId, propertyId, serviceId, pageSize],
  );

  useEffect(() => {
    let cancelled = false;
    setEvents(null);
    setNextCursor(null);
    setExpanded(new Set());
    fetchPage(null)
      .then((payload) => {
        if (cancelled) return;
        setEvents(payload.events);
        setNextCursor(payload.nextCursor);
      })
      .catch(() => {
        if (cancelled) return;
        setEvents([]);
        toast.error(t("loadError"));
      });
    return () => {
      cancelled = true;
    };
  }, [fetchPage, t]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const payload = await fetchPage(nextCursor);
      setEvents((prev) => [...(prev ?? []), ...payload.events]);
      setNextCursor(payload.nextCursor);
    } catch {
      toast.error(t("loadError"));
    } finally {
      setLoadingMore(false);
    }
  }

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function eventLabel(event: AuditEvent) {
    const specific = `events.${event.table_name.replace(".", "_")}_${event.operation}`;
    if (t.has(specific)) return t(specific);
    const tableKey = `tables.${event.table_name.replace(".", "_")}`;
    const tableLabel = t.has(tableKey) ? t(tableKey) : event.table_name;
    return `${tableLabel} — ${t(`ops.${event.operation}`)}`;
  }

  function fieldLabel(field: string) {
    return t.has(`fields.${field}`) ? t(`fields.${field}`) : field;
  }

  if (events === null) {
    return (
      <div className="space-y-3">
        {Array.from({ length: compact ? 3 : 6 }).map((_, idx) => (
          <Skeleton key={idx} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="rounded-[20px] border border-[#E2E8F0] bg-white px-6 py-10 text-center text-sm font-medium text-[#94A3B8]">
        {t("empty")}
      </div>
    );
  }

  return (
    <div className={compact ? "max-h-[320px] overflow-y-auto pr-1" : undefined}>
      <ol className="space-y-2">
        {events.map((event) => {
          const Icon =
            TABLE_ICONS[event.table_name] ?? OP_ICONS[event.operation];
          const isExpanded = expanded.has(event.id);
          // What the expander shows: per-field diff for UPDATE, the snapshot
          // for INSERT/DELETE, nothing for LOGIN.
          const detailEntries: [string, unknown, unknown][] =
            event.operation === "UPDATE"
              ? (event.changed_fields ?? []).map((field) => [
                  field,
                  event.old_values?.[field],
                  event.new_values?.[field],
                ])
              : Object.entries(
                  (event.operation === "DELETE"
                    ? event.old_values
                    : event.new_values) ?? {},
                ).map(([field, value]) => [field, undefined, value]);
          const hasDetails =
            event.operation !== "LOGIN" && detailEntries.length > 0;

          return (
            <li
              key={event.id}
              className="rounded-[16px] border border-[#E2E8F0] bg-white"
            >
              <div
                className={`flex flex-wrap items-center gap-x-3 gap-y-2 ${compact ? "px-4 py-3" : "px-5 py-4"}`}
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${OP_BADGE_CLASSES[event.operation]}`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-[14px] font-black leading-5 text-[#1E293B]">
                      {eventLabel(event)}
                    </span>
                    <span
                      className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.5px] ${OP_BADGE_CLASSES[event.operation]}`}
                    >
                      {t(`ops.${event.operation}`)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] font-semibold text-[#64748B]">
                    <span>
                      {dateFormatter.format(new Date(event.occurred_at))}
                    </span>
                    <span aria-hidden>·</span>
                    <span>
                      {event.actor_name ??
                        (event.actor_source === "system"
                          ? t("system")
                          : (event.actor_id?.slice(0, 8) ?? t("system")))}
                    </span>
                    {event.subject_name && event.subject_user_id ? (
                      <Link
                        href={`/dashboard/admin/logs?user=${event.subject_user_id}`}
                        className="rounded-md bg-[#F1F5F9] px-2 py-0.5 text-[11px] font-bold text-[#475569] hover:bg-[#E2E8F0]"
                      >
                        {event.subject_name}
                      </Link>
                    ) : null}
                    {event.property_title && event.property_id ? (
                      <Link
                        href={`/dashboard/admin/logs?property=${event.property_id}`}
                        className="rounded-md bg-[#EFF6FF] px-2 py-0.5 text-[11px] font-bold text-[#2563EB] hover:bg-[#DBEAFE]"
                      >
                        {event.property_title}
                      </Link>
                    ) : null}
                    {event.service_title && event.service_id ? (
                      <Link
                        href={`/dashboard/admin/logs?service=${event.service_id}`}
                        className="rounded-md bg-[#ECFDF5] px-2 py-0.5 text-[11px] font-bold text-[#10B981] hover:bg-[#D1FAE5]"
                      >
                        {event.service_title}
                      </Link>
                    ) : null}
                  </div>
                </div>
                {hasDetails ? (
                  <button
                    type="button"
                    onClick={() => toggleExpanded(event.id)}
                    className="inline-flex h-11 items-center gap-1 rounded-[12px] px-3 text-[12px] font-bold text-[#2563EB] hover:bg-[#EFF6FF]"
                  >
                    {isExpanded ? t("hideDiff") : t("showDiff")}
                    <ChevronDown
                      className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                    />
                  </button>
                ) : null}
              </div>

              {hasDetails && isExpanded ? (
                <div className="max-h-[260px] overflow-y-auto border-t border-[#F1F5F9] bg-[#F8FAFC] px-5 py-3">
                  <table className="w-full text-[12px]">
                    <tbody>
                      {detailEntries.map(([field, oldValue, newValue]) => (
                        <tr
                          key={field}
                          className="border-b border-[#F1F5F9] last:border-b-0"
                        >
                          <td className="w-1/3 py-1.5 pr-3 align-top font-bold text-[#475569]">
                            {fieldLabel(field)}
                          </td>
                          <td className="py-1.5 align-top font-medium text-[#334155]">
                            {event.operation === "UPDATE" ? (
                              <>
                                <span className="text-[#EF4444] line-through decoration-[#FCA5A5]">
                                  {formatValue(oldValue)}
                                </span>
                                <span aria-hidden className="mx-1.5">
                                  →
                                </span>
                                <span className="text-[#10B981]">
                                  {formatValue(newValue)}
                                </span>
                              </>
                            ) : (
                              formatValue(newValue)
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>

      {nextCursor ? (
        <button
          type="button"
          onClick={loadMore}
          disabled={loadingMore}
          className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-[12px] border border-[#E2E8F0] bg-white text-[13px] font-bold text-[#334155] hover:bg-[#F8FAFC] disabled:opacity-50"
        >
          {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {t("loadMore")}
        </button>
      ) : null}
    </div>
  );
}
