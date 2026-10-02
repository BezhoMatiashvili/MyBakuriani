"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { CheckCircle2, FileText, Loader2, Lock, Upload } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { useAuth } from "@/lib/hooks/useAuth";
import { useOwnershipStatuses } from "@/lib/hooks/useOwnershipStatus";
import { createClient } from "@/lib/supabase/client";
import { safeInternalPath } from "@/lib/security";
import { cn } from "@/lib/utils";
import { convertHeicToJpeg, isHeicFile } from "@/lib/utils/heic";
import { downscaleImageFile } from "@/lib/utils/watermark";
import { ownershipKey } from "@/lib/ownership/store";
import {
  MAX_OWNERSHIP_DOCUMENT_BYTES,
  MAX_OWNERSHIP_ITEMS,
  OWNERSHIP_FILE_ACCEPT,
  isAcceptableOwnershipFile,
  parseOwnershipListingParam,
  type OwnershipDocumentKind,
  type OwnershipListingKind,
  type OwnershipVerificationStatus,
} from "@/lib/ownership/document-file";
import type {
  OwnershipDocumentUploadError,
  OwnershipSubmitError,
  OwnershipSubmitRequest,
} from "@/lib/ownership/types";
import type { Database } from "@/lib/types/database";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";

// Owner page for ownership verification (C39): pick listings, upload one ID
// plus a registry extract per listing, submit for admin review.

type ServiceCategory = Database["public"]["Enums"]["service_category"];
type StatusKey = "none" | OwnershipVerificationStatus;
type KindKey = "rental" | "sale" | "hotel" | ServiceCategory;

type OwnedListing = {
  kind: OwnershipListingKind;
  id: string;
  /** `<kind>:<id>` — selection, upload slot and test-hook key. */
  key: string;
  title: string;
  kindKey: KindKey;
  blocked: boolean;
  createdAt: number;
};

type SlotState = "empty" | "waiting" | "uploading" | "uploaded" | "error";
type SlotError =
  | "notAccepted"
  | "tooLarge"
  | "empty"
  | "incomplete"
  | "unsupported"
  | "heic"
  | "busy"
  | "rateLimited"
  | "documentLimit"
  | "uploadFailed";
type SubmitErrorKey =
  | "documentInvalid"
  | "extractShared"
  | "requestExists"
  | "listingNotFound"
  | "rateLimited"
  | "generic";

type Slot = {
  state: SlotState;
  fileName: string | null;
  /** The document the server accepted for this slot. */
  documentId: string | null;
  error: SlotError | null;
};

type UploadJob = {
  slotKey: string;
  kind: OwnershipDocumentKind;
  file: File;
  /** The slot's pick counter: a newer pick supersedes this job. */
  generation: number;
  /** The page's reset counter: a successful submit drops every job. */
  epoch: number;
};

const IDENTITY_SLOT = "identity";
/** The one extract the selected services share while the switch is on. */
const SHARED_SERVICES_SLOT = "services";
const UPLOAD_URL = "/api/ownership-verifications/documents";
const SUBMIT_URL = "/api/ownership-verifications";
const UPLOAD_TIMEOUT_MS = 90_000;
// A photo is downscaled before upload and prepareFile re-checks the result, so
// a large phone photo is fine here; a PDF goes as it is (10 MB).
const MAX_IMAGE_INPUT_BYTES = 40 * 1024 * 1024;

const EMPTY_SLOT: Slot = {
  state: "empty",
  fileName: null,
  documentId: null,
  error: null,
};

const UPLOAD_ERRORS: Partial<Record<OwnershipDocumentUploadError, SlotError>> =
  {
    upload_busy: "busy",
    rate_limited: "rateLimited",
    document_limit: "documentLimit",
    too_large: "tooLarge",
    empty: "empty",
    unsupported: "unsupported",
    incomplete: "incomplete",
  };

const SUBMIT_ERRORS: Partial<Record<OwnershipSubmitError, SubmitErrorKey>> = {
  document_invalid: "documentInvalid",
  extract_shared: "extractShared",
  request_exists: "requestExists",
  listing_not_found: "listingNotFound",
  rate_limited: "rateLimited",
};

