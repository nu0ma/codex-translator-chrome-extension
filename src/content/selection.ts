export interface SelectionInfo {
  text: string;
  rect: DOMRect;
}

/**
 * Capture the current selection. Returns null if the selection is collapsed,
 * empty after trimming, or outside the document layout.
 */
export function captureSelection(): SelectionInfo | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const text = sel.toString().trim();
  if (text.length === 0) return null;

  const range = sel.getRangeAt(0);
  const rects = range.getClientRects();
  const rect = rects.length > 0 ? rects[rects.length - 1]! : range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;

  return { text, rect };
}
