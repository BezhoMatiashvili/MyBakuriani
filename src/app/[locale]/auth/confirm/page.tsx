"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { safeInternalPath } from "@/lib/security";
import { createClient } from "@/lib/supabase/client";
import { postAuthRedirectPath } from "../post-auth-redirect";

// Sign-up confirmation link. The hosted "Confirm signup" template links to
// /auth/confirm?token_hash=…&type=email. Opening it only shows a button: mail
// scanners prefetch links (e.g. Microsoft Defender Safe Links), so a GET that
// verified would confirm an address its owner never saw. The browser verifies
// on click, which also spends the user's own /verify rate limit rather than
// the app server's single IP. Recovery links keep their /auth/callback flow.
const CONFIRM_OTP_TYPES = ["email", "signup"] as const;
type ConfirmOtpType = (typeof CONFIRM_OTP_TYPES)[number];

const INVALID_LINK = "/auth/login?error=invalid_link";

type ConfirmLink = { next: string | null } & (
  { tokenHash: string; type: ConfirmOtpType } | { code: string }
);

function isConfirmOtpType(type: string | null): type is ConfirmOtpType {
  return CONFIRM_OTP_TYPES.some((allowed) => allowed === type);
}

// null: nothing to confirm (no token, another link type, or GoTrue's error
// redirect for an expired link).
function readLink(params: URLSearchParams): ConfirmLink | null {
  if (["error", "error_code", "error_description"].some((k) => params.has(k))) {
    return null;
  }
  const next = safeInternalPath(params.get("next"));
  const tokenHash = params.get("token_hash");
  if (tokenHash) {
    const type = params.get("type");
    return isConfirmOtpType(type) ? { tokenHash, type, next } : null;
  }
  const code = params.get("code");
  return code ? { code, next } : null;
}

async function verifyLink(
  supabase: ReturnType<typeof createClient>,
  link: ConfirmLink,
): Promise<boolean> {
  if ("tokenHash" in link) {
    const { error } = await supabase.auth.verifyOtp({
      type: link.type,
      token_hash: link.tokenHash,
    });
    return !error;
  }
  // PKCE fallback for the default template: GoTrue confirmed the address
  // before redirecting here with ?code=. In the browser that signed up, the
  // shared client has already exchanged the code on load (@supabase/ssr always
  // sets detectSessionInUrl) and spent the code verifier, so the session that
  // exchange left behind counts as success.
  await supabase.auth.initialize();
  const { error } = await supabase.auth.exchangeCodeForSession(link.code);
  if (!error) return true;
  const { data } = await supabase.auth.getSession();
  return !!data.session;
}

export default function ConfirmEmailPage() {
  const t = useTranslations("AuthLogin");

  return (
    <div className="flex min-h-[calc(100dvh-160px)] items-center justify-center px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-[420px] rounded-[24px] border bg-white p-10 text-center shadow-[0px_25px_50px_-12px_rgba(0,0,0,0.08)]"
      >
        <h1 className="text-xl font-black text-balance text-[#1E293B]">
          {t("confirmEmail.title")}
        </h1>
        <p className="mt-2 text-sm text-[#94A3B8]">
          {t("confirmEmail.description")}
        </p>
        {/* useSearchParams needs a Suspense boundary; a prerender holds the
            disabled fallback. Server or client, nothing verifies until a click. */}
        <Suspense fallback={<ConfirmButton />}>
          <ConfirmEmailAction />
        </Suspense>
      </motion.div>
    </div>
  );
}

function ConfirmEmailAction() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Read once: the shared client strips ?code= from the address bar after it
  // exchanges the code, and useSearchParams follows that change.
  const [link] = useState(() => readLink(searchParams));
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (!link) router.replace(INVALID_LINK);
  }, [link, router]);

  async function confirm() {
    // The token works once: a second click would fail and bounce a user who
    // was just confirmed to the expired-link notice.
    if (!link || started.current) return;
    started.current = true;
    setBusy(true);

    const supabase = createClient();
    if (!(await verifyLink(supabase, link))) {
      router.replace(INVALID_LINK);
      return;
    }
    const target = await postAuthRedirectPath(supabase, link.next);
    // As on the login page: re-render server components against the new auth
    // cookie so the first navigation already sees the session.
    router.refresh();
    router.replace(target);
  }

  if (!link) return <ConfirmButton />;
  return <ConfirmButton busy={busy} onClick={() => void confirm()} />;
}

// Without onClick (static fallback, or a link being redirected away) the
// button renders disabled.
function ConfirmButton({
  busy = false,
  onClick,
}: {
  busy?: boolean;
  onClick?: () => void;
}) {
  const t = useTranslations("AuthLogin");

  return (
    <Button
      type="button"
      onClick={onClick}
      disabled={!onClick || busy}
      className="mt-8 min-h-11 w-full lg:min-h-0"
      size="lg"
    >
      {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
      {t("confirmEmail.button")}
    </Button>
  );
}
