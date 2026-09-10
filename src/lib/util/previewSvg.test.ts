import { describe, expect, it } from 'vitest';
import { previewPairMismatched, viewBoxWidthOf } from './previewSvg';

const svgWithViewBox = (width: number, height = 382) =>
  `<svg id="preview" width="100%" style="max-width: ${width}px;" viewBox="0 0 ${width} ${height}"><g></g></svg>`;

describe('viewBoxWidthOf', () => {
  it('extracts the width from a mermaid svg viewBox', () => {
    expect(viewBoxWidthOf(svgWithViewBox(787.566650390625))).toBe(787.566650390625);
  });

  it('handles fractional origin coordinates', () => {
    const svg = '<svg viewBox="0.00000762939453125 0 787.5833740234375 382"></svg>';
    expect(viewBoxWidthOf(svg)).toBe(787.5833740234375);
  });

  it('returns null for svg without a viewBox and for non-svg input', () => {
    expect(viewBoxWidthOf('<svg width="100%"></svg>')).toBeNull();
    expect(viewBoxWidthOf('')).toBeNull();
    expect(viewBoxWidthOf(null)).toBeNull();
    expect(viewBoxWidthOf(undefined)).toBeNull();
  });
});

describe('previewPairMismatched', () => {
  it('detects previews rendered at different sizes', () => {
    expect(previewPairMismatched(svgWithViewBox(441.816650390625), svgWithViewBox(417))).toBe(true);
  });

  it('accepts identical or near-identical previews', () => {
    const svg = svgWithViewBox(787.566650390625);
    expect(previewPairMismatched(svg, svg)).toBe(false);
    expect(previewPairMismatched(svg, svgWithViewBox(787.6))).toBe(false);
  });

  it('never reports a mismatch when a width cannot be parsed', () => {
    expect(previewPairMismatched('<svg></svg>', svgWithViewBox(417))).toBe(false);
    expect(previewPairMismatched(svgWithViewBox(441.8), null)).toBe(false);
  });
});
