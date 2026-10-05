// Browser-only snapshot of the user's screen that Jev plans from (C43). It
// sends labels and structure, never a field's value; the server masks
// e-mails and long numbers again (plan.ts:normalizeElements).

import {
  ELEMENT_KINDS,
  SUPPORT_LIMITS,
  cleanPrivate,
  cleanText,
  stripLocale,
  type ElementKind,
  type PageElement,
} from "./plan";

export type PageScan = {
  elements: PageElement[];
  /** id -> the element to highlight (a hidden control's visible label). */
  targets: Map<string, HTMLElement>;
};

const INTERACTIVE = [
  "a[href]",
  "button",
  "input:not([type='hidden'])",
  "select",
  "textarea",
  "summary",
  "[role='button']",
  "[role='link']",
  "[role='tab']",
  "[role='menuitem']",
  "[role='menuitemradio']",
  "[role='menuitemcheckbox']",
  "[role='option']",
  "[role='checkbox']",
  "[role='radio']",
  "[role='switch']",
  "[role='combobox']",
  "[contenteditable='true']",
  "[tabindex]:not([tabindex='-1'])",
  "[data-jev]",
  // Divs that only have a React onClick leave no other trace in the DOM.
  "[class*='cursor-pointer']",
].join(",");

// Inside these, an element's descendants are part of the same control.
const ATOMIC =
  "a, button, label, summary, [data-jev], [role='button'], [role='link'], [role='tab'], [role='option'], [role='menuitem'], [role='menuitemradio'], [role='menuitemcheckbox'], [role='checkbox'], [role='radio'], [role='switch']";

const IGNORED = "[data-jev-ignore], [aria-hidden='true'], [inert]";

// Custom controls that hold a value the way an <input> or <select> does.
const FIELD_ROLES = new Set(["combobox", "textbox", "spinbutton", "listbox"]);

// Short bold or heading text: titles, field captions, a warning's first line,
// a listing card's name. The nearest one above an element is its section.
const TITLES =
  "h1, h2, h3, h4, h5, h6, legend, label, strong, b, [role='heading'], p[class*='font-bold'], p[class*='font-extrabold'], p[class*='font-black'], p[class*='font-semibold'], span[class*='font-bold'], span[class*='font-extrabold'], span[class*='font-black'], div[class*='font-bold'], div[class*='font-extrabold'], div[class*='font-black']";

type FormControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

function isFormControl(el: Element): el is FormControl {
  return (
    el instanceof HTMLInputElement ||
    el instanceof HTMLSelectElement ||
    el instanceof HTMLTextAreaElement
  );
}

function isShown(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width < 4 || rect.height < 4) return false;
  if (typeof el.checkVisibility === "function") {
    return el.checkVisibility({
      opacityProperty: true,
      visibilityProperty: true,
    });
  }
  const style = getComputedStyle(el);
  return style.visibility !== "hidden" && style.opacity !== "0";
}

/** The open modal if there is one (the page behind it is inert), else the page. */
function scanRoots(): HTMLElement[] {
  const modals = Array.from(
    document.querySelectorAll<HTMLElement>(
      "[role='dialog'][aria-modal='true'], [role='alertdialog'][aria-modal='true'], dialog[open]",
    ),
  ).filter((el) => !el.closest("[data-jev-ignore]") && isShown(el));
  const modal = modals[modals.length - 1];
  if (!modal) return [document.body];
  // Select and menu popups render in portals outside the modal.
  const popups = Array.from(
    document.querySelectorAll<HTMLElement>("[role='listbox'], [role='menu']"),
  ).filter((el) => !modal.contains(el) && isShown(el));
  return [modal, ...popups];
}

/** True while an open modal leaves the element out of reach (and out of the scan). */
export function isBehindModal(el: Element): boolean {
  return !scanRoots().some((root) => root.contains(el));
}

function text(el: Element | null | undefined): string {
  if (!el) return "";
  return el instanceof HTMLElement ? el.innerText : (el.textContent ?? "");
}

/**
 * A caption laid out next to a field without <label for>: the closest
 * <label>/<legend> before the field's branch, up to three wrappers up
 * (<div><label>Zone *</label><div><select/><Chevron/></div></div>).
 */
function captionOf(control: HTMLElement): HTMLElement | null {
  let branch: HTMLElement = control;
  for (let depth = 0; depth < 3; depth += 1) {
    for (
      let sibling = branch.previousElementSibling;
      sibling;
      sibling = sibling.previousElementSibling
    ) {
      if (
        sibling.matches("label, legend") &&
        !sibling.querySelector("input, select, textarea")
      )
        return sibling as HTMLElement;
    }
    if (!branch.parentElement) break;
    branch = branch.parentElement;
  }
  return null;
}

