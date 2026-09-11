import { defaultState } from '$/constants';
import type { ErrorHash, MarkerData, State, ValidatedState } from '$/types';
import { resolve, base } from '$app/paths';
import { debounce, get as lodashGet } from 'lodash-es';
import type { MermaidConfig } from 'mermaid';
import { untrack } from 'svelte';
import { env } from './env';
import {
  extractErrorLineText,
  findMostRelevantLineNumber,
  replaceLineNumberInErrorMessage
} from './errorHandling';
import { parse } from './mermaid';
import { readJSON, writeJSON } from './persist.svelte';
import { findUnsafeConfigPaths, stripConfigPaths } from './sanitize';
import { deserializeState, serializeState } from './serde';
import { errorDebug, formatJSON, getUTMSource, MCBaseURL } from './util';

export { defaultState };

const urlParseFailedState = `flowchart TD
    A[Loading URL failed. We can try to figure out why.] -->|Decode JSON| B(Please check the console to see the JSON and error details.)
    B --> C{Is the JSON correct?}
    C -->|Yes| D(Please Click here to Raise an issue in github.<br/>Including the broken link in the issue <br/> will speed up the fix.)
    C -->|No| E{Did someone <br/>send you this link?}
    E -->|Yes| F[Ask them to send <br/>you the complete link]
    E -->|No| G{Did you copy <br/> the complete URL?}
    G --> |Yes| D
    G --> |"No :("| H(Try using the Timeline tab in History <br/>from same browser you used to create the diagram.)
    click D href "https://github.com/mermaid-js/mermaid-live-editor/issues/new?assignees=&labels=bug&template=bug_report.md&title=Broken%20link" "Raise issue"`;

const CODE_STORE_KEY = 'codeStore';

// The single mutable input state; only update() below may write to it.
// The fallback is cloned so mutations never write through to defaultState.
const input = $state<State>(readJSON(CODE_STORE_KEY, { ...defaultState }));

// inputState is shared externally when exporting via URL, History, etc.
// It is reactive for reads; the read-only type keeps writes inside this
// module, where update() persists and re-validates every change.
export const inputState: Readonly<State> = input;

const validatedStateOf = (state: State, serialized: string): ValidatedState => ({
  ...state,
  error: undefined,
  errorMarkers: [],
  serialized
});

const initialState = $state.snapshot(input) as State;
// Only ever replaced wholesale, so raw (shallow) reactivity is enough.
let validatedCurrent = $state.raw<ValidatedState>(
  validatedStateOf(initialState, serializeState(initialState))
);

let lastParsedCode: string | undefined;
let lastParseResult:
  | {
      diagramType?: string;
      error?: Error;
      errorMarkers: MarkerData[];
    }
  | undefined;

// Token guarding publishes: only the newest applied state may write
// `validatedCurrent`, so a slow parse of an older code can never clobber the
// state of a newer one. processState publishes an interim result before its
// async parse finishes, letting the view render in parallel with parsing.
let stateToken = 0;

const publishValidated = (processed: ValidatedState): void => {
  validatedCurrent = processed;
  updateHash?.(processed.serialized);
};

const buildParseErrorState = (state: State, processed: ValidatedState, error: unknown): void => {
  processed.error = error as Error;
  errorDebug();
  console.error(error);
  if (error && typeof error === 'object' && 'hash' in error) {
    try {
      let errorString = processed.error.toString();
      const errorLineText = extractErrorLineText(errorString);
      const realLineNumber = findMostRelevantLineNumber(errorLineText, state.code);

      let first_line: number, last_line: number, first_column: number, last_column: number;
      try {
        ({ first_line, last_line, first_column, last_column } = (error.hash as ErrorHash).loc);
      } catch {
        const lineNo = findMostRelevantLineNumber(errorString, state.code);
        first_line = lineNo;
        last_line = lineNo + 1;
        first_column = 0;
        last_column = 0;
      }

      if (realLineNumber !== -1) {
        errorString = replaceLineNumberInErrorMessage(errorString, realLineNumber);
      }

      processed.error = new Error(errorString);
      const marker: MarkerData = {
        endColumn: last_column + (first_column === last_column ? 0 : 5),
        endLineNumber: last_line + (realLineNumber - first_line),
        message: errorString || 'Syntax error',
        severity: 8, // Error
        startColumn: first_column,
        startLineNumber: realLineNumber
      };
      processed.errorMarkers = [marker];
    } catch (error) {
      console.error('Error without line helper', error);
    }
  }
};

