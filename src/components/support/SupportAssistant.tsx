"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CheckCircle2, Loader2, MessageCircle, X } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { CONTACT_EMAIL, CONTACT_PHONE_E164 } from "@/lib/site-contact";
import { scanPage, type PageScan } from "@/lib/support/scan";
import {
  ACTION_PARAM_KEYS,
  FEEDBACK_REF,
  SUPPORT_LIMITS,
  cabinetForPath,
  cleanPrivate,
  stripLocale,
  type ActionParams,
  type JevStep,
  type SupportActionRef,
  type SupportButton,
  type SupportCabinet,
  type SupportLocale,
  type SupportResponse,
} from "@/lib/support/plan";
import {
  actionHref,
  isExternalHref,
  isSafeActionHref,
  type ActionContext,
} from "@/lib/support/actions";
import { SUPPORT_STORAGE_KEY } from "@/lib/support/storage";
import { JevAvatar } from "./JevAvatar";
import { JevSpotlight } from "./JevSpotlight";
import { SupportPanel, type ChatEntry, type QuickChip } from "./SupportPanel";

const CONTACT = { phone: CONTACT_PHONE_E164, email: CONTACT_EMAIL };

// What a quick question does when pressed, with no answer-model call:
// "answer" shows a pre-written answer (Support.canned.<key>) with buttons,
// "guide" starts the on-screen walkthrough, "create" opens the listing form
// and walks through it there.
type ChipPlan =
  | {
      kind: "answer";
      actions: SupportActionRef[];
      /** Offer "Show me on screen" with the question as the goal. */
      guide?: boolean;
      /** Example replies (Support.canned.<key>Example1..n). */
      examples?: number;
    }
  | { kind: "guide" }
  | { kind: "create"; category?: string };

const CHIPS: Record<string, ChipPlan> = {
  addRental: { kind: "create", category: "rental" },
  addSale: { kind: "create", category: "sale" },
  addService: { kind: "create" },
  addVacancy: { kind: "create", category: "employment" },
  postListing: { kind: "create" },
  uploadPhotos: { kind: "guide" },
  addBooking: { kind: "guide" },
  topUp: { kind: "answer", actions: [{ id: "topup" }], guide: true },
  smartMatch: { kind: "answer", actions: [{ id: "smart_match" }], guide: true },
  favorites: { kind: "answer", actions: [{ id: "favorites" }] },
  profilePhoto: { kind: "guide" },
  acceptTask: { kind: "guide" },
  schedule: { kind: "answer", actions: [{ id: "schedule" }] },
  uploadMenu: { kind: "guide" },
  dishDiscount: { kind: "guide" },
  readCvs: { kind: "answer", actions: [{ id: "orders" }] },
  reviewListings: {
    kind: "answer",
    actions: [{ id: "admin_verifications" }],
  },
  reviewOwnership: {
    kind: "answer",
    actions: [{ id: "admin_verifications", params: { tab: "ownership" } }],
    guide: true,
  },
  findUser: { kind: "answer", actions: [{ id: "admin_clients" }], guide: true },
  verifyOwnership: {
    kind: "answer",
    actions: [{ id: "ownership" }],
    guide: true,
  },
  linkGoogle: { kind: "answer", actions: [{ id: "account" }], guide: true },
  requiredFields: { kind: "guide" },
  publish: { kind: "guide" },
  findPlace: {
    kind: "answer",
    actions: [{ id: "browse", params: { category: "apartments" } }],
    examples: 2,
  },
  register: { kind: "answer", actions: [{ id: "register" }], guide: true },
  forgotPassword: { kind: "answer", actions: [{ id: "forgot_password" }] },
  googleSignIn: { kind: "guide" },
};

// "addService" in a services cabinet opens that cabinet's own form.
const SERVICE_FORM: Partial<Record<SupportCabinet, string>> = {
  entertainment: "entertainment",
  transport: "transport",
  services: "service",
  employment: "employment",
  food: "food",
};

const QUICK_ACTIONS: Record<SupportCabinet, readonly string[]> = {
  renter: ["addRental", "uploadPhotos", "addBooking", "topUp"],
  seller: ["addSale", "uploadPhotos", "topUp"],
  guest: ["smartMatch", "favorites", "profilePhoto"],
  cleaner: ["acceptTask", "schedule"],
  food: ["uploadMenu", "dishDiscount", "topUp"],
  entertainment: ["addService", "uploadPhotos", "topUp"],
  transport: ["addService", "uploadPhotos", "topUp"],
  employment: ["addVacancy", "readCvs"],
  services: ["addService", "uploadPhotos", "topUp"],
  admin: ["reviewListings", "reviewOwnership", "findUser"],
  account: ["verifyOwnership", "linkGoogle"],
  create: ["uploadPhotos", "requiredFields", "publish"],
  auth: ["register", "forgotPassword", "googleSignIn"],
  public: ["findPlace", "register", "postListing"],
};
const PUBLIC_SIGNED_IN = ["findPlace", "postListing"] as const;

type Guide = {
  goal: string;
  steps: JevStep[];
  index: number;
  done: boolean;
  /** What the user already did, for re-plans on later screens. */
  progress: string[];
  plans: number;
  status: "planning" | "running";
};

/** The saved chat; `owner` is the signed-in user's id or "anon". */
type Saved = {
  owner: string;
  entries: ChatEntry[];
  guide: Guide | null;
  savedAt: number;
};

