"use client";

// Admin review of per-listing ownership verification (C39). Three views over
// GET /api/admin/ownership-verifications: the pending queue (grouped by
// submission, oldest first), approved requests (revocable) and the history of
// rejected/revoked ones. Decisions go through POST on the same route; the
// documents open in a new tab through the admin-only document route.

import { useEffect, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Eye,
  FileText,
  FileX,
  Loader2,
  MapPin,
  Undo2,
  User as UserIcon,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminSearchInput } from "@/components/admin/AdminSearchInput";
import { formatDate, formatDateTime, formatPhone } from "@/lib/utils/format";
import { MAX_OWNERSHIP_DECISION_NOTE } from "@/lib/ownership/document-file";
import type {
  AdminOwnershipAction,
  AdminOwnershipDocument,
  AdminOwnershipItem,
  AdminOwnershipListFilter,
  AdminOwnershipListResponse,
  AdminOwnershipReviewError,
  AdminOwnershipReviewRequest,
  OwnershipVerificationStatus,
} from "@/lib/ownership/types";

type ReasonAction = Exclude<AdminOwnershipAction, "approve">;

const FILTERS: { key: AdminOwnershipListFilter; label: string }[] = [
  { key: "pending", label: "მოლოდინში" },
  { key: "approved", label: "დადასტურებული" },
  { key: "decided", label: "ისტორია" },
];

const EMPTY_TEXT: Record<AdminOwnershipListFilter, string> = {
  pending: "განსახილველი მოთხოვნები არ არის",
  approved: "დადასტურებული მოთხოვნები არ არის",
  decided: "უარყოფილი ან გაუქმებული მოთხოვნები არ არის",
};

// The owner page's words for the same categories (DashboardAccount.ownership.kinds).
const SERVICE_CATEGORY_LABEL: Partial<Record<string, string>> = {
  food: "კვება",
  cleaning: "დასუფთავება",
  handyman: "ხელოსანი",
  transport: "ტრანსპორტი",
  entertainment: "გართობა",
  employment: "დასაქმება",
};

const STATUS_BADGE: Record<
  OwnershipVerificationStatus,
  { label: string; cls: string }
> = {
  pending: {
    label: "მოლოდინში",
    cls: "border-[#BFDBFE] bg-[#EFF6FF] text-[#1D4ED8]",
  },
  approved: {
    label: "დადასტურებული",
    cls: "border-[#BBF7D0] bg-[#F0FDF4] text-[#15803D]",
  },
  rejected: {
    label: "უარყოფილი",
    cls: "border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]",
  },
  revoked: {
    label: "გაუქმებული",
    cls: "border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]",
  },
};

const SUCCESS_MESSAGE: Record<AdminOwnershipAction, string> = {
  approve: "მესაკუთრეობა დადასტურდა",
  reject: "მოთხოვნა უარყოფილია",
  revoke: "დადასტურება გაუქმდა",
};

const NOTE_REQUIRED = "მიუთითეთ მიზეზი";
const GENERIC_ERROR = "შეცდომა — სცადეთ თავიდან";

const REVIEW_ERROR_MESSAGES = new Map<AdminOwnershipReviewError, string>([
  ["already_decided", "მოთხოვნა უკვე განხილულია — სია განახლდა"],
  [
    "document_missing",
    "დოკუმენტი წაშლილია — დადასტურება შეუძლებელია, უარყავით მოთხოვნა",
  ],
  ["note_required", NOTE_REQUIRED],
  ["note_too_long", `მიზეზი ${MAX_OWNERSHIP_DECISION_NOTE} სიმბოლოზე გრძელია`],
  [
    "self_review",
    "საკუთარ განცხადებაზე ვერ გადაწყვეტთ — მოთხოვნა სხვა ადმინისტრატორმა უნდა განიხილოს",
  ],
]);

// The same registry link as the audit panel's NAPR card.
const NAPR_URL = "https://napr.gov.ge/";

const CHIP_CLASS =
  "inline-flex shrink-0 rounded-lg border px-2.5 py-1 text-[12px] font-extrabold";
const ROW_CLASS =
  "flex flex-col gap-4 px-5 py-4 sm:px-6 lg:flex-row lg:items-start lg:justify-between";
