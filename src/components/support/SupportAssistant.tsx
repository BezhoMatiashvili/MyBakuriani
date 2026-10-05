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
import { scanPage, type PageScan } from "@/lib/support/scan";
import {
  SUPPORT_LIMITS,
  cabinetForPath,
  stripLocale,
  type JevStep,
  type SupportCabinet,
  type SupportLocale,
  type SupportResponse,
} from "@/lib/support/plan";
import { JevAvatar } from "./JevAvatar";
import { JevSpotlight } from "./JevSpotlight";
import { SupportPanel, type ChatEntry } from "./SupportPanel";

// Each chip starts an on-screen walkthrough directly (no Gemini round trip).
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

type Saved = { entries: ChatEntry[]; guide: Guide | null; savedAt: number };

const STORAGE_KEY = "mb.jev.v1";
const MAX_ENTRIES = 30;
// The first plan plus re-plans after each screen change, per goal.
const MAX_PLANS = 6;
// A walkthrough survives page changes in the same tab, not a later visit.
const GUIDE_TTL_MS = 15 * 60_000;
// Longest wait for a route change, a modal or the next wizard step to render
// before the page is scanned; most screens settle well before it.
const SETTLE_MS = 700;
// The page counts as settled after this long without a change.
const QUIET_MS = 150;
// A first question that reads like "how do I / where / I can't" (ka, en, ru):
// its steps are planned while Gemini decides between an answer and a
// walkthrough, so a walkthrough starts without a second wait.
const HOW_TO =
  /როგორ|სად |ვერ |მინდა|მაჩვენე|დამეხმარ|\b(?:how|where|can'?t|cannot|unable|show me|help me)\b|как |где |не могу|не получается|покажи|помоги/i;
const PREFETCH_TTL_MS = 2 * 60_000;
const ADVANCE_MS = 350;
const CLIENT_TIMEOUT_MS = 45_000;
const OPTION_SELECTOR =
  "[role='option'], [role='menuitem'], [role='menuitemradio'], [role='menuitemcheckbox']";

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
// read; only a hint for which quick questions to offer.
function looksSignedIn(): boolean {
  return /(?:^|;\s*)sb-[^=]+-auth-token(?:\.0)?=/.test(document.cookie);
}

type Lift = { px: number; bar: boolean };

/**
 * How far above the bottom edge the launcher sits: clear of any fixed bar
 * along the bottom of the screen (the dashboards' tab bar on phones, a
 * listing's call bar, a floating banner or notice, the cookie notice),
 * re-checked as such bars come and go.
 */
function useCornerLift(): Lift {
  const [lift, setLift] = useState<Lift>({ px: 16, bar: false });
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
        for (const x of [width - 24, width - 64]) {
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
          ? { px: Math.round(height - top) + 12, bar: true }
          : { px: width >= 1024 ? 24 : 16, bar: false };
      setLift((prev) =>
        prev.px === next.px && prev.bar === next.bar ? prev : next,
      );
    };
    measure();
    const timer = window.setInterval(measure, 800);
    window.addEventListener("resize", measure);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("resize", measure);
    };
  }, []);
  return lift;
}

// A bar already reaches the screen's edge (safe area included); otherwise the
// launcher keeps clear of the home indicator.
function liftStyle(lift: Lift, extra = 0): React.CSSProperties {
  return {
    bottom: lift.bar
      ? lift.px + extra
      : `calc(env(safe-area-inset-bottom) + ${lift.px + extra}px)`,
  };
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

function isEntry(value: unknown): value is ChatEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === "string" &&
    (entry.role === "user" || entry.role === "assistant") &&
    typeof entry.text === "string"
  );
}

function isGuide(value: unknown): value is Guide {
  if (!value || typeof value !== "object") return false;
  const guide = value as Record<string, unknown>;
  return (
    typeof guide.goal === "string" &&
    Array.isArray(guide.progress) &&
    typeof guide.plans === "number"
  );
}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * The dashboard support assistant (C43). Questions go to Gemini through
 * /api/support; when the user needs to do something, Jev plans on-screen
 * steps from a snapshot of the page and JevSpotlight walks through them,
 * re-planning after every screen change until the goal is done.
 */
