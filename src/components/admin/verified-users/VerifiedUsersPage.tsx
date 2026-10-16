"use client";

import { useCallback, useEffect, useRef, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/admin/finance/ui";
import { useStatusQuery } from "@/components/admin/statuses/shared";
import { cn } from "@/lib/utils";
import GroupsTab from "./GroupsTab";
import UsersTab from "./UsersTab";

// /dashboard/admin/verified-users (C52): accounts an admin verified, and the
// payer groups. The tab and its search live in the URL (?tab=groups; the
// verified list is the default).

const TABS = ["users", "groups"] as const;
type Tab = (typeof TABS)[number];

export default function VerifiedUsersPage() {
  const t = useTranslations("AdminVerifiedUsers");
  const query = useStatusQuery();
  const tab: Tab = query.get("tab") === "groups" ? "groups" : "users";
  const panelRef = useRef<HTMLDivElement>(null);
  const shownTab = useRef(tab);

  // A finished removal or deletion takes its opener out of the DOM and focus
  // falls to the body: bring it to the tab panel, unless it is already on
  // something real.
  const settle = useCallback(() => {
    const active = document.activeElement;
    if (!active || active === document.body || !active.isConnected) {
      panelRef.current?.focus();
    }
  }, []);

  // A group chip on the verified list opens the Groups tab, and the chip goes
  // with its tab: the same hand-over as after a removal. A press on a tab
  // itself keeps focus on that tab, so this does nothing then.
  useEffect(() => {
    if (shownTab.current === tab) return;
    shownTab.current = tab;
    settle();
  }, [tab, settle]);

  function goTo(next: Tab) {
    if (next !== tab) query.reset(next === "users" ? {} : { tab: next });
  }

  // WAI-ARIA tabs: one tab stop for the list, the arrow keys move between the
  // tabs (and open them), Home and End jump to the ends.
  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, from: Tab) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
      return;
    const at = TABS.indexOf(from);
    let next: Tab;
    switch (event.key) {
      case "ArrowRight":
        next = TABS[(at + 1) % TABS.length];
        break;
      case "ArrowLeft":
        next = TABS[(at - 1 + TABS.length) % TABS.length];
        break;
      case "Home":
        next = TABS[0];
        break;
      case "End":
        next = TABS[TABS.length - 1];
        break;
      default:
        return;
    }
    event.preventDefault();
    goTo(next);
    document.getElementById(`verified-users-tab-${next}`)?.focus();
  }

  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-6 pb-10">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      <div
        role="tablist"
        aria-label={t("tabsLabel")}
        data-jev-public
        className="flex max-w-full gap-1 overflow-x-auto rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-1"
      >
        {TABS.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            id={`verified-users-tab-${item}`}
            aria-selected={item === tab}
            aria-controls={`verified-users-panel-${item}`}
            tabIndex={item === tab ? 0 : -1}
            onClick={() => goTo(item)}
            onKeyDown={(event) => onTabKeyDown(event, item)}
            className={cn(
              "min-h-[44px] shrink-0 rounded-xl px-4 text-[14px] font-bold transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#2563EB]",
              item === tab
                ? "bg-white text-[#0F172A] shadow-sm"
                : "text-[#64748B] hover:text-[#0F172A]",
            )}
          >
            {t(`tabs.${item}`)}
          </button>
        ))}
      </div>

      <div
        ref={panelRef}
        role="tabpanel"
        tabIndex={-1}
        id={`verified-users-panel-${tab}`}
        aria-labelledby={`verified-users-tab-${tab}`}
        className="outline-none"
      >
        {tab === "users" ? (
          <UsersTab onSettled={settle} />
        ) : (
          <GroupsTab onSettled={settle} />
        )}
      </div>
    </div>
  );
}
