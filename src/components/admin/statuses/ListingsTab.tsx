"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { X } from "lucide-react";
import DataTable, { type Column } from "@/components/admin/finance/DataTable";
import {
  Button,
  EmptyState,
  Pill,
  Select,
  Skeletons,
  statusTone,
} from "@/components/admin/finance/ui";
import { Link } from "@/i18n/navigation";
import { formatPhone } from "@/lib/utils/format";
import { propertyViewUrl, serviceViewUrl } from "@/lib/utils/listingUrls";
import { cn } from "@/lib/utils";
import {
  ADMIN_STATUS_MAX_TARGETS,
  LISTING_ACTIONS,
  LISTING_CATEGORIES,
  LISTING_STATUSES,
  PROMOTION_FILTERS,
  type ChangeResult,
  type ListingTarget,
} from "@/lib/admin-statuses";
import ChangeDialog from "./ChangeDialog";
import {
  API_BASE,
  ApiError,
  Checkbox,
  ChipGroup,
  ErrorBox,
  SearchBox,
  SelectionBar,
  StatusPager,
  TableToolbar,
  TimeLeft,
  VipPill,
  readJson,
  skippedKeys,
  useDayTimeFormat,
  useErrorText,
  useSelection,
  useStatusList,
  useStatusQuery,
  type ListPayload,
  type ListingRow,
} from "./shared";

// VIP / SUPER VIP / discount tab (C44): properties and services together from
// admin_listing_promotions_v.

const QUICK_ACTIONS = ["vip_grant", "vip_end", "discount_set"] as const;
const FILTER_KEYS = [
  "q",
  "owner",
  "kind",
  "category",
  "status",
  "expiring",
  "promo",
];
const PROPERTY_CATEGORIES = ["rental", "hotel", "sale"];

type Picked = { target: ListingTarget; label: string | null };
type DialogState = {
  targets: ListingTarget[];
  label: string | null;
  action?: string;
  fromSelection: boolean;
};

const keyOf = (kind: string, id: string) => `${kind}:${id}`;

function targetOf(row: ListingRow): ListingTarget | null {
  if (!row.id || (row.kind !== "property" && row.kind !== "service")) {
    return null;
  }
  return { kind: row.kind, id: row.id };
}

function viewUrl(row: ListingRow): string | null {
  if (!row.id || !row.kind) return null;
  if (row.kind === "property") {
    return propertyViewUrl(
      {
        id: row.id,
        is_for_sale: row.category === "sale",
        type: row.category === "hotel" ? "hotel" : row.subtype,
      },
      { preview: true },
    );
  }
  return serviceViewUrl(
    { id: row.id, category: row.category ?? "" },
    { preview: true },
  );
}