function labelOf(target: HTMLElement, control: HTMLElement): string {
  const aria =
    control.getAttribute("aria-label") || target.getAttribute("aria-label");
  if (aria?.trim()) return aria;
  const labelledBy = control.getAttribute("aria-labelledby");
  if (labelledBy) {
    const joined = labelledBy
      .split(/\s+/)
      .map((id) => text(document.getElementById(id)))
      .join(" ");
    if (joined.trim()) return joined;
  }
  if (isFormControl(control)) {
    const caption =
      Array.from(control.labels ?? [])
        .map((label) => text(label))
        .join(" ")
        .trim() || text(captionOf(control)).trim();
    const placeholder = control.getAttribute("placeholder")?.trim() ?? "";
    if (caption && placeholder) return `${caption} (${placeholder})`;
    if (caption || placeholder) return caption || placeholder;
    if (
      control instanceof HTMLInputElement &&
      ["submit", "button", "reset"].includes(control.type)
    )
      return control.value;
    return control.getAttribute("title") ?? "";
  }
  // A custom dropdown's own text is its chosen value: name it by its caption.
  if (FIELD_ROLES.has(control.getAttribute("role") ?? "")) {
    const caption = text(captionOf(control)).trim();
    if (caption) return caption;
  }
  const own = text(target).trim();
  if (own) return own;
  return (
    target.querySelector("img[alt]")?.getAttribute("alt") ||
    target.getAttribute("title") ||
    ""
  );
}

/** Visible short titles of the scanned area, in document order. */
function outlineOf(roots: HTMLElement[]): HTMLElement[] {
  const titles: HTMLElement[] = [];
  for (const root of roots) {
    for (const node of root.querySelectorAll<HTMLElement>(TITLES)) {
      if (node.closest(IGNORED) || node.closest(ATOMIC.replace("label, ", "")))
        continue;
      const length = text(node).trim().length;
      if (length < 2 || length > 90 || !isShown(node)) continue;
      if (node.querySelector("input, select, textarea, button, a")) continue;
      titles.push(node);
    }
  }
  return titles;
}

function namedArea(el: HTMLElement): string {
  const box = el.closest<HTMLElement>(
    "[data-jev-section], nav[aria-label], aside[aria-label], header[aria-label], [role='dialog'][aria-label]",
  );
  return (
    box?.getAttribute("data-jev-section") ||
    box?.getAttribute("aria-label") ||
    ""
  );
}

function kindOf(target: HTMLElement, control: HTMLElement): ElementKind {
  const declared = target.dataset.jevKind;
  if (declared && (ELEMENT_KINDS as readonly string[]).includes(declared))
    return declared as ElementKind;
  if (control instanceof HTMLInputElement) {
    if (control.type === "checkbox") return "checkbox";
    if (control.type === "radio") return "radio";
    if (control.type === "file") return "file";
    if (["submit", "button", "reset", "image"].includes(control.type))
      return "button";
    if (control.type === "range") return "other";
    return "input";
  }
  if (control instanceof HTMLSelectElement) return "select";
  if (control instanceof HTMLTextAreaElement || control.isContentEditable)
    return "textarea";
  if (control instanceof HTMLAnchorElement) return "link";
  switch (control.getAttribute("role")) {
    case "link":
      return "link";
    case "tab":
      return "tab";
    case "option":
    case "menuitem":
    case "menuitemradio":
    case "menuitemcheckbox":
      return "option";
    case "checkbox":
    case "switch":
      return "checkbox";
    case "radio":
      return "radio";
    case "combobox":
      return "select";
    case "textbox":
      return "input";
    default:
      return "button";
  }
}

/** Whether the field already has a value or the toggle is on. Never the value itself. */
function filledOf(control: HTMLElement): boolean | undefined {
  if (control instanceof HTMLInputElement) {
    if (control.type === "checkbox" || control.type === "radio")
      return control.checked;
    if (control.type === "file") return (control.files?.length ?? 0) > 0;
    return control.value.trim() !== "";
  }
  if (control instanceof HTMLSelectElement) return control.value !== "";
  if (control instanceof HTMLTextAreaElement)
    return control.value.trim() !== "";
  const state =
    control.getAttribute("aria-checked") ??
    control.getAttribute("aria-selected") ??
    control.getAttribute("aria-pressed");
  return state === null ? undefined : state === "true";
}

function hrefOf(control: HTMLElement): string | undefined {
  if (!(control instanceof HTMLAnchorElement)) return undefined;
  try {
    const url = new URL(control.href, window.location.href);
    return url.origin === window.location.origin
      ? stripLocale(url.pathname)
      : undefined;
  } catch {
    return undefined;
  }
}

