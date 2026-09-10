import type { Point } from 'mermaid/dist/types.js';
import panzoom from 'svg-pan-zoom';
import Hammer from 'hammerjs';

export type RenderEngineMode = 'standard' | 'gpu' | 'canvas';

export interface ViewportEngineOptions {
  pan?: Point;
  zoom?: number;
  isPanEnabled: boolean;
  onPanZoomChange?: (pan: Point, zoom: number) => void;
}

export interface ViewportEngine {
  init(diagramView: SVGElement, options: ViewportEngineOptions): void;
  destroy(): void;
  restorePanZoom(pan: Point, zoom: number): void;
  resize(): void;
  zoomIn(): void;
  zoomOut(): void;
  reset(): void;
  enablePanZoom(): void;
  disablePanZoom(): void;
  getPan(): Point | undefined;
  getZoom(): number | undefined;
}

/**
 * Completely clean any modifications made by viewport engines from the SVG DOM
 * and surrounding container, restoring the SVG to its clean default state.
 */
export const cleanSvgElement = (svgEl: SVGElement): void => {
  if (!svgEl) return;

  // 1. Unwrap svg-pan-zoom viewport group if present
  const viewport = svgEl.querySelector('.svg-pan-zoom_viewport');
  if (viewport) {
    while (viewport.firstChild) {
      svgEl.insertBefore(viewport.firstChild, viewport);
    }
    viewport.remove();
  }

  // 2. Remove svg-pan-zoom controls if present
  const controls = svgEl.querySelector('#svg-pan-zoom-controls');
  controls?.remove();

  // 3. Reset SVG inline styles and sizing attributes
  svgEl.removeAttribute('style');
  svgEl.style.width = '100%';
  svgEl.style.height = '100%';
  svgEl.style.maxWidth = '100%';
  svgEl.style.display = 'block';
  svgEl.style.position = 'relative';
  svgEl.style.opacity = '1';
  svgEl.style.pointerEvents = 'auto';
  svgEl.style.transform = '';
  svgEl.style.transformOrigin = '';
  svgEl.style.willChange = '';

  // 4. Remove any canvas elements created by CanvasEngine from container
  const container = svgEl.parentElement;
  if (container) {
    const canvases = container.querySelectorAll('.mermaid-canvas-viewport');
    canvases.forEach((c) => c.remove());
    container.style.position = 'relative';
    container.style.overflow = 'hidden';
    container.style.cursor = 'default';
  }
};

const getSvgDimensions = (svgEl: SVGElement): { width: number; height: number } => {
  const svg = svgEl as SVGSVGElement;
  const viewBox = svg.viewBox?.baseVal;
  if (viewBox && viewBox.width > 0 && viewBox.height > 0) {
    return { width: viewBox.width, height: viewBox.height };
  }

  const viewBoxAttr = svgEl.getAttribute('viewBox');
  if (viewBoxAttr) {
    const parts = viewBoxAttr.trim().split(/[\s,]+/);
    if (parts.length === 4) {
      const w = parseFloat(parts[2]);
      const h = parseFloat(parts[3]);
      if (w > 0 && h > 0) return { width: w, height: h };
    }
  }

  try {
    const bbox = svg.getBBox();
    if (bbox.width > 0 && bbox.height > 0) {
      return { width: bbox.width, height: bbox.height };
    }
  } catch {
    // In headless or test environments, getBBox might throw
  }

  const rect = svgEl.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    return { width: rect.width, height: rect.height };
  }

  const attrW = parseFloat(svgEl.getAttribute('width') || '0');
  const attrH = parseFloat(svgEl.getAttribute('height') || '0');
  if (attrW > 0 && attrH > 0) {
    return { width: attrW, height: attrH };
  }

  return { width: 800, height: 600 };
};

const getPanzoomFn = () => {
  if (typeof panzoom === 'function') return panzoom;
  return (panzoom as unknown as { default?: typeof panzoom })?.default;
};

/**
 * Standard Engine: Wraps official svg-pan-zoom.
 */
