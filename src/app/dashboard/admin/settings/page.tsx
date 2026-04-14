"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Percent,
  MessageSquare,
  Bell,
  Users,
  AlertTriangle,
  Save,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface PlatformSettings {
  commissionRate: number;
  vipPrice: number;
  superVipPrice: number;
  smsPackage10: number;
  smsPackage50: number;
  smsPackage100: number;
  maxPhotos: number;
  maintenanceMode: boolean;
}

interface AdminUser {
  id: string;
  name: string;
  phone: string;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<PlatformSettings>({
    commissionRate: 10,
    vipPrice: 15,
    superVipPrice: 30,
    smsPackage10: 5,
    smsPackage50: 20,
    smsPackage100: 35,
    maxPhotos: 20,
    maintenanceMode: false,
  });

  const [admins, setAdmins] = useState<AdminUser[]>([
    { id: "1", name: "ადმინი 1", phone: "+995 555 12 34 56" },
  ]);

  const [newAdminPhone, setNewAdminPhone] = useState("");
  const [saved, setSaved] = useState(false);

  const [notificationTemplates, setNotificationTemplates] = useState({
    bookingConfirmed: "თქვენი ჯავშანი დადასტურებულია!",
    bookingCancelled: "თქვენი ჯავშანი გაუქმებულია.",
    verificationApproved: "თქვენი ანგარიში ვერიფიცირებულია!",
    verificationRejected: "ვერიფიკაცია უარყოფილია.",
  });

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleAddAdmin = () => {
    if (!newAdminPhone.trim()) return;
    setAdmins((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        name: "ახალი ადმინი",
        phone: newAdminPhone,
      },
    ]);
    setNewAdminPhone("");
  };

  const handleRemoveAdmin = (id: string) => {
    setAdmins((prev) => prev.filter((a) => a.id !== id));
  };

  const sections = [
    {
      title: "საკომისიო და ფასები",
      icon: Percent,
      content: (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[#1E293B]">
              საკომისიო (%)
            </label>
            <input
              type="number"
              min={0}
              max={100}
              value={settings.commissionRate}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  commissionRate: Number(e.target.value),
                }))
              }
              className="w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2.5 text-[13px] font-medium text-[#1E293B] shadow-[inset_0px_2px_4px_1px_rgba(0,0,0,0.05)] focus:border-brand-accent focus:outline-none focus:ring-1 focus:ring-brand-accent"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[#1E293B]">
              VIP ფასი (₾)
            </label>
            <input
              type="number"
              min={0}
              value={settings.vipPrice}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  vipPrice: Number(e.target.value),
                }))
              }
              className="w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2.5 text-[13px] font-medium text-[#1E293B] shadow-[inset_0px_2px_4px_1px_rgba(0,0,0,0.05)] focus:border-brand-accent focus:outline-none focus:ring-1 focus:ring-brand-accent"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[#1E293B]">
              Super VIP ფასი (₾)
            </label>
            <input
              type="number"
              min={0}
              value={settings.superVipPrice}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  superVipPrice: Number(e.target.value),
                }))
              }
              className="w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2.5 text-[13px] font-medium text-[#1E293B] shadow-[inset_0px_2px_4px_1px_rgba(0,0,0,0.05)] focus:border-brand-accent focus:outline-none focus:ring-1 focus:ring-brand-accent"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[#1E293B]">
              მაქს. ფოტო რაოდენობა
            </label>
            <input
              type="number"
              min={1}
              max={50}
              value={settings.maxPhotos}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  maxPhotos: Number(e.target.value),
                }))
              }
              className="w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2.5 text-[13px] font-medium text-[#1E293B] shadow-[inset_0px_2px_4px_1px_rgba(0,0,0,0.05)] focus:border-brand-accent focus:outline-none focus:ring-1 focus:ring-brand-accent"
            />
          </div>
        </div>
      ),
    },
    {
      title: "SMS პაკეტების ფასები",
      icon: MessageSquare,
      content: (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[#1E293B]">
              10 SMS (₾)
            </label>
            <input
              type="number"
              min={0}
              value={settings.smsPackage10}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  smsPackage10: Number(e.target.value),
                }))
              }
              className="w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2.5 text-[13px] font-medium text-[#1E293B] shadow-[inset_0px_2px_4px_1px_rgba(0,0,0,0.05)] focus:border-brand-accent focus:outline-none focus:ring-1 focus:ring-brand-accent"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[#1E293B]">
              50 SMS (₾)
            </label>
            <input
              type="number"
              min={0}
              value={settings.smsPackage50}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  smsPackage50: Number(e.target.value),
                }))
              }
              className="w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2.5 text-[13px] font-medium text-[#1E293B] shadow-[inset_0px_2px_4px_1px_rgba(0,0,0,0.05)] focus:border-brand-accent focus:outline-none focus:ring-1 focus:ring-brand-accent"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[#1E293B]">
              100 SMS (₾)
            </label>
            <input
              type="number"
              min={0}
              value={settings.smsPackage100}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  smsPackage100: Number(e.target.value),
                }))
              }
              className="w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2.5 text-[13px] font-medium text-[#1E293B] shadow-[inset_0px_2px_4px_1px_rgba(0,0,0,0.05)] focus:border-brand-accent focus:outline-none focus:ring-1 focus:ring-brand-accent"
            />
          </div>
        </div>
      ),
    },
    {
      title: "შეტყობინების შაბლონები",
      icon: Bell,
      content: (
        <div className="space-y-4">
          {Object.entries(notificationTemplates).map(([key, value]) => {
            const labels: Record<string, string> = {
              bookingConfirmed: "ჯავშნის დადასტურება",
              bookingCancelled: "ჯავშნის გაუქმება",
              verificationApproved: "ვერიფიკაციის დადასტურება",
              verificationRejected: "ვერიფიკაციის უარყოფა",
            };
            return (
              <div key={key}>
                <label className="mb-1.5 block text-sm font-medium text-[#1E293B]">
                  {labels[key] ?? key}
                </label>
                <textarea
                  rows={2}
                  value={value}
                  onChange={(e) =>
                    setNotificationTemplates((prev) => ({
                      ...prev,
                      [key]: e.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2.5 text-[13px] font-medium text-[#1E293B] shadow-[inset_0px_2px_4px_1px_rgba(0,0,0,0.05)] focus:border-brand-accent focus:outline-none focus:ring-1 focus:ring-brand-accent"
                />
              </div>
            );
          })}
        </div>
      ),
    },
    {
      title: "ადმინ მომხმარებლები",
      icon: Users,
      content: (
        <div className="space-y-3">
          {admins.map((admin) => (
            <div
              key={admin.id}
              className="flex items-center justify-between rounded-lg bg-[#F8FAFC]/60 px-4 py-2.5"
            >
              <div>
                <p className="text-sm font-medium text-[#1E293B]">
                  {admin.name}
                </p>
                <p className="text-xs text-[#94A3B8]">{admin.phone}</p>
              </div>
              <button
                onClick={() => handleRemoveAdmin(admin.id)}
                className="rounded-md p-1.5 text-[#94A3B8] hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="+995 5XX XX XX XX"
              value={newAdminPhone}
              onChange={(e) => setNewAdminPhone(e.target.value)}
              className="flex-1 rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm focus:border-brand-accent focus:outline-none"
            />
            <Button size="sm" onClick={handleAddAdmin}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              დამატება
            </Button>
          </div>
        </div>
      ),
    },
    {
      title: "ტექნიკური სამუშაოების რეჟიმი",
      icon: AlertTriangle,
      content: (
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-[#1E293B]">
              ტექნიკური სამუშაოების რეჟიმი
            </p>
            <p className="text-xs text-[#94A3B8]">
              ჩართვის შემთხვევაში მომხმარებლები ვერ შეძლებენ საიტზე წვდომას
            </p>
          </div>
          <button
            onClick={() =>
              setSettings((s) => ({
                ...s,
                maintenanceMode: !s.maintenanceMode,
              }))
            }
            className={`relative h-6 w-11 rounded-full transition-colors ${
              settings.maintenanceMode ? "bg-red-500" : "bg-[#F8FAFC]"
            }`}
          >
            <span
              className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                settings.maintenanceMode ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-black leading-[30px] tracking-[-0.5px] text-[#1E293B]">
            პარამეტრები
          </h1>
          <p className="mt-1 text-sm font-medium text-[#64748B]">
            პლატფორმის კონფიგურაცია
          </p>
        </div>
        <Button onClick={handleSave} className="relative">
          <Save className="mr-2 h-4 w-4" />
          {saved ? "შენახულია!" : "შენახვა"}
        </Button>
      </div>

      {/* Settings sections */}
      <div className="space-y-4">
        {sections.map((section, i) => (
          <motion.div
            key={section.title}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className="rounded-[20px] border border-[#EEF1F4] bg-white p-6 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]"
          >
            <div className="mb-4 flex items-center gap-2">
              <section.icon className="h-5 w-5 text-brand-accent" />
              <h2 className="text-lg font-semibold text-[#1E293B]">
                {section.title}
              </h2>
            </div>
            {section.content}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