const PAGER_BUTTON_CLASS =
  "inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[#E2E8F0] bg-white text-[#475569] disabled:opacity-40";

// The route's error token may arrive as `error` or as `code`; anything else
// (including a 401/403 from requireAdmin) gets the generic message.
function reviewErrorMessage(payload: unknown): string {
  const body = payload as { error?: unknown; code?: unknown } | null;
  for (const token of [body?.error, body?.code]) {
    const message = REVIEW_ERROR_MESSAGES.get(
      token as AdminOwnershipReviewError,
    );
    if (message) return message;
  }
  return GENERIC_ERROR;
}

function listingTypeLabel(listing: AdminOwnershipItem["listing"]): string {
  if (listing.kind === "property") {
    if (listing.isForSale) return "გაყიდვა";
    return listing.propertyType === "hotel" ? "სასტუმრო" : "გაქირავება";
  }
  const category = listing.category ?? "";
  return SERVICE_CATEGORY_LABEL[category] ?? (category || "სერვისი");
}

// First-appearance order, so the server's oldest-first order holds per group.
function groupBySubmission(
  items: AdminOwnershipItem[],
): AdminOwnershipItem[][] {
  const groups = new Map<string, AdminOwnershipItem[]>();
  for (const item of items) {
    const group = groups.get(item.submissionId);
    if (group) group.push(item);
    else groups.set(item.submissionId, [item]);
  }
  return [...groups.values()];
}