export class StandardEngine implements ViewportEngine {
  private diagramView?: SVGElement;
  private pzoom: ReturnType<typeof panzoom> | undefined;
  private hammer: HammerManager | undefined;
  private options?: ViewportEngineOptions;

  public init(diagramView: SVGElement, options: ViewportEngineOptions): void {
    this.diagramView = diagramView;
    this.options = options;
    const panzoomFn = getPanzoomFn();

    // Clean any prior engine state
    cleanSvgElement(diagramView);

    if (!panzoomFn) {
      console.warn('svg-pan-zoom is not available in current environment');
      return;
    }

    this.pzoom = panzoomFn(diagramView, {
      center: true,
      controlIconsEnabled: false,
      customEventsHandler: {
        haltEventListeners: ['touchstart', 'touchend', 'touchmove', 'touchleave', 'touchcancel'],
        init: (panZoomOptions) => {
          const instance = panZoomOptions.instance;
          let initialScale = 1;
          let pannedX = 0;
          let pannedY = 0;
          this.hammer = new Hammer(panZoomOptions.svgElement);

          const resetPanned = () => {
            pannedX = 0;
            pannedY = 0;
          };
          const handlePan = (event: HammerInput) => {
            instance.panBy({ x: event.deltaX - pannedX, y: event.deltaY - pannedY });
            pannedX = event.deltaX;
            pannedY = event.deltaY;
          };

          this.hammer.get('pinch').set({ enable: true });
          this.hammer.on('panstart panmove', (event) => {
            if (event.type === 'panstart') {
              resetPanned();
            }
            handlePan(event);
          });
          this.hammer.on('pinchstart pinchmove', (event) => {
            if (event.type === 'pinchstart') {
              initialScale = instance.getZoom();
              resetPanned();
            }
            instance.zoomAtPoint(initialScale * event.scale, {
              x: event.center.x,
              y: event.center.y
            });
            handlePan(event);
          });
          panZoomOptions.svgElement.addEventListener('touchmove', (event) => {
            event.preventDefault();
          });
        },
        destroy: () => {
          this.hammer?.destroy();
        }
      },
      fit: true,
      maxZoom: 12,
      minZoom: 0.2,
      onPan: (pan) => {
        const zoom = this.pzoom?.getZoom();
        if (zoom) {
          this.options?.onPanZoomChange?.(pan, zoom);
        }
      },
      onZoom: (zoom) => {
        const pan = this.pzoom?.getPan();
        if (pan) {
          this.options?.onPanZoomChange?.(pan, zoom);
        }
      },
      panEnabled: options.isPanEnabled,
      zoomEnabled: options.isPanEnabled
    });

    this.pzoom.disableDblClickZoom();

    if (
      options.pan &&
      options.zoom &&
      Number.isFinite(options.zoom) &&
      Number.isFinite(options.pan.x) &&
      Number.isFinite(options.pan.y)
    ) {
      this.restorePanZoom(options.pan, options.zoom);
    } else {
      this.reset();
    }
  }

  public destroy(): void {
    try {
      this.hammer?.destroy();
      this.pzoom?.destroy();
    } catch {
      // ignore cleanup errors
    }
    this.pzoom = undefined;
    this.hammer = undefined;

    if (this.diagramView) {
      cleanSvgElement(this.diagramView);
      this.diagramView = undefined;
    }
  }

  public restorePanZoom(pan: Point, zoom: number): void {
    if (!this.pzoom) return;
    this.pzoom.zoom(zoom);
    this.pzoom.pan(pan);
  }

  public resize(): void {
    this.pzoom?.resize();
  }

  public zoomIn(): void {
    this.pzoom?.zoomIn();
  }

  public zoomOut(): void {
    this.pzoom?.zoomOut();
  }

  public reset(): void {
    this.pzoom?.reset();
    this.pzoom?.zoom(0.875);
  }

  public enablePanZoom(): void {
    this.pzoom?.enablePan();
    this.pzoom?.enableZoom();
  }

  public disablePanZoom(): void {
    this.pzoom?.disablePan();
    this.pzoom?.disableZoom();
  }

