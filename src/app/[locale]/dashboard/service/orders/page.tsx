"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageSquare,
  User,
  Calendar,
  Check,
  X as XIcon,
  Clock,
  FileText,
  Briefcase,
  Phone,
  MapPin,
  Languages,
  Banknote,
  Download,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import StatusBadge from "@/components/shared/StatusBadge";
import Modal from "@/components/shared/Modal";
import { formatDate } from "@/lib/utils/format";
import type { Tables } from "@/lib/types/database";

type Message = Tables<"sms_messages"> & {
  sender?: { display_name: string; phone: string };
};

type ApplicationRow = Tables<"job_applications"> & {
  service: { id: string; title: string; owner_id: string } | null;
};

type ViewType = "messages" | "applications";
type StatusTab = "new" | "processed";

const statusTabs: { key: StatusTab; label: string }[] = [
  { key: "new", label: "ახალი" },
  { key: "processed", label: "დამუშავებული" },
];

const viewTabs: { key: ViewType; label: string }[] = [
  { key: "messages", label: "შეკითხვები" },
  { key: "applications", label: "ვაკანსიის განაცხადები" },
];

export default function ServiceOrdersPage() {
  const supabase = createClient();
  const { user } = useAuth();

  const [viewType, setViewType] = useState<ViewType>("messages");
  const [activeTab, setActiveTab] = useState<StatusTab>("new");

  const [messages, setMessages] = useState<Message[]>([]);
  const [applications, setApplications] = useState<ApplicationRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [selectedApplication, setSelectedApplication] =
    useState<ApplicationRow | null>(null);

  const fetchMessages = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("sms_messages")
      .select(
        "*, sender:profiles!sms_messages_from_user_id_fkey(display_name, phone)",
      )
      .eq("to_user_id", user.id)
      .order("created_at", { ascending: false });
    setMessages((data as Message[]) ?? []);
  }, [user, supabase]);

  const fetchApplications = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("job_applications")
      .select("*, service:services!inner(id,title,owner_id)")
      .eq("service.owner_id", user.id)
      .order("created_at", { ascending: false });
    setApplications((data as ApplicationRow[] | null) ?? []);
  }, [user, supabase]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    Promise.all([fetchMessages(), fetchApplications()]).finally(() =>
      setLoading(false),
    );
  }, [user, fetchMessages, fetchApplications]);

  // Realtime: messages
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("service-orders-messages-rt")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "sms_messages",
          filter: `to_user_id=eq.${user.id}`,
        },
        () => {
          fetchMessages();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, supabase, fetchMessages]);

  // Realtime: applications. The DB filter is by service_id, not owner, so we
  // refetch and rely on the SELECT RLS policy to scope to the current owner.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("service-orders-applications-rt")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "job_applications",
        },
        () => {
          fetchApplications();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, supabase, fetchApplications]);

  const filteredMessages = messages.filter((msg) =>
    activeTab === "new" ? !msg.is_read : msg.is_read,
  );

  const filteredApplications = applications.filter(
    (app) => app.status === activeTab,
  );

  const newMessageCount = messages.filter((m) => !m.is_read).length;
  const newApplicationCount = applications.filter(
    (a) => a.status === "new",
  ).length;

  async function markMessageRead(id: string) {
    await supabase.from("sms_messages").update({ is_read: true }).eq("id", id);
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, is_read: true } : m)),
    );
  }

  async function markApplicationProcessed(id: string) {
    const { error } = await supabase
      .from("job_applications")
      .update({ status: "processed" })
      .eq("id", id);
    if (error) return;
    setApplications((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: "processed" } : a)),
    );
  }

  async function downloadCv(path: string) {
    const { data, error } = await supabase.storage
      .from("cv-documents")
      .createSignedUrl(path, 60);
    if (error || !data) return;
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <h1 className="text-[36px] font-black leading-[44px] text-[#0F172A]">
        შეკვეთები / შეკითხვები
      </h1>

      {/* View type switcher */}
      <div className="inline-flex max-w-full flex-wrap rounded-xl border border-[#E2E8F0] bg-white p-1">
        {viewTabs.map((vt) => {
          const active = viewType === vt.key;
          const badge =
            vt.key === "messages" ? newMessageCount : newApplicationCount;
          return (
            <button
              key={vt.key}
              type="button"
              onClick={() => {
                setViewType(vt.key);
                setActiveTab("new");
              }}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition-colors ${
                active
                  ? "bg-[#2563EB] text-white"
                  : "text-[#64748B] hover:text-[#1E293B]"
              }`}
            >
              {vt.key === "messages" ? (
                <MessageSquare className="h-4 w-4" />
              ) : (
                <Briefcase className="h-4 w-4" />
              )}
              {vt.label}
              {badge > 0 && (
                <span
                  className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold ${
                    active
                      ? "bg-white text-[#2563EB]"
                      : "bg-[#EF4444] text-white"
                  }`}
                >
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 rounded-xl bg-[#F8FAFC] p-1">
        {statusTabs.map((tab) => {
          const count =
            tab.key === "new"
              ? viewType === "messages"
                ? newMessageCount
                : newApplicationCount
              : 0;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? "bg-brand-surface text-[#1E293B] shadow-[0px_1px_3px_rgba(0,0,0,0.05)]"
                  : "text-[#94A3B8] hover:text-[#1E293B]"
              }`}
            >
              {tab.label}
              {tab.key === "new" && count > 0 && (
                <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-accent px-1 text-xs text-white">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-xl bg-[#F8FAFC]"
            />
          ))}
        </div>
      ) : viewType === "messages" ? (
        <MessagesList
          rows={filteredMessages}
          activeTab={activeTab}
          onSelect={setSelectedMessage}
        />
      ) : (
        <ApplicationsList
          rows={filteredApplications}
          activeTab={activeTab}
          onSelect={setSelectedApplication}
          onDownloadCv={downloadCv}
        />
      )}

      <AnimatePresence>
        {selectedMessage && (
          <Modal
            isOpen={!!selectedMessage}
            onClose={() => setSelectedMessage(null)}
            title="შეკვეთის დეტალები"
            size="md"
          >
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-accent-light text-brand-accent">
                  <User className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold">
                    {(
                      selectedMessage.sender as
                        | { display_name: string }
                        | undefined
                    )?.display_name ?? "მომხმარებელი"}
                  </p>
                  <p className="text-sm text-[#94A3B8]">
                    {(selectedMessage.sender as { phone: string } | undefined)
                      ?.phone ?? ""}
                  </p>
                </div>
              </div>

              <div>
                <p className="mb-1 text-xs font-medium text-[#94A3B8]">
                  შეტყობინება
                </p>
                <div className="rounded-lg bg-[#F8FAFC] p-3 text-sm">
                  {selectedMessage.message}
                </div>
              </div>

              <div className="flex items-center gap-2 text-sm text-[#94A3B8]">
                <Calendar className="h-4 w-4" />
                {formatDate(selectedMessage.created_at)}
              </div>

              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-[#94A3B8]" />
                <StatusBadge
                  status={selectedMessage.is_read ? "active" : "pending"}
                />
              </div>

              <div className="flex gap-3 border-t pt-4">
                {!selectedMessage.is_read && (
                  <button
                    type="button"
                    onClick={() => {
                      markMessageRead(selectedMessage.id);
                      setSelectedMessage({
                        ...selectedMessage,
                        is_read: true,
                      });
                    }}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-accent/90"
                  >
                    <Check className="h-4 w-4" />
                    მიღება
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedMessage(null)}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-[#F8FAFC]"
                >
                  <XIcon className="h-4 w-4" />
                  დახურვა
                </button>
              </div>
            </div>
          </Modal>
        )}

        {selectedApplication && (
          <Modal
            isOpen={!!selectedApplication}
            onClose={() => setSelectedApplication(null)}
            title="განაცხადის დეტალები"
            size="md"
          >
            <ApplicationDetail
              app={selectedApplication}
              onMarkProcessed={() => {
                markApplicationProcessed(selectedApplication.id);
                setSelectedApplication({
                  ...selectedApplication,
                  status: "processed",
                });
              }}
              onClose={() => setSelectedApplication(null)}
              onDownloadCv={downloadCv}
            />
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Messages list ─────────────────────────────────────────────────────────

function MessagesList({
  rows,
  activeTab,
  onSelect,
}: {
  rows: Message[];
  activeTab: StatusTab;
  onSelect: (m: Message) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[#64748B]/30 p-8 text-center">
        <MessageSquare className="mx-auto h-10 w-10 text-[#94A3B8]/50" />
        <p className="mt-2 text-sm text-[#94A3B8]">
          {activeTab === "new"
            ? "ახალი შეკვეთები არ არის"
            : "დამუშავებული შეკვეთები არ არის"}
        </p>
      </div>
    );
  }
  return (
    <>
      <div className="hidden overflow-x-auto rounded-xl border sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-[#F8FAFC] text-left">
              <th className="px-4 py-3 font-medium text-[#94A3B8]">კლიენტი</th>
              <th className="px-4 py-3 font-medium text-[#94A3B8]">
                შეტყობინება
              </th>
              <th className="px-4 py-3 font-medium text-[#94A3B8]">თარიღი</th>
              <th className="px-4 py-3 font-medium text-[#94A3B8]">სტატუსი</th>
              <th className="px-4 py-3 font-medium text-[#94A3B8]">
                მოქმედება
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((msg, idx) => (
              <motion.tr
                key={msg.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: idx * 0.03 }}
                className="border-b last:border-0 hover:bg-[#F8FAFC]/60"
              >
                <td className="px-4 py-3 font-medium">
                  {(msg.sender as { display_name: string } | undefined)
                    ?.display_name ?? "—"}
                </td>
                <td className="max-w-[200px] truncate px-4 py-3 text-[#94A3B8]">
                  {msg.message}
                </td>
                <td className="px-4 py-3 text-[#94A3B8]">
                  {formatDate(msg.created_at)}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={msg.is_read ? "active" : "pending"} />
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => onSelect(msg)}
                    className="text-sm font-medium text-brand-accent hover:underline"
                  >
                    ნახვა
                  </button>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-3 sm:hidden">
        {rows.map((msg, idx) => (
          <motion.button
            key={msg.id}
            type="button"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.04 }}
            onClick={() => onSelect(msg)}
            className="flex w-full items-center gap-3 rounded-xl bg-brand-surface p-4 text-left shadow-[var(--shadow-card)]"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-accent-light text-brand-accent">
              <User className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">
                  {(msg.sender as { display_name: string } | undefined)
                    ?.display_name ?? "—"}
                </span>
                <StatusBadge status={msg.is_read ? "active" : "pending"} />
              </div>
              <p className="mt-0.5 truncate text-xs text-[#94A3B8]">
                {msg.message}
              </p>
            </div>
            {!msg.is_read && (
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-brand-accent" />
            )}
          </motion.button>
        ))}
      </div>
    </>
  );
}

// ─── Applications list ─────────────────────────────────────────────────────

function ApplicationsList({
  rows,
  activeTab,
  onSelect,
  onDownloadCv,
}: {
  rows: ApplicationRow[];
  activeTab: StatusTab;
  onSelect: (a: ApplicationRow) => void;
  onDownloadCv: (path: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[#64748B]/30 p-8 text-center">
        <Briefcase className="mx-auto h-10 w-10 text-[#94A3B8]/50" />
        <p className="mt-2 text-sm text-[#94A3B8]">
          {activeTab === "new"
            ? "ახალი განაცხადები არ არის"
            : "დამუშავებული განაცხადები არ არის"}
        </p>
      </div>
    );
  }
  return (
    <>
      <div className="hidden overflow-x-auto rounded-xl border sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-[#F8FAFC] text-left">
              <th className="px-4 py-3 font-medium text-[#94A3B8]">
                კანდიდატი
              </th>
              <th className="px-4 py-3 font-medium text-[#94A3B8]">ვაკანსია</th>
              <th className="px-4 py-3 font-medium text-[#94A3B8]">ტელეფონი</th>
              <th className="px-4 py-3 font-medium text-[#94A3B8]">თარიღი</th>
              <th className="px-4 py-3 font-medium text-[#94A3B8]">CV</th>
              <th className="px-4 py-3 font-medium text-[#94A3B8]">სტატუსი</th>
              <th className="px-4 py-3 font-medium text-[#94A3B8]">
                მოქმედება
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((app, idx) => (
              <motion.tr
                key={app.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: idx * 0.03 }}
                className="border-b last:border-0 hover:bg-[#F8FAFC]/60"
              >
                <td className="px-4 py-3 font-medium">{app.full_name}</td>
                <td className="max-w-[200px] truncate px-4 py-3 text-[#94A3B8]">
                  {app.service?.title ?? "—"}
                </td>
                <td className="px-4 py-3 text-[#94A3B8]">{app.phone}</td>
                <td className="px-4 py-3 text-[#94A3B8]">
                  {formatDate(app.created_at)}
                </td>
                <td className="px-4 py-3">
                  {app.cv_path ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDownloadCv(app.cv_path!);
                      }}
                      className="inline-flex items-center gap-1 rounded-md bg-[#DBEAFE] px-2 py-1 text-xs font-bold text-[#2563EB] hover:bg-[#BFDBFE]"
                    >
                      <Download className="h-3 w-3" />
                      ჩამოტვირთვა
                    </button>
                  ) : (
                    <span className="text-xs text-[#94A3B8]">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge
                    status={app.status === "processed" ? "active" : "pending"}
                  />
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => onSelect(app)}
                    className="text-sm font-medium text-brand-accent hover:underline"
                  >
                    ნახვა
                  </button>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-3 sm:hidden">
        {rows.map((app, idx) => (
          <motion.button
            key={app.id}
            type="button"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.04 }}
            onClick={() => onSelect(app)}
            className="flex w-full items-center gap-3 rounded-xl bg-brand-surface p-4 text-left shadow-[var(--shadow-card)]"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-accent-light text-brand-accent">
              <Briefcase className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{app.full_name}</span>
                <StatusBadge
                  status={app.status === "processed" ? "active" : "pending"}
                />
              </div>
              <p className="mt-0.5 truncate text-xs text-[#94A3B8]">
                {app.service?.title ?? "—"} · {app.phone}
              </p>
            </div>
            {app.status === "new" && (
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-brand-accent" />
            )}
          </motion.button>
        ))}
      </div>
    </>
  );
}

// ─── Application detail ────────────────────────────────────────────────────

function ApplicationDetail({
  app,
  onMarkProcessed,
  onClose,
  onDownloadCv,
}: {
  app: ApplicationRow;
  onMarkProcessed: () => void;
  onClose: () => void;
  onDownloadCv: (path: string) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-accent-light text-brand-accent">
          <User className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="font-semibold">{app.full_name}</p>
          <p className="truncate text-sm text-[#94A3B8]">
            {app.service?.title ?? "—"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <Field icon={<Phone className="h-4 w-4" />} label="ტელეფონი">
          {app.phone}
        </Field>
        <Field icon={<Calendar className="h-4 w-4" />} label="დაბადების თარიღი">
          {app.birth_date ?? "—"}
        </Field>
        <Field icon={<MapPin className="h-4 w-4" />} label="ლოკაცია">
          {app.current_location ?? "—"}
        </Field>
        <Field
          icon={<Banknote className="h-4 w-4" />}
          label="სასურველი ხელფასი"
        >
          {app.desired_salary ? `${app.desired_salary} ₾` : "—"}
        </Field>
        <Field icon={<MapPin className="h-4 w-4" />} label="საცხოვრებელი">
          {app.needs_housing
            ? "სჭირდება საცხოვრებელი"
            : "აქვს ფართი ბაკურიანში"}
        </Field>
        <Field icon={<Languages className="h-4 w-4" />} label="ენები">
          {app.languages.length > 0 ? app.languages.join(", ") : "—"}
        </Field>
      </div>

      {(app.is_non_smoker ||
        app.has_health_certificate ||
        app.has_experience) && (
        <div>
          <p className="mb-2 text-xs font-medium text-[#94A3B8]">
            დამატებითი ინფორმაცია
          </p>
          <div className="flex flex-wrap gap-2">
            {app.is_non_smoker && <Pill>არამწეველი</Pill>}
            {app.has_health_certificate && <Pill>ჯანმრთელობის ცნობა</Pill>}
            {app.has_experience && <Pill>სამუშაო გამოცდილება</Pill>}
          </div>
        </div>
      )}

      {app.has_experience && app.last_workplace && (
        <Field icon={<Briefcase className="h-4 w-4" />} label="ბოლო სამუშაო">
          {app.last_workplace}
        </Field>
      )}

      {app.cv_path && (
        <button
          type="button"
          onClick={() => onDownloadCv(app.cv_path!)}
          className="inline-flex items-center gap-2 rounded-xl border border-[#DBEAFE] bg-[#F0F7FF] px-4 py-2.5 text-sm font-bold text-[#2563EB] transition-colors hover:bg-[#DBEAFE]"
        >
          <FileText className="h-4 w-4" />
          ნახე CV
          <Download className="h-3.5 w-3.5" />
        </button>
      )}

      <div className="flex items-center gap-2 text-sm text-[#94A3B8]">
        <Clock className="h-4 w-4" />
        {formatDate(app.created_at)}
      </div>

      <div className="flex gap-3 border-t pt-4">
        {app.status === "new" && (
          <button
            type="button"
            onClick={onMarkProcessed}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-accent/90"
          >
            <Check className="h-4 w-4" />
            მიღება
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-[#F8FAFC]"
        >
          <XIcon className="h-4 w-4" />
          დახურვა
        </button>
      </div>
    </div>
  );
}

function Field({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg bg-[#F8FAFC] p-3">
      <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-[#94A3B8]">
        {icon}
        {label}
      </div>
      <div className="text-sm font-semibold text-[#1E293B]">{children}</div>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#DCFCE7] px-3 py-1 text-xs font-bold text-[#166534]">
      <CheckIcon /> {children}
    </span>
  );
}

function CheckIcon() {
  return <Check className="h-3 w-3" />;
}