const STATUS_TONE: Record<StatusKey, string> = {
  none: "bg-[#F1F5F9] text-[#475569]",
  pending: "bg-[#FFFBEB] text-[#B45309]",
  approved: "bg-[#EEF2FF] text-[#1E3A8A]",
  rejected: "bg-[#FEF2F2] text-[#B91C1C]",
  revoked: "bg-[#FEF2F2] text-[#B91C1C]",
};

const CARD =
  "rounded-[24px] border bg-white p-5 shadow-[0px_25px_50px_-12px_rgba(0,0,0,0.08)] sm:p-8";

/** A listing can get a new request when it has none, or its last one ended. */
function canRequest(status: StatusKey) {
  return status === "none" || status === "rejected" || status === "revoked";
}

function isPdf(file: File) {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

/** Retry-After in ms, bounded so a bad header cannot stall the queue. */
function retryDelayMs(res: Response) {
  const seconds = Number(res.headers.get("Retry-After"));
  return Number.isFinite(seconds) && seconds > 0
    ? Math.min(seconds, 10) * 1000
    : 2000;
}

/** HEIC → JPEG; images re-encoded ≤ 2560 px without EXIF; PDFs as they are. */
async function prepareFile(
  file: File,
): Promise<{ file: File } | { error: SlotError }> {
  let out = file;
  if (isHeicFile(out)) {
    try {
      out = await convertHeicToJpeg(out);
    } catch {
      return { error: "heic" };
    }
  }
  if (!isPdf(out)) out = await downscaleImageFile(out);
  if (!isAcceptableOwnershipFile(out.name, out.type)) {
    return { error: "notAccepted" };
  }
  if (out.size === 0) return { error: "empty" };
  if (out.size > MAX_OWNERSHIP_DOCUMENT_BYTES) return { error: "tooLarge" };
  return { file: out };
}

async function sendDocument(
  form: FormData,
): Promise<{ res: Response; body: { id?: unknown; error?: unknown } } | null> {
  // A hung request on a weak signal would otherwise block the queue for good.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
  try {
    const res = await fetch(UPLOAD_URL, {
      method: "POST",
      body: form,
      signal: controller.signal,
    });
    const body = await res.json().catch(() => ({}));
    return { res, body };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** One upload; a busy answer (one upload per user at a time) is retried once. */
async function uploadDocument(
  file: File,
  kind: OwnershipDocumentKind,
  replacesDocumentId: string | null,
): Promise<{ id: string } | { error: SlotError }> {
  for (let attempt = 0; ; attempt++) {
    const form = new FormData();
    form.append("file", file, file.name);
    form.append("kind", kind);
    if (replacesDocumentId) {
      form.append("replacesDocumentId", replacesDocumentId);
    }
    const sent = await sendDocument(form);
    if (!sent) return { error: "uploadFailed" };
    const { res, body } = sent;
    if (res.ok && typeof body.id === "string") return { id: body.id };
    const code = body.error as OwnershipDocumentUploadError | undefined;
    if (code === "upload_busy" && attempt === 0) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs(res)));
      continue;
    }
    return { error: (code && UPLOAD_ERRORS[code]) || "uploadFailed" };
  }
}

