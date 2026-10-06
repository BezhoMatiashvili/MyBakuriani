"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import DataTable, { type Column } from "@/components/admin/finance/DataTable";
import {
  Button,
  EmptyState,
  Select,
  Skeletons,
} from "@/components/admin/finance/ui";
import { formatPhone } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import {
  ADMIN_STATUS_MAX_TARGETS,
  MEMBERSHIP_ACTIONS,
  MEMBERSHIP_SEASONS,
  MEMBERSHIP_STATES,
  type ChangeResult,
} from "@/lib/admin-statuses";
import ChangeDialog from "./ChangeDialog";
import MembershipDrawer from "./MembershipDrawer";
import {
  API_BASE,
  ApiError,
  Checkbox,
  ChipGroup,
  ErrorBox,
  MembershipStatePill,
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
  type ListPayload,
  type MembershipRow,
  type RenterPackage,
} from "./shared";

// საწევრო tab (C44): one row per user from admin_membership_overview_v.

const BULK_ACTIONS = MEMBERSHIP_ACTIONS.filter((a) => a !== "set_period");
const QUICK_ACTIONS = ["extend", "shorten", "set_end"] as const;
const FILTER_KEYS = ["q", "scope", "season", "expiring", "pending", "state"];

type Payload = ListPayload<MembershipRow> & { packages?: RenterPackage[] };
type DialogState = {
  ids: string[];
  label: string | null;
  action?: string;
  fromSelection: boolean;
};