export function SupportAssistant({ homeRole }: { homeRole?: string | null }) {
  const t = useTranslations("Support");
  const locale = useLocale() as SupportLocale;
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
  const lift = useCornerLift();

  // Async plan runs and DOM listeners read the latest values from refs.
  const guideRef = useRef<Guide | null>(null);
  const contextRef = useRef({ locale, cabinet, path });
  const tRef = useRef(t);
  const labelsRef = useRef<Map<string, string>>(new Map());
  const entriesRef = useRef<ChatEntry[]>([]);
  const restoredRef = useRef(false);
  const ticketRef = useRef(0);
  const timerRef = useRef<number | undefined>(undefined);
  const lastPathRef = useRef(path);
  const prefetchRef = useRef<Prefetch | null>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);

  useLayoutEffect(() => {
    contextRef.current = { locale, cabinet, path };
    tRef.current = t;
  });

  // Saved at once as well as from the effect below: a click on a link can
  // swap layouts (dashboard <-> /create) and unmount this component before
  // its effects run, and the next page continues from what is saved.
  const save = useCallback((next: Guide | null) => {
    if (!restoredRef.current) return;
    try {
      const saved: Saved = {
        entries: entriesRef.current,
        guide: next,
        savedAt: Date.now(),
      };
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
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

  const startGuide = useCallback(
    (goal: string, progress: string[] = []) => {
      cancelPlan();
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
        .filter((entry) => !entry.tone)
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
        push({ role: "assistant", text: response.text, showMe: message });
      } else if (response.type === "guide") {
        // Walk through the steps already planned for the question itself.
        startGuide(prefetchRef.current?.goal ?? response.goal);
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

  const quick = useCallback(
    (text: string) => {
      push({ role: "user", text });
      startGuide(text);
    },
    [push, startGuide],
  );

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

  // Restore the conversation and an unfinished walkthrough after a page change
  // that swapped layouts (dashboard <-> /create) or a reload.
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(STORAGE_KEY);
      const saved = raw ? (JSON.parse(raw) as Partial<Saved>) : null;
      if (saved && Array.isArray(saved.entries)) {
        entriesRef.current = saved.entries.filter(isEntry).slice(-MAX_ENTRIES);
        setEntries(entriesRef.current);
      }
      if (
        saved &&
        isGuide(saved.guide) &&
        Date.now() - Number(saved.savedAt ?? 0) < GUIDE_TTL_MS
      ) {
        // Its steps point at elements of a page that is gone: plan again here.
        commitGuide({
          ...saved.guide,
          steps: [],
          index: 0,
          status: "planning",
        });
        schedulePlan("quiet");
      }
    } catch {
      // Storage unavailable or corrupt: start fresh.
    }
    restoredRef.current = true;
    setRestored(true);
  }, [commitGuide, schedulePlan]);

  useEffect(() => {
    entriesRef.current = entries;
    if (restored) save(guideRef.current);
  }, [entries, guide, restored, save]);

  // A route change invalidates every element id of the current plan.
  useEffect(() => {
    if (lastPathRef.current === path) return;
    lastPathRef.current = path;
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
  const quickActions = quickKeys.map((key) => t(`quick.${key}`));
  const corner = "fixed right-4 lg:right-6";

  return (
    <div data-jev-ignore>
      <AnimatePresence>
        {!open && !guide && (
          <motion.button
            key="launcher"
            ref={launcherRef}
            type="button"
            onClick={() => {
              setSignedIn(looksSignedIn());
              setOpen(true);
            }}
            aria-label={t("launcher")}
            aria-controls="jev-panel"
            data-testid="jev-launcher"
            style={liftStyle(lift)}
            className={`${corner} z-[80] flex h-14 min-w-14 items-center justify-center gap-2 rounded-full bg-gradient-to-br from-[#2563EB] to-[#4F46E5] text-white shadow-[0_12px_32px_-8px_rgba(37,99,235,0.65)] ring-4 ring-white/80 sm:pl-4 sm:pr-5`}
            initial={reduceMotion ? false : { opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            whileHover={reduceMotion ? undefined : { scale: 1.06 }}
            whileTap={reduceMotion ? undefined : { scale: 0.94 }}
          >
            <MessageCircle className="size-6" strokeWidth={2.25} aria-hidden />
            <span className="hidden text-[15px] font-bold sm:inline">
              {t("name")}
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      {guide?.status === "planning" && (
        <div
          role="status"
          data-testid="jev-planning"
          style={liftStyle(lift)}
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
            style={liftStyle(lift, 72)}
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
            quickActions={quickActions}
            reduceMotion={reduceMotion}
            onDraft={setDraft}
            onSend={send}
            onShowMe={startGuide}
            onOption={choose}
            onQuick={quick}
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