// Lower is kept first when a page has more elements than the cap: form
// fields and the page's own buttons, then the navigation (sidebar, header,
// bottom bar: what multi-page walkthroughs need), then content links such
// as listing cards, which can run into the hundreds.
function priority(el: HTMLElement, kind: ElementKind): number {
  if (el.hasAttribute("data-jev")) return 0;
  if (
    ["input", "textarea", "select", "checkbox", "radio", "file"].includes(kind)
  )
    return 1;
  const inContent = Boolean(
    el.closest("main, [role='dialog'], [role='listbox'], [role='menu']"),
  );
  if (!inContent) return 3;
  return kind === "link" ? 4 : 2;
}

const precedes = (a: Node, b: Node) =>
  Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

export function scanPage(): PageScan {
  const roots = scanRoots();
  // control -> highlighted element (a hidden input's visible label).
  const picked = new Map<HTMLElement, HTMLElement>();
  const chosen = new Set<HTMLElement>();
  for (const root of roots) {
    for (const control of root.querySelectorAll<HTMLElement>(INTERACTIVE)) {
      if (control.closest(IGNORED)) continue;
      let target: HTMLElement | null = control;
      if (!isShown(control)) {
        target = isFormControl(control)
          ? (Array.from(control.labels ?? []).find(isShown) ?? null)
          : null;
        if (!target) continue;
      }
      if (chosen.has(target)) continue;
      chosen.add(target);
      picked.set(control, target);
    }
  }

  const outline = outlineOf(roots);
  let titleIndex = -1;

  type Candidate = {
    order: number;
    rank: number;
    target: HTMLElement;
    element: Omit<PageElement, "id">;
    jev?: string;
  };
  const candidates: Candidate[] = [];
  let order = 0;
  for (const [control, target] of picked) {
    order += 1;
    // The last title above this element (both lists are in document order).
    while (
      titleIndex + 1 < outline.length &&
      precedes(outline[titleIndex + 1], target)
    )
      titleIndex += 1;
    // A control nested in another chosen control is part of it, except a
    // form field inside its own <label>: then the field is the control and
    // the label only its caption.
    const outer = target.parentElement?.closest<HTMLElement>(ATOMIC);
    if (outer && chosen.has(outer) && !isFormControl(target)) continue;
    if (
      target === control &&
      target.tagName === "LABEL" &&
      Array.from(
        target.querySelectorAll<HTMLElement>("input, select, textarea"),
      ).some((field) => chosen.has(field))
    )
      continue;
    const kind = kindOf(target, control);
    const label = cleanPrivate(labelOf(target, control), SUPPORT_LIMITS.label);
    const hint = cleanText(target.dataset.jevHint, SUPPORT_LIMITS.hint);
    if (!label && !hint) continue;
    const element: Omit<PageElement, "id"> = { kind, label };
    const href = hrefOf(control);
    if (href) element.href = href;
    const title = titleIndex >= 0 ? text(outline[titleIndex]) : "";
    const section = cleanPrivate(
      namedArea(target) || title,
      SUPPORT_LIMITS.section,
    );
    if (section && !label.startsWith(section.replace(/\s*\*$/, "")))
      element.section = section;
    if (hint) element.hint = hint;
    if (
      (control as HTMLInputElement).required ||
      control.getAttribute("aria-required") === "true" ||
      ((isFormControl(control) ||
        FIELD_ROLES.has(control.getAttribute("role") ?? "")) &&
        /\*\s*(?:\(|$)/.test(label))
    )
      element.required = true;
    const filled = filledOf(control);
    if (filled) element.filled = true;
    if (
      (control as HTMLButtonElement).disabled ||
      control.getAttribute("aria-disabled") === "true"
    )
      element.disabled = true;
    candidates.push({
      order,
      rank: priority(target, kind),
      target,
      element,
      jev: target.dataset.jev,
    });
  }

  const kept = candidates
    .sort((a, b) => a.rank - b.rank || a.order - b.order)
    .slice(0, SUPPORT_LIMITS.elements)
    .sort((a, b) => a.order - b.order);

  const elements: PageElement[] = [];
  const targets = new Map<string, HTMLElement>();
  let lastSection = "";
  kept.forEach((candidate, index) => {
    const named = candidate.jev?.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 36);
    let id = named ? `jev:${named}` : `e${index + 1}`;
    if (targets.has(id)) id = `e${index + 1}`;
    targets.set(id, candidate.target);
    // A section is a heading over the elements that follow: say it once.
    const element: PageElement = { id, ...candidate.element };
    if (element.section && element.section === lastSection) {
      delete element.section;
    } else if (element.section) {
      lastSection = element.section;
    }
    elements.push(element);
  });
  return { elements, targets };
}