const MAX_ENTRIES = 30;
// The first plan plus re-plans after each screen change, per goal.
const MAX_PLANS = 6;
// A walkthrough survives page changes in the same tab, not a later visit.
const GUIDE_TTL_MS = 15 * 60_000;
// A conversation left alone this long is forgotten.
const CHAT_IDLE_MS = 30 * 60_000;
// Longest wait for a route change, a modal or the next wizard step to render
// before the page is scanned; most screens settle well before it.
const SETTLE_MS = 700;
// The page counts as settled after this long without a change.
const QUIET_MS = 150;
// A first question that reads like "how do I / where / I can't" (ka, en, ru):
// its steps are planned while the answer is written, so a walkthrough starts
// without a second wait.
const HOW_TO =
  /როგორ|სად |ვერ |მინდა|მაჩვენე|დამეხმარ|\b(?:how|where|can'?t|cannot|unable|show me|help me)\b|как |где |не могу|не получается|покажи|помоги/i;
const PREFETCH_TTL_MS = 2 * 60_000;
const ADVANCE_MS = 350;
const CLIENT_TIMEOUT_MS = 45_000;
const OPTION_SELECTOR =
  "[role='option'], [role='menuitem'], [role='menuitemradio'], [role='menuitemcheckbox']";
// Proactive help: an error shown this soon after the user's own click,
// submit or Enter counts as "it didn't work".
const NUDGE_WINDOW_MS = 2_000;
const NUDGE_SHOW_MS = 12_000;
const NUDGED_KEY = "mb.jev.nudged";
const ERROR_SELECTOR = "[data-sonner-toast][data-type='error'], [role='alert']";
const DISABLED_SELECTOR =
  "button:disabled, [role='button'][aria-disabled='true'], button[aria-disabled='true']";

async function callSupport(
  body: Record<string, unknown>,
): Promise<SupportResponse> {
  try {
    const response = await fetch("/api/support", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
    });
    const data = (await response
      .json()
      .catch(() => null)) as SupportResponse | null;
    if (data && typeof data === "object" && "type" in data) return data;
    return {
      type: "error",
      error: response.status === 429 ? "rate_limited" : "failed",
    };
  } catch {
    return { type: "error", error: "failed" };
  }
}

const wait = (ms: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, ms));

type Settle = "none" | "quiet" | "change";

function isOurs(node: Node | null): boolean {
  const element = node instanceof Element ? node : node?.parentElement;
  return Boolean(element?.closest("[data-jev-ignore]"));
}

/**
 * Resolves once the page has gone QUIET_MS without changing (the widget's
 * own DOM aside), after SETTLE_MS at most. "change" first waits for the page
 * to change at all (a click that opens a modal or starts a navigation), so
 * the scan never catches the screen the user is leaving.
 */