export default function OwnershipVerificationsPanel({
  onChanged,
}: {
  onChanged?: () => void;
}) {
  const [filter, setFilter] = useState<AdminOwnershipListFilter>("pending");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  // A page number belongs to one filter + query; any other view starts at 0.
  const [paging, setPaging] = useState({ view: "", page: 0 });
  const [result, setResult] = useState<{
    url: string;
    data: AdminOwnershipListResponse;
  } | null>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reasonFor, setReasonFor] = useState<{
    id: string;
    action: ReasonAction;
  } | null>(null);
  // Typed reasons survive refreshes and other rows' decisions; a reason is
  // dropped only once its own decision succeeded.
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const paged = filter !== "pending";
  const view = `${filter}|${query}`;
  const page = paging.view === view ? paging.page : 0;
  const params = new URLSearchParams({ status: filter });
  if (paged) {
    if (query) params.set("q", query);
    params.set("page", String(page));
  }
  const listUrl = `/api/admin/ownership-verifications?${params.toString()}`;

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // A refresh after a decision re-fetches the same URL and swaps the rows in
  // place; only a new view (filter, query, page) shows the skeleton.
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const res = await fetch(listUrl, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await res
          .json()
          .catch(() => null)) as AdminOwnershipListResponse | null;
        if (controller.signal.aborted) return;
        if (res.ok && payload && Array.isArray(payload.items)) {
          setResult({ url: listUrl, data: payload });
          setFailedUrl(null);
        } else {
          setFailedUrl(listUrl);
        }
      } catch {
        if (!controller.signal.aborted) setFailedUrl(listUrl);
      }
    }
    void load();
    return () => controller.abort();
  }, [listUrl, reloadToken]);

  const data = result?.url === listUrl ? result.data : null;
  const loadFailed = !data && failedUrl === listUrl;

  async function review(
    item: AdminOwnershipItem,
    action: AdminOwnershipAction,
  ) {
    const note = action === "approve" ? "" : (drafts[item.id] ?? "").trim();
    if (action !== "approve" && !note) {
      toast.error(NOTE_REQUIRED);
      return;
    }
    const body: AdminOwnershipReviewRequest = { id: item.id, action };
    if (note) body.note = note;

    setBusyId(item.id);
    try {
      const res = await fetch("/api/admin/ownership-verifications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(reviewErrorMessage(payload));
        return;
      }
      toast.success(SUCCESS_MESSAGE[action]);
      setReasonFor((current) => (current?.id === item.id ? null : current));
      setDrafts((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
      setResult(
        (current) =>
          current && {
            ...current,
            data: {
              ...current.data,
              items: current.data.items.filter((entry) => entry.id !== item.id),
              total: Math.max(0, current.data.total - 1),
            },
          },
      );
      // Emptying a later page by hand would otherwise leave the admin on it.
      if (paged && page > 0 && data?.items.length === 1) {
        setPaging({ view, page: page - 1 });
      }
    } catch {
      toast.error(GENERIC_ERROR);
    } finally {
      setBusyId(null);
      setReloadToken((n) => n + 1);
      onChanged?.();
    }
  }

  function renderDecision(item: AdminOwnershipItem) {
    const busy = busyId === item.id;
    const locked = busyId !== null;

    if (reasonFor?.id === item.id) {
      const action = reasonFor.action;
      return (
        <ReasonForm
          id={item.id}
          label={action === "reject" ? "უარყოფის მიზეზი" : "გაუქმების მიზეზი"}
          submitLabel={action === "reject" ? "უარყოფა" : "გაუქმება"}
          value={drafts[item.id] ?? ""}
          busy={busy}
          disabled={locked}
          onChange={(value) =>
            setDrafts((current) => ({ ...current, [item.id]: value }))
          }
          onCancel={() => setReasonFor(null)}
          onSubmit={() => void review(item, action)}
        />
      );
    }

    if (item.status === "approved") {
      return (
        <button
          type="button"
          disabled={locked}
          onClick={() => setReasonFor({ id: item.id, action: "revoke" })}
          className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-[#FDE68A] bg-[#FFFBEB] px-4 text-[13px] font-bold text-[#B45309] transition-colors hover:bg-[#FEF3C7] disabled:opacity-50"
        >
          <Undo2 className="h-4 w-4" />
          გაუქმება
        </button>
      );
    }

    return (
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={locked}
          onClick={() => void review(item, "approve")}
          className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-[#059669] px-4 text-[13px] font-bold text-white shadow-[0px_8px_20px_rgba(5,150,105,0.25)] transition-colors hover:bg-[#047857] disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          დადასტურება
        </button>
        <button
          type="button"
          disabled={locked}
          onClick={() => setReasonFor({ id: item.id, action: "reject" })}
          className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-4 text-[13px] font-bold text-[#DC2626] transition-colors hover:bg-[#FEE2E2] disabled:opacity-50"
        >
          <X className="h-4 w-4" />
          უარყოფა
        </button>
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-[24px] border border-[#E2E8F0] bg-white shadow-[0px_4px_20px_-2px_rgba(0,0,0,0.04)]">
      <div className="space-y-4 border-b border-[#EDF2F7] px-5 py-5 sm:px-6">
        <div>
          <h1 className="text-xl font-black text-[#0F172A]">
            მესაკუთრეობის დადასტურება
          </h1>
          <p className="mt-1 text-sm text-[#64748B]">
            მესაკუთრე ტვირთავს ამონაწერს საჯარო რეესტრიდან და პირადობის
            დოკუმენტს. დადასტურებულ განცხადებას საიტზე ნიშანი „დადასტურებული
            მესაკუთრე“ გამოუჩნდება.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {FILTERS.map(({ key, label }) => {
            const isActive = filter === key;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={isActive}
                onClick={() => {
                  setFilter(key);
                  setReasonFor(null);
                }}
                className={`inline-flex min-h-[44px] items-center rounded-full border px-4 text-[13px] font-semibold transition-colors ${
                  isActive
                    ? "border-[#2563EB] bg-[#2563EB] text-white"
                    : "border-[#E2E8F0] bg-white text-[#334155] hover:border-[#CBD5E1]"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {paged && (
          <AdminSearchInput
            value={search}
            onChange={setSearch}
            onClear={() => {
              setSearch("");
              setQuery("");
            }}
            loading={search.trim() !== query}
            placeholder="ძიება (ID, სათაური, სახელი, ტელეფონი)..."
          />
        )}
      </div>

      {loadFailed ? (
        <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-sm font-semibold text-[#B91C1C]">
            სია ვერ ჩაიტვირთა
          </p>
          <button
            type="button"
            onClick={() => {
              setFailedUrl(null);
              setReloadToken((n) => n + 1);
            }}
            className="min-h-[44px] rounded-xl border border-[#E2E8F0] bg-white px-4 text-[13px] font-bold text-[#334155] hover:bg-[#F8FAFC]"
          >
            თავიდან ცდა
          </button>
        </div>
      ) : !data ? (
        <div className="space-y-3 p-6">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      ) : data.items.length === 0 ? (
        <div className="p-10 text-center text-sm font-medium text-[#94A3B8]">
          {paged && query ? "ვერაფერი მოიძებნა" : EMPTY_TEXT[filter]}
        </div>
      ) : paged ? (
        <ul className="divide-y divide-[#F1F5F9]">
          {data.items.map((item) => (
            <li
              key={item.id}
              data-ownership-request={item.id}
              className={ROW_CLASS}
            >
              <div className="min-w-0 flex-1 space-y-2">
                <ListingHeading item={item} showStatus={filter === "decided"} />
                <p className="break-words text-[13px] font-medium text-[#64748B]">
                  {item.owner?.displayName || "—"} ·{" "}
                  {formatPhone(item.owner?.phone)}
                </p>
                <p className="text-[12px] font-medium text-[#94A3B8]">
                  {item.status === "approved" ? "დადასტურდა" : "განხილულია"}:{" "}
                  {formatDate(item.reviewedAt)}
                </p>
                {item.decisionNote && (
                  <p className="break-words text-[13px] text-[#334155]">
                    <span className="font-semibold">მიზეზი:</span>{" "}
                    {item.decisionNote}
                  </p>
                )}
                <ListingLink href={item.listing.href} />
              </div>
              {item.status === "approved" && (
                <div className="w-full lg:w-[340px] lg:shrink-0">
                  {renderDecision(item)}
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        groupBySubmission(data.items).map((group) => {
          const first = group[0];
          return (
            <article
              key={first.submissionId}
              className="border-b border-[#E2E8F0] last:border-b-0"
            >
              <header className="flex flex-col gap-3 bg-[#F8FAFC] px-5 py-4 sm:px-6 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 space-y-2">
                  <OwnerSummary owner={first.owner} />
                  <p className="text-[12px] font-medium text-[#94A3B8]">
                    გამოგზავნილია {formatDateTime(first.createdAt)} ·{" "}
                    {group.length} განცხადება
                  </p>
                </div>
                <div className="flex flex-col items-start gap-1 md:items-end">
                  <DocumentLink
                    doc={first.documents.identity}
                    label="პირადობის მოწმობა / პასპორტი"
                  />
                  <p className="text-[12px] font-semibold text-[#B45309]">
                    მხოლოდ სანახავად — ნუ ჩამოტვირთავთ
                  </p>
                </div>
              </header>
              <ul className="divide-y divide-[#F1F5F9]">
                {group.map((item) => (
                  <li
                    key={item.id}
                    data-ownership-request={item.id}
                    className={ROW_CLASS}
                  >
                    <div className="min-w-0 flex-1 space-y-2">
                      <ListingHeading item={item} />
                      <p className="flex items-start gap-1.5 text-[13px] font-medium text-[#64748B]">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                        <span className="min-w-0 break-words">
                          {item.listing.location || "—"}
                        </span>
                      </p>
                      {item.listing.kind === "property" && (
                        <CadastralLine code={item.listing.cadastralCode} />
                      )}
                      <div className="flex flex-wrap gap-2">
                        <ListingLink href={item.listing.href} />
                        <DocumentLink
                          doc={item.documents.extract}
                          label="რეესტრის ამონაწერი"
                        />
                      </div>
                    </div>
                    <div className="w-full lg:w-[340px] lg:shrink-0">
                      {renderDecision(item)}
                    </div>
                  </li>
                ))}
              </ul>
            </article>
          );
        })
      )}

      {paged && data && data.pageSize > 0 && data.total > data.pageSize && (
        <div className="flex items-center justify-center gap-3 border-t border-[#EDF2F7] px-5 py-4">
          <button
            type="button"
            aria-label="წინა გვერდი"
            disabled={page === 0}
            onClick={() => setPaging({ view, page: page - 1 })}
            className={PAGER_BUTTON_CLASS}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="text-[13px] font-semibold text-[#64748B]">
            {page + 1} / {Math.ceil(data.total / data.pageSize)}
          </span>
          <button
            type="button"
            aria-label="შემდეგი გვერდი"
            disabled={(page + 1) * data.pageSize >= data.total}
            onClick={() => setPaging({ view, page: page + 1 })}
            className={PAGER_BUTTON_CLASS}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      )}
    </section>
  );
}

function OwnerSummary({ owner }: { owner: AdminOwnershipItem["owner"] }) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#EEF2F7] text-[#475569]">
        <UserIcon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="break-words text-[15px] font-black leading-[22px] text-[#0F172A]">
          {owner?.displayName || "—"}
        </p>
        <p className="text-[13px] font-medium text-[#64748B]">
          {formatPhone(owner?.phone)}
        </p>
        <p className="text-[13px] font-medium text-[#64748B]">
          პირადი ნომერი:{" "}
          <span className="font-mono font-bold text-[#0F172A]">
            {owner?.personalId || "—"}
          </span>
        </p>
      </div>
    </div>
  );
}

function ListingHeading({
  item,
  showStatus = false,
}: {
  item: AdminOwnershipItem;
  showStatus?: boolean;
}) {
  const status = STATUS_BADGE[item.status];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className="min-w-0 break-words text-[15px] font-bold leading-[22px] text-[#0F172A]">
        {item.listing.title || "—"}
      </p>
      <span
        className={`${CHIP_CLASS} border-[#E2E8F0] bg-[#F8FAFC] text-[#475569]`}
      >
        {listingTypeLabel(item.listing)}
      </span>
      {showStatus && (
        <span className={`${CHIP_CLASS} ${status.cls}`}>{status.label}</span>
      )}
    </div>
  );
}

function ListingLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-3 text-[13px] font-bold text-[#1D4ED8] transition-colors hover:bg-[#EFF6FF]"
    >
      <Eye className="h-4 w-4" />
      ნახე საიტზე
    </a>
  );
}

function DocumentLink({
  doc,
  label,
}: {
  doc: AdminOwnershipDocument;
  label: string;
}) {
  if (!doc.available) {
    return (
      <span className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-dashed border-[#E2E8F0] px-3 text-[13px] font-semibold text-[#94A3B8]">
        <FileX className="h-4 w-4 shrink-0" />
        {label}: დოკუმენტი წაშლილია
      </span>
    );
  }
  return (
    <a
      href={"/api/admin/ownership-verifications/documents/" + doc.id}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-[#BFDBFE] bg-[#EFF6FF] px-3 text-[13px] font-bold text-[#1D4ED8] transition-colors hover:bg-[#DBEAFE]"
    >
      <FileText className="h-4 w-4 shrink-0" />
      {label}
      <ExternalLink className="h-3 w-3 shrink-0" />
    </a>
  );
}

function CadastralLine({ code }: { code: string | null }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
      <span className="font-semibold text-[#64748B]">საკადასტრო კოდი:</span>
      {code ? (
        <span className="select-all font-mono font-bold text-[#0F172A]">
          {code}
        </span>
      ) : (
        <span className="font-medium text-[#94A3B8]">არ არის მითითებული</span>
      )}
      <a
        href={NAPR_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-[44px] items-center gap-1 text-[12px] font-bold text-[#1D4ED8] hover:underline"
      >
        napr.gov.ge შემოწმება
        <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}

function ReasonForm({
  id,
  label,
  submitLabel,
  value,
  busy,
  disabled,
  onChange,
  onCancel,
  onSubmit,
}: {
  id: string;
  label: string;
  submitLabel: string;
  value: string;
  busy: boolean;
  disabled: boolean;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const fieldId = `ownership-reason-${id}`;
  return (
    <div className="space-y-2">
      <label
        htmlFor={fieldId}
        className="block text-[12px] font-bold text-[#475569]"
      >
        {label}
      </label>
      <textarea
        id={fieldId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={MAX_OWNERSHIP_DECISION_NOTE}
        rows={3}
        required
        autoFocus
        className="w-full resize-y rounded-xl border border-[#E2E8F0] bg-white px-3 py-2 text-[16px] text-[#0F172A] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10 sm:text-[14px]"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[12px] font-medium text-[#94A3B8]">
          {value.length} / {MAX_OWNERSHIP_DECISION_NOTE}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="min-h-[44px] rounded-xl border border-[#E2E8F0] bg-white px-4 text-[13px] font-bold text-[#475569] transition-colors hover:bg-[#F8FAFC] disabled:opacity-50"
          >
            დახურვა
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={disabled || !value.trim()}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#DC2626] px-4 text-[13px] font-bold text-white transition-colors hover:bg-[#B91C1C] disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