  public getPan(): Point | undefined {
    return this.pzoom?.getPan();
  }

  public getZoom(): number | undefined {
    return this.pzoom?.getZoom();
  }
}

/**
 * GPU Accelerated Engine:
 * Hardware-composited CSS 3D transforms (`translate3d` + `scale` + `will-change: transform`).
 * Zero SVG DOM layout/repaint recalculation on main thread during dragging/scaling.
 * Retains 100% SVG vector clarity, links, text selection, and export pipelines.
 */
export class GpuEngine implements ViewportEngine {
  private diagramView?: SVGElement;
  private container?: HTMLElement;
  private options?: ViewportEngineOptions;
  private pan: Point = { x: 0, y: 0 };
  private zoom = 1;
  private isPanEnabled = true;
  private intrinsicWidth = 800;
  private intrinsicHeight = 600;
  private isDirty = false;

  private isPointerDown = false;
  private startX = 0;
  private startY = 0;
  private startPanX = 0;
  private startPanY = 0;
  private activePointers = new Map<number, { x: number; y: number }>();
  private initialPinchDist = 0;
  private initialPinchZoom = 1;

  private boundOnPointerDown = (e: PointerEvent) => this.onPointerDown(e);
  private boundOnPointerMove = (e: PointerEvent) => this.onPointerMove(e);
  private boundOnPointerUp = (e: PointerEvent) => this.onPointerUp(e);
  private boundOnWheel = (e: WheelEvent) => this.onWheel(e);
  private boundOnDblClick = (e: MouseEvent) => this.onDblClick(e);

  public init(diagramView: SVGElement, options: ViewportEngineOptions): void {
    this.diagramView = diagramView;
    this.container = diagramView.parentElement as HTMLElement;
    this.options = options;
    this.isPanEnabled = options.isPanEnabled;

    if (!this.container) return;

    // Clean any prior engine state
    cleanSvgElement(diagramView);

    const { width, height } = getSvgDimensions(diagramView);
    this.intrinsicWidth = width;
    this.intrinsicHeight = height;

    // Configure container for hardware compositing
    this.container.style.position = 'relative';
    this.container.style.overflow = 'hidden';
    this.container.style.touchAction = 'none';
    this.container.style.cursor = this.isPanEnabled ? 'grab' : 'default';

    // Configure SVG styling for CSS 3D transformation
    diagramView.style.position = 'absolute';
    diagramView.style.top = '0';
    diagramView.style.left = '0';
    diagramView.style.width = `${this.intrinsicWidth}px`;
    diagramView.style.height = `${this.intrinsicHeight}px`;
    diagramView.style.maxWidth = 'none';
    diagramView.style.maxHeight = 'none';
    diagramView.style.transformOrigin = '0 0';
    diagramView.style.willChange = 'transform';
    diagramView.style.userSelect = 'none';
    diagramView.style.overflow = 'visible';
    diagramView.style.display = 'block';
    diagramView.style.opacity = '1';

    // Attach listeners
    this.container.addEventListener('pointerdown', this.boundOnPointerDown);
    this.container.addEventListener('pointermove', this.boundOnPointerMove);
    this.container.addEventListener('pointerup', this.boundOnPointerUp);
    this.container.addEventListener('pointercancel', this.boundOnPointerUp);
    this.container.addEventListener('wheel', this.boundOnWheel, { passive: false });
    this.container.addEventListener('dblclick', this.boundOnDblClick);

    if (
      options.pan &&
      options.zoom &&
      Number.isFinite(options.zoom) &&
      Number.isFinite(options.pan.x) &&
      Number.isFinite(options.pan.y)
    ) {
      this.restorePanZoom(options.pan, options.zoom);
    } else {
      this.reset();
    }
  }

  private applyTransform(): void {
    if (!this.diagramView) return;
    this.diagramView.style.transform = `translate3d(${this.pan.x}px, ${this.pan.y}px, 0px) scale(${this.zoom})`;
  }