export default function ListingsTab() {
  const t = useTranslations("AdminStatuses");
  const query = useStatusQuery();
  const errorText = useErrorText();
  const dayTime = useDayTimeFormat();

  const listUrl = useMemo(
    () => `${API_BASE.listings}?${query.apiQuery}`,
    [query.apiQuery],
  );
  const list = useStatusList<ListPayload<ListingRow>>(listUrl);
  const selection = useSelection<Picked>();
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [selectingAll, setSelectingAll] = useState(false);

  const rows = list.data?.rows ?? [];
  const count = list.data?.count ?? 0;
  const promoCounts = list.data?.promoCounts ?? {};
  const owner = query.get("owner");
  const ownerName =
    owner && rows.length > 0 && rows.every((row) => row.owner_id === owner)
      ? rows[0].owner_name
      : null;
  const pageItems: [string, Picked][] = [];
  for (const row of rows) {
    const target = targetOf(row);
    if (target) {
      pageItems.push([
        keyOf(target.kind, target.id),
        { target, label: row.title },
      ]);
    }
  }
  const allOnPage =
    pageItems.length > 0 && pageItems.every(([k]) => selection.map.has(k));
  const someOnPage = pageItems.some(([k]) => selection.map.has(k));
  const hasFilters = FILTER_KEYS.some((key) => query.get(key));

  function applied(result: ChangeResult, fromSelection: boolean) {
    list.reload();
    if (fromSelection) {
      const keep = skippedKeys("listings", result);
      selection.replace([...selection.map].filter(([k]) => keep.has(k)));
    }
  }

  async function selectAll() {
    setSelectingAll(true);
    try {
      const qs = new URLSearchParams(query.apiQuery);
      qs.delete("page");
      qs.set("ids", "1");
      const res = await fetch(`${API_BASE.listings}?${qs}`, {
        cache: "no-store",
      });
      const body = await readJson<{
        targets?: ListingTarget[];
        tooMany?: boolean;
        count?: number;
      }>(res);
      if (body.tooMany) {
        toast.warning(
          t("selection.tooMany", {
            count: body.count ?? 0,
            max: ADMIN_STATUS_MAX_TARGETS,
          }),
        );
        return;
      }
      const titles = new Map(pageItems);
      selection.setMany(
        (body.targets ?? []).map((target) => {
          const k = keyOf(target.kind, target.id);
          return [k, { target, label: titles.get(k)?.label ?? null }];
        }),
        true,
      );
    } catch (err) {
      toast.error(errorText(err instanceof ApiError ? err.code : null));
    } finally {
      setSelectingAll(false);
    }
  }

  const columns: Column<ListingRow>[] = [
    {
      key: "select",
      header: (
        <Checkbox
          checked={allOnPage}
          indeterminate={someOnPage}
          onChange={(on) => selection.setMany(pageItems, on)}
          label={t("selection.selectPage")}
        />
      ),
      className: "w-[52px]",
      render: (row) => {
        const target = targetOf(row);
        if (!target) return null;
        const k = keyOf(target.kind, target.id);
        return (
          <Checkbox
            checked={selection.map.has(k)}
            onChange={() => selection.toggle(k, { target, label: row.title })}
            label={t("selection.selectRow", {
              name: row.title || t("common.noName"),
            })}
          />
        );
      },
    },
    {
      key: "listing",
      header: t("columns.listing"),
      className: "min-w-[220px]",
      render: (row) => {
        const href = viewUrl(row);
        return (
          <div className="space-y-0.5">
            {href ? (
              <Link
                href={href}
                target="_blank"
                rel="noopener"
                className="font-bold text-[#0F172A] underline-offset-2 hover:text-[#2563EB] hover:underline"
                title={t("cells.viewListing")}
              >
                {row.title || t("common.noName")}
              </Link>
            ) : (
              <p className="font-bold text-[#0F172A]">
                {row.title || t("common.noName")}
              </p>
            )}
            <p className="text-[12px] text-[#64748B]">
              {row.category && t.has(`categories.${row.category}`)
                ? t(`categories.${row.category}`)
                : row.category}
            </p>
          </div>
        );
      },
    },
    {
      key: "owner",
      header: t("columns.owner"),
      className: "min-w-[180px]",
      render: (row) => (
        <div className="space-y-0.5">
          <p className="font-semibold text-[#0F172A]">
            {row.owner_name || t("common.noName")}
          </p>
          <p className="text-[12px] text-[#64748B]">
            {row.owner_phone
              ? formatPhone(row.owner_phone)
              : t("common.noPhone")}
          </p>
          {row.owner_id && row.owner_id !== owner && (
            <button
              type="button"
              onClick={() => query.update({ owner: row.owner_id })}
              className="min-h-[32px] text-left text-[12px] font-bold text-[#2563EB] underline-offset-2 hover:underline"
            >
              {t("cells.ownerListings")}
            </button>
          )}
        </div>
      ),
    },
    {
      key: "vip",
      header: t("columns.vip"),
      className: "min-w-[170px]",
      render: (row) =>
        row.vip_tier ? (
          <div className="space-y-1">
            <VipPill tier={row.vip_tier} />
            <p className="text-[12px] tabular-nums text-[#475569]">
              {row.vip_permanent
                ? t("common.permanent")
                : dayTime(row.vip_expires_at)}
            </p>
            {!row.vip_permanent && <TimeLeft expiresAt={row.vip_expires_at} />}
          </div>
        ) : (
          <span className="text-[#94A3B8]">—</span>
        ),
    },
    {
      key: "discount",
      header: t("columns.discount"),
      className: "min-w-[160px]",
      render: (row) => {
        if (!row.discount_applicable) {
          return (
            <span className="text-[12px] text-[#94A3B8]">
              {t("cells.noDiscount")}
            </span>
          );
        }
        if (!row.discount_active) {
          return <span className="text-[#94A3B8]">—</span>;
        }
        return (
          <div className="space-y-1">
            <Pill tone="danger">{`−${row.discount_percent ?? 0}%`}</Pill>
            <p className="text-[12px] tabular-nums text-[#475569]">
              {row.discount_permanent
                ? t("common.permanent")
                : dayTime(row.discount_expires_at)}
            </p>
            {!row.discount_permanent && (
              <TimeLeft expiresAt={row.discount_expires_at} />
            )}
          </div>
        );
      },
    },
    {
      key: "status",
      header: t("columns.listingStatus"),
      render: (row) => (
        <Pill tone={statusTone(row.status)}>
          {row.status && t.has(`listingStatuses.${row.status}`)
            ? t(`listingStatuses.${row.status}`)
            : row.status}
        </Pill>
      ),
    },
    {
      key: "actions",
      header: <span className="sr-only">{t("columns.actions")}</span>,
      align: "right",
      // relative: keeps the sr-only label inside the table's scroll frame
      // (an absolute child of an unpositioned cell would widen <main>).
      className: "relative",
      render: (row) => {
        const target = targetOf(row);
        if (!target) return null;
        return (
          <Button
            onClick={() =>
              setDialog({
                targets: [target],
                label: row.title || t("common.noName"),
                fromSelection: false,
              })
            }
          >
            {t("common.manage")}
          </Button>
        );
      },
    },
  ];

  const kindFilter = query.get("kind");
  const categoryOptions = LISTING_CATEGORIES.filter((category) =>
    kindFilter === "property"
      ? PROPERTY_CATEGORIES.includes(category)
      : kindFilter === "service"
        ? !PROPERTY_CATEGORIES.includes(category)
        : true,
  );

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-2xl border border-[#E2E8F0] bg-white p-3 sm:p-4">
        <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center">
          <SearchBox
            value={query.get("q")}
            onCommit={(value) => query.update({ q: value || null })}
            placeholder={t("filters.searchListings")}
            loading={list.loading}
          />
          <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 lg:flex lg:flex-wrap">
            <Select
              ariaLabel={t("filters.anyKind")}
              value={kindFilter}
              onChange={(value) =>
                query.update({ kind: value || null, category: null })
              }
              placeholder={t("filters.anyKind")}
              options={(["property", "service"] as const).map((value) => ({
                value,
                label: t(`kinds.${value}`),
              }))}
              className="lg:w-[170px]"
            />
            <Select
              ariaLabel={t("filters.anyCategory")}
              value={query.get("category")}
              onChange={(value) => query.update({ category: value || null })}
              placeholder={t("filters.anyCategory")}
              options={categoryOptions.map((value) => ({
                value,
                label: t(`categories.${value}`),
              }))}
              className="lg:w-[180px]"
            />
            <Select
              ariaLabel={t("filters.anyStatus")}
              value={query.get("status")}
              onChange={(value) => query.update({ status: value || null })}
              placeholder={t("filters.anyStatus")}
              options={LISTING_STATUSES.map((value) => ({
                value,
                label: t(`listingStatuses.${value}`),
              }))}
              className="lg:w-[170px]"
            />
            <Select
              ariaLabel={t("filters.anyExpiry")}
              value={query.get("expiring")}
              onChange={(value) => query.update({ expiring: value || null })}
              placeholder={t("filters.anyExpiry")}
              options={[
                { value: "7", label: t("filters.expiring7") },
                { value: "30", label: t("filters.expiring30") },
              ]}
              className="lg:w-[190px]"
            />
          </div>
          {hasFilters && (
            <Button
              variant="ghost"
              onClick={() => query.reset({ tab: "listings" })}
            >
              {t("common.clearFilters")}
            </Button>
          )}
        </div>
        {owner && (
          <div>
            <button
              type="button"
              onClick={() => query.update({ owner: null })}
              aria-label={t("filters.removeOwner")}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-full bg-[#EFF6FF] px-3.5 text-[13px] font-bold text-[#1D4ED8] hover:bg-[#DBEAFE]"
            >
              {t("filters.owner", {
                name: ownerName || t("filters.ownerUnknown"),
              })}
              <X className="size-4" aria-hidden />
            </button>
          </div>
        )}
        <ChipGroup
          label={t("filters.stateLabel")}
          value={query.get("promo")}
          onChange={(value) => query.update({ promo: value || null })}
          chips={[
            { value: "", label: t("common.all") },
            ...PROMOTION_FILTERS.map((promo) => ({
              value: promo,
              label: t(`promo.${promo}`),
              count: promoCounts[promo] ?? 0,
            })),
          ]}
        />
      </div>

      <TableToolbar>
        <span className={cn("tabular-nums", list.loading && "opacity-60")}>
          {t("common.total", { count })}
          {list.loading && list.data ? ` · ${t("common.refreshing")}` : ""}
        </span>
        {count > 0 &&
          (count <= ADMIN_STATUS_MAX_TARGETS ? (
            <Button
              variant="ghost"
              loading={selectingAll}
              onClick={() => void selectAll()}
            >
              {selectingAll
                ? t("selection.selectingAll")
                : t("selection.selectAll", { count })}
            </Button>
          ) : (
            <span className="text-[12px]">
              {t("selection.tooMany", {
                count,
                max: ADMIN_STATUS_MAX_TARGETS,
              })}
            </span>
          ))}
      </TableToolbar>

      {list.error && (
        <ErrorBox message={errorText(list.error)} onRetry={list.reload} />
      )}
      {!list.data ? (
        list.error ? null : (
          <Skeletons count={4} className="h-16" />
        )
      ) : rows.length === 0 ? (
        <EmptyState>{t("common.empty")}</EmptyState>
      ) : (
        <div data-testid="listing-table">
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(row) => keyOf(row.kind ?? "", row.id ?? "")}
            rowClassName={(row) =>
              selection.map.has(keyOf(row.kind ?? "", row.id ?? ""))
                ? "bg-[#EFF6FF]"
                : undefined
            }
            minWidth={1080}
            caption={t("tabs.listings")}
          />
        </div>
      )}

      {list.data && (
        <StatusPager
          page={list.data.page}
          pageSize={list.data.pageSize}
          count={count}
          onPage={(page) => query.update({ page: String(page) }, true)}
        />
      )}

      <SelectionBar
        kind="listings"
        count={selection.size}
        quickActions={QUICK_ACTIONS}
        onClear={selection.clear}
        onAction={(action) => {
          const values = [...selection.map.values()];
          setDialog({
            targets: values.map((value) => value.target),
            label: values.length === 1 ? values[0].label : null,
            action,
            fromSelection: true,
          });
        }}
      />

      <ChangeDialog
        open={dialog !== null}
        kind="listings"
        targets={{ targets: dialog?.targets ?? [] }}
        count={dialog?.targets.length ?? 0}
        label={dialog?.label}
        actions={LISTING_ACTIONS}
        initialAction={dialog?.action}
        onApplied={(result) => applied(result, dialog?.fromSelection ?? false)}
        onClose={() => setDialog(null)}
      />
    </div>
  );
}
