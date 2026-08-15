"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import {
  FileText,
  Link as LinkIcon,
  QrCode,
  Plus,
  Percent,
  ExternalLink,
  UtensilsCrossed,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  contentChangeErrorKey,
  submitContentChange,
} from "@/lib/content-change/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import MenuItemDiscountModal, {
  type MenuItemDiscountRequestResult,
} from "@/components/dashboard/MenuItemDiscountModal";
import { ListingBadge } from "@/components/shared/ListingBadge";
import { isDiscountActive } from "@/lib/utils/pricing";
import type { Tables } from "@/lib/types/database";

type Service = Tables<"services">;
type MenuItem = Tables<"service_menu_items">;
type MenuItemDiscountRequest = {
  id: string;
  status: "pending" | "approved" | "rejected" | "superseded";
  proposed_values: { discount_percent?: number } | null;
  quoted_amount_gel: number | null;
  quoted_duration_hours: number | null;
  payment_error: string | null;
  rejection_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
};

interface MenuData {
  url?: string;
}

// The "open menu" anchor below renders the LIVE input value, not the saved one,
// so gating only the save left `javascript:` in an href while the owner typed.
// Self-XSS only (own state, own dashboard), but the anchor and the save must
// agree on what counts as a URL — hence one predicate, used by both.
const isHttpUrl = (value: string) => /^https?:\/\/.+\..+/i.test(value);