const processState = async (state: State, token: number) => {
  const processed = validatedStateOf(state, '');
  // No changes should be done to fields part of `state`.
  processed.serialized = serializeState(state);
  if (state.code === lastParsedCode && lastParseResult) {
    processed.diagramType = lastParseResult.diagramType;
    processed.error = lastParseResult.error;
    processed.errorMarkers = lastParseResult.errorMarkers;
  } else {
    // Publish immediately so rendering starts while the parse is in flight;
    // diagramType and error markers patch in when the parse resolves.
    if (token === stateToken) {
      publishValidated(processed);
    }
    try {
      const { diagramType } = await parse(state.code);
      if (token !== stateToken) {
        return processed;
      }
      processed.diagramType = diagramType;
      lastParsedCode = state.code;
      lastParseResult = {
        diagramType,
        error: undefined,
        errorMarkers: []
      };
    } catch (error) {
      if (token !== stateToken) {
        return processed;
      }
      buildParseErrorState(state, processed, error);
      lastParsedCode = state.code;
      lastParseResult = {
        diagramType: undefined,
        error: processed.error,
        errorMarkers: processed.errorMarkers
      };
    }
  }
  return processed;
};

// Replaces the old URL-hash store subscription; assigned by initURLSubscription.
let updateHash: ((serialized: string) => void) | undefined;

// Persist the current input state and asynchronously re-validate it,
// publishing the result to `validatedState` (and the URL hash, once
// initURLSubscription has run). Only called from update(), which suppresses
// dependency tracking.
const persistAndProcess = (): void => {
  const snapshot = $state.snapshot(input) as State;
  writeJSON(CODE_STORE_KEY, snapshot);
  const token = ++stateToken;
  void processState(snapshot, token).then((processed) => {
    if (token === stateToken) {
      publishValidated(processed);
    }
  });
};

const debouncedPersistAndProcess = debounce(() => {
  persistAndProcess();
}, 250);

// The single mutation gateway: every update function funnels its writes
// through here. The mutator runs untracked so effects that call an update
// function never subscribe to the input state it reads, and the trailing
// persist + re-validate cannot be forgotten by a new update function.
const update = (mutate: (state: State) => void): void => {
  untrack(() => {
    mutate(input);
    persistAndProcess();
  });
};

// All internal reads should be done via validatedState, but it should not be
// persisted/shared externally.
export const validatedState = {
  get current(): ValidatedState {
    return validatedCurrent;
  }
};

const urlsCurrent = $derived.by(() => {
  const { serialized } = validatedCurrent;
  // Diagram rendering is served by the vault backend under the current origin
  // (see /api/render). MERMAID_RENDERER_URL still allows overriding it.
  const { rendererUrl: rendererUrlEnv } = env;
  const rendererUrl = rendererUrlEnv || `${window.location.origin}${base}/api/render`;
  const png = `${rendererUrl}/img/${serialized}?type=png`;
  return {
    mdCode: `[![](${png})](${window.location.href})`,
    mermaidChart: ({
      medium,
      campaign
    }: {
      medium:
        | 'ai_edit'
        | 'ai_repair'
        | 'main_menu'
        | 'save_diagram'
        | 'share'
        | 'vibe_diagramming'
        | 'visual_edit'
        | 'voice_edit';
      campaign?: string;
    }) => {
      const utmSource = getUTMSource();
      const params = new URLSearchParams({
        utm_source: utmSource,
        utm_medium: medium,
        ...(campaign ? { utm_campaign: campaign } : {})
      }).toString();
      return {
        save: `${MCBaseURL}/app/plugin/save?state=${serialized}&${params}`,
        playground: `${MCBaseURL}/play?${params}#${serialized}`,
        plugins: `${MCBaseURL}/plugins?${params}`,
        home: `${MCBaseURL}/?${params}`
      };
    },
    new: `${resolve('/diagram', {})}#${serializeState(defaultState)}`,
    png,
    svg: `${rendererUrl}/svg/${serialized}`,
    // Absolute URL: the view-only link is meant to be copied and shared.
    view: `${window.location.origin}${resolve('/view', {})}#${serialized}`
  };
});

export const urls = {
  get current() {
    return urlsCurrent;
  }
};

/**
 * Asks the user for confirmation if the config contains settings that might
 * pose security risks, such as a relaxed `securityLevel`.
 *
 * @param config - The Mermaid configuration to sanitize.
 * @returns The sanitized Mermaid configuration as a JSON string.
 */