  private onPointerDown(e: PointerEvent): void {
    if (!this.isPanEnabled || !this.container) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    const target = e.target as HTMLElement;
    if (target && (target.tagName === 'A' || target.closest('a') || target.tagName === 'BUTTON')) {
      return;
    }

    this.isPointerDown = true;
    this.startX = e.clientX;
    this.startY = e.clientY;
    this.startPanX = this.pan.x;
    this.startPanY = this.pan.y;
    this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    try {
      this.container.setPointerCapture(e.pointerId);
    } catch {
      // ignore pointer capture errors in unsupported environments
    }
    this.container.style.cursor = 'grabbing';
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.activePointers.has(e.pointerId)) return;
    this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this.activePointers.size === 1 && this.isPointerDown) {
      const dx = e.clientX - this.startX;
      const dy = e.clientY - this.startY;
      this.pan = { x: this.startPanX + dx, y: this.startPanY + dy };
      this.isDirty = true;
      this.applyTransform();
      this.options?.onPanZoomChange?.(this.pan, this.zoom);
    } else if (this.activePointers.size === 2 && this.container) {
      const pts = Array.from(this.activePointers.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (this.initialPinchDist > 0) {
        const factor = dist / this.initialPinchDist;
        const newZoom = Math.max(0.1, Math.min(15, this.initialPinchZoom * factor));
        const rect = this.container.getBoundingClientRect();
        const midX = (pts[0].x + pts[1].x) / 2 - rect.left;
        const midY = (pts[0].y + pts[1].y) / 2 - rect.top;
        const ratio = newZoom / this.zoom;
        this.pan = {
          x: midX - (midX - this.pan.x) * ratio,
          y: midY - (midY - this.pan.y) * ratio
        };
        this.zoom = newZoom;
        this.isDirty = true;
        this.applyTransform();
        this.options?.onPanZoomChange?.(this.pan, this.zoom);
      } else {
        this.initialPinchDist = dist;
        this.initialPinchZoom = this.zoom;
      }
    }
  }

  private onPointerUp(e: PointerEvent): void {
    this.activePointers.delete(e.pointerId);
    if (this.activePointers.size < 2) {
      this.initialPinchDist = 0;
    }
    if (this.activePointers.size === 0) {
      this.isPointerDown = false;
      if (this.container) {
        this.container.style.cursor = this.isPanEnabled ? 'grab' : 'default';
      }
    }
    try {
      if (this.container?.hasPointerCapture(e.pointerId)) {
        this.container.releasePointerCapture(e.pointerId);
      }
    } catch {
      // ignore release pointer capture errors
    }
  }

  private onWheel(e: WheelEvent): void {
    if (!this.isPanEnabled || !this.container) return;
    e.preventDefault();

    const rect = this.container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const delta = -e.deltaY;
    const zoomFactor = delta > 0 ? 1.15 : 0.85;
    const newZoom = Math.max(0.05, Math.min(20, this.zoom * zoomFactor));
    if (Math.abs(newZoom - this.zoom) < 0.0001) return;

    const ratio = newZoom / this.zoom;
    this.pan = {
      x: mouseX - (mouseX - this.pan.x) * ratio,
      y: mouseY - (mouseY - this.pan.y) * ratio
    };
    this.zoom = newZoom;
    this.isDirty = true;
    this.applyTransform();
    this.options?.onPanZoomChange?.(this.pan, this.zoom);
  }

  private onDblClick(e: MouseEvent): void {
    if (!this.isPanEnabled || !this.container) return;
    const rect = this.container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const newZoom = Math.min(20, this.zoom * 1.5);
    const ratio = newZoom / this.zoom;
    this.pan = {
      x: mouseX - (mouseX - this.pan.x) * ratio,
      y: mouseY - (mouseY - this.pan.y) * ratio
    };
    this.zoom = newZoom;
    this.isDirty = true;
    this.applyTransform();
    this.options?.onPanZoomChange?.(this.pan, this.zoom);
  }

  public zoomAtCenter(factor: number): void {
    if (!this.container) return;
    const cWidth = this.container.clientWidth || 800;
    const cHeight = this.container.clientHeight || 600;
    const centerX = cWidth / 2;
    const centerY = cHeight / 2;
    const newZoom = Math.max(0.05, Math.min(20, this.zoom * factor));
    const ratio = newZoom / this.zoom;
    this.pan = {
      x: centerX - (centerX - this.pan.x) * ratio,
      y: centerY - (centerY - this.pan.y) * ratio
    };
    this.zoom = newZoom;
    this.isDirty = true;
    this.applyTransform();
    this.options?.onPanZoomChange?.(this.pan, this.zoom);
  }

  public destroy(): void {
    if (this.container) {
      this.container.removeEventListener('pointerdown', this.boundOnPointerDown);
      this.container.removeEventListener('pointermove', this.boundOnPointerMove);
      this.container.removeEventListener('pointerup', this.boundOnPointerUp);
      this.container.removeEventListener('pointercancel', this.boundOnPointerUp);
      this.container.removeEventListener('wheel', this.boundOnWheel);
      this.container.removeEventListener('dblclick', this.boundOnDblClick);
      this.container.style.cursor = 'default';
    }
    if (this.diagramView) {
      cleanSvgElement(this.diagramView);
      this.diagramView = undefined;
    }
    this.container = undefined;
    this.activePointers.clear();
  }

  public restorePanZoom(pan: Point, zoom: number): void {
    this.pan = { ...pan };
    this.zoom = zoom;
    this.applyTransform();
  }

  public resize(): void {
    if (!this.isDirty) {
      this.reset();
    }
  }

  public zoomIn(): void {
    this.zoomAtCenter(1.25);
  }

  public zoomOut(): void {
    this.zoomAtCenter(0.8);
  }

  public reset(): void {
    if (!this.container) return;
    const cWidth = this.container.clientWidth || 800;
    const cHeight = this.container.clientHeight || 600;
    const scaleX = cWidth / this.intrinsicWidth;
    const scaleY = cHeight / this.intrinsicHeight;
    const fitZoom = Math.min(scaleX, scaleY) * 0.875;
    this.pan = {
      x: (cWidth - this.intrinsicWidth * fitZoom) / 2,
      y: (cHeight - this.intrinsicHeight * fitZoom) / 2
    };
    this.zoom = Math.max(0.05, Math.min(20, fitZoom));
    this.isDirty = false;
    this.applyTransform();
    this.options?.onPanZoomChange?.(this.pan, this.zoom);
  }

  public enablePanZoom(): void {
    this.isPanEnabled = true;
    if (this.container) this.container.style.cursor = 'grab';
  }

  public disablePanZoom(): void {
    this.isPanEnabled = false;
    if (this.container) this.container.style.cursor = 'default';
  }

  public getPan(): Point | undefined {
    return { ...this.pan };
  }

  public getZoom(): number | undefined {
    return this.zoom;
  }
}