export default function MembershipsTab({
  onShowListings,
}: {
  onShowListings: (ownerId: string) => void;
}) {
  const t = useTranslations("AdminStatuses");
  const query = useStatusQuery();
  const errorText = useErrorText();
  const day = useDayFormat();

  const listUrl = useMemo(() => {
    const qs = new URLSearchParams(query.apiQuery);
    qs.set("packages", "1");
    return `${API_BASE.memberships}?${qs}`;
  }, [query.apiQuery]);
  const list = useStatusList<Payload>(listUrl);
  const selection = useSelection<string | null>();
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [drawer, setDrawer] = useState<{
    id: string;
    name: string | null;
  } | null>(null);
  const [selectingAll, setSelectingAll] = useState(false);

  const rows = list.data?.rows ?? [];
  const packages = list.data?.packages ?? [];
  const count = list.data?.count ?? 0;
  const stateCounts = list.data?.stateCounts ?? {};
  const allCount = Object.values(stateCounts).reduce((a, b) => a + b, 0);
  const pageItems = rows
    .filter((row) => row.user_id)
    .map(
      (row) =>
        [row.user_id as string, row.display_name] as [string, string | null],
    );
  const allOnPage =
    pageItems.length > 0 && pageItems.every(([id]) => selection.map.has(id));
  const someOnPage = pageItems.some(([id]) => selection.map.has(id));
  const hasFilters = FILTER_KEYS.some((key) => query.get(key));

  function applied(result: ChangeResult, fromSelection: boolean) {
    list.reload();
    if (fromSelection) {
      const keep = skippedKeys("memberships", result);
      selection.replace([...selection.map].filter(([id]) => keep.has(id)));
    }
  }

  async function selectAll() {
    setSelectingAll(true);
    try {
      const qs = new URLSearchParams(query.apiQuery);
      qs.delete("page");
      qs.set("ids", "1");
      const res = await fetch(`${API_BASE.memberships}?${qs}`, {
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

  const columns: Column<MembershipRow>[] = [
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
          checked={selection.map.has(row.user_id ?? "")}
          onChange={() =>
            row.user_id && selection.toggle(row.user_id, row.display_name)
          }
          label={t("selection.selectRow", {
            name: row.display_name || t("common.noName"),
          })}
        />
      ),
    },
    {
      key: "user",
      header: t("columns.user"),
      className: "min-w-[200px]",
      render: (row) => (
        <div className="space-y-0.5">
          <button
            type="button"
            onClick={() =>
              row.user_id &&
              setDrawer({ id: row.user_id, name: row.display_name })
            }
            className="min-h-[32px] text-left font-bold text-[#2563EB] underline-offset-2 hover:underline"
          >
            {row.display_name || t("common.noName")}
          </button>
          <p className="text-[12px] text-[#64748B]">
            {row.phone ? formatPhone(row.phone) : t("common.noPhone")}
          </p>
        </div>
      ),
    },
    {
      key: "state",
      header: t("columns.state"),
      render: (row) => (
        <div className="flex flex-col items-start gap-1">
          <MembershipStatePill state={row.state} />
          {row.pending_id && row.state !== "pending" && (
            <span className="text-[11px] font-bold text-[#B45309]">
              {t("cells.pendingRequest")}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "period",
      header: t("columns.period"),
      className: "min-w-[210px]",
      render: (row) => <PeriodCell row={row} day={day} />,
    },
    {
      key: "left",
      header: t("columns.left"),
      render: (row) => <TimeLeft expiresAt={row.coverage_expires_at} />,
    },
    {
      key: "package",
      header: t("columns.package"),
      className: "min-w-[150px]",
      render: (row) => {
        const season =
          row.current_season ?? row.next_season ?? row.pending_season;
        const tier = row.current_price_tier ?? row.next_price_tier;
        if (!season && !tier) {
          return <span className="text-[#94A3B8]">—</span>;
        }
        return (
          <div className="space-y-0.5 text-[12px]">
            {season && (
              <p className="font-bold text-[#0F172A]">
                {t.has(`seasons.${season}`) ? t(`seasons.${season}`) : season}
              </p>
            )}
            {tier && (
              <p className="text-[#64748B]">
                {t.has(`priceTiers.${tier}`) ? t(`priceTiers.${tier}`) : tier}
              </p>
            )}
          </div>
        );
      },
    },
    {
      key: "rentals",
      header: t("columns.rentals"),
      render: (row) => {
        const total = row.rental_count ?? 0;
        if (total === 0) return <span className="text-[#94A3B8]">0</span>;
        return (
          <div className="space-y-0.5 text-[12px]">
            <p className="tabular-nums text-[#0F172A]">
              {t("cells.rentalsCount", {
                active: row.active_rental_count ?? 0,
                total,
              })}
            </p>
            {!row.covered_now && (
              <p className="font-bold text-[#B91C1C]">
                {t("cells.rentalsHidden")}
              </p>
            )}
          </div>
        );
      },
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
            row.user_id &&
            setDialog({
              ids: [row.user_id],
              label: row.display_name || t("common.noName"),
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
            placeholder={t("filters.searchMemberships")}
            loading={list.loading}
          />
          <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-3 lg:flex lg:flex-wrap">
            <Select
              ariaLabel={t("filters.scopeMembers")}
              value={query.get("scope") || "members"}
              onChange={(value) =>
                query.update({ scope: value === "members" ? null : value })
              }
              options={[
                { value: "members", label: t("filters.scopeMembers") },
                { value: "all", label: t("filters.scopeAll") },
              ]}
              className="lg:w-[190px]"
            />
            <Select
              ariaLabel={t("filters.anySeason")}
              value={query.get("season")}
              onChange={(value) => query.update({ season: value || null })}
              placeholder={t("filters.anySeason")}
              options={MEMBERSHIP_SEASONS.map((value) => ({
                value,
                label: t(`seasons.${value}`),
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
              checked={query.get("pending") === "1"}
              onChange={(event) =>
                query.update({ pending: event.target.checked ? "1" : null })
              }
              className="size-[18px] accent-[#2563EB]"
            />
            {t("filters.pendingOnly")}
          </label>
          {hasFilters && (
            <Button
              variant="ghost"
              onClick={() => query.reset({ tab: "memberships" })}
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
            ...MEMBERSHIP_STATES.map((state) => ({
              value: state,
              label: t(`states.${state}`),
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
        <div data-testid="membership-table">
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(row) => row.user_id ?? ""}
            rowClassName={(row) =>
              selection.map.has(row.user_id ?? "") ? "bg-[#EFF6FF]" : undefined
            }
            minWidth={1040}
            caption={t("tabs.memberships")}
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
        kind="memberships"
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
        kind="memberships"
        targets={{ userIds: dialog?.ids ?? [] }}
        count={dialog?.ids.length ?? 0}
        label={dialog?.label}
        actions={BULK_ACTIONS}
        initialAction={dialog?.action}
        packages={packages}
        onApplied={(result) => applied(result, dialog?.fromSelection ?? false)}
        onClose={() => setDialog(null)}
      />

      <MembershipDrawer
        userId={drawer?.id ?? null}
        name={drawer?.name}
        packages={packages}
        onClose={() => setDrawer(null)}
        onApplied={() => list.reload()}
        onShowListings={(id) => {
          setDrawer(null);
          onShowListings(id);
        }}
      />
    </div>
  );
}

function PeriodCell({
  row,
  day,
}: {
  row: MembershipRow;
  day: (instant: string | null | undefined) => string;
}) {
  const t = useTranslations("AdminStatuses");
  const lines: string[] = [];
  if (row.current_id) {
    lines.push(
      `${day(row.current_starts_at)} – ${day(row.current_expires_at)}`,
    );
  }
  if (row.next_id) {
    lines.push(
      `${t("cells.startsOn", { date: day(row.next_starts_at) })} – ${day(row.next_expires_at)}`,
    );
  }
  if (lines.length === 0 && row.last_expired_at) {
    lines.push(t("cells.endedOn", { date: day(row.last_expired_at) }));
  }
  if (lines.length === 0) return <span className="text-[#94A3B8]">—</span>;
  return (
    <div className="space-y-0.5 tabular-nums">
      {lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </div>
  );
}
