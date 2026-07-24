"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Loader2,
  Save,
  Eye,
  EyeOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AdminSearchInput } from "@/components/admin/AdminSearchInput";
import { ICON_MAP } from "@/lib/status-cards/icons";
import {
  STATUS_ICONS,
  STATUS_KINDS,
  type LocalizedText,
  type StatusCard,
  type StatusCardItem,
  type StatusIcon,
  type StatusKind,
} from "@/lib/status-cards/types";

const LANGS: (keyof LocalizedText)[] = ["ka", "en", "ru"];

function newItem(): StatusCardItem {
  return {
    id: crypto.randomUUID(),
    label: { ka: "" },
    value: null,
    status: "none",
    url: null,
  };
}

function newCard(): StatusCard {
  return {
    id: crypto.randomUUID(),
    icon: "none",
    label: { ka: "" },
    value: { ka: "" },
    redDot: false,
    expandable: false,
    active: true,
    items: [],
  };
}

const inputClass =
  "w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#0F172A] outline-none focus:border-[#2563EB]";

function LocalizedField({
  value,
  onChange,
}: {
  value: LocalizedText;
  onChange: (next: LocalizedText) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {LANGS.map((lang) => (
        <label key={lang} className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-wide text-[#94A3B8]">
            {lang}
          </span>
          <input
            value={value[lang] ?? ""}
            onChange={(e) => onChange({ ...value, [lang]: e.target.value })}
            className={inputClass}
          />
        </label>
      ))}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex min-h-11 items-center gap-2 text-sm font-medium text-[#334155] lg:min-h-0"
    >
      <span
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
          checked ? "bg-[#2563EB]" : "bg-[#CBD5E1]",
        )}
      >
        <span
          className={cn(
            "absolute size-4 rounded-full bg-white shadow-sm transition-all",
            checked ? "right-0.5" : "left-0.5",
          )}
        />
      </span>
      {label}
    </button>
  );
}

const STATUS_LABEL_KEY: Record<StatusKind, string> = {
  ok: "statusOk",
  warn: "statusWarn",
  closed: "statusClosed",
  none: "statusNone",
};