export default function FoodOrdersPage() {
  const tCreate = useTranslations("CreateShared");
  const t = useTranslations("FoodOrders");
  const tShared = useTranslations("DashboardShared");
  const supabase = createClient();
  const { user } = useAuth();
  const [service, setService] = useState<Service | null>(null);
  const [loading, setLoading] = useState(true);
  const [menuUrl, setMenuUrl] = useState("");
  const [menuUrlError, setMenuUrlError] = useState(false);
  // Derived once rather than guarding at the call site: the value that reaches
  // href is then itself the validated one, instead of an unvalidated value
  // rendered under a separate condition.
  const trimmedMenuUrl = menuUrl.trim();
  const safeMenuUrl = isHttpUrl(trimmedMenuUrl) ? trimmedMenuUrl : null;
  const [reviewNotice, setReviewNotice] = useState("");
  const [reviewError, setReviewError] = useState("");

  const [items, setItems] = useState<MenuItem[]>([]);
  const [itemRequests, setItemRequests] = useState<
    Record<string, MenuItemDiscountRequest | null>
  >({});
  const [discountModalItem, setDiscountModalItem] = useState<MenuItem | null>(
    null,
  );
  const [dishFormOpen, setDishFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [dishName, setDishName] = useState("");
  const [dishDescription, setDishDescription] = useState("");
  const [dishPrice, setDishPrice] = useState("");
  const [dishSaving, setDishSaving] = useState(false);
  const [dishError, setDishError] = useState("");

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const svcRes = await supabase
      .from("services")
      .select("*")
      .eq("owner_id", user.id)
      .eq("category", "food")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (svcRes.data) {
      setService(svcRes.data);
      const menuData = (svcRes.data.menu as unknown as MenuData | null) ?? {};
      setMenuUrl(menuData.url ?? "");

      const itemsRes = await fetch(
        `/api/food/menu-items?serviceId=${encodeURIComponent(svcRes.data.id)}`,
        { cache: "no-store" },
      );
      const fetchedItems = itemsRes.ok
        ? (((await itemsRes.json()) as { items: MenuItem[] }).items ?? [])
        : [];
      setItems(fetchedItems);

      const requestEntries = await Promise.all(
        fetchedItems.map(async (item) => {
          const res = await fetch(
            `/api/food/menu-item-discount-requests?menuItemId=${encodeURIComponent(item.id)}`,
            { cache: "no-store" },
          );
          if (!res.ok) return [item.id, null] as const;
          const payload = (await res.json()) as {
            request: MenuItemDiscountRequest | null;
          };
          return [item.id, payload.request] as const;
        }),
      );
      setItemRequests(Object.fromEntries(requestEntries));
    }
    setLoading(false);
  }, [user, supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const menuData: MenuData =
    (service?.menu as unknown as MenuData | null) ?? {};

  // The whole `menu` column is review-gated, so these three actions queue a change
  // request instead of writing the row. Nothing on screen can update until an admin
  // approves, so the outcome has to be reported explicitly.
  async function submitMenuChange(nextMenu: MenuData) {
    if (!service) return;
    setReviewNotice("");
    setReviewError("");
    try {
      await submitContentChange("service", service.id, { menu: nextMenu });
      setReviewNotice(tCreate("contentChange.pending"));
      // Re-read the row: an admin may have approved an earlier request, and building the
      // next proposal from a stale snapshot would silently drop the approved values.
      await fetchData();
    } catch (cause) {
      setReviewError(tCreate(contentChangeErrorKey(cause)));
    }
  }

  async function saveMenuUrl() {
    if (!service) return;
    // Empty is allowed here (it clears the saved URL); safeMenuUrl is null for
    // empty too, which is why the save can't just reuse it.
    if (trimmedMenuUrl && !isHttpUrl(trimmedMenuUrl)) {
      setMenuUrlError(true);
      return;
    }
    setMenuUrlError(false);
    await submitMenuChange({ ...menuData, url: trimmedMenuUrl });
  }

  function openAddForm() {
    setEditingItem(null);
    setDishName("");
    setDishDescription("");
    setDishPrice("");
    setDishError("");
    setDishFormOpen(true);
  }

  function openEditForm(item: MenuItem) {
    setEditingItem(item);
    setDishName(item.name);
    setDishDescription(item.description ?? "");
    setDishPrice(String(item.price));
    setDishError("");
    setDishFormOpen(true);
  }

  function closeDishForm() {
    setDishFormOpen(false);
    setEditingItem(null);
  }

  async function saveDish() {
    if (!service) return;
    const trimmedName = dishName.trim();
    const priceNumber = Number(dishPrice);
    if (!trimmedName || !Number.isFinite(priceNumber) || priceNumber < 0) {
      setDishError(tCreate("genericError"));
      return;
    }
    setDishSaving(true);
    setDishError("");
    try {
      const res = editingItem
        ? await fetch(`/api/food/menu-items/${editingItem.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: trimmedName,
              // Unlike the create RPC, the update RPC treats a null
              // description as "keep current" — an empty string is the only
              // way to actually clear it, so this branch must NOT fall back
              // to null the way the create branch below does.
              description: dishDescription.trim(),
              price: priceNumber,
              isAvailable: editingItem.is_available,
            }),
          })
        : await fetch("/api/food/menu-items", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              serviceId: service.id,
              name: trimmedName,
              description: dishDescription.trim() || null,
              price: priceNumber,
            }),
          });
      if (!res.ok) throw new Error("request_failed");
      closeDishForm();
      await fetchData();
    } catch {
      setDishError(tCreate("genericError"));
    } finally {
      setDishSaving(false);
    }
  }

  async function toggleAvailability(item: MenuItem) {
    const res = await fetch(`/api/food/menu-items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: item.name,
        description: item.description,
        price: Number(item.price),
        isAvailable: !item.is_available,
      }),
    });
    if (res.ok) await fetchData();
  }

  async function handleDeleteDish(item: MenuItem) {
    if (!window.confirm(t("confirmDeleteDish"))) return;
    const res = await fetch(`/api/food/menu-items/${item.id}`, {
      method: "DELETE",
    });
    if (res.ok) await fetchData();
  }

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-[36px] font-black leading-[44px] text-[#0F172A]">
          {service?.title ?? tShared("defaultRestaurant")}
        </h1>
        <p className="mt-1 text-[14px] font-medium text-[#64748B]">
          {t("subtitle")}
        </p>
        {reviewNotice && (
          <p className="mt-3 rounded-xl bg-[#ECFDF5] px-4 py-3 text-[13px] font-medium text-[#0F8F60]">
            {reviewNotice}
          </p>
        )}
        {reviewError && (
          <p className="mt-3 rounded-xl bg-[#FEF2F2] px-4 py-3 text-[13px] font-medium text-[#DC2626]">
            {reviewError}
          </p>
        )}
      </motion.div>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h2 className="text-[16px] font-black text-[#0F172A]">
          {t("menuSection")}
        </h2>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-[20px] border border-[#EEF1F4] bg-white p-5 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#FEE2E2] text-[#DC2626]">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[13px] font-black text-[#0F172A]">
                  {t("pdfMenu")}
                </p>
                <p className="text-[11px] text-[#94A3B8]">{t("pdfMenuHint")}</p>
              </div>
            </div>
            <p className="mt-4 rounded-xl bg-[#F8FAFC] px-3 py-2.5 text-[11px] font-medium text-[#64748B]">
              {t("maxSize")}
            </p>
            <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#0F172A] px-5 py-2.5 text-[12px] font-bold text-white hover:bg-[#1E293B]">
              <Plus className="h-4 w-4" />
              {t("uploadMenu")}
              <input type="file" accept="application/pdf" className="hidden" />
            </label>
          </div>

          <div className="rounded-[20px] border border-[#EEF1F4] bg-white p-5 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#DBEAFE] text-[#2563EB]">
                <LinkIcon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[13px] font-black text-[#0F172A]">
                  {t("digitalMenu")}
                </p>
                <p className="text-[11px] text-[#94A3B8]">
                  {t("digitalMenuHint")}
                </p>
              </div>
            </div>
            <input
              type="url"
              inputMode="url"
              value={menuUrl}
              onChange={(e) => {
                setMenuUrl(e.target.value);
                if (menuUrlError) setMenuUrlError(false);
              }}
              placeholder="https://..."
              className={`mt-4 h-11 w-full rounded-xl border bg-white px-4 text-[12px] font-medium text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 ${
                menuUrlError
                  ? "border-[#EF4444] focus:border-[#EF4444] focus:ring-[#EF4444]/15"
                  : "border-[#E2E8F0] focus:border-[#2563EB] focus:ring-[#2563EB]/15"
              }`}
            />
            {menuUrlError && (
              <p className="mt-1.5 text-[11px] font-medium text-[#EF4444]">
                {t("invalidUrl")}
              </p>
            )}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={saveMenuUrl}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-4 py-2.5 text-[12px] font-bold text-white hover:bg-[#1E40AF]"
              >
                <QrCode className="h-4 w-4" />
                {t("saveAndQr")}
              </button>
              {safeMenuUrl && (
                <a
                  href={safeMenuUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-[42px] w-[42px] items-center justify-center rounded-xl border border-[#E2E8F0] text-[#64748B] hover:border-[#2563EB] hover:text-[#2563EB]"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </div>
          </div>
        </div>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-[16px] font-black text-[#0F172A]">
              {t("menuItemsSection")}
            </h2>
            <p className="mt-0.5 text-[12px] text-[#94A3B8]">
              {t("menuItemsHint")}
            </p>
          </div>
          <button
            type="button"
            onClick={openAddForm}
            className="inline-flex items-center gap-2 rounded-xl bg-[#0F172A] px-4 py-2.5 text-[12px] font-bold text-white hover:bg-[#1E293B]"
          >
            <Plus className="h-4 w-4" />
            {t("addDish")}
          </button>
        </div>

        {dishFormOpen && (
          <div className="mb-4 rounded-[20px] border border-[#EEF1F4] bg-white p-5 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]">
            <p className="text-[13px] font-black text-[#0F172A]">
              {editingItem ? t("editDish") : t("addDish")}
            </p>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="text-[11px] font-bold text-[#64748B]">
                  {t("dishName")}
                </label>
                <input
                  type="text"
                  value={dishName}
                  onChange={(e) => setDishName(e.target.value)}
                  placeholder={t("dishNamePlaceholder")}
                  className="mt-1 h-11 w-full rounded-xl border border-[#E2E8F0] bg-white px-4 text-[12px] font-medium text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/15"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-[#64748B]">
                  {t("dishPrice")}
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={dishPrice}
                  onChange={(e) => setDishPrice(e.target.value)}
                  className="mt-1 h-11 w-full rounded-xl border border-[#E2E8F0] bg-white px-4 text-[12px] font-medium text-[#0F172A] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/15"
                />
              </div>
            </div>
            <div className="mt-3">
              <label className="text-[11px] font-bold text-[#64748B]">
                {t("dishDescription")}
              </label>
              <textarea
                value={dishDescription}
                onChange={(e) => setDishDescription(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 text-[12px] font-medium text-[#0F172A] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/15"
              />
            </div>
            {dishError && (
              <p className="mt-2 text-[11px] font-medium text-[#EF4444]">
                {dishError}
              </p>
            )}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={saveDish}
                disabled={dishSaving}
                className="flex items-center justify-center gap-2 rounded-xl bg-[#0F172A] px-5 py-2.5 text-[12px] font-bold text-white hover:bg-[#1E293B] disabled:opacity-50"
              >
                {t("saveDish")}
              </button>
              <button
                type="button"
                onClick={closeDishForm}
                className="rounded-xl border border-[#E2E8F0] px-5 py-2.5 text-[12px] font-bold text-[#64748B] hover:border-[#CBD5E1]"
              >
                {t("cancelDish")}
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <Skeleton className="h-24 rounded-[20px]" />
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-[20px] border border-dashed border-[#CBD5E1] bg-white py-10 text-center">
            <UtensilsCrossed className="h-9 w-9 text-[#CBD5E1]" />
            <p className="mt-3 text-[13px] font-bold text-[#0F172A]">
              {t("noDishesYet")}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => {
              const discountActive = isDiscountActive(
                item.discount_percent,
                item.discount_expires_at,
              );
              const pendingRequest = itemRequests[item.id];
              const hasPendingRequest = pendingRequest?.status === "pending";
              return (
                <div
                  key={item.id}
                  className="rounded-[20px] border border-[#EEF1F4] bg-white p-5 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[13px] font-black text-[#0F172A]">
                          {item.name}
                        </p>
                        {discountActive && (
                          <ListingBadge
                            variant="discount"
                            className="normal-case"
                          >
                            −{item.discount_percent}%
                          </ListingBadge>
                        )}
                      </div>
                      {item.description && (
                        <p className="mt-1 text-[12px] text-[#64748B]">
                          {item.description}
                        </p>
                      )}
                      <p className="mt-1.5 text-[13px] font-bold text-[#0F172A]">
                        {Number(item.price).toFixed(2)} ₾
                      </p>
                      {discountActive && item.discount_expires_at && (
                        <p className="mt-1 text-[11px] font-semibold text-[#166534]">
                          {t("itemDiscountExpires", {
                            date: new Intl.DateTimeFormat(undefined, {
                              dateStyle: "medium",
                              timeStyle: "short",
                            }).format(new Date(item.discount_expires_at)),
                          })}
                        </p>
                      )}
                      {hasPendingRequest && (
                        <div className="mt-2 rounded-xl border border-[#BFDBFE] bg-[#EFF6FF] px-3 py-2">
                          <p className="text-[12px] font-black text-[#1E3A8A]">
                            {t("itemDiscountPending")}
                          </p>
                          <p className="mt-0.5 text-[11px] font-semibold text-[#1D4ED8]">
                            {t("itemDiscountPendingDetails", {
                              percent:
                                pendingRequest?.proposed_values
                                  ?.discount_percent ?? 0,
                              amount: Number(
                                pendingRequest?.quoted_amount_gel ?? 0,
                              ).toFixed(2),
                              hours: pendingRequest?.quoted_duration_hours ?? 0,
                            })}
                          </p>
                          {pendingRequest?.payment_error ===
                            "insufficient_balance" && (
                            <p className="mt-1 text-[11px] font-bold text-[#B45309]">
                              {t("itemDiscountNeedsBalance")}
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <button
                        type="button"
                        onClick={() => toggleAvailability(item)}
                        className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                          item.is_available
                            ? "bg-[#DCFCE7] text-[#16A34A]"
                            : "bg-[#F1F5F9] text-[#64748B]"
                        }`}
                      >
                        {item.is_available
                          ? t("dishAvailable")
                          : t("dishUnavailable")}
                      </button>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEditForm(item)}
                          className="rounded-lg border border-[#E2E8F0] px-2.5 py-1.5 text-[11px] font-bold text-[#0F172A] hover:border-[#2563EB] hover:text-[#2563EB]"
                        >
                          {t("editDish")}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteDish(item)}
                          className="rounded-lg border border-[#FCA5A5] px-2.5 py-1.5 text-[11px] font-bold text-[#EF4444] hover:bg-[#FEF2F2]"
                        >
                          {t("deleteDish")}
                        </button>
                      </div>
                      {!discountActive && !hasPendingRequest && (
                        <button
                          type="button"
                          disabled={!service || service.status !== "active"}
                          onClick={() => setDiscountModalItem(item)}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-[#16A34A] px-3 py-1.5 text-[11px] font-bold text-white hover:bg-[#15803D] disabled:opacity-50"
                        >
                          <Percent className="h-3.5 w-3.5" />
                          {t("activateItemDiscount")}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </motion.section>

      <MenuItemDiscountModal
        isOpen={!!discountModalItem}
        onClose={() => setDiscountModalItem(null)}
        item={
          discountModalItem
            ? {
                id: discountModalItem.id,
                name: discountModalItem.name,
                price: Number(discountModalItem.price),
              }
            : null
        }
        onSubmitted={(request: MenuItemDiscountRequestResult) => {
          setItemRequests((prev) => ({
            ...prev,
            [request.menu_item_id]: {
              id: request.id,
              status: "pending",
              proposed_values: { discount_percent: request.discount_percent },
              quoted_amount_gel: request.quoted_amount_gel,
              quoted_duration_hours: request.quoted_duration_hours,
              payment_error: null,
              rejection_reason: null,
              created_at: request.created_at,
              reviewed_at: null,
            },
          }));
          setDiscountModalItem(null);
        }}
      />
    </div>
  );
}
