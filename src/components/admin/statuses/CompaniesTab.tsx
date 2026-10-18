"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import DataTable, { type Column } from "@/components/admin/finance/DataTable";
import {
  Button,
  EmptyState,
  Pill,
  Select,
  Skeletons,
  type Tone,
} from "@/components/admin/finance/ui";
import { formatPhone } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import {
  ADMIN_STATUS_MAX_TARGETS,
  COMPANY_ACTIONS,
  COMPANY_PLAN_TIERS,
  COMPANY_STATES,
  type ChangeResult,
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
  readJson,
  skippedKeys,
  useDayFormat,
  useErrorText,
  useSelection,
  useStatusList,
  useStatusQuery,
  type CompanyRow,
  type CompanyTierPackage,
  type ListPayload,
} from "./shared";

// Company plan tab (C44): one row per organization from admin_company_plans_v.

const QUICK_ACTIONS = ["extend", "shorten", "set_end"] as const;
const FILTER_KEYS = ["q", "tier", "expiring", "orgStatus", "state"];
const STATE_TONES: Record<string, Tone> = {
  active: "success",
  expired: "neutral",
  none: "neutral",
};

type Payload = ListPayload<CompanyRow> & { tiers?: CompanyTierPackage[] };
type DialogState = {
  ids: string[];
  label: string | null;
  action?: string;
  fromSelection: boolean;
};

