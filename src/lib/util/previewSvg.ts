/**
 * Mermaid geometry depends on the font metrics of the environment that
 * rendered the SVG (different machines, headless server renderer), so stored
 * light/dark previews for the same diagram can have different intrinsic
 * sizes. Displaying such a pair side by side (theme toggle) makes the
 * preview visibly jump. This helper detects that case so the caller can
 * ignore the stored preview and re-render from the local environment
 * instead; as both themes get visited, the stored pair converges to a
 * single environment.
 */

const VIEWBOX_WIDTH_RE = /viewBox="\s*-?[\d.]+[\s,]+-?[\d.]+[\s,]+([\d.]+)[\s,]+-?[\d.]+\s*"/;

/** Intrinsic width from the svg viewBox, or null when it cannot be parsed. */
export const viewBoxWidthOf = (svg: string | null | undefined): number | null => {
  if (!svg) return null;
  const match = svg.match(VIEWBOX_WIDTH_RE);
  return match ? parseFloat(match[1]) : null;
};

/** Sub-pixel differences are rounding noise, not a rendering-environment change. */
const WIDTH_EPSILON = 0.5;

/**
 * True when two preview SVGs were rendered at different sizes, meaning they
 * come from different rendering environments and would visibly shift if
 * swapped in place. Unparseable input never counts as mismatched.
 */
export const previewPairMismatched = (
  onScreen: string | null | undefined,
  stored: string | null | undefined
): boolean => {
  const onScreenWidth = viewBoxWidthOf(onScreen);
  const storedWidth = viewBoxWidthOf(stored);
  if (onScreenWidth === null || storedWidth === null) {
    return false;
  }
  return Math.abs(onScreenWidth - storedWidth) > WIDTH_EPSILON;
};