function pageSettled(mode: Settle): Promise<void> {
  if (mode === "none") return Promise.resolve();
  return new Promise((resolve) => {
    let quiet: number | undefined;
    const finish = () => {
      observer.disconnect();
      window.clearTimeout(quiet);
      window.clearTimeout(cap);
      resolve();
    };
    const arm = () => {
      window.clearTimeout(quiet);
      quiet = window.setTimeout(finish, QUIET_MS);
    };
    const observer = new MutationObserver((records) => {
      const changed = records.some(
        (record) =>
          !isOurs(record.target) &&
          (record.type !== "childList" ||
            [...record.addedNodes, ...record.removedNodes].some(
              (node) => !isOurs(node),
            )),
      );
      if (changed) arm();
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
    const cap = window.setTimeout(finish, SETTLE_MS);
    if (mode === "quiet") arm();
  });
}

// Supabase keeps the session in sb-<ref>-auth-token cookies that scripts can
// read; only a hint for which quick questions and buttons to offer (the
// server decides with the real session).
function looksSignedIn(): boolean {
  return /(?:^|;\s*)sb-[^=]+-auth-token(?:\.0)?=/.test(document.cookie);
}

/** Whose chat this tab holds: the session's user id (read locally) or "anon". */
async function currentOwner(): Promise<string> {
  if (!looksSignedIn()) return "anon";
  try {
    const { data } = await createClient().auth.getSession();
    return data.session?.user.id ?? "anon";
  } catch {
    return "anon";
  }
}

function tbilisiToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tbilisi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

type Lift = { px: number; bar: boolean; height: number };

/**
 * How far above the bottom edge the launcher sits: clear of any fixed bar
 * along the bottom of the screen (the dashboards' tab bar on phones, a
 * listing's call bar, a floating banner or notice, the cookie notice),
 * re-checked as such bars come and go.
 */
function useCornerLift(side: Spot["side"]): Lift {
  const [lift, setLift] = useState<Lift>(() => ({
    px: 16,
    bar: false,
    height: window.innerHeight,
  }));
  useLayoutEffect(() => {
    const measure = () => {
      if (document.hidden) return;
      const width = window.innerWidth;
      const height = window.innerHeight;
      // Bars can stack (a floating notice above a listing's call bar), so
      // look again just above each bar found.
      let top = height;
      for (let round = 0; round < 3; round += 1) {
        const floor = top;
        const xs = side === "left" ? [24, 64] : [width - 24, width - 64];
        for (const x of xs) {
          for (const y of [floor - 20, floor - 48]) {
            let node: Element | null | undefined = document
              .elementsFromPoint(x, y)
              .find((el) => !el.closest("[data-jev-ignore]"));
            while (node && node !== document.body) {
              const { position } = getComputedStyle(node);
              if (position === "fixed" || position === "sticky") break;
              node = node.parentElement;
            }
            if (!node || node === document.body) continue;
            const rect = node.getBoundingClientRect();
            // A bar, not a full-screen overlay or a tall sticky column.
            if (rect.bottom >= floor - 40 && rect.height < height * 0.4)
              top = Math.min(top, rect.top);
          }
        }
        if (top === floor) break;
      }
      const next =
        top < height
          ? { px: Math.round(height - top) + 12, bar: true, height }
          : { px: width >= 1024 ? 24 : 16, bar: false, height };
      setLift((prev) =>
        prev.px === next.px &&
        prev.bar === next.bar &&
        prev.height === next.height
          ? prev
          : next,
      );
    };
    measure();
    const timer = window.setInterval(measure, 800);
    window.addEventListener("resize", measure);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("resize", measure);
    };
  }, [side]);
  return lift;
}

// A bar already reaches the screen's edge (safe area included); otherwise the
// launcher keeps clear of the home indicator. `raised` is a height the user
// dragged the launcher to; it never goes below either.
function liftStyle(
  lift: Lift,
  extra = 0,
  raised: number | null = null,
): React.CSSProperties {
  if (lift.bar) return { bottom: Math.max(lift.px, raised ?? 0) + extra };
  const edge = `calc(env(safe-area-inset-bottom) + ${lift.px + extra}px)`;
  return {
    bottom: raised === null ? edge : `max(${edge}, ${raised + extra}px)`,
  };
}

/** Where the user dragged the launcher to; null = the default corner. */
type Spot = { side: "left" | "right"; bottom: number };

// Per device, like a remembered tab: not personal data, kept across sign-outs.
const SPOT_KEY = "mb.support.spot.v1";
// Movement that turns a press into a drag; anything less is a tap.
const DRAG_SLOP = 6;
// Room kept above a dragged launcher for the navbar and for the hint and
// "done" bubbles that open above it.
const TOP_ROOM = 140;

function readSpot(): Spot | null {
  try {
    const saved = JSON.parse(window.localStorage.getItem(SPOT_KEY) ?? "null");
    if (
      (saved?.side === "left" || saved?.side === "right") &&
      Number.isFinite(saved.bottom)
    )
      return { side: saved.side, bottom: saved.bottom };
  } catch {
    // Blocked or malformed storage: the default corner.
  }
  return null;
}

function writeSpot(spot: Spot) {
  try {
    window.localStorage.setItem(SPOT_KEY, JSON.stringify(spot));
  } catch {
    // Not remembered; this page view still uses it.
  }
}

type Press = { id: number; x: number; y: number; dx: number; dy: number };

/**
 * The round chat button. A tap opens the chat; press and move drags it, and
 * on release it settles against the nearer side edge at the height it was
 * dropped (`onMove`), so a user can move it off whatever it covers.
 */
function SupportLauncher({
  buttonRef,
  corner,
  style,
  label,
  name,
  reduceMotion,
  onOpen,
  onMove,
}: {
  buttonRef: React.RefObject<HTMLButtonElement | null>;
  corner: string;
  style: React.CSSProperties;
  label: string;
  name: string;
  reduceMotion: boolean;
  onOpen: () => void;
  onMove: (spot: Spot) => void;
}) {
  const [drag, setDrag] = useState<{ left: number; top: number } | null>(null);
  const pressRef = useRef<Press | null>(null);
  const dragRef = useRef<{ left: number; top: number } | null>(null);
  const draggedRef = useRef(false);
  const snapRef = useRef<{ x: number; y: number } | null>(null);

  // Glide from where it was dropped to the edge it settles on.
  useLayoutEffect(() => {
    const from = snapRef.current;
    const el = buttonRef.current;
    if (drag || !from || !el) return;
    snapRef.current = null;
    const rect = el.getBoundingClientRect();
    const dx = from.x - (rect.left + rect.width / 2);
    const dy = from.y - (rect.top + rect.height / 2);
    if (reduceMotion || (!dx && !dy)) return;
    el.animate([{ translate: `${dx}px ${dy}px` }, { translate: "0px 0px" }], {
      duration: 280,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
    });
  }, [drag, style, reduceMotion, buttonRef]);

  const end = () => {
    pressRef.current = null;
    dragRef.current = null;
    setDrag(null);
  };

  return (
    <motion.button
      ref={buttonRef}
      type="button"
      onPointerDown={(e) => {
        if (!e.isPrimary || e.button !== 0) return;
        draggedRef.current = false;
        const rect = e.currentTarget.getBoundingClientRect();
        pressRef.current = {
          id: e.pointerId,
          x: e.clientX,
          y: e.clientY,
          dx: e.clientX - (rect.left + rect.width / 2),
          dy: e.clientY - (rect.top + rect.height / 2),
        };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const press = pressRef.current;
        if (!press || press.id !== e.pointerId) return;
        if (
          !dragRef.current &&
          Math.hypot(e.clientX - press.x, e.clientY - press.y) < DRAG_SLOP
        )
          return;
        const { offsetWidth: w, offsetHeight: h } = e.currentTarget;
        const next = {
          left: Math.min(
            Math.max(e.clientX - press.dx - w / 2, 8),
            window.innerWidth - w - 8,
          ),
          top: Math.min(
            Math.max(e.clientY - press.dy - h / 2, 8),
            window.innerHeight - h - 8,
          ),
        };
        dragRef.current = next;
        setDrag(next);
      }}
      onPointerUp={(e) => {
        const dropped = dragRef.current;
        if (!dropped) {
          pressRef.current = null;
          return;
        }
        // The browser still sends a click after a drag; it must not open
        // the chat.
        draggedRef.current = true;
        const { offsetWidth: w, offsetHeight: h } = e.currentTarget;
        const x = dropped.left + w / 2;
        snapRef.current = { x, y: dropped.top + h / 2 };
        onMove({
          side: x < window.innerWidth / 2 ? "left" : "right",
          bottom: Math.round(window.innerHeight - dropped.top - h),
        });
        end();
      }}
      onPointerCancel={end}
      onClick={() => {
        if (draggedRef.current) {
          draggedRef.current = false;
          return;
        }
        onOpen();
      }}
      aria-label={label}
      aria-controls="jev-panel"
      data-testid="jev-launcher"
      style={{
        ...(drag
          ? {
              left: drag.left,
              top: drag.top,
              right: "auto",
              bottom: "auto",
              cursor: "grabbing",
            }
          : style),
        WebkitTouchCallout: "none",
      }}
      className={`${corner} z-[80] flex h-14 min-w-14 touch-none select-none items-center justify-center gap-2 rounded-full bg-gradient-to-br from-[#2563EB] to-[#4F46E5] text-white shadow-[0_12px_32px_-8px_rgba(37,99,235,0.65)] ring-4 ring-white/80 sm:pl-4 sm:pr-5`}
      initial={reduceMotion ? false : { opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: drag && !reduceMotion ? 1.08 : 1 }}
      exit={{ opacity: 0, scale: 0.6 }}
      whileHover={reduceMotion || drag ? undefined : { scale: 1.06 }}
      whileTap={reduceMotion || drag ? undefined : { scale: 0.94 }}
    >
      <MessageCircle className="size-6" strokeWidth={2.25} aria-hidden />
      <span className="hidden text-[15px] font-bold sm:inline">{name}</span>
    </motion.button>
  );
}

/** Steps planned ahead for a first "how do I" question (see HOW_TO). */
type Prefetch = {
  goal: string;
  path: string;
  at: number;
  scan: PageScan;
  response: Promise<SupportResponse>;
};

/** Scans once a route that is still loading (skeletons) has rendered. */
async function settledScan(): Promise<PageScan> {
  let scan = scanPage();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const loading = document.querySelector(
      "main [aria-busy='true'], main .animate-pulse",
    );
    if (!loading && scan.elements.length >= 3) break;
    await wait(500);
    scan = scanPage();
  }
  return scan;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function strings(value: unknown, max: number): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const list = value.filter((item): item is string => typeof item === "string");
  return list.length > 0 ? list.slice(0, max) : undefined;
}