function FileSlot({
  slot = EMPTY_SLOT,
  title,
  hint,
  inputTestId,
  listingKey,
  disabled,
  onPick,
}: {
  slot?: Slot;
  title: string;
  hint?: string;
  inputTestId: string;
  listingKey?: string;
  disabled: boolean;
  onPick: (file: File) => void;
}) {
  const t = useTranslations("DashboardAccount");
  const titleId = useId();

  return (
    <div
      data-testid="ownership-slot"
      data-state={slot.state}
      className={cn(
        "rounded-xl border p-3.5",
        slot.state === "error"
          ? "border-red-200"
          : slot.state === "uploaded"
            ? "border-emerald-200"
            : "border-[#E2E8F0]",
      )}
    >
      <p id={titleId} className="break-words text-sm font-bold text-[#0F172A]">
        {title}
      </p>
      {hint ? (
        <p className="mt-0.5 text-[13px] font-medium text-[#64748B]">{hint}</p>
      ) : null}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <label
          className={cn(
            "inline-flex min-h-11 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-4 text-sm font-bold text-[#0F172A] transition-colors focus-within:ring-2 focus-within:ring-[#2563EB]/40 hover:bg-[#F8FAFC]",
            disabled && "cursor-not-allowed opacity-50",
          )}
        >
          <Upload className="size-4" aria-hidden />
          {slot.state === "uploaded"
            ? t("ownership.replaceFile")
            : t("ownership.chooseFile")}
          <input
            type="file"
            accept={OWNERSHIP_FILE_ACCEPT}
            className="sr-only"
            data-testid={inputTestId}
            data-listing-key={listingKey}
            aria-describedby={titleId}
            disabled={disabled}
            onChange={(event) => {
              const file = event.target.files?.[0];
              // Cleared so picking the same file again still fires `change`.
              event.target.value = "";
              if (file) onPick(file);
            }}
          />
        </label>
        <div aria-live="polite" className="min-w-0 text-[13px] font-medium">
          {slot.state === "waiting" ? (
            <p className="truncate text-[#64748B]">
              {t("ownership.waiting")} · {slot.fileName}
            </p>
          ) : slot.state === "uploading" ? (
            <p className="flex items-center gap-1.5 text-[#2563EB]">
              <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden />
              {t("ownership.uploading")}
            </p>
          ) : slot.state === "uploaded" ? (
            <p className="flex min-w-0 items-center gap-1.5 text-emerald-700">
              <CheckCircle2 className="size-4 shrink-0" aria-hidden />
              <span className="shrink-0">{t("ownership.uploaded")}</span>
              <span className="truncate text-[#64748B]">{slot.fileName}</span>
            </p>
          ) : slot.state === "error" && slot.error ? (
            <p className="break-words text-red-600">
              {t(`ownership.errors.${slot.error}`)}
            </p>
          ) : null}
        </div>
      </div>
      <p className="mt-2 text-xs font-medium text-[#94A3B8]">
        {t("ownership.formats")}
      </p>
    </div>
  );
}