export default function CompaniesTab() {
  const t = useTranslations("AdminStatuses");
  const query = useStatusQuery();
  const errorText = useErrorText();
  const day = useDayFormat();

  const listUrl = useMemo(() => {
    const qs = new URLSearchParams(query.apiQuery);
    qs.set("packages", "1");
    return `${API_BASE.companies}?${qs}`;
  }, [query.apiQuery]);
  const list = useStatusList<Payload>(listUrl);
  const selection = useSelection<string | null>();
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [selectingAll, setSelectingAll] = useState(false);

  const rows = list.data?.rows ?? [];
  const tiers = list.data?.tiers ?? [];
  const count = list.data?.count ?? 0;
  const stateCounts = list.data?.stateCounts ?? {};
  const allCount = Object.values(stateCounts).reduce((a, b) => a + b, 0);
  const pageItems = rows
    .filter((row) => row.organization_id)
    .map(
      (row) =>
        [row.organization_id as string, row.brand_name] as [
          string,
          string | null,
        ],
    );
  const allOnPage =
    pageItems.length > 0 && pageItems.every(([id]) => selection.map.has(id));
  const someOnPage = pageItems.some(([id]) => selection.map.has(id));
  const hasFilters = FILTER_KEYS.some((key) => query.get(key));

  function applied(result: ChangeResult, fromSelection: boolean) {
    list.reload();
    if (fromSelection) {
      const keep = skippedKeys("companies", result);
      selection.replace([...selection.map].filter(([id]) => keep.has(id)));
    }
  }

  async function selectAll() {
    setSelectingAll(true);
    try {
      const qs = new URLSearchParams(query.apiQuery);
      qs.delete("page");
      qs.set("ids", "1");
      const res = await fetch(`${API_BASE.companies}?${qs}`, {
        cache: "no-store",
      });
      const body = await readJson<{
        ids?: string[];
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
      const names = new Map(pageItems);
      selection.setMany(
        (body.ids ?? []).map((id) => [id, names.get(id) ?? null]),
        true,
      );
    } catch (err) {
      toast.error(errorText(err instanceof ApiError ? err.code : null));
    } finally {
      setSelectingAll(false);
    }
  }

  const tierLabel = (tier: string | null) =>
    tier && t.has(`companyTiers.${tier}`) ? t(`companyTiers.${tier}`) : tier;

  const columns: Column<CompanyRow>[] = [
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
      render: (row) => (
        <Checkbox
          checked={selection.map.has(row.organization_id ?? "")}
          onChange={() =>
            row.organization_id &&
            selection.toggle(row.organization_id, row.brand_name)
          }
          label={t("selection.selectRow", {
            name: row.brand_name || t("common.noName"),
          })}
        />
      ),
    },
    {
      key: "company",
      header: t("columns.company"),
      className: "min-w-[200px]",
      render: (row) => (
        <div className="space-y-0.5">
          <p className="font-bold text-[#0F172A]">
            {row.brand_name || t("common.noName")}
          </p>
          {row.legal_name && row.legal_name !== row.brand_name && (
            <p className="text-[12px] text-[#64748B]">{row.legal_name}</p>
          )}
          {row.org_status && row.org_status !== "active" && (
            <Pill tone="warning">
              {t.has(`orgStatuses.${row.org_status}`)
                ? t(`orgStatuses.${row.org_status}`)
                : row.org_status}
            </Pill>
          )}
        </div>
      ),
    },
    {
      key: "owner",
      header: t("columns.owner"),
      className: "min-w-[170px]",
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
        </div>
      ),
    },
    {
      key: "plan",
      header: t("columns.plan"),
      render: (row) => (
        <div className="flex flex-col items-start gap-1">
          <Pill tone={STATE_TONES[row.state ?? "none"] ?? "neutral"}>
            {row.state && t.has(`companyStates.${row.state}`)
              ? t(`companyStates.${row.state}`)
              : row.state}
          </Pill>
          {(row.tier ?? row.last_tier) && (
            <span
              className={cn(
                "text-[13px] font-bold",
                row.tier ? "text-[#0F172A]" : "text-[#94A3B8]",
              )}
            >
              {tierLabel(row.tier ?? row.last_tier)}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "usage",
      header: t("columns.usage"),
      render: (row) => {
        const used = row.used_listings ?? 0;
        if (!row.plan_id) {
          return <span className="tabular-nums text-[#64748B]">{used}</span>;
        }
        const limit = row.listing_limit;
        const over = limit !== null && used > limit;
        return (
          <div className="space-y-0.5">
            <p
              className={cn(
                "tabular-nums",
                over ? "font-bold text-[#B91C1C]" : "text-[#0F172A]",
              )}
            >
              {t("cells.usage", {
                used,
                limit: limit === null ? t("cells.unlimited") : limit,
              })}
            </p>
            {over && (
              <p className="text-[11px] font-bold text-[#B91C1C]">
                {t("cells.overLimit")}
              </p>
            )}
          </div>
        );
      },
    },
    {
      key: "period",
      header: t("columns.period"),
      className: "min-w-[200px]",
      render: (row) =>
        row.plan_id ? (
          <span className="tabular-nums">
            {day(row.starts_at)} – {day(row.expires_at)}
          </span>
        ) : row.last_expires_at ? (
          <span className="text-[#64748B]">
            {t("cells.endedOn", { date: day(row.last_expires_at) })}
          </span>
        ) : (
          <span className="text-[#94A3B8]">—</span>
        ),
    },
    {
      key: "left",
      header: t("columns.left"),
      render: (row) =>
        row.plan_id ? (
          <TimeLeft expiresAt={row.expires_at} />
        ) : (
          <span className="text-[#94A3B8]">—</span>
        ),
    },
    {
      key: "actions",
      header: <span className="sr-only">{t("columns.actions")}</span>,
      align: "right",
      // relative: keeps the sr-only label inside the table's scroll frame
      // (an absolute child of an unpositioned cell would widen <main>).
      className: "relative",
      render: (row) => (
        <Button
          onClick={() =>
            row.organization_id &&
            setDialog({
              ids: [row.organization_id],
              label: row.brand_name || t("common.noName"),
              fromSelection: false,
            })
          }
        >
          {t("common.manage")}
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-2xl border border-[#E2E8F0] bg-white p-3 sm:p-4">
        <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center">
          <SearchBox
            value={query.get("q")}
            onCommit={(value) => query.update({ q: value || null })}
            placeholder={t("filters.searchCompanies")}
            loading={list.loading}
          />
          <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 lg:flex lg:flex-wrap">
            <Select
              ariaLabel={t("filters.anyTier")}
              value={query.get("tier")}
              onChange={(value) => query.update({ tier: value || null })}
              placeholder={t("filters.anyTier")}
              options={COMPANY_PLAN_TIERS.map((value) => ({
                value,
                label: t(`companyTiers.${value}`),
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
          <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 text-[13px] font-semibold text-[#334155]">
            <input
              type="checkbox"
              checked={query.get("orgStatus") === "active"}
              onChange={(event) =>
                query.update({
                  orgStatus: event.target.checked ? "active" : null,
                })
              }
              className="size-[18px] accent-[#2563EB]"
            />
            {t("filters.activeCompaniesOnly")}
          </label>
          {hasFilters && (
            <Button
              variant="ghost"
              onClick={() => query.reset({ tab: "companies" })}
            >
              {t("common.clearFilters")}
            </Button>
          )}
        </div>
        <ChipGroup
          label={t("filters.stateLabel")}
          value={query.get("state")}
          onChange={(value) => query.update({ state: value || null })}
          chips={[
            { value: "", label: t("common.all"), count: allCount },
            ...COMPANY_STATES.map((state) => ({
              value: state,
              label: t(`companyStates.${state}`),
              count: stateCounts[state] ?? 0,
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
        <div data-testid="company-table">
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(row) => row.organization_id ?? ""}
            rowClassName={(row) =>
              selection.map.has(row.organization_id ?? "")
                ? "bg-[#EFF6FF]"
                : undefined
            }
            minWidth={1000}
            caption={t("tabs.companies")}
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
        kind="companies"
        count={selection.size}
        quickActions={QUICK_ACTIONS}
        onClear={selection.clear}
        onAction={(action) =>
          setDialog({
            ids: [...selection.map.keys()],
            label:
              selection.size === 1
                ? ([...selection.map.values()][0] ?? null)
                : null,
            action,
            fromSelection: true,
          })
        }
      />

      <ChangeDialog
        open={dialog !== null}
        kind="companies"
        targets={{ orgIds: dialog?.ids ?? [] }}
        count={dialog?.ids.length ?? 0}
        label={dialog?.label}
        actions={COMPANY_ACTIONS}
        initialAction={dialog?.action}
        tiers={tiers}
        onApplied={(result) => applied(result, dialog?.fromSelection ?? false)}
        onClose={() => setDialog(null)}
      />
    </div>
  );
}
