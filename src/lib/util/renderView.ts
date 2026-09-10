import type { MermaidConfig } from 'mermaid';
import { Svg2Roughjs } from 'svg2roughjs';
import { render as renderDiagram } from './mermaid';

export interface PlacedDiagram {
  diagramType?: string;
  graphDiv?: SVGSVGElement;
}

/**
 * Renders the diagram and places the resulting SVG into the container,
 * applying the hand-drawn transform and sizing fixups. Shared by the
 * store-bound View and the standalone EmbedView.
 *
 * @returns The detected diagram type and the placed SVG element (absent when
 *   mermaid returned an empty render).
 */
export const renderAndPlaceDiagram = async ({
  code,
  config,
  container,
  rough,
  viewId
}: {
  code: string;
  config: MermaidConfig;
  /** Must have an `id` — Svg2Roughjs addresses the container by CSS selector. */
  container: HTMLDivElement;
  rough: boolean;
  viewId: string;
}): Promise<PlacedDiagram> => {
  const containerSelector = `#${container.id}`;
  delete container.dataset.processed;
  const { svg, bindFunctions, diagramType } = await renderDiagram(config, code, viewId);
  if (svg.length === 0) {
    return { diagramType };
  }
  container.innerHTML = svg;
  let graphDiv = document.querySelector<SVGSVGElement>(`#${viewId}`);
  if (!graphDiv) {
    throw new Error('graph-div not found');
  }
  if (rough) {
    const originalStyles = Array.from(graphDiv.querySelectorAll('style')).map((s) =>
      s.cloneNode(true)
    );
    const originalDefs = Array.from(graphDiv.querySelectorAll('defs')).map((d) =>
      d.cloneNode(true)
    );

    const svg2roughjs = new Svg2Roughjs(containerSelector);
    svg2roughjs.svg = graphDiv;
    await svg2roughjs.sketch();
    graphDiv.remove();
    const sketch = document.querySelector<SVGSVGElement>(`${containerSelector} > svg`);
    if (!sketch) {
      throw new Error('sketch not found');
    }
    const height = sketch.getAttribute('height');
    const width = sketch.getAttribute('width');
    sketch.setAttribute('id', 'graph-div');
    sketch.setAttribute('height', '100%');
    sketch.setAttribute('width', '100%');
    sketch.setAttribute('viewBox', `0 0 ${width} ${height}`);
    sketch.style.maxWidth = '100%';

    // Re-attach original styles and defs so the sketched SVG remains fully self-contained
    for (const defs of originalDefs) {
      sketch.insertBefore(defs, sketch.firstChild);
    }
    for (const style of originalStyles) {
      sketch.insertBefore(style, sketch.firstChild);
    }

    const resetStyle = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    resetStyle.textContent = `
      #graph-div p, svg p {
        margin: 0 !important;
        padding: 0 !important;
      }
    `;
    sketch.insertBefore(resetStyle, sketch.firstChild);

    graphDiv = sketch;
  } else {
    graphDiv.setAttribute('height', '100%');
    graphDiv.style.maxWidth = '100%';
    if (bindFunctions) {
      bindFunctions(graphDiv);
    }
  }
  return { diagramType, graphDiv };
};