/** A button from the server or a saved chat, if its link passes the guard. */
function toButton(value: unknown): SupportButton | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  if (!isSafeActionHref(value.href, CONTACT)) return null;
  const button: SupportButton = { id: value.id, href: value.href };
  if (isRecord(value.params)) {
    const params: ActionParams = {};
    for (const key of ACTION_PARAM_KEYS) {
      const item = value.params[key];
      if (typeof item === "string" || typeof item === "number")
        params[key] = item;
      else if (Array.isArray(item))
        params[key] = item.filter(
          (part): part is string => typeof part === "string",
        );
    }
    if (Object.keys(params).length > 0) button.params = params;
  }
  return button;
}

function toButtons(value: unknown): SupportButton[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const list = value
    .map(toButton)
    .filter((button): button is SupportButton => button !== null)
    .slice(0, SUPPORT_LIMITS.actions);
  return list.length > 0 ? list : undefined;
}

/** A saved entry, re-checked field by field (storage can be edited). */
function toEntry(value: unknown): ChatEntry | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== "string" ||
    (value.role !== "user" && value.role !== "assistant") ||
    typeof value.text !== "string"
  )
    return null;
  const entry: ChatEntry = { id: value.id, role: value.role, text: value.text };
  if (value.tone === "info" || value.tone === "error") entry.tone = value.tone;
  const actions = toButtons(value.actions);
  if (actions) entry.actions = actions;
  if (typeof value.guide === "string" && value.guide) entry.guide = value.guide;
  const suggestions = strings(value.suggestions, SUPPORT_LIMITS.suggestions);
  if (suggestions) entry.suggestions = suggestions;
  if (typeof value.ref === "string" && FEEDBACK_REF.test(value.ref))
    entry.ref = value.ref;
  if (value.rating === "up" || value.rating === "down")
    entry.rating = value.rating;
  const options = strings(value.options, SUPPORT_LIMITS.options);
  if (options) entry.options = options;
  if (typeof value.goal === "string") entry.goal = value.goal;
  const progress = strings(value.progress, SUPPORT_LIMITS.progress);
  if (progress) entry.progress = progress;
  return entry;
}

