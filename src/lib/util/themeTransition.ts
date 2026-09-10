import { setMode } from 'mode-watcher';
import { tick } from 'svelte';

export type ColorMode = 'light' | 'dark';

const FADE_CLASS = 'theme-fade';
const FADE_MS = 250;

let removeTimer: number | undefined;

/**
 * Firefox's same-document view-transition implementation misrasters content
 * clipped at the viewport edge inside scrollers (dashboard edge cards showed
 * a stretched frame during the fade), so Firefox gets the CSS color fade
 * instead. The UA check gates on engine quality, which feature detection
 * cannot express.
 */
const canCrossFade = (): boolean =>
  typeof document.startViewTransition === 'function' && !navigator.userAgent.includes('Firefox/');

/**
 * Switches the color mode with a smooth full-page cross-fade via the View
 * Transitions API; Firefox and browsers without it fall back to a CSS color
 * transition (`html.theme-fade` in app.css). Reduced-motion users get the
 * instant swap.
 *
 * The update callback resolves only after Svelte has flushed effects, so
 * theme-dependent content that swaps synchronously from caches (e.g. cached
 * diagram previews) lands inside the captured "new" state. Mid-animation DOM
 * mutations must stay the exception (slow async loads), as content changing
 * while the transition composites can misraster viewport-clipped content.
 */
export const setModeWithFade = (next: ColorMode): void => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    setMode(next);
    return;
  }

  if (canCrossFade()) {
    document.startViewTransition(async () => {
      setMode(next);
      await tick();
    });
    return;
  }

  // A transition only fires when the transition property exists before the
  // colors change, so add the class and force a style flush first.
  const root = document.documentElement;
  root.classList.add(FADE_CLASS);
  void root.offsetWidth;
  setMode(next);
  window.clearTimeout(removeTimer);
  removeTimer = window.setTimeout(() => root.classList.remove(FADE_CLASS), FADE_MS + 50);
};
