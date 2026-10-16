"use client";

import type { ReactNode } from "react";
import { BadgeCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { formatPhone } from "@/lib/utils/format";
import { initialsOf, shortUserCode } from "@/lib/user-groups";

// One person, the same way in the verified list, the group cards and the
// picker (C52): avatar, name, a verified mark and "phone · role · ID". The ID
// is the MB-XXXXX code the dashboards show, because names and numbers repeat.

export type IdentityUser = {
  id: string;
  display_name: string;
  phone: string | null;
  avatar_url: string | null;
  role: string;
};

export default function UserIdentity({
  user,
  verified = false,
  href,
  extra,
  compact = false,
  className,
}: {
  user: IdentityUser;
  /** Icon-only mark beside the name (no mark for an unverified account). */
  verified?: boolean;
  /** Makes the whole block the link to this account (one stretched link). */
  href?: string;
  /** A line under the details, e.g. why a picker option is disabled. */
  extra?: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  const t = useTranslations("AdminVerifiedUsers");
  const tShared = useTranslations("AdminShared");
  const name = user.display_name || "—";
  const role = tShared.has(`roles.${user.role}`)
    ? tShared(`roles.${user.role}`)
    : user.role;
  const phone = user.phone ? formatPhone(user.phone) : t("noPhone");
  const code = t("idLabel", { code: shortUserCode(user.id) });

  return (
    <div
      className={cn(
        "relative flex min-h-11 min-w-0 items-center gap-3",
        className,
      )}
    >
      <Avatar aria-hidden className={compact ? "size-8" : "size-10"}>
        {user.avatar_url && <AvatarImage src={user.avatar_url} alt="" />}
        <AvatarFallback className="bg-[#EFF6FF] text-[12px] font-extrabold text-[#2563EB]">
          {initialsOf(user.display_name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-center gap-1.5 text-[14px] font-bold leading-5 text-[#0F172A]">
          {href ? (
            <Link
              href={href}
              title={name}
              className="truncate rounded-sm outline-none after:absolute after:inset-0 hover:text-[#2563EB] hover:underline focus-visible:ring-2 focus-visible:ring-[#2563EB]"
            >
              {name}
            </Link>
          ) : (
            <span className="truncate" title={name}>
              {name}
            </span>
          )}
          {verified && (
            <span
              className="inline-flex shrink-0 text-[#16A34A]"
              title={t("pills.verified")}
            >
              <BadgeCheck className="size-4" aria-hidden />
              <span className="sr-only">{t("pills.verified")}</span>
            </span>
          )}
        </p>
        {/* Wraps between the three parts (a column can be narrow) instead of
            cutting the ID off: the ID is what tells two equal names apart. */}
        <p className="line-clamp-3 text-[12px] leading-4 text-[#475569] [overflow-wrap:anywhere]">
          <span className="whitespace-nowrap">{phone}</span> · {role} ·{" "}
          <span className="whitespace-nowrap">{code}</span>
        </p>
        {extra}
      </div>
    </div>
  );
}
