"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  FileText,
  Check,
  X,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import StatusBadge from "@/components/shared/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatPhone } from "@/lib/utils/format";
import type { Tables, Enums } from "@/lib/types/database";

type VerificationWithRelations = Tables<"verifications"> & {
  user?: Tables<"profiles"> | null;
  property?: Tables<"properties"> | null;
};

type FilterStatus = "all" | Enums<"verification_status">;

export default function VerificationsPage() {
  const [loading, setLoading] = useState(true);
  const [verifications, setVerifications] = useState<
    VerificationWithRelations[]
  >([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});

  const loadVerifications = useCallback(async () => {
    const supabase = createClient();
    try {
      let query = supabase
        .from("verifications")
        .select(
          "*, user:profiles!verifications_user_id_fkey(*), property:properties!verifications_property_id_fkey(*)",
        )
        .order("created_at", { ascending: false });

      if (filterStatus !== "all") {
        query = query.eq("status", filterStatus);
      }

      const { data } = await query;
      setVerifications((data as VerificationWithRelations[]) ?? []);
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => {
    loadVerifications();
  }, [loadVerifications]);

  const handleAction = async (id: string, action: "approved" | "rejected") => {
    const supabase = createClient();
    const notes = adminNotes[id] || null;

    await supabase
      .from("verifications")
      .update({
        status: action,
        admin_notes: notes,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (action === "approved") {
      const verification = verifications.find((v) => v.id === id);
      if (verification) {
        await supabase
          .from("profiles")
          .update({ is_verified: true, verified_at: new Date().toISOString() })
          .eq("id", verification.user_id);
      }
    }

    await loadVerifications();
    setExpandedId(null);
  };

  const statusBadgeMap: Record<string, "pending" | "verified" | "blocked"> = {
    pending: "pending",
    approved: "verified",
    rejected: "blocked",
  };

  const filters: { value: FilterStatus; label: string }[] = [
    { value: "all", label: "ყველა" },
    { value: "pending", label: "მოლოდინში" },
    { value: "approved", label: "დადასტურებული" },
    { value: "rejected", label: "უარყოფილი" },
  ];

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-[20px] font-black leading-[30px] tracking-[-0.5px] text-[#1E293B]">
            ვერიფიკაციები
          </h1>
          <p className="mt-1 text-sm font-medium text-[#64748B]">
            მომხმარებლების და ქონების ვერიფიკაციის მართვა
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-brand-accent" />
          <span className="text-sm font-medium text-[#94A3B8]">
            {verifications.filter((v) => v.status === "pending").length}{" "}
            მომლოდინე
          </span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f.value}
            onClick={() => {
              setFilterStatus(f.value);
              setLoading(true);
            }}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              filterStatus === f.value
                ? "bg-brand-accent text-white"
                : "bg-[#F8FAFC] text-[#94A3B8] hover:bg-[#F8FAFC]"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : verifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-[#64748B]/30 py-16">
          <Search className="mb-3 h-10 w-10 text-[#94A3B8]/50" />
          <p className="text-sm text-[#94A3B8]">ვერიფიკაციები ვერ მოიძებნა</p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Table header */}
          <div className="hidden grid-cols-5 gap-4 rounded-lg bg-[#F8FAFC] px-4 py-2.5 text-xs font-medium text-[#94A3B8] sm:grid">
            <span>მომხმარებელი</span>
            <span>ქონება</span>
            <span>გაგზავნის თარიღი</span>
            <span>სტატუსი</span>
            <span />
          </div>

          {verifications.map((v) => (
            <motion.div
              key={v.id}
              layout
              className="overflow-hidden rounded-[20px] border border-[#EEF1F4] bg-white shadow-[0px_4px_12px_rgba(0,0,0,0.02)]"
            >
              {/* Row */}
              <button
                onClick={() => setExpandedId(expandedId === v.id ? null : v.id)}
                className="grid w-full grid-cols-1 gap-2 px-4 py-3 text-left sm:grid-cols-5 sm:items-center sm:gap-4"
              >
                <div>
                  <p className="font-medium text-[#1E293B]">
                    {v.user?.display_name ?? "—"}
                  </p>
                  <p className="text-xs text-[#94A3B8] sm:hidden">
                    {v.user?.phone ? formatPhone(v.user.phone) : ""}
                  </p>
                </div>
                <p className="truncate text-sm text-[#94A3B8]">
                  {v.property?.title ?? "პირადი ვერიფიკაცია"}
                </p>
                <p className="text-sm text-[#94A3B8]">
                  {formatDate(v.created_at)}
                </p>
                <div>
                  <StatusBadge
                    status={statusBadgeMap[v.status ?? "pending"] ?? "pending"}
                  />
                </div>
                <div className="flex justify-end">
                  {expandedId === v.id ? (
                    <ChevronUp className="h-4 w-4 text-[#94A3B8]" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-[#94A3B8]" />
                  )}
                </div>
              </button>

              {/* Expanded detail */}
              <AnimatePresence>
                {expandedId === v.id && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="border-t border-[#E2E8F0]"
                  >
                    <div className="grid grid-cols-1 gap-6 p-4 lg:grid-cols-2">
                      {/* User info */}
                      <div className="space-y-3">
                        <h3 className="text-sm font-semibold text-[#1E293B]">
                          მომხმარებლის ინფორმაცია
                        </h3>
                        <dl className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <dt className="text-[#94A3B8]">სახელი</dt>
                            <dd className="font-medium text-[#1E293B]">
                              {v.user?.display_name ?? "—"}
                            </dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="text-[#94A3B8]">ტელეფონი</dt>
                            <dd className="font-medium text-[#1E293B]">
                              {v.user?.phone ? formatPhone(v.user.phone) : "—"}
                            </dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="text-[#94A3B8]">როლი</dt>
                            <dd className="font-medium text-[#1E293B]">
                              {v.user?.role ?? "—"}
                            </dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="text-[#94A3B8]">
                              რეგისტრაციის თარიღი
                            </dt>
                            <dd className="font-medium text-[#1E293B]">
                              {v.user?.created_at
                                ? formatDate(v.user.created_at)
                                : "—"}
                            </dd>
                          </div>
                        </dl>

                        {/* Property details */}
                        {v.property && (
                          <>
                            <h3 className="pt-2 text-sm font-semibold text-[#1E293B]">
                              ქონების დეტალები
                            </h3>
                            <dl className="space-y-2 text-sm">
                              <div className="flex justify-between">
                                <dt className="text-[#94A3B8]">სათაური</dt>
                                <dd className="font-medium text-[#1E293B]">
                                  {v.property.title}
                                </dd>
                              </div>
                              <div className="flex justify-between">
                                <dt className="text-[#94A3B8]">ტიპი</dt>
                                <dd className="font-medium text-[#1E293B]">
                                  {v.property.type}
                                </dd>
                              </div>
                              <div className="flex justify-between">
                                <dt className="text-[#94A3B8]">მდებარეობა</dt>
                                <dd className="font-medium text-[#1E293B]">
                                  {v.property.location}
                                </dd>
                              </div>
                            </dl>
                          </>
                        )}
                      </div>

                      {/* Documents & actions */}
                      <div className="space-y-4">
                        {/* Documents */}
                        <div>
                          <h3 className="mb-2 text-sm font-semibold text-[#1E293B]">
                            ატვირთული დოკუმენტები
                          </h3>
                          {Array.isArray(v.documents) &&
                          v.documents.length > 0 ? (
                            <div className="space-y-1.5">
                              {(v.documents as string[]).map((doc, i) => (
                                <a
                                  key={i}
                                  href={doc}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-2 rounded-md bg-[#F8FAFC] px-3 py-2 text-sm text-brand-accent hover:underline"
                                >
                                  <FileText className="h-4 w-4" />
                                  დოკუმენტი {i + 1}
                                </a>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-[#94A3B8]">
                              დოკუმენტები არ არის ატვირთული
                            </p>
                          )}
                        </div>

                        {/* Admin notes */}
                        <div>
                          <label className="mb-1.5 block text-sm font-semibold text-[#1E293B]">
                            ადმინის შენიშვნები
                          </label>
                          <textarea
                            className="w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2.5 text-[13px] font-medium text-[#1E293B] shadow-[inset_0px_2px_4px_1px_rgba(0,0,0,0.05)] placeholder:text-[#94A3B8] focus:border-brand-accent focus:outline-none focus:ring-1 focus:ring-brand-accent"
                            rows={3}
                            placeholder="შენიშვნის დამატება..."
                            value={adminNotes[v.id] ?? v.admin_notes ?? ""}
                            onChange={(e) =>
                              setAdminNotes((prev) => ({
                                ...prev,
                                [v.id]: e.target.value,
                              }))
                            }
                          />
                        </div>

                        {/* Decision history */}
                        {v.reviewed_at && (
                          <div className="rounded-md bg-[#F8FAFC] px-3 py-2 text-xs text-[#94A3B8]">
                            გადაწყვეტილება: {formatDate(v.reviewed_at)}
                          </div>
                        )}

                        {/* Action buttons */}
                        {v.status === "pending" && (
                          <div className="flex gap-3">
                            <Button
                              onClick={() => handleAction(v.id, "approved")}
                              className="flex-1 bg-green-600 text-white hover:bg-green-700"
                            >
                              <Check className="mr-2 h-4 w-4" />
                              დადასტურება
                            </Button>
                            <Button
                              onClick={() => handleAction(v.id, "rejected")}
                              variant="outline"
                              className="flex-1 border-red-300 text-red-600 hover:bg-red-50"
                            >
                              <X className="mr-2 h-4 w-4" />
                              უარყოფა
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