function isGuide(value: unknown): value is Guide {
  if (!isRecord(value)) return false;
  return (
    typeof value.goal === "string" &&
    Array.isArray(value.progress) &&
    typeof value.plans === "number"
  );
}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function nudgedPaths(): string[] {
  try {
    const raw = window.sessionStorage.getItem(NUDGED_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list)
      ? list.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function rememberNudge(path: string) {
  try {
    const list = [...nudgedPaths().filter((item) => item !== path), path];
    window.sessionStorage.setItem(NUDGED_KEY, JSON.stringify(list.slice(-50)));
  } catch {
    // Storage unavailable: the nudge may show again on this page.
  }
}

/** What went wrong, as the planner will read it (masked, one line). */
type Trouble = { kind: "error" | "disabled"; text: string };

/**
 * The support assistant on every page (C43). Questions go to Gemini through
 * /api/support and come back as an answer with buttons that open the right
 * page or form; when the user needs to do something on screen, Jev plans
 * steps from a snapshot of the page and JevSpotlight walks through them,
 * re-planning after every screen change until the goal is done.
 */
export function SupportAssistant({ homeRole }: { homeRole?: string | null }) {
  const t = useTranslations("Support");
  const locale = useLocale() as SupportLocale;
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const path = stripLocale(pathname);
  const cabinet = cabinetForPath(path, homeRole);
  const reduceMotion = useReducedMotion() ?? false;

  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<"answer" | "plan" | null>(null);
  const [guide, setGuide] = useState<Guide | null>(null);
  const [targets, setTargets] = useState<Map<string, HTMLElement>>(
    () => new Map(),
  );
  const [celebrate, setCelebrate] = useState(false);
  const [restored, setRestored] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [nudge, setNudge] = useState<Trouble | null>(null);
  const [spot, setSpot] = useState<Spot | null>(readSpot);
  const side = spot?.side ?? "right";
  const lift = useCornerLift(side);
  const raised = spot
    ? Math.max(0, Math.min(spot.bottom, lift.height - TOP_ROOM))
    : null;

  // Async plan runs and DOM listeners read the latest values from refs.
  const guideRef = useRef<Guide | null>(null);
  const contextRef = useRef({ locale, cabinet, path });
  const tRef = useRef(t);
  const routerRef = useRef(router);
  const labelsRef = useRef<Map<string, string>>(new Map());
  const entriesRef = useRef<ChatEntry[]>([]);
  const ownerRef = useRef("anon");
  const restoredRef = useRef(false);
  const ticketRef = useRef(0);
  const timerRef = useRef<number | undefined>(undefined);
  const lastPathRef = useRef(path);
  const prefetchRef = useRef<Prefetch | null>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);
  const quietRef = useRef(true);

  useLayoutEffect(() => {
    contextRef.current = { locale, cabinet, path };
    tRef.current = t;
    routerRef.current = router;
    // No nudge while the chat or a walkthrough is open.
    quietRef.current = !open && !guide;
  });

  // Saved at once as well as from the effect below: a click on a link can
  // swap layouts (dashboard <-> /create) and unmount this component before
  // its effects run, and the next page continues from what is saved.
  const save = useCallback((next: Guide | null) => {
    if (!restoredRef.current) return;
    try {
      const saved: Saved = {
        owner: ownerRef.current,
        entries: entriesRef.current,
        guide: next,
        savedAt: Date.now(),
      };
      window.sessionStorage.setItem(SUPPORT_STORAGE_KEY, JSON.stringify(saved));
    } catch {
      // Private mode or full storage: the chat just won't survive a reload.
    }
  }, []);

  const commitGuide = useCallback(
    (next: Guide | null) => {
      guideRef.current = next;
      setGuide(next);
      save(next);
    },
    [save],
  );

  const push = useCallback((entry: Omit<ChatEntry, "id">) => {
    setEntries((list) =>
      [...list, { ...entry, id: newId() }].slice(-MAX_ENTRIES),
    );
  }, []);

  /** The browser's view for buttons it builds itself (quick questions). */
  const clientContext = useCallback(
    (): ActionContext => ({
      cabinet: contextRef.current.cabinet,
      signedIn: looksSignedIn(),
      today: tbilisiToday(),
      zones: [],
      contact: CONTACT,
    }),
    [],
  );

  const runPlan = useCallback(
    async (ticket: number, settle: Settle) => {
      const stale = () => ticket !== ticketRef.current;
      const current = guideRef.current;
      if (!current || stale()) return;
      if (current.plans >= MAX_PLANS) {
        commitGuide(null);
        push({
          role: "assistant",
          text: tRef.current("gaveUp"),
          tone: "error",
        });
        setOpen(true);
        return;
      }
      setBusy("plan");
      const { locale, cabinet, path } = contextRef.current;
      // Steps already planned for this goal on this screen (see HOW_TO).
      const prefetch = prefetchRef.current;
      prefetchRef.current = null;
      const ahead =
        prefetch &&
        current.plans === 0 &&
        prefetch.goal === current.goal &&
        prefetch.path === path &&
        Date.now() - prefetch.at < PREFETCH_TTL_MS
          ? await prefetch.response
          : null;
      if (stale()) return;
      let scan: PageScan;
      let response: SupportResponse;
      // An error (a timeout, the hourly limit) is retried by a fresh request.
      if (ahead && ahead.type !== "error" && prefetch) {
        scan = prefetch.scan;
        response = ahead;
      } else {
        await pageSettled(settle);
        if (stale()) return;
        scan = await settledScan();
        if (stale()) return;
        response = await callSupport({
          mode: "plan",
          locale,
          cabinet,
          path,
          title: document.title,
          goal: current.goal,
          progress: current.progress,
          elements: scan.elements,
        });
        if (stale()) return;
      }
      setBusy(null);

      if (response.type === "plan" && response.plan.kind === "steps") {
        labelsRef.current = new Map(
          scan.elements.map((element) => [
            element.id,
            element.label || element.hint || element.id,
          ]),
        );
        setTargets(scan.targets);
        if (current.plans === 0 && response.plan.intro)
          push({ role: "assistant", text: response.plan.intro });
        commitGuide({
          ...current,
          steps: response.plan.steps,
          index: 0,
          done: response.plan.done,
          plans: current.plans + 1,
          status: "running",
        });
        return;
      }

      commitGuide(null);
      setOpen(true);
      if (response.type === "plan" && response.plan.kind === "ask") {
        push({
          role: "assistant",
          text: [response.plan.intro, response.plan.question]
            .filter(Boolean)
            .join("\n"),
          options: response.plan.options,
          goal: current.goal,
          progress: current.progress,
        });
      } else if (response.type === "error") {
        push({
          role: "assistant",
          text: tRef.current(`errors.${response.error}`),
          tone: "error",
        });
      } else {
        push({
          role: "assistant",
          text: tRef.current("notFound"),
          tone: "error",
        });
      }
    },
    [commitGuide, push],
  );

  const schedulePlan = useCallback(
    (settle: Settle) => {
      window.clearTimeout(timerRef.current);
      const ticket = ++ticketRef.current;
      timerRef.current = window.setTimeout(() => {
        void runPlan(ticket, settle);
      }, 0);
    },
    [runPlan],
  );

  const cancelPlan = useCallback(() => {
    ticketRef.current += 1;
    window.clearTimeout(timerRef.current);
    setBusy(null);
  }, []);

  useEffect(
    () => () => {
      ticketRef.current += 1;
      window.clearTimeout(timerRef.current);
    },
    [],
  );

  /**
   * Starts a walkthrough. With `href` it first opens that page (a listing
   * form) and plans there: the route change, or the next layout restoring
   * the saved walkthrough, triggers the plan.
   */
  const startGuide = useCallback(
    (goal: string, progress: string[] = [], href?: string) => {
      cancelPlan();
      setNudge(null);
      push({
        role: "assistant",
        text: tRef.current("guideStarting"),
        tone: "info",
      });
      commitGuide({
        goal: goal.slice(0, SUPPORT_LIMITS.goal),
        steps: [],
        index: 0,
        done: false,
        progress,
        plans: 0,
        status: "planning",
      });
      setOpen(false);
      if (href && href.split("?")[0] !== contextRef.current.path) {
        routerRef.current.push(href);
        return;
      }
      schedulePlan("none");
    },
    [cancelPlan, commitGuide, push, schedulePlan],
  );

  const finish = useCallback(() => {
    cancelPlan();
    commitGuide(null);
    push({ role: "assistant", text: tRef.current("doneMessage") });
    setCelebrate(true);
  }, [cancelPlan, commitGuide, push]);

  const stop = useCallback(() => {
    cancelPlan();
    commitGuide(null);
    push({ role: "assistant", text: tRef.current("stopped"), tone: "info" });
  }, [cancelPlan, commitGuide, push]);

  const advance = useCallback(() => {
    const current = guideRef.current;
    if (!current || current.status !== "running") return;
    const step = current.steps[current.index];
    if (!step) return;
    const label = labelsRef.current.get(step.target) ?? step.target;
    const progress = [...current.progress, `${step.action} "${label}"`].slice(
      -SUPPORT_LIMITS.progress,
    );
    if (current.index + 1 < current.steps.length) {
      commitGuide({ ...current, index: current.index + 1, progress });
    } else if (current.done) {
      finish();
    } else {
      commitGuide({ ...current, progress, status: "planning" });
      schedulePlan("change");
    }
  }, [commitGuide, finish, schedulePlan]);

  const back = useCallback(() => {
    const current = guideRef.current;
    if (!current || current.status !== "running" || current.index === 0) return;
    commitGuide({
      ...current,
      index: current.index - 1,
      progress: current.progress.slice(0, -1),
    });
  }, [commitGuide]);

  // The element of the current step is gone (re-rendered, closed, hidden).
  const lost = useCallback(() => {
    const current = guideRef.current;
    if (!current || current.status !== "running") return;
    commitGuide({ ...current, status: "planning" });
    schedulePlan("quiet");
  }, [commitGuide, schedulePlan]);

  const ask = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || busy) return;
      const history = entries
        .filter((entry) => !entry.tone && entry.text)
        .slice(-SUPPORT_LIMITS.history)
        .map(({ role, text: said }) => ({ role, text: said }));
      push({ role: "user", text: message });
      setDraft("");
      setBusy("answer");
      const { locale, cabinet, path } = contextRef.current;
      prefetchRef.current = null;
      if (history.length === 0 && HOW_TO.test(message)) {
        const scan = scanPage();
        const goal = message.slice(0, SUPPORT_LIMITS.goal);
        if (scan.elements.length > 0)
          prefetchRef.current = {
            goal,
            path,
            at: Date.now(),
            scan,
            response: callSupport({
              mode: "plan",
              locale,
              cabinet,
              path,
              title: document.title,
              goal,
              progress: [],
              elements: scan.elements,
            }),
          };
      }
      const response = await callSupport({
        mode: "ask",
        locale,
        cabinet,
        path,
        message,
        history,
      });
      setBusy(null);
      if (response.type === "answer") {
        // The steps planned in parallel answer the question itself, so a
        // walkthrough offered for it starts from them (same goal).
        const prefetched = prefetchRef.current?.goal;
        const goal = response.guide ? (prefetched ?? response.guide) : "";
        push({
          role: "assistant",
          text: response.text,
          actions: toButtons(response.actions),
          guide: goal || undefined,
          suggestions: strings(
            response.suggestions,
            SUPPORT_LIMITS.suggestions,
          ),
          ref: FEEDBACK_REF.test(response.ref) ? response.ref : undefined,
        });
        if (response.guideNow && goal) startGuide(goal);
      } else if (response.type === "error") {
        push({
          role: "assistant",
          text: tRef.current(`errors.${response.error}`),
          tone: "error",
        });
      } else {
        push({
          role: "assistant",
          text: tRef.current("notFound"),
          tone: "error",
        });
      }
    },
    [busy, entries, push, startGuide],
  );

  // Quick questions: a pre-written answer with buttons, a walkthrough, or
  // the listing form; none of them waits for the answer model.
  const quick = useCallback(
    (chip: QuickChip) => {
      const plan = CHIPS[chip.key] ?? { kind: "guide" };
      push({ role: "user", text: chip.text });
      if (plan.kind === "guide") {
        startGuide(chip.text);
        return;
      }
      const ctx = clientContext();
      if (plan.kind === "create") {
        const category = plan.category ?? SERVICE_FORM[ctx.cabinet];
        const href = actionHref(
          { id: "add_listing", params: category ? { category } : undefined },
          ctx,
        );
        startGuide(chip.text, [], href ?? undefined);
        return;
      }
      const actions: SupportButton[] = [];
      for (const ref of plan.actions) {
        const href = actionHref(ref, ctx);
        if (href) actions.push({ ...ref, href });
      }
      const examples = Array.from({ length: plan.examples ?? 0 }, (_, index) =>
        tRef.current(`canned.${chip.key}Example${index + 1}` as never),
      );
      push({
        role: "assistant",
        text: tRef.current(`canned.${chip.key}` as never),
        actions: actions.length > 0 ? actions : undefined,
        guide: plan.guide ? chip.text : undefined,
        suggestions: examples.length > 0 ? examples : undefined,
        ref: `canned:${chip.key}`,
      });
    },
    [clientContext, push, startGuide],
  );

  // A button under an answer: a note in the chat, then the page opens (the
  // site's own form does the rest; nothing is sent or paid from here).
  const pressAction = useCallback(
    (button: SupportButton, label: string) => {
      if (!isSafeActionHref(button.href, CONTACT)) return;
      if (isExternalHref(button.href)) return; // a plain tel:/mailto: link
      push({
        role: "assistant",
        text: tRef.current("opened", { label }),
        tone: "info",
      });
      setOpen(false);
      routerRef.current.push(button.href);
    },
    [push],
  );

  // 👍/👎: only the answer's ref and the rating are sent.
  const rate = useCallback((entryId: string, rating: "up" | "down") => {
    const entry = entriesRef.current.find((item) => item.id === entryId);
    if (!entry?.ref || entry.rating) return;
    setEntries((list) =>
      list.map((item) => (item.id === entryId ? { ...item, rating } : item)),
    );
    void callSupport({ mode: "feedback", ref: entry.ref, rating });
  }, []);

  // An answer keeps the goal and what was done; Jev reads it as a step.
  const choose = useCallback(
    (goal: string, option: string, progress?: string[]) => {
      push({ role: "user", text: option });
      const done = Array.isArray(progress) ? progress : [];
      startGuide(goal, [...done, `answered "${option}"`]);
    },
    [push, startGuide],
  );

  // A reply typed under Jev's question answers it, like tapping an option
  // (Jev sometimes asks without options).
  const send = useCallback(() => {
    const last = entries[entries.length - 1];
    const answer = draft.trim();
    if (answer && !busy && last?.role === "assistant" && last.goal) {
      setDraft("");
      choose(last.goal, answer, last.progress);
      return;
    }
    void ask(draft);
  }, [entries, draft, busy, choose, ask]);

  const reset = useCallback(() => {
    prefetchRef.current = null;
    cancelPlan();
    commitGuide(null);
    setEntries([]);
  }, [cancelPlan, commitGuide]);

  const close = useCallback(() => setOpen(false), []);
  const moveLauncher = useCallback((next: Spot) => {
    setSpot(next);
    writeSpot(next);
  }, []);

  // Restore the conversation and an unfinished walkthrough after a page change
  // that swapped layouts (dashboard <-> /create) or a reload, unless it
  // belongs to another account or was left alone too long.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const owner = await currentOwner();
      if (cancelled) return;
      ownerRef.current = owner;
      try {
        const raw = window.sessionStorage.getItem(SUPPORT_STORAGE_KEY);
        const saved = raw ? (JSON.parse(raw) as Partial<Saved>) : null;
        const age = Date.now() - Number(saved?.savedAt ?? 0);
        // A visitor's chat carries over when they sign in; a signed-in
        // user's chat is never shown to anyone else.
        const theirs = saved?.owner === owner || saved?.owner === "anon";
        if (saved && theirs && age < CHAT_IDLE_MS) {
          if (Array.isArray(saved.entries)) {
            entriesRef.current = saved.entries
              .map(toEntry)
              .filter((entry): entry is ChatEntry => entry !== null)
              .slice(-MAX_ENTRIES);
            setEntries(entriesRef.current);
          }
          if (isGuide(saved.guide) && age < GUIDE_TTL_MS) {
            // Its steps point at elements of a page that is gone: plan again here.
            commitGuide({
              ...saved.guide,
              steps: [],
              index: 0,
              status: "planning",
            });
            schedulePlan("quiet");
          }
        } else if (raw) {
          window.sessionStorage.removeItem(SUPPORT_STORAGE_KEY);
        }
      } catch {
        // Storage unavailable or corrupt: start fresh.
      }
      restoredRef.current = true;
      setRestored(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [commitGuide, schedulePlan]);

  useEffect(() => {
    entriesRef.current = entries;
    if (restored) save(guideRef.current);
  }, [entries, guide, restored, save]);

  // A route change invalidates every element id of the current plan.
  useEffect(() => {
    if (lastPathRef.current === path) return;
    lastPathRef.current = path;
    setNudge(null);
    const current = guideRef.current;
    if (!current) return;
    commitGuide({ ...current, status: "planning" });
    schedulePlan("quiet");
  }, [path, commitGuide, schedulePlan]);

  useEffect(() => {
    if (!celebrate) return;
    const timer = window.setTimeout(() => setCelebrate(false), 2600);
    return () => window.clearTimeout(timer);
  }, [celebrate]);

  useEffect(() => {
    if (wasOpenRef.current && !open && !guideRef.current) {
      launcherRef.current?.focus({ preventScroll: true });
    }
    wasOpenRef.current = open;
  }, [open]);

  // Proactive help, local only: an error the user's own click, submit or
  // Enter just caused (an error toast, a new role=alert), or a press on a
  // disabled button. Offered once per page per tab; nothing is sent unless
  // the user presses "Show me".
  useEffect(() => {
    let actedAt = 0;
    let actedPath = "";
    const offer = (trouble: Trouble) => {
      const here = contextRef.current.path;
      if (!quietRef.current || nudgedPaths().includes(here)) return;
      rememberNudge(here);
      setNudge(trouble);
    };
    const onAct = (event: Event) => {
      if (isOurs(event.target as Node | null)) return;
      if (
        event instanceof KeyboardEvent &&
        (event.key !== "Enter" || event.isComposing)
      )
        return;
      actedAt = performance.now();
      actedPath = contextRef.current.path;
    };
    // A disabled button gets no click, but the press lands on the page.
    const onPress = (event: PointerEvent) => {
      if (isOurs(event.target as Node | null)) return;
      const hit = document
        .elementsFromPoint(event.clientX, event.clientY)
        .find((el) => el.matches(DISABLED_SELECTOR));
      if (!hit || isOurs(hit)) return;
      // A greyed-out pager or tab arrow is not a step the user is stuck on.
      if (hit.closest("nav, [role='navigation'], [role='tablist']")) return;
      const label = cleanPrivate(
        hit.getAttribute("aria-label") || (hit as HTMLElement).innerText,
        SUPPORT_LIMITS.progressText - 30,
      );
      if (label) offer({ kind: "disabled", text: label });
    };
    const observer = new MutationObserver((records) => {
      if (
        !actedAt ||
        performance.now() - actedAt > NUDGE_WINDOW_MS ||
        actedPath !== contextRef.current.path
      )
        return;
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof HTMLElement) || isOurs(node)) continue;
          const found = node.matches(ERROR_SELECTOR)
            ? node
            : node.querySelector<HTMLElement>(ERROR_SELECTOR);
          // Next.js announces route changes in a role=alert of its own.
          if (!found || found.closest("next-route-announcer")) continue;
          if (found.id === "__next-route-announcer__") continue;
          const text = cleanPrivate(
            found.innerText,
            SUPPORT_LIMITS.progressText - 30,
          );
          if (text) {
            offer({ kind: "error", text });
            return;
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("click", onAct, true);
    document.addEventListener("submit", onAct, true);
    document.addEventListener("keydown", onAct, true);
    document.addEventListener("pointerdown", onPress, true);
    return () => {
      observer.disconnect();
      document.removeEventListener("click", onAct, true);
      document.removeEventListener("submit", onAct, true);
      document.removeEventListener("keydown", onAct, true);
      document.removeEventListener("pointerdown", onPress, true);
    };
  }, []);

  useEffect(() => {
    if (!nudge) return;
    if (open || guide) {
      setNudge(null);
      return;
    }
    const timer = window.setTimeout(() => setNudge(null), NUDGE_SHOW_MS);
    return () => window.clearTimeout(timer);
  }, [nudge, open, guide]);

  const helpWithTrouble = useCallback(() => {
    const trouble = nudge;
    if (!trouble) return;
    setNudge(null);
    const seen =
      trouble.kind === "error"
        ? `saw error "${trouble.text}"`
        : `pressed disabled "${trouble.text}"`;
    push({ role: "user", text: tRef.current("nudge.ask") });
    startGuide(tRef.current("nudge.goal"), [seen]);
  }, [nudge, push, startGuide]);

  const step =
    guide?.status === "running" ? guide.steps[guide.index] : undefined;
  const target = step ? targets.get(step.target) : undefined;

  useEffect(() => {
    if (step && (!target || !target.isConnected)) lost();
  }, [step, target, lost]);

  // Move on by itself when the user does what the step asks.
  useEffect(() => {
    if (!step || !target) return;
    let timer: number | undefined;
    let menuOpen = false;
    const go = () => {
      if (timer === undefined) timer = window.setTimeout(advance, ADVANCE_MS);
    };
    const inside = (node: EventTarget | null) =>
      node instanceof Node && target.contains(node);
    const labelledByTarget = (node: EventTarget | null) =>
      node instanceof HTMLInputElement &&
      Array.from(node.labels ?? []).some((label) => label === target);
    const formChoice =
      target instanceof HTMLSelectElement ||
      target instanceof HTMLInputElement ||
      target instanceof HTMLLabelElement;
    const opensMenu =
      target.getAttribute("role") === "combobox" ||
      target.hasAttribute("aria-haspopup");

    const onClick = (event: MouseEvent) => {
      const node = event.target;
      if (node instanceof Element && node.closest("[data-jev-ignore]")) return;
      if (step.action === "click") {
        if (!inside(node)) return;
        // A link navigates (and may unmount this layout): record the step now.
        if (node instanceof Element && node.closest("a[href]")) advance();
        else go();
      } else if (!formChoice) {
        // A custom dropdown is done once an option is picked, whatever the
        // step called it (Jev also points at dropdowns with "look").
        if (opensMenu) {
          if (inside(node)) {
            menuOpen = true;
          } else if (
            menuOpen &&
            node instanceof Element &&
            node.closest(OPTION_SELECTOR)
          ) {
            go();
          }
        } else if (step.action === "select" && inside(node)) {
          go();
        }
      }
    };
    const onChange = (event: Event) => {
      const node = event.target;
      if (step.action === "upload") {
        if (
          node instanceof HTMLInputElement &&
          node.type === "file" &&
          (node.files?.length ?? 0) > 0
        )
          go();
      } else if (
        // A field the step only points at is done once the user fills it in.
        step.action !== "click" &&
        (inside(node) || labelledByTarget(node))
      ) {
        go();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        step.action === "type" &&
        event.key === "Enter" &&
        inside(event.target) &&
        !(event.target instanceof HTMLTextAreaElement)
      )
        go();
    };
    const onDrop = (event: DragEvent) => {
      if (step.action === "upload" && inside(event.target)) go();
    };

    document.addEventListener("click", onClick, true);
    document.addEventListener("change", onChange, true);
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("drop", onDrop, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("change", onChange, true);
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("drop", onDrop, true);
      window.clearTimeout(timer);
    };
  }, [step, target, advance]);

  const quickKeys =
    cabinet === "public" && signedIn
      ? PUBLIC_SIGNED_IN
      : QUICK_ACTIONS[cabinet];
  const quickChips: QuickChip[] = quickKeys.map((key) => ({
    key,
    text: t(`quick.${key}` as never),
  }));
  const corner =
    side === "left" ? "fixed left-4 lg:left-6" : "fixed right-4 lg:right-6";

  return (
    <div data-jev-ignore>
      <AnimatePresence>
        {nudge && !open && !guide && (
          <motion.div
            key="nudge"
            role="status"
            data-testid="jev-nudge"
            style={liftStyle(lift, 68, raised)}
            className={`${corner} z-[81] flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-2xl bg-white py-2 pl-3 pr-1 shadow-[0_12px_32px_-8px_rgba(15,23,42,0.35)] ring-1 ring-[#DBEAFE] sm:max-w-[340px]`}
            initial={reduceMotion ? false : { opacity: 0, y: 10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10 }}
          >
            <JevAvatar size="sm" />
            <p className="min-w-0 flex-1 text-[13px] font-semibold leading-snug text-[#0F172A]">
              {t("nudge.text")}
            </p>
            <button
              type="button"
              onClick={helpWithTrouble}
              data-testid="jev-nudge-show"
              className="min-h-11 shrink-0 rounded-xl bg-[#2563EB] px-3 text-[13px] font-bold text-white transition-colors hover:bg-[#1D4ED8]"
            >
              {t("nudge.show")}
            </button>
            <button
              type="button"
              onClick={() => setNudge(null)}
              aria-label={t("close")}
              className="flex size-11 shrink-0 items-center justify-center rounded-full text-[#64748B] transition-colors hover:bg-[#F1F5F9] hover:text-[#0F172A]"
            >
              <X className="size-4" aria-hidden />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!open && !guide && (
          <SupportLauncher
            key="launcher"
            buttonRef={launcherRef}
            corner={corner}
            style={liftStyle(lift, 0, raised)}
            label={t("launcher")}
            name={t("name")}
            reduceMotion={reduceMotion}
            onOpen={() => {
              setSignedIn(looksSignedIn());
              setNudge(null);
              setOpen(true);
            }}
            onMove={moveLauncher}
          />
        )}
      </AnimatePresence>

      {guide?.status === "planning" && (
        <div
          role="status"
          data-testid="jev-planning"
          style={liftStyle(lift, 0, raised)}
          className={`${corner} z-[80] flex min-h-14 items-center gap-2.5 rounded-full bg-white py-1.5 pl-2 pr-1 text-[13px] font-semibold text-[#1E293B] shadow-[0_12px_32px_-8px_rgba(15,23,42,0.35)] ring-1 ring-[#DBEAFE]`}
        >
          <JevAvatar size="md" />
          <Loader2
            className="size-4 animate-spin text-[#2563EB] motion-reduce:animate-none"
            aria-hidden
          />
          <span>{t("looking")}</span>
          <button
            type="button"
            onClick={stop}
            aria-label={t("stop")}
            className="flex size-11 items-center justify-center rounded-full text-[#64748B] transition-colors hover:bg-[#F1F5F9] hover:text-[#0F172A]"
          >
            <X className="size-4.5" aria-hidden />
          </button>
        </div>
      )}

      <AnimatePresence>
        {celebrate && (
          <motion.div
            key="done"
            role="status"
            style={liftStyle(lift, 72, raised)}
            className={`${corner} z-[81] flex items-center gap-2 rounded-full bg-[#16A34A] px-4 py-2.5 text-[14px] font-bold text-white shadow-lg`}
            initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12 }}
          >
            <CheckCircle2 className="size-5" aria-hidden />
            {t("doneToast")}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <SupportPanel
            key="panel"
            entries={entries}
            busy={busy}
            draft={draft}
            quickChips={quickChips}
            cabinet={cabinet}
            reduceMotion={reduceMotion}
            onDraft={setDraft}
            onSend={send}
            onShowMe={(goal) => startGuide(goal)}
            onOption={choose}
            onQuick={quick}
            onAction={pressAction}
            onSuggestion={(text) => void ask(text)}
            onRate={rate}
            onReset={reset}
            onClose={close}
          />
        )}
      </AnimatePresence>

      {guide && step && target && (
        <JevSpotlight
          target={target}
          step={step}
          index={guide.index}
          total={guide.steps.length}
          reduceMotion={reduceMotion}
          onNext={advance}
          onBack={back}
          onStop={stop}
          onLost={lost}
        />
      )}
    </div>
  );
}