export const sanitizeConfig = (config: string | MermaidConfig) => {
  const mermaidConfig: MermaidConfig =
    typeof config === 'string' ? (JSON.parse(config) as MermaidConfig) : config;

  const unsafePaths = findUnsafeConfigPaths(mermaidConfig);

  if (
    unsafePaths.length > 0 &&
    confirm(
      `Removing ${unsafePaths
        .map((unsafePath) => {
          return `${JSON.stringify(unsafePath.join('.'))}: ${JSON.stringify(lodashGet(mermaidConfig, unsafePath))}`;
        })
        .join(
          ',\n'
        )} from the config for safety.\nClick Cancel if you trust the source of this Diagram.`
    )
  ) {
    stripConfigPaths(mermaidConfig, unsafePaths);
  }
  return formatJSON(mermaidConfig);
};

export const loadState = (data: string): void => {
  console.log(`Loading '${data}'`);
  update((state) => {
    let next: State;
    try {
      next = deserializeState(data);
      next.mermaid = sanitizeConfig(next.mermaid || defaultState.mermaid);
    } catch (error) {
      next = $state.snapshot(state) as State;
      if (data) {
        console.error('Init error', error);
        next.code = urlParseFailedState;
        next.mermaid = defaultState.mermaid;
      }
    }
    applyPartial(state, next);
  });
};

let renderCount = 0;
const applyPartial = (state: State, newState: Partial<State>): void => {
  renderCount++;
  Object.assign(state, newState, { renderCount });
};

export const updatePanZoom = (pan: { x: number; y: number }, zoom: number): void => {
  untrack(() => {
    input.pan = pan;
    input.zoom = zoom;
    debouncedPersistAndProcess();
  });
};

export const updateCodeStore = (newState: Partial<State>): void => {
  const keys = Object.keys(newState);
  if (keys.length > 0 && keys.every((k) => k === 'pan' || k === 'zoom')) {
    untrack(() => {
      if (newState.pan !== undefined) input.pan = newState.pan;
      if (newState.zoom !== undefined) input.zoom = newState.zoom;
      debouncedPersistAndProcess();
    });
    return;
  }
  update((state) => applyPartial(state, newState));
};

export const updateCode = (
  code: string,
  {
    updateDiagram = false,
    resetPanZoom = false
  }: { updateDiagram?: boolean; resetPanZoom?: boolean } = {}
): void => {
  errorDebug();

  update((state) => {
    if (resetPanZoom) {
      state.pan = undefined;
      state.zoom = undefined;
    }
    state.code = code;
    state.updateDiagram = updateDiagram;
  });
};

/**
 * Blanks the editor content while a diagram is being fetched from the
 * backend, so the code (and any render) of a previously opened diagram is
 * never shown. Skips parsing — there is nothing to validate in the blank
 * state — and drops the pan/zoom of the previous diagram; the fetched
 * diagram is published afterwards via updateCode.
 */
export const resetInputForPendingLoad = (): void => {
  untrack(() => {
    // Invalidate any in-flight parse/publish of the previous content.
    stateToken++;
    input.code = '';
    input.pan = undefined;
    input.zoom = undefined;
    input.updateDiagram = true;
    lastParsedCode = undefined;
    lastParseResult = undefined;
    const snapshot = $state.snapshot(input) as State;
    writeJSON(CODE_STORE_KEY, snapshot);
    publishValidated(validatedStateOf(snapshot, serializeState(snapshot)));
  });
};

export const toggleDarkTheme = (dark: boolean): void => {
  update((state) => {
    const config = JSON.parse(state.mermaid) as MermaidConfig;
    if (!config.theme || ['dark', 'default'].includes(config.theme)) {
      config.theme = dark ? 'dark' : 'default';
    }
    state.mermaid = formatJSON(config);
  });
};

// Replaces the whole input state (e.g. when restoring a history entry),
// dropping keys the next state does not define.
export const replaceInputState = (next: State): void => {
  update((state) => {
    for (const key of Object.keys(state)) {
      if (!(key in next)) {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- full-replace semantics
        delete (state as unknown as Record<string, unknown>)[key];
      }
    }
    Object.assign(state, next);
  });
};

export const initURLSubscription = (): void => {
  updateHash = debounce((serialized: string) => {
    history.replaceState(
      typeof window !== 'undefined' ? window.history.state : undefined,
      '',
      `#${serialized}`
    );
  }, 250);
  updateHash(validatedCurrent.serialized);
};

export const verifyState = (): void => {
  update((state) => applyPartial(state, state.panZoom ? {} : { panZoom: true }));
};
