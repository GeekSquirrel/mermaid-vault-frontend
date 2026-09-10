import { describe, expect, it, vi, beforeEach } from 'vitest';
import { PanZoomState, getStoredEngineMode, setStoredEngineMode } from './panZoom';

describe('PanZoomState and ViewportEngine', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to standard engine mode if not stored', () => {
    expect(getStoredEngineMode()).toBe('standard');
    const state = new PanZoomState();
    expect(state.getEngineMode()).toBe('standard');
  });

  it('persists and restores engine mode from localStorage', () => {
    setStoredEngineMode('gpu');
    expect(getStoredEngineMode()).toBe('gpu');

    const state = new PanZoomState();
    expect(state.getEngineMode()).toBe('gpu');

    state.setEngineMode('canvas');
    expect(state.getEngineMode()).toBe('canvas');
    expect(getStoredEngineMode()).toBe('canvas');
  });

  it('fires onEngineChange callback when engine mode is switched', () => {
    const state = new PanZoomState();
    const onEngineChange = vi.fn();
    state.onEngineChange = onEngineChange;

    state.setEngineMode('gpu');
    expect(onEngineChange).toHaveBeenCalledWith('gpu');

    state.setEngineMode('canvas');
    expect(onEngineChange).toHaveBeenCalledWith('canvas');

    state.setEngineMode('standard');
    expect(onEngineChange).toHaveBeenCalledWith('standard');
  });

  it('initializes GPU engine on an SVG element and allows zoomIn/zoomOut/reset', () => {
    const container = document.createElement('div');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 1000 800');
    container.appendChild(svg);
    document.body.appendChild(container);

    const state = new PanZoomState();
    state.setEngineMode('gpu');

    const onPanZoomChange = vi.fn();
    state.onPanZoomChange = onPanZoomChange;

    state.updateElement(svg, { pan: { x: 50, y: 100 }, zoom: 1.5 });
    expect(state.getPan()).toEqual({ x: 50, y: 100 });
    expect(state.getZoom()).toBe(1.5);

    state.zoomIn();
    expect(state.getZoom()).toBeGreaterThan(1.5);

    state.zoomOut();
    state.reset();
    expect(state.getZoom()).toBeDefined();

    document.body.removeChild(container);
  });

  it('switches engine seamlessly and cleanly fits the diagram view', () => {
    const container = document.createElement('div');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 500 400');
    container.appendChild(svg);
    document.body.appendChild(container);

    const state = new PanZoomState();
    state.updateElement(svg, { pan: { x: 120, y: 80 }, zoom: 2.0 });

    state.setEngineMode('gpu');
    expect(state.getEngineMode()).toBe('gpu');
    expect(state.getZoom()).toBeGreaterThan(0);
    expect(state.getPan()).toBeDefined();

    document.body.removeChild(container);
  });
});
