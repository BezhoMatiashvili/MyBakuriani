/**
 * Scrolls the element tagged with [data-field="key"] into view and focuses its
 * first focusable control. The data-field anchor is rendered unconditionally
 * (independent of error state), so it already exists when the user clicks submit
 * — this avoids waiting for the error re-render before scrolling.
 */
export function scrollToField(fieldKey: string): void {
  if (typeof document === "undefined") return;
  const el = document.querySelector<HTMLElement>(`[data-field="${fieldKey}"]`);
  if (!el) return;

  el.scrollIntoView({ behavior: "smooth", block: "center" });

  // Focus the first focusable control after the smooth scroll settles.
  window.setTimeout(() => {
    el.querySelector<HTMLElement>(
      'input, textarea, select, button, [tabindex]:not([tabindex="-1"])',
    )?.focus({ preventScroll: true });
  }, 350);
}