/**
 * Canvas 2D Engine:
 * Renders diagram bitmap to an HTML5 <canvas> for blitting performance.
 * Keeps the underlying SVG in DOM with dual-layer fallback to guarantee
 * no blank screens even if browser restricts foreignObject inside Image.
 */
export class CanvasEngine implements ViewportEngine {
  private diagramView?: SVGElement;
  private container?: HTMLElement;
  private canvas?: HTMLCanvasElement;
  private ctx?: CanvasRenderingContext2D | null;
  private options?: ViewportEngineOptions;
  private cachedImage?: HTMLImageElement;
  private pan: Point = { x: 0, y: 0 };
  private zoom = 1;
  private isPanEnabled = true;
  private intrinsicWidth = 800;
  private intrinsicHeight = 600;
  private isDirty = false;

  private isPointerDown = false;
  private startX = 0;
  private startY = 0;
  private startPanX = 0;
  private startPanY = 0;
  private activePointers = new Map<number, { x: number; y: number }>();
  private initialPinchDist = 0;
  private initialPinchZoom = 1;

  private boundOnPointerDown = (e: PointerEvent) => this.onPointerDown(e);
  private boundOnPointerMove = (e: PointerEvent) => this.onPointerMove(e);
  private boundOnPointerUp = (e: PointerEvent) => this.onPointerUp(e);
  private boundOnWheel = (e: WheelEvent) => this.onWheel(e);
  private boundOnDblClick = (e: MouseEvent) => this.onDblClick(e);

