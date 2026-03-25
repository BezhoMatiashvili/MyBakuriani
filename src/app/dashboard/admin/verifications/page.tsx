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
    setLoading(false);
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
          <h1 className="text-2xl font-bold text-foreground">ვერიფიკაციები</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            მომხმარებლების და ქონების ვერიფიკაციის მართვა
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-brand-accent" />
          <span className="text-sm font-medium text-muted-foreground">
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
                : "bg-muted text-muted-foreground hover:bg-muted/80"
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
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-muted-foreground/30 py-16">
          <Search className="mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            ვერიფიკაციები ვერ მოიძებნა
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Table header */}
          <div className="hidden grid-cols-5 gap-4 rounded-lg bg-muted/50 px-4 py-2.5 text-xs font-medium text-muted-foreground sm:grid">
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
              className="overflow-hidden rounded-[var(--radius-card)] bg-brand-surface shadow-[var(--shadow-card)]"
            >
              {/* Row */}
              <button
                onClick={() => setExpandedId(expandedId === v.id ? null : v.id)}
                className="grid w-full grid-cols-1 gap-2 px-4 py-3 text-left sm:grid-cols-5 sm:items-center sm:gap-4"
              >
                <div>
                  <p className="font-medium text-foreground">
                    {v.user?.display_name ?? "—"}
                  </p>
                  <p className="text-xs text-muted-foreground sm:hidden">
                    {v.user?.phone ? formatPhone(v.user.phone) : ""}
                  </p>
                </div>
                <p className="truncate text-sm text-muted-foreground">
                  {v.property?.title ?? "პირადი ვერიფიკაცია"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {formatDate(v.created_at)}
                </p>
                <div>
                  <StatusBadge status={statusBadgeMap[v.status] ?? "pending"} />
                </div>
                <div className="flex justify-end">
                  {expandedId === v.id ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
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
                    className="border-t border-border"
                  >
                    <div className="grid grid-cols-1 gap-6 p-4 lg:grid-cols-2">
                      {/* User info */}
                      <div className="space-y-3">
                        <h3 className="text-sm font-semibold text-foreground">
                          მომხმარებლის ინფორმაცია
                        </h3>
                        <dl className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <dt className="text-muted-foreground">სახელი</dt>
                            <dd className="font-medium text-foreground">
                              {v.user?.display_name ?? "—"}
                            </dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="text-muted-foreground">ტელეფონი</dt>
                            <dd className="font-medium text-foreground">
                              {v.user?.phone ? formatPhone(v.user.phone) : "—"}
                            </dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="text-muted-foreground">როლი</dt>
                            <dd className="font-medium text-foreground">
                              {v.user?.role ?? "—"}
                            </dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="text-muted-foreground">
                              რეგისტრაციის თარიღი
                            </dt>
                            <dd className="font-medium text-foreground">
                              {v.user?.created_at
                                ? formatDate(v.user.created_at)
                                : "—"}
                            </dd>
                          </div>
                        </dl>

                        {/* Property details */}
                        {v.property && (
                          <>
                            <h3 className="pt-2 text-sm font-semibold text-foreground">
                              ქონების დეტალები
                            </h3>
                            <dl className="space-y-2 text-sm">
                              <div className="flex justify-between">
                                <dt className="text-muted-foreground">
                                  სათაური
                                </dt>
                                <dd className="font-medium text-foreground">
                                  {v.property.title}
                                </dd>
                              </div>
                              <div className="flex justify-between">
                                <dt className="text-muted-foreground">ტიპი</dt>
                                <dd className="font-medium text-foreground">
                                  {v.property.type}
                                </dd>
                              </div>
                              <div className="flex justify-between">
                                <dt className="text-muted-foreground">
                                  მდებარეობა
                                </dt>
                                <dd className="font-medium text-foreground">
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
                          <h3 className="mb-2 text-sm font-semibold text-foreground">
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
                                  className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm text-brand-accent hover:underline"
                                >
                                  <FileText className="h-4 w-4" />
                                  დოკუმენტი {i + 1}
                                </a>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground">
                              დოკუმენტები არ არის ატვირთული
                            </p>
                          )}
                        </div>

                        {/* Admin notes */}
                        <div>
                          <label className="mb-1.5 block text-sm font-semibold text-foreground">
                            ადმინის შენიშვნები
                          </label>
                          <textarea
                            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-brand-accent focus:outline-none focus:ring-1 focus:ring-brand-accent"
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
                          <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
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
