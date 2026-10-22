// Keep invalid fields and failed-save feedback reachable in deferred editors.
export function revealDisclosures(element: HTMLElement) {
  if (!element.isConnected) return;
  for (
    let parent = element.parentElement;
    parent;
    parent = parent.parentElement
  ) {
    if (parent instanceof HTMLDetailsElement) parent.open = true;
  }
}