  public init(diagramView: SVGElement, options: ViewportEngineOptions): void {
    this.diagramView = diagramView;
    this.container = diagramView.parentElement as HTMLElement;
    this.options = options;
    this.isPanEnabled = options.isPanEnabled;

    if (!this.container) return;

    // Clean previous engine DOM artifacts
    cleanSvgElement(diagramView);

    const { width, height } = getSvgDimensions(diagramView);
    this.intrinsicWidth = width;
    this.intrinsicHeight = height;

    // Position the SVG as a synchronized fallback layer so user NEVER sees a blank screen!
    diagramView.style.position = 'absolute';
    diagramView.style.top = '0';
    diagramView.style.left = '0';
    diagramView.style.width = `${this.intrinsicWidth}px`;
    diagramView.style.height = `${this.intrinsicHeight}px`;
    diagramView.style.maxWidth = 'none';
    diagramView.style.maxHeight = 'none';
    diagramView.style.transformOrigin = '0 0';
    diagramView.style.willChange = 'transform';
    diagramView.style.display = 'block';
    diagramView.style.opacity = '1';

    // Create Canvas overlay
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'mermaid-canvas-viewport';
    this.canvas.style.position = 'absolute';
    this.canvas.style.top = '0';
    this.canvas.style.left = '0';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.cursor = this.isPanEnabled ? 'grab' : 'default';

    this.container.style.position = 'relative';
    this.container.style.overflow = 'hidden';
    this.container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');

    // Attach listeners to canvas
    this.canvas.addEventListener('pointerdown', this.boundOnPointerDown);
    this.canvas.addEventListener('pointermove', this.boundOnPointerMove);
    this.canvas.addEventListener('pointerup', this.boundOnPointerUp);
    this.canvas.addEventListener('pointercancel', this.boundOnPointerUp);
    this.canvas.addEventListener('wheel', this.boundOnWheel, { passive: false });
    this.canvas.addEventListener('dblclick', this.boundOnDblClick);

    if (
      options.pan &&
      options.zoom &&
      Number.isFinite(options.zoom) &&
      Number.isFinite(options.pan.x) &&
      Number.isFinite(options.pan.y)
    ) {
      this.restorePanZoom(options.pan, options.zoom);
    } else {
      this.reset();
    }

    // Rasterize SVG into Image
    this.rasterizeSvg(diagramView);
  }