function OwnershipPageContent() {
  const t = useTranslations("DashboardAccount");
  const tError = useTranslations("Error");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const {
    rows,
    loading: statusLoading,
    error: statusError,
    refresh,
  } = useOwnershipStatuses({ fresh: true });

  const [listings, setListings] = useState<OwnedListing[] | null>(null);
  const [listingsError, setListingsError] = useState(false);
  // null until the owner touches the list; `?listing=` preselects meanwhile.
  const [selection, setSelection] = useState<ReadonlySet<string> | null>(null);
  const [sharedExtract, setSharedExtract] = useState(false);
  const [slots, setSlots] = useState<Record<string, Slot>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<SubmitErrorKey | null>(null);
  const [lastSubmitOk, setLastSubmitOk] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // The upload queue lives in refs: one file at a time, never a stale closure.
  const queueRef = useRef<UploadJob[]>([]);
  const drainingRef = useRef(false);
  const epochRef = useRef(0);
  const generationsRef = useRef(new Map<string, number>());
  // The newest accepted document per slot, sent as `replacesDocumentId`.
  const documentIdsRef = useRef(new Map<string, string>());

  const created = searchParams.get("created") === "1";
  const safeNext = safeInternalPath(searchParams.get("next"));
  const nextPath = safeNext?.startsWith("/dashboard/")
    ? safeNext
    : "/dashboard";
  const listingParam = searchParams.get("listing");
  const preselectKey = useMemo(() => {
    const target = parseOwnershipListingParam(listingParam);
    return target ? `${target.kind}:${target.id.toLowerCase()}` : null;
  }, [listingParam]);

  const loadListings = useCallback(async (ownerId: string) => {
    setListingsError(false);
    const supabase = createClient();
    try {
      const [properties, services] = await Promise.all([
        supabase
          .from("properties")
          .select("id, title, type, is_for_sale, status, created_at")
          .eq("owner_id", ownerId)
          .order("created_at", { ascending: false }),
        supabase
          .from("services")
          .select("id, title, category, status, created_at")
          .eq("owner_id", ownerId)
          .order("created_at", { ascending: false }),
      ]);
      if (properties.error || services.error) throw new Error("load failed");
      const merged: OwnedListing[] = [
        ...(properties.data ?? []).map((p): OwnedListing => ({
          kind: "property",
          id: p.id,
          key: `property:${p.id}`,
          title: p.title,
          kindKey: p.is_for_sale
            ? "sale"
            : p.type === "hotel"
              ? "hotel"
              : "rental",
          blocked: p.status === "blocked",
          createdAt: Date.parse(p.created_at ?? "") || 0,
        })),
        ...(services.data ?? []).map((s): OwnedListing => ({
          kind: "service",
          id: s.id,
          key: `service:${s.id}`,
          title: s.title,
          kindKey: s.category,
          blocked: s.status === "blocked",
          createdAt: Date.parse(s.created_at ?? "") || 0,
        })),
      ].sort((a, b) => b.createdAt - a.createdAt);
      setListings(merged);
    } catch {
      setListingsError(true);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/auth/login");
      return;
    }
    void loadListings(user.id);
  }, [authLoading, user, router, loadListings]);

  const statusOf = useCallback(
    (listing: OwnedListing): StatusKey =>
      rows.get(ownershipKey(listing.kind, listing.id))?.status ?? "none",
    [rows],
  );

  // Without statuses nothing is selectable: a pending listing would 409.
  const statusesReady = !statusLoading && !statusError;
  const selectable = useMemo(
    () =>
      statusesReady && listings
        ? listings.filter((l) => !l.blocked && canRequest(statusOf(l)))
        : [],
    [statusesReady, listings, statusOf],
  );
  const selectableKeys = new Set(selectable.map((l) => l.key));
  const rawSelection = selection ?? new Set(preselectKey ? [preselectKey] : []);
  // Selection ∩ selectable, so a listing that gained a request drops out.
  const selected = selectable.filter((l) => rawSelection.has(l.key));
  const selectedKeys = new Set(selected.map((l) => l.key));
  const selectedProperties = selected.filter((l) => l.kind === "property");
  const selectedServices = selected.filter((l) => l.kind === "service");
  const sharedOn = sharedExtract && selectedServices.length >= 2;
  const atCap = selected.length >= MAX_OWNERSHIP_ITEMS;

  // Properties never share an extract; services only through the switch.
  const extractSlotKey = (listing: OwnedListing) =>
    listing.kind === "service" && sharedOn ? SHARED_SERVICES_SLOT : listing.key;
  const neededSlots =
    selected.length > 0
      ? [IDENTITY_SLOT, ...new Set(selected.map(extractSlotKey))]
      : [];
  const missingFiles = neededSlots.some(
    (key) => slots[key]?.state !== "uploaded",
  );
  const uploadsInFlight = Object.values(slots).some(
    (slot) => slot.state === "waiting" || slot.state === "uploading",
  );
  const canSubmit =
    selected.length > 0 && !missingFiles && !uploadsInFlight && !submitting;

  function toggle(key: string, on: boolean) {
    const next = new Set(selectedKeys);
    if (on) next.add(key);
    else next.delete(key);
    setSelection(next);
  }

  function selectAll() {
    setSelection(
      new Set(selectable.slice(0, MAX_OWNERSHIP_ITEMS).map((l) => l.key)),
    );
  }

  function patchSlot(key: string, patch: Partial<Slot>) {
    setSlots((prev) => ({
      ...prev,
      [key]: { ...(prev[key] ?? EMPTY_SLOT), ...patch },
    }));
  }

  function pickFile(slotKey: string, kind: OwnershipDocumentKind, file: File) {
    const generation = (generationsRef.current.get(slotKey) ?? 0) + 1;
    generationsRef.current.set(slotKey, generation);
    queueRef.current = queueRef.current.filter((j) => j.slotKey !== slotKey);
    if (!isAcceptableOwnershipFile(file.name, file.type)) {
      patchSlot(slotKey, {
        state: "error",
        fileName: file.name,
        error: "notAccepted",
      });
      return;
    }
    const inputLimit = isPdf(file)
      ? MAX_OWNERSHIP_DOCUMENT_BYTES
      : MAX_IMAGE_INPUT_BYTES;
    if (file.size > inputLimit) {
      patchSlot(slotKey, {
        state: "error",
        fileName: file.name,
        error: "tooLarge",
      });
      return;
    }
    queueRef.current.push({
      slotKey,
      kind,
      file,
      generation,
      epoch: epochRef.current,
    });
    patchSlot(slotKey, { state: "waiting", fileName: file.name, error: null });
    void drain();
  }

  async function drain() {
    if (drainingRef.current) return;
    drainingRef.current = true;
    try {
      for (
        let job = queueRef.current.shift();
        job;
        job = queueRef.current.shift()
      ) {
        await runJob(job);
      }
    } finally {
      drainingRef.current = false;
    }
  }

  async function runJob(job: UploadJob) {
    const isCurrent = () =>
      job.epoch === epochRef.current &&
      generationsRef.current.get(job.slotKey) === job.generation;
    if (!isCurrent()) return;
    patchSlot(job.slotKey, { state: "uploading" });

    const prepared = await prepareFile(job.file);
    if ("error" in prepared) {
      if (isCurrent()) {
        patchSlot(job.slotKey, { state: "error", error: prepared.error });
      }
      return;
    }
    if (!isCurrent()) return;

    const result = await uploadDocument(
      prepared.file,
      job.kind,
      documentIdsRef.current.get(job.slotKey) ?? null,
    );
    if ("error" in result) {
      if (isCurrent()) {
        patchSlot(job.slotKey, { state: "error", error: result.error });
      }
      return;
    }
    if (job.epoch !== epochRef.current) return;
    // Recorded even when superseded, so the newer pick replaces this one.
    documentIdsRef.current.set(job.slotKey, result.id);
    if (isCurrent()) {
      patchSlot(job.slotKey, {
        state: "uploaded",
        documentId: result.id,
        error: null,
      });
    }
  }

  async function submit() {
    if (!canSubmit) return;
    const identityDocumentId = slots[IDENTITY_SLOT]?.documentId;
    const items = selected.map((l) => ({
      kind: l.kind,
      id: l.id,
      documentId: slots[extractSlotKey(l)]?.documentId ?? "",
    }));
    if (!identityDocumentId || items.some((item) => !item.documentId)) return;
    const body: OwnershipSubmitRequest = { identityDocumentId, items };

    setSubmitting(true);
    setSubmitError(null);
    setLastSubmitOk(false);
    try {
      const res = await fetch(SUBMIT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: OwnershipSubmitError;
      };
      if (!res.ok) {
        setSubmitError((data.error && SUBMIT_ERRORS[data.error]) || "generic");
        // An earlier attempt may have been stored although its answer was
        // lost (a retry then reads as extract_shared or request_exists), so
        // every failure reloads the statuses: a listing that already has a
        // request drops out of the selection. refresh() updates the chips too.
        void refresh();
        if (data.error === "listing_not_found" && user) {
          void loadListings(user.id);
        }
        return;
      }
      toast.success(t("ownership.submitted"));
      setLastSubmitOk(true);
      setSubmitted(true);
      await refresh();
      epochRef.current += 1;
      queueRef.current = [];
      documentIdsRef.current.clear();
      setSlots({});
      setSelection(new Set());
      setSharedExtract(false);
    } catch {
      // No answer: the submission may still have been stored.
      setSubmitError("generic");
      void refresh();
    } finally {
      setSubmitting(false);
    }
  }

  function retryLoad() {
    if (listingsError && user) void loadListings(user.id);
    if (statusError) void refresh();
  }

  const loadError = listingsError || statusError;
  const loading =
    !loadError && (authLoading || listings === null || statusLoading);
  const sharedSwitchId = "ownership-shared-extract";

  return (
    <div className="mx-auto w-full max-w-[720px] space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-[28px] font-black leading-[36px] text-[#0F172A] sm:text-[36px] sm:leading-[44px]">
          {t("ownership.title")}
        </h1>
        <p className="mt-1 text-[14px] font-medium text-[#64748B]">
          {t("ownership.intro")}
        </p>
        <p className="mt-2 flex items-start gap-2 text-[13px] font-medium text-[#64748B]">
          <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {t("ownership.privacy")}
        </p>
      </motion.div>

      {created ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-[#BFDBFE] bg-[#EFF6FF] p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-medium text-[#1E3A8A]">
            {t("ownership.createdBanner")}
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(nextPath)}
            className="min-h-11 shrink-0"
          >
            {submitted ? t("ownership.backToCabinet") : t("ownership.later")}
          </Button>
        </div>
      ) : null}

      {loadError ? (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="text-sm font-medium text-red-700">
            {t("ownership.errors.loadFailed")}
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={retryLoad}
            className="min-h-11 shrink-0"
          >
            {tError("retry")}
          </Button>
        </div>
      ) : loading || !listings ? (
        <div className={cn(CARD, "space-y-3")}>
          <Skeleton className="h-5 w-40 rounded-md" />
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
        </div>
      ) : listings.length === 0 ? (
        <div className={cn(CARD, "text-center")}>
          <FileText className="mx-auto size-8 text-[#94A3B8]" aria-hidden />
          <p className="mt-3 text-sm font-bold text-[#0F172A]">
            {t("ownership.emptyTitle")}
          </p>
          <Link
            href="/create"
            className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl bg-[#2563EB] px-5 text-sm font-bold text-white transition-colors hover:bg-[#1D4ED8]"
          >
            {t("ownership.emptyCta")}
          </Link>
        </div>
      ) : (
        <>
          <section className={CARD}>
            <h2 className="text-sm font-bold text-[#0F172A]">
              {t("ownership.listTitle")}
            </h2>
            {selectable.length > 0 ? (
              <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3">
                <p
                  aria-live="polite"
                  className="text-[13px] font-medium text-[#64748B]"
                >
                  {t("ownership.selectedCount", { count: selected.length })}
                </p>
                <div className="flex items-center gap-4">
                  {selected.length <
                  Math.min(selectable.length, MAX_OWNERSHIP_ITEMS) ? (
                    <button
                      type="button"
                      onClick={selectAll}
                      disabled={submitting}
                      className="min-h-11 text-xs font-bold text-[#2563EB] hover:underline disabled:opacity-50"
                    >
                      {t("ownership.selectAll")}
                    </button>
                  ) : null}
                  {selected.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setSelection(new Set())}
                      disabled={submitting}
                      className="min-h-11 text-xs font-bold text-[#64748B] hover:underline disabled:opacity-50"
                    >
                      {t("ownership.clearSelection")}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
            <ul className="mt-3 space-y-2.5">
              {listings.map((listing) => {
                const status = statusOf(listing);
                const isSelectable = selectableKeys.has(listing.key);
                const checked = selectedKeys.has(listing.key);
                const note =
                  status === "rejected" || status === "revoked"
                    ? rows.get(ownershipKey(listing.kind, listing.id))
                        ?.decision_note
                    : null;
                return (
                  <li
                    key={listing.key}
                    data-testid="ownership-listing"
                    data-listing-key={listing.key}
                    data-status={status}
                    className="rounded-xl border border-[#E2E8F0] px-3 pb-2.5"
                  >
                    {isSelectable ? (
                      <label className="flex min-h-11 cursor-pointer items-center gap-3 pt-1">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={submitting || (!checked && atCap)}
                          onChange={(event) =>
                            toggle(listing.key, event.target.checked)
                          }
                          className="size-5 shrink-0 cursor-pointer accent-[#2563EB]"
                        />
                        <span className="min-w-0 break-words text-sm font-bold text-[#0F172A]">
                          {listing.title}
                        </span>
                      </label>
                    ) : (
                      <p className="flex min-h-11 items-center break-words pt-1 text-sm font-bold text-[#0F172A]">
                        {listing.title}
                      </p>
                    )}
                    <div
                      className={cn(
                        "flex flex-wrap items-center gap-x-2 gap-y-1",
                        isSelectable && "pl-8",
                      )}
                    >
                      <span className="text-xs font-medium text-[#64748B]">
                        {t(`ownership.kinds.${listing.kindKey}`)}
                      </span>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-bold",
                          STATUS_TONE[status],
                        )}
                      >
                        {t(`ownership.status.${status}`)}
                      </span>
                    </div>
                    {note ? (
                      <p
                        className={cn(
                          "mt-1 break-words text-xs font-medium text-[#B91C1C]",
                          isSelectable && "pl-8",
                        )}
                      >
                        {t("ownership.reason", { reason: note })}
                      </p>
                    ) : null}
                    {listing.blocked && canRequest(status) ? (
                      <p className="mt-1 text-xs font-medium text-[#94A3B8]">
                        {t("ownership.blocked")}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>

          {selectable.length > 0 ? (
            <>
              <section className={CARD}>
                <h2 className="text-sm font-bold text-[#0F172A]">
                  {t("ownership.step1Title")}
                </h2>
                <div className="mt-3">
                  <FileSlot
                    slot={slots[IDENTITY_SLOT]}
                    title={t("ownership.step1Hint")}
                    inputTestId="ownership-identity-input"
                    disabled={submitting}
                    onPick={(file) => pickFile(IDENTITY_SLOT, "identity", file)}
                  />
                </div>
              </section>

              <section className={CARD}>
                <h2 className="text-sm font-bold text-[#0F172A]">
                  {t("ownership.step2Title")}
                </h2>
                {selected.length === 0 ? (
                  <p className="mt-1 text-[13px] font-medium text-[#64748B]">
                    {t("ownership.selectFirst")}
                  </p>
                ) : (
                  <div className="mt-3 space-y-3">
                    {selectedProperties.map((listing) => (
                      <FileSlot
                        key={listing.key}
                        slot={slots[listing.key]}
                        title={listing.title}
                        hint={t("ownership.extractHintProperty")}
                        inputTestId="ownership-extract-input"
                        listingKey={listing.key}
                        disabled={submitting}
                        onPick={(file) =>
                          pickFile(listing.key, "registry_extract", file)
                        }
                      />
                    ))}
                    {selectedServices.length >= 2 ? (
                      <div className="flex min-h-11 items-center justify-between gap-3 rounded-xl bg-[#F8FAFC] px-3.5">
                        <label
                          htmlFor={sharedSwitchId}
                          className="flex-1 cursor-pointer py-2 text-sm font-medium text-[#0F172A]"
                        >
                          {t("ownership.sharedExtract")}
                        </label>
                        <Switch
                          id={sharedSwitchId}
                          size="lg"
                          checked={sharedExtract}
                          onCheckedChange={setSharedExtract}
                          disabled={submitting}
                          aria-label={t("ownership.sharedExtract")}
                        />
                      </div>
                    ) : null}
                    {sharedOn ? (
                      <FileSlot
                        slot={slots[SHARED_SERVICES_SLOT]}
                        title={selectedServices.map((l) => l.title).join(", ")}
                        hint={t("ownership.extractHintService")}
                        inputTestId="ownership-extract-input"
                        listingKey={SHARED_SERVICES_SLOT}
                        disabled={submitting}
                        onPick={(file) =>
                          pickFile(
                            SHARED_SERVICES_SLOT,
                            "registry_extract",
                            file,
                          )
                        }
                      />
                    ) : (
                      selectedServices.map((listing) => (
                        <FileSlot
                          key={listing.key}
                          slot={slots[listing.key]}
                          title={listing.title}
                          hint={t("ownership.extractHintService")}
                          inputTestId="ownership-extract-input"
                          listingKey={listing.key}
                          disabled={submitting}
                          onPick={(file) =>
                            pickFile(listing.key, "registry_extract", file)
                          }
                        />
                      ))
                    )}
                  </div>
                )}
              </section>

              <div className="space-y-3">
                {submitError ? (
                  <div
                    role="alert"
                    className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700"
                  >
                    {t(`ownership.errors.${submitError}`)}
                  </div>
                ) : null}
                <Button
                  type="button"
                  data-testid="ownership-submit"
                  onClick={submit}
                  disabled={!canSubmit}
                  className="min-h-11 w-full sm:w-auto sm:px-6"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      {t("ownership.submitting")}
                    </>
                  ) : (
                    t("ownership.submit")
                  )}
                </Button>
                {!submitting && selected.length === 0 ? (
                  <p className="text-[13px] font-medium text-[#64748B]">
                    {t("ownership.selectFirst")}
                  </p>
                ) : !submitting && missingFiles ? (
                  <p className="text-[13px] font-medium text-[#64748B]">
                    {t("ownership.missingFiles")}
                  </p>
                ) : null}
              </div>
            </>
          ) : null}

          {lastSubmitOk ? (
            <p
              role="status"
              className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-700"
            >
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
              {t("ownership.submitted")}
            </p>
          ) : null}
          {submitted ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push(nextPath)}
              className="min-h-11 w-full sm:w-auto"
            >
              {t("ownership.backToCabinet")}
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}

export default function OwnershipVerificationPage() {
  return (
    <Suspense>
      <OwnershipPageContent />
    </Suspense>
  );
}
