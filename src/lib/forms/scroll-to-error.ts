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

/**
 * Scrolls to whichever of the given invalid fields comes first on the page
 * (document order, not the order of `fieldKeys`). Runs on the next frame so an
 * anchor mounted by the same state update (e.g. a step change) already exists.
 */
export function scrollToFirstInvalid(fieldKeys: Iterable<string>): void {
  if (typeof window === "undefined") return;
  const keys = [...fieldKeys];
  if (keys.length === 0) return;
  window.requestAnimationFrame(() => {
    const anchors = keys
      .map((key) =>
        document.querySelector<HTMLElement>(`[data-field="${key}"]`),
      )
      .filter((el): el is HTMLElement => el !== null);
    if (anchors.length === 0) return;
    anchors.sort((a, b) =>
      a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
    );
    const first = anchors[0].getAttribute("data-field");
    if (first) scrollToField(first);
  });
}