export default function AdminStatusCardsPage() {
  const t = useTranslations("AdminStatusCards");
  const [cards, setCards] = useState<StatusCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const filteredCards = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cards;
    return cards.filter(
      (c) =>
        c.id.toLowerCase().includes(q) ||
        (c.label.ka ?? "").toLowerCase().includes(q),
    );
  }, [cards, search]);

  useEffect(() => {
    fetch("/api/admin/status-cards")
      .then((r) => r.json())
      .then((p: { cards?: StatusCard[] } | null) => {
        if (p?.cards) setCards(p.cards);
      })
      .catch(() => toast.error(t("loadError")))
      .finally(() => setLoading(false));
  }, [t]);

  function patchCard(idx: number, patch: Partial<StatusCard>) {
    setCards((prev) =>
      prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
    );
  }

  function patchItem(
    cardIdx: number,
    itemIdx: number,
    patch: Partial<StatusCardItem>,
  ) {
    setCards((prev) =>
      prev.map((c, i) =>
        i === cardIdx
          ? {
              ...c,
              items: c.items.map((it, j) =>
                j === itemIdx ? { ...it, ...patch } : it,
              ),
            }
          : c,
      ),
    );
  }

  function moveCard(idx: number, dir: -1 | 1) {
    setCards((prev) => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }

  function moveItem(cardIdx: number, itemIdx: number, dir: -1 | 1) {
    setCards((prev) =>
      prev.map((c, i) => {
        if (i !== cardIdx) return c;
        const items = [...c.items];
        const target = itemIdx + dir;
        if (target < 0 || target >= items.length) return c;
        [items[itemIdx], items[target]] = [items[target], items[itemIdx]];
        return { ...c, items };
      }),
    );
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/status-cards", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cards }),
      });
      const payload = await res.json();
      if (!res.ok) {
        toast.error(payload?.error || t("saveError"));
        return;
      }
      setCards(payload.cards);
      toast.success(t("saved"));
    } catch {
      toast.error(t("saveError"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-[#94A3B8]" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-black text-[#0F172A] sm:text-[32px]">
            {t("title")}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[#64748B]">
            {t("subtitle")}
          </p>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="flex h-11 items-center gap-2 rounded-xl bg-[#2563EB] px-5 text-sm font-bold text-white transition-colors hover:bg-[#1D4ED8] disabled:opacity-60"
        >
          {saving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          {saving ? t("saving") : t("save")}
        </button>
      </div>

      <AdminSearchInput
        value={search}
        onChange={setSearch}
        placeholder={t("searchPlaceholder")}
        onClear={() => setSearch("")}
      />

      <div className="space-y-3">
        {filteredCards.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm font-medium text-[#64748B]">
            {t("searchEmpty")}
          </p>
        ) : (
          filteredCards.map((card) => {
            const idx = cards.findIndex((c) => c.id === card.id);
            const Icon = ICON_MAP[card.icon];
            const isEditing = expandedId === card.id;
            return (
              <div
                key={card.id}
                className={cn(
                  "rounded-2xl border bg-white",
                  card.active
                    ? "border-[#E2E8F0]"
                    : "border-dashed border-[#CBD5E1]",
                )}
              >
                {/* Header row */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="flex flex-col">
                    <button
                      type="button"
                      onClick={() => moveCard(idx, -1)}
                      disabled={idx === 0}
                      aria-label={t("moveUp")}
                      className="flex size-11 items-center justify-center text-[#94A3B8] hover:text-[#334155] disabled:opacity-30 lg:size-auto"
                    >
                      <ChevronUp className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveCard(idx, 1)}
                      disabled={idx === cards.length - 1}
                      aria-label={t("moveDown")}
                      className="flex size-11 items-center justify-center text-[#94A3B8] hover:text-[#334155] disabled:opacity-30 lg:size-auto"
                    >
                      <ChevronDown className="size-4" />
                    </button>
                  </div>

                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#F1F5F9] text-[#475569]">
                    {Icon ? <Icon className="size-5" /> : <span>—</span>}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-[#0F172A]">
                      {card.label.ka || t("untitled")}
                    </p>
                    <p className="truncate text-xs text-[#94A3B8]">
                      {card.value.ka}
                      {card.expandable
                        ? ` · ${card.items.length} ${t("items").toLowerCase()}`
                        : ""}
                    </p>
                  </div>

                  {!card.active && (
                    <span className="rounded-md bg-[#F1F5F9] px-2 py-1 text-[11px] font-bold text-[#64748B]">
                      {t("hidden")}
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => setExpandedId(isEditing ? null : card.id)}
                    className="flex min-h-11 items-center justify-center rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-xs font-bold text-[#334155] hover:bg-[#F8FAFC] lg:min-h-0"
                  >
                    {isEditing ? t("done") : t("edit")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!window.confirm(t("deleteCardConfirm"))) return;
                      setCards((prev) => prev.filter((_, i) => i !== idx));
                    }}
                    aria-label={t("delete")}
                    className="flex size-11 items-center justify-center rounded-lg border border-[#FECACA] bg-[#FEF2F2] p-1.5 text-[#DC2626] hover:bg-[#FEE2E2] lg:size-auto"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>

                {/* Editor body */}
                {isEditing && (
                  <div className="space-y-5 border-t border-[#E2E8F0] px-4 py-4">
                    <div className="flex flex-wrap items-end gap-4">
                      <label className="flex flex-col gap-1">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-[#94A3B8]">
                          {t("icon")}
                        </span>
                        <select
                          value={card.icon}
                          onChange={(e) =>
                            patchCard(idx, {
                              icon: e.target.value as StatusIcon,
                            })
                          }
                          className={inputClass}
                        >
                          {STATUS_ICONS.map((ic) => (
                            <option key={ic} value={ic}>
                              {ic}
                            </option>
                          ))}
                        </select>
                      </label>
                      <Toggle
                        checked={card.active}
                        onChange={(v) => patchCard(idx, { active: v })}
                        label={t("active")}
                      />
                      <Toggle
                        checked={card.redDot}
                        onChange={(v) => patchCard(idx, { redDot: v })}
                        label={t("redDot")}
                      />
                      <Toggle
                        checked={card.expandable}
                        onChange={(v) => patchCard(idx, { expandable: v })}
                        label={t("expandable")}
                      />
                    </div>

                    <div>
                      <p className="mb-1.5 text-xs font-bold text-[#334155]">
                        {t("label")}
                      </p>
                      <LocalizedField
                        value={card.label}
                        onChange={(v) => patchCard(idx, { label: v })}
                      />
                    </div>

                    <div>
                      <p className="mb-1.5 text-xs font-bold text-[#334155]">
                        {t("value")}
                      </p>
                      <LocalizedField
                        value={card.value}
                        onChange={(v) => patchCard(idx, { value: v })}
                      />
                    </div>

                    {/* Children items */}
                    {card.expandable && (
                      <div className="rounded-xl bg-[#F8FAFC] p-3">
                        <div className="mb-2 flex items-center justify-between">
                          <p className="text-xs font-bold text-[#334155]">
                            {t("items")}
                          </p>
                          <button
                            type="button"
                            onClick={() =>
                              patchCard(idx, {
                                items: [...card.items, newItem()],
                              })
                            }
                            className="flex min-h-11 items-center gap-1 rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-1 text-xs font-bold text-[#2563EB] hover:bg-[#F1F5F9] lg:min-h-0"
                          >
                            <Plus className="size-3.5" />
                            {t("addItem")}
                          </button>
                        </div>

                        {card.items.length === 0 ? (
                          <p className="py-3 text-center text-xs text-[#94A3B8]">
                            {t("noItems")}
                          </p>
                        ) : (
                          <div className="space-y-3">
                            {card.items.map((item, j) => (
                              <div
                                key={item.id}
                                className="rounded-lg border border-[#E2E8F0] bg-white p-3"
                              >
                                <div className="mb-2 flex items-center justify-end gap-1">
                                  <button
                                    type="button"
                                    onClick={() => moveItem(idx, j, -1)}
                                    disabled={j === 0}
                                    aria-label={t("moveUp")}
                                    className="flex size-11 items-center justify-center text-[#94A3B8] hover:text-[#334155] disabled:opacity-30 lg:size-auto"
                                  >
                                    <ChevronUp className="size-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => moveItem(idx, j, 1)}
                                    disabled={j === card.items.length - 1}
                                    aria-label={t("moveDown")}
                                    className="flex size-11 items-center justify-center text-[#94A3B8] hover:text-[#334155] disabled:opacity-30 lg:size-auto"
                                  >
                                    <ChevronDown className="size-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      patchCard(idx, {
                                        items: card.items.filter(
                                          (_, k) => k !== j,
                                        ),
                                      })
                                    }
                                    aria-label={t("delete")}
                                    className="ml-1 flex size-11 items-center justify-center rounded-md border border-[#FECACA] bg-[#FEF2F2] p-1 text-[#DC2626] hover:bg-[#FEE2E2] lg:size-auto"
                                  >
                                    <Trash2 className="size-3.5" />
                                  </button>
                                </div>

                                <div className="space-y-2">
                                  <LocalizedField
                                    value={item.label}
                                    onChange={(v) =>
                                      patchItem(idx, j, { label: v })
                                    }
                                  />
                                  <LocalizedField
                                    value={item.value ?? { ka: "" }}
                                    onChange={(v) =>
                                      patchItem(idx, j, { value: v })
                                    }
                                  />
                                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                    <label className="flex flex-col gap-1">
                                      <span className="text-[10px] font-bold uppercase tracking-wide text-[#94A3B8]">
                                        {t("status")}
                                      </span>
                                      <select
                                        value={item.status}
                                        onChange={(e) =>
                                          patchItem(idx, j, {
                                            status: e.target
                                              .value as StatusKind,
                                          })
                                        }
                                        className={inputClass}
                                      >
                                        {STATUS_KINDS.map((s) => (
                                          <option key={s} value={s}>
                                            {t(STATUS_LABEL_KEY[s])}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                    <label className="flex flex-col gap-1">
                                      <span className="text-[10px] font-bold uppercase tracking-wide text-[#94A3B8]">
                                        {t("url")}
                                      </span>
                                      <input
                                        value={item.url ?? ""}
                                        onChange={(e) =>
                                          patchItem(idx, j, {
                                            url: e.target.value,
                                          })
                                        }
                                        placeholder={t("urlPlaceholder")}
                                        className={inputClass}
                                      />
                                    </label>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex items-center gap-2 text-xs text-[#94A3B8]">
                      {card.active ? (
                        <Eye className="size-3.5" />
                      ) : (
                        <EyeOff className="size-3.5" />
                      )}
                      {card.active ? t("active") : t("hidden")}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <button
        type="button"
        onClick={() => {
          const card = newCard();
          setCards((prev) => [...prev, card]);
          setExpandedId(card.id);
        }}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#CBD5E1] text-sm font-bold text-[#64748B] hover:border-[#2563EB] hover:text-[#2563EB]"
      >
        <Plus className="size-4" />
        {t("addCard")}
      </button>
    </div>
  );
}