  private rasterizeSvg(svgEl: SVGElement): void {
    try {
      const clone = svgEl.cloneNode(true) as SVGElement;
      clone.removeAttribute('style');
      clone.setAttribute('width', `${this.intrinsicWidth}px`);
      clone.setAttribute('height', `${this.intrinsicHeight}px`);
      clone.setAttribute('viewBox', `0 0 ${this.intrinsicWidth} ${this.intrinsicHeight}`);
      if (!clone.getAttribute('xmlns')) {
        clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      }
      if (!clone.getAttribute('xmlns:xlink')) {
        clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
      }

      let svgString = clone.outerHTML
        .replaceAll('<br>', '<br/>')
        .replaceAll(/<img([^>]*)>/g, (m, g: string) => `<img ${g} />`);

      svgString = `<?xml version="1.0" encoding="UTF-8"?>\n${svgString}`;

      const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        this.cachedImage = img;
        // Image raster is ready! Hide the SVG layer
        if (this.diagramView) {
          this.diagramView.style.opacity = '0';
          this.diagramView.style.pointerEvents = 'none';
        }
        this.renderCanvas();
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        // If image loading fails, ensure SVG stays visible so user never sees blank canvas
        if (this.diagramView) {
          this.diagramView.style.opacity = '1';
          this.diagramView.style.pointerEvents = 'auto';
        }
        this.renderCanvas();
      };
      img.src = url;
    } catch {
      if (this.diagramView) {
        this.diagramView.style.opacity = '1';
      }
      this.renderCanvas();
    }
  }

  private renderCanvas(): void {
    if (!this.canvas || !this.ctx || !this.container) return;
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const cWidth = this.container.clientWidth || 800;
    const cHeight = this.container.clientHeight || 600;

    if (this.canvas.width !== cWidth * dpr || this.canvas.height !== cHeight * dpr) {
      this.canvas.width = cWidth * dpr;
      this.canvas.height = cHeight * dpr;
    }

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    if (this.cachedImage) {
      this.ctx.save();
      this.ctx.scale(dpr, dpr);
      this.ctx.translate(this.pan.x, this.pan.y);
      this.ctx.scale(this.zoom, this.zoom);
      this.ctx.drawImage(this.cachedImage, 0, 0, this.intrinsicWidth, this.intrinsicHeight);
      this.ctx.restore();
    }

    // Always keep underlying SVG in sync with same transform
    if (this.diagramView) {
      this.diagramView.style.transform = `translate3d(${this.pan.x}px, ${this.pan.y}px, 0px) scale(${this.zoom})`;
    }
  }

  private onPointerDown(e: PointerEvent): void {
    if (!this.isPanEnabled || !this.canvas) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    this.isPointerDown = true;
    this.startX = e.clientX;
    this.startY = e.clientY;
    this.startPanX = this.pan.x;
    this.startPanY = this.pan.y;
    this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // ignore pointer capture errors in unsupported environments
    }
    this.canvas.style.cursor = 'grabbing';
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.activePointers.has(e.pointerId)) return;
    this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this.activePointers.size === 1 && this.isPointerDown) {
      const dx = e.clientX - this.startX;
      const dy = e.clientY - this.startY;
      this.pan = { x: this.startPanX + dx, y: this.startPanY + dy };
      this.isDirty = true;
      this.renderCanvas();
      this.options?.onPanZoomChange?.(this.pan, this.zoom);
    } else if (this.activePointers.size === 2 && this.container) {
      const pts = Array.from(this.activePointers.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (this.initialPinchDist > 0) {
        const factor = dist / this.initialPinchDist;
        const newZoom = Math.max(0.05, Math.min(20, this.initialPinchZoom * factor));
        const rect = this.container.getBoundingClientRect();
        const midX = (pts[0].x + pts[1].x) / 2 - rect.left;
        const midY = (pts[0].y + pts[1].y) / 2 - rect.top;
        const ratio = newZoom / this.zoom;
        this.pan = {
          x: midX - (midX - this.pan.x) * ratio,
          y: midY - (midY - this.pan.y) * ratio
        };
        this.zoom = newZoom;
        this.isDirty = true;
        this.renderCanvas();
        this.options?.onPanZoomChange?.(this.pan, this.zoom);
      } else {
        this.initialPinchDist = dist;
        this.initialPinchZoom = this.zoom;
      }
    }
  }

  private onPointerUp(e: PointerEvent): void {
    this.activePointers.delete(e.pointerId);
    if (this.activePointers.size < 2) {
      this.initialPinchDist = 0;
    }
    if (this.activePointers.size === 0) {
      this.isPointerDown = false;
      if (this.canvas) {
        this.canvas.style.cursor = this.isPanEnabled ? 'grab' : 'default';
      }
    }
    try {
      if (this.canvas?.hasPointerCapture(e.pointerId)) {
        this.canvas.releasePointerCapture(e.pointerId);
      }
    } catch {
      // ignore release pointer capture errors
    }
  }

  private onWheel(e: WheelEvent): void {
    if (!this.isPanEnabled || !this.container) return;
    e.preventDefault();

    const rect = this.container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const delta = -e.deltaY;
    const zoomFactor = delta > 0 ? 1.15 : 0.85;
    const newZoom = Math.max(0.05, Math.min(20, this.zoom * zoomFactor));
    if (Math.abs(newZoom - this.zoom) < 0.0001) return;

    const ratio = newZoom / this.zoom;
    this.pan = {
      x: mouseX - (mouseX - this.pan.x) * ratio,
      y: mouseY - (mouseY - this.pan.y) * ratio
    };
    this.zoom = newZoom;
    this.isDirty = true;
    this.renderCanvas();
    this.options?.onPanZoomChange?.(this.pan, this.zoom);
  }

  private onDblClick(e: MouseEvent): void {
    if (!this.isPanEnabled || !this.container) return;
    const rect = this.container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const newZoom = Math.min(20, this.zoom * 1.5);
    const ratio = newZoom / this.zoom;
    this.pan = {
      x: mouseX - (mouseX - this.pan.x) * ratio,
      y: mouseY - (mouseY - this.pan.y) * ratio
    };
    this.zoom = newZoom;
    this.isDirty = true;
    this.renderCanvas();
    this.options?.onPanZoomChange?.(this.pan, this.zoom);
  }

  public zoomAtCenter(factor: number): void {
    if (!this.container) return;
    const cWidth = this.container.clientWidth || 800;
    const cHeight = this.container.clientHeight || 600;
    const centerX = cWidth / 2;
    const centerY = cHeight / 2;
    const newZoom = Math.max(0.05, Math.min(20, this.zoom * factor));
    const ratio = newZoom / this.zoom;
    this.pan = {
      x: centerX - (centerX - this.pan.x) * ratio,
      y: centerY - (centerY - this.pan.y) * ratio
    };
    this.zoom = newZoom;
    this.isDirty = true;
    this.renderCanvas();
    this.options?.onPanZoomChange?.(this.pan, this.zoom);
  }

  public destroy(): void {
    if (this.canvas) {
      this.canvas.removeEventListener('pointerdown', this.boundOnPointerDown);
      this.canvas.removeEventListener('pointermove', this.boundOnPointerMove);
      this.canvas.removeEventListener('pointerup', this.boundOnPointerUp);
      this.canvas.removeEventListener('pointercancel', this.boundOnPointerUp);
      this.canvas.removeEventListener('wheel', this.boundOnWheel);
      this.canvas.removeEventListener('dblclick', this.boundOnDblClick);
      this.canvas.remove();
    }
    if (this.diagramView) {
      cleanSvgElement(this.diagramView);
      this.diagramView = undefined;
    }
    this.canvas = undefined;
    this.ctx = undefined;
    this.cachedImage = undefined;
    this.container = undefined;
    this.activePointers.clear();
  }

  public restorePanZoom(pan: Point, zoom: number): void {
    this.pan = { ...pan };
    this.zoom = zoom;
    this.renderCanvas();
  }

  public resize(): void {
    if (!this.isDirty) {
      this.reset();
    } else {
      this.renderCanvas();
    }
  }

  public zoomIn(): void {
    this.zoomAtCenter(1.25);
  }

  public zoomOut(): void {
    this.zoomAtCenter(0.8);
  }

  public reset(): void {
    if (!this.container) return;
    const cWidth = this.container.clientWidth || 800;
    const cHeight = this.container.clientHeight || 600;
    const scaleX = cWidth / this.intrinsicWidth;
    const scaleY = cHeight / this.intrinsicHeight;
    const fitZoom = Math.min(scaleX, scaleY) * 0.875;
    this.pan = {
      x: (cWidth - this.intrinsicWidth * fitZoom) / 2,
      y: (cHeight - this.intrinsicHeight * fitZoom) / 2
    };
    this.zoom = Math.max(0.05, Math.min(20, fitZoom));
    this.isDirty = false;
    this.renderCanvas();
    this.options?.onPanZoomChange?.(this.pan, this.zoom);
  }

  public enablePanZoom(): void {
    this.isPanEnabled = true;
    if (this.canvas) this.canvas.style.cursor = 'grab';
  }

  public disablePanZoom(): void {
    this.isPanEnabled = false;
    if (this.canvas) this.canvas.style.cursor = 'default';
  }

  public getPan(): Point | undefined {
    return { ...this.pan };
  }

  public getZoom(): number | undefined {
    return this.zoom;
  }
}
