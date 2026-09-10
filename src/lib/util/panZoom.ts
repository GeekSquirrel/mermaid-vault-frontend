import type { State } from '$/types';
import type { Point } from 'mermaid/dist/types.js';
import {
  type RenderEngineMode,
  type ViewportEngine,
  StandardEngine,
  GpuEngine,
  CanvasEngine,
  cleanSvgElement
} from './viewportEngine';

export type { RenderEngineMode };

const ENGINE_STORAGE_KEY = 'mermaid-render-engine';

export const getStoredEngineMode = (): RenderEngineMode => {
  if (typeof window === 'undefined') return 'standard';
  const saved = localStorage.getItem(ENGINE_STORAGE_KEY);
  if (saved === 'gpu' || saved === 'canvas' || saved === 'standard') {
    return saved;
  }
  return 'standard';
};

export const setStoredEngineMode = (mode: RenderEngineMode) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(ENGINE_STORAGE_KEY, mode);
  }
};

export class PanZoomState {
  private engineMode: RenderEngineMode = getStoredEngineMode();
  private engine: ViewportEngine | undefined;
  private currentElement?: SVGElement;
  private currentPan?: Point;
  private currentZoom?: number;
  private isDirty = false;
  private resizeObserver?: ResizeObserver;

  public isPanEnabled = true;
  public onPanZoomChange?: (pan: Point, zoom: number) => void;
  public onEngineChange?: (mode: RenderEngineMode) => void;

  constructor() {
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.resize();
        if (!this.isDirty) {
          this.reset();
        }
      });
    }
  }

  public getEngineMode(): RenderEngineMode {
    return this.engineMode;
  }

  public setEngineMode(mode: RenderEngineMode): void {
    if (this.engineMode === mode) return;
    this.engineMode = mode;
    setStoredEngineMode(mode);

    if (this.currentElement) {
      this.engine?.destroy();
      cleanSvgElement(this.currentElement);
      this.createEngine();
      this.engine?.init(this.currentElement, {
        isPanEnabled: this.isPanEnabled,
        onPanZoomChange: (p, z) => {
          this.currentPan = p;
          this.currentZoom = z;
          this.isDirty = true;
          this.onPanZoomChange?.(p, z);
        }
      });
      this.reset();
    }
    this.onEngineChange?.(mode);
  }

  private createEngine(): void {
    switch (this.engineMode) {
      case 'gpu':
        this.engine = new GpuEngine();
        break;
      case 'canvas':
        this.engine = new CanvasEngine();
        break;
      case 'standard':
      default:
        this.engine = new StandardEngine();
        break;
    }
  }

  public updateElement(diagramView: SVGElement, { pan, zoom }: Pick<State, 'pan' | 'zoom'>) {
    this.engine?.destroy();
    this.currentElement = diagramView;
    this.currentPan = pan;
    this.currentZoom = zoom;

    this.createEngine();

    this.engine?.init(diagramView, {
      pan,
      zoom,
      isPanEnabled: this.isPanEnabled,
      onPanZoomChange: (p, z) => {
        this.currentPan = p;
        this.currentZoom = z;
        this.isDirty = true;
        this.onPanZoomChange?.(p, z);
      }
    });

    this.resizeObserver?.disconnect();
    this.resizeObserver?.observe(diagramView);

    if (this.isPanEnabled) {
      this.engine?.enablePanZoom();
    } else {
      this.engine?.disablePanZoom();
    }

    if (pan === undefined && zoom === undefined) {
      this.reset();
    }
  }

  public restorePanZoom(pan: Point, zoom: number) {
    this.currentPan = pan;
    this.currentZoom = zoom;
    this.engine?.restorePanZoom(pan, zoom);
  }

  public resize() {
    this.engine?.resize();
    if (!this.isDirty) {
      this.reset();
    }
  }

  public zoomIn() {
    this.engine?.zoomIn();
  }

  public zoomOut() {
    this.engine?.zoomOut();
  }

  public reset() {
    this.engine?.reset();
    this.isDirty = false;
  }

  public getPan(): Point | undefined {
    return this.engine?.getPan() ?? this.currentPan;
  }

  public getZoom(): number | undefined {
    return this.engine?.getZoom() ?? this.currentZoom;
  }
}
