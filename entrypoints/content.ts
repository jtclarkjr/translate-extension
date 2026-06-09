import type {
  AskResponse,
  ContentRequest,
  SpeakResponse,
  TranslateResponse,
  TranslationResult,
} from "@/lib/messages";
import { defaultSettings, type PlaybackMode } from "@/lib/settings";

type SelectionState = {
  text: string;
  rect: DOMRect;
};

type PanelPosition = {
  left: number;
  top: number;
};

type PanelState = {
  selection: SelectionState;
  position?: PanelPosition;
  translation?: TranslationResult;
  answer?: string;
  loading: boolean;
  error?: string;
  question: string;
  speaking?: "original" | "translation" | "both";
};

type DragState = {
  startX: number;
  startY: number;
  initialLeft: number;
  initialTop: number;
};

const ROOT_ID = "natural-translator-root";
const MAX_SELECTION_CHARS = 7000;
const PANEL_WIDTH = 384;
const PANEL_MIN_VISIBLE_HEIGHT = 120;
const FONT_STACK =
  'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

let root: HTMLDivElement | undefined;
let shadow: ShadowRoot | undefined;
let panelState: PanelState | undefined;
let dragState: DragState | undefined;
let panelRequestId = 0;
let ignoreOutsideClicksUntil = 0;
let currentAudio: HTMLAudioElement | undefined;
let resolveCurrentPlayback: (() => void) | undefined;
const audioCache = new Map<string, string>();

export default defineContentScript({
  matches: ["<all_urls>"],
  main() {
    document.addEventListener("mouseup", handleSelectionChange);
    document.addEventListener("keyup", handleSelectionChange);
    document.addEventListener("selectionchange", scheduleSelectionChange);
    document.addEventListener("scroll", hideButton, true);
    document.addEventListener("pointerdown", handleDocumentPointerDown, true);
    document.addEventListener("pointermove", handleDocumentPointerMove, true);
    document.addEventListener("pointerup", stopDragging, true);
    document.addEventListener("pointercancel", stopDragging, true);
    browser.runtime.onMessage.addListener((message: ContentRequest) => {
      if (message.type === "open-selection-panel") {
        openPanelFromMessage(message.text);
      }
    });
  },
});

function scheduleSelectionChange() {
  window.setTimeout(handleSelectionChange, 80);
}

function handleSelectionChange(event?: Event) {
  if (
    event?.target instanceof Node &&
    Boolean(shadow?.querySelector(".nt-panel")?.contains(event.target))
  ) {
    return;
  }

  const selectionState = getSelectionState(MAX_SELECTION_CHARS);

  if (!selectionState) {
    if (!hasPanel()) {
      hideButton();
    }
    return;
  }

  if (!hasPanel()) {
    renderButton(selectionState, getButtonTop(selectionState.rect));
  }
}

function openPanelFromMessage(text: string) {
  const currentSelection = getSelectionState(MAX_SELECTION_CHARS);
  void openPanelFromText(text, currentSelection?.rect || getFallbackRect());
}

function hasPanel() {
  return Boolean(panelState);
}

function ensureRoot() {
  if (root && shadow) {
    return shadow;
  }

  root = document.createElement("div");
  root.id = ROOT_ID;
  root.style.position = "fixed";
  root.style.left = "0";
  root.style.top = "0";
  root.style.width = "0";
  root.style.height = "0";
  root.style.zIndex = "2147483647";
  root.style.pointerEvents = "none";
  shadow = root.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = styles;
  shadow.append(style);
  document.documentElement.append(root);

  return shadow;
}

function hideButton() {
  shadow?.querySelector(".nt-floating-button")?.remove();
}

function renderButton(selection: SelectionState, top: number) {
  const shadowRoot = ensureRoot();
  const button = document.createElement("button");
  button.className = "nt-floating-button";
  button.type = "button";
  button.textContent = "Translate";
  setElementStyles(button, {
    position: "fixed",
    zIndex: "2147483647",
    boxSizing: "border-box",
    pointerEvents: "auto",
    border: "1px solid #1e40af",
    borderRadius: "999px",
    background: "#2563eb",
    color: "#ffffff",
    cursor: "pointer",
    fontFamily: FONT_STACK,
    fontSize: "13px",
    fontWeight: "800",
    lineHeight: "1",
    minHeight: "34px",
    padding: "0 13px",
    boxShadow: "0 10px 24px rgba(15, 23, 42, 0.2)",
  });
  button.style.left = `${clamp(selection.rect.left, 8, window.innerWidth - 118)}px`;
  button.style.top = `${top}px`;
  button.addEventListener("click", () => openPanel(selection));

  shadowRoot.querySelector(".nt-floating-button")?.remove();
  shadowRoot.append(button);
}

async function openPanel(selection: SelectionState) {
  destroyPanelAudio();
  hideButton();
  const requestId = ++panelRequestId;
  panelState = {
    selection,
    position: getInitialPanelPosition(selection.rect),
    loading: true,
    question: "",
  };
  ignoreOutsideClicksUntil = Date.now() + 500;
  renderPanel();

  let response: TranslateResponse;

  try {
    response = (await browser.runtime.sendMessage({
      type: "translate",
      text: selection.text,
    })) as TranslateResponse;
  } catch (error) {
    if (requestId !== panelRequestId || !panelState) {
      return;
    }

    panelState = {
      ...panelState,
      loading: false,
      error: error instanceof Error ? error.message : "Unable to request translation.",
    };
    renderPanel();
    return;
  }

  if (requestId !== panelRequestId || !panelState) {
    return;
  }

  if (response.ok) {
    panelState = {
      ...panelState,
      translation: response.data,
      loading: false,
    };
  } else {
    panelState = {
      ...panelState,
      loading: false,
      error: response.error,
    };
  }

  renderPanel();
}

async function openPanelFromText(text: string, rect: DOMRect) {
  await openPanel({
    text: text.replace(/\s+/g, " ").trim().slice(0, MAX_SELECTION_CHARS),
    rect,
  });
}

function closePanel() {
  panelRequestId += 1;
  destroyPanelAudio();
  panelState = undefined;
  shadow?.querySelector(".nt-panel")?.remove();
}

function handleDocumentPointerDown(event: PointerEvent) {
  if (!panelState || !shadow) {
    return false;
  }

  if (Date.now() < ignoreOutsideClicksUntil) {
    return false;
  }

  const target = event.composedPath()[0];
  const isInsidePanel =
    target instanceof Node && Boolean(shadow.querySelector(".nt-panel")?.contains(target));

  if (!isInsidePanel) {
    closePanel();
    return true;
  }

  return false;
}

function handleDocumentPointerMove(event: PointerEvent) {
  if (!dragState || !panelState) {
    return;
  }

  panelState.position = clampPanelPosition({
    left: dragState.initialLeft + event.clientX - dragState.startX,
    top: dragState.initialTop + event.clientY - dragState.startY,
  });

  const panel = shadow?.querySelector<HTMLElement>(".nt-panel");
  if (panel) {
    panel.style.left = `${panelState.position.left}px`;
    panel.style.top = `${panelState.position.top}px`;
  }
}

function stopDragging() {
  dragState = undefined;
}

function renderPanel() {
  if (!panelState) {
    return;
  }

  const shadowRoot = ensureRoot();
  shadowRoot.querySelector(".nt-panel")?.remove();
  const panel = document.createElement("section");
  panel.className = "nt-panel";
  setElementStyles(panel, {
    position: "fixed",
    zIndex: "2147483647",
    boxSizing: "border-box",
    pointerEvents: "auto",
    width: "min(360px, calc(100vw - 16px))",
    border: "1px solid #cbd5e1",
    borderRadius: "8px",
    background: "#f8fafc",
    color: "#172033",
    boxShadow: "0 18px 44px rgba(15, 23, 42, 0.2)",
    fontFamily: FONT_STACK,
    lineHeight: "1.5",
    overflow: "hidden",
  });
  panel.style.left = `${panelState.position?.left ?? getInitialPanelPosition(panelState.selection.rect).left}px`;
  panel.style.top = `${panelState.position?.top ?? getInitialPanelPosition(panelState.selection.rect).top}px`;

  panel.append(renderHeader());

  if (panelState.loading) {
    panel.append(renderStatus("Translating selected text..."));
  } else if (panelState.error) {
    panel.append(renderError(panelState.error));
  } else if (panelState.translation) {
    panel.append(renderTranslation(panelState.translation));
    panel.append(renderActions(panelState.translation));
    panel.append(renderQuestionForm());

    if (panelState.answer) {
      panel.append(renderAnswer(panelState.answer));
    }
  }

  shadowRoot.append(panel);
}

function renderHeader() {
  const header = document.createElement("header");
  header.className = "nt-header";
  setElementStyles(header, {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "16px",
    padding: "18px 18px 14px",
    borderBottom: "1px solid #e2e8f0",
    background: "#f8fafc",
    cursor: "grab",
    userSelect: "none",
    touchAction: "none",
  });
  header.addEventListener("pointerdown", startDragging);
  const title = document.createElement("div");
  title.className = "nt-title";
  title.textContent = "Natural Translator";
  setElementStyles(title, {
    flex: "1",
    color: "#172033",
    fontSize: "22px",
    fontWeight: "800",
    lineHeight: "1.15",
  });
  const badge = document.createElement("span");
  badge.className = "nt-badge";
  badge.textContent = panelState?.translation ? "Ready" : "Working";
  setElementStyles(badge, {
    borderRadius: "999px",
    background: "#dcfce7",
    color: "#166534",
    fontSize: "12px",
    fontWeight: "800",
    padding: "5px 9px",
    whiteSpace: "nowrap",
  });
  const close = document.createElement("button");
  close.className = "nt-icon-button";
  close.type = "button";
  close.title = "Close";
  close.textContent = "x";
  setElementStyles(close, {
    width: "30px",
    height: "30px",
    border: "1px solid #cbd5e1",
    borderRadius: "6px",
    background: "#ffffff",
    color: "#475569",
    cursor: "pointer",
    font: "inherit",
    lineHeight: "1",
  });
  close.addEventListener("click", closePanel);
  header.append(title, badge, close);
  return header;
}

function renderTranslation(translation: TranslationResult) {
  const wrapper = document.createElement("div");
  wrapper.className = "nt-result";
  setInsetBlockStyles(wrapper);
  const label = document.createElement("div");
  label.className = "nt-section-label";
  label.textContent = "Translation";
  setLabelStyles(label);
  const translated = document.createElement("p");
  translated.className = "nt-result-text";
  translated.textContent = translation.translatedText;
  setElementStyles(translated, {
    border: "1px solid #cbd5e1",
    borderRadius: "6px",
    background: "#ffffff",
    color: "#172033",
    margin: "0",
    fontSize: "15px",
    lineHeight: "1.55",
    padding: "10px 11px",
    whiteSpace: "pre-wrap",
  });
  wrapper.append(label, translated);

  const metaText = [translation.detectedLanguage, translation.notes].filter(Boolean).join(" - ");
  if (metaText) {
    const meta = document.createElement("p");
    meta.className = "nt-meta";
    meta.textContent = metaText;
    setElementStyles(meta, {
      margin: "8px 0 0",
      color: "#64748b",
      fontSize: "12px",
      lineHeight: "1.45",
    });
    wrapper.append(meta);
  }

  return wrapper;
}

function renderActions(translation: TranslationResult) {
  const group = document.createElement("div");
  group.className = "nt-actions";
  setElementStyles(group, {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    margin: "14px 18px",
  });
  group.append(
    actionButton("Play original", () => playAudio("original")),
    actionButton("Play translation", () => playAudio("translation", translation.translatedText)),
    actionButton("Play default", playDefaultAudio),
    actionButton("Stop sound", stopAudio),
    actionButton("Copy", () => navigator.clipboard.writeText(translation.translatedText)),
  );

  if (panelState?.speaking) {
    const status = document.createElement("span");
    status.className = "nt-speaking";
    status.textContent = "Generating voice...";
    setElementStyles(status, {
      alignSelf: "center",
      color: "#64748b",
      fontSize: "12px",
    });
    group.append(status);
  }

  return group;
}

function renderQuestionForm() {
  const form = document.createElement("form");
  form.className = "nt-question";
  setElementStyles(form, {
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: "8px",
    margin: "14px 18px",
  });
  const label = document.createElement("label");
  label.className = "nt-question-label";
  label.textContent = "Follow-up question";
  setLabelStyles(label);
  label.style.gridColumn = "1 / -1";
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Ask about the selected text";
  input.value = panelState?.question || "";
  setInputStyles(input);
  input.addEventListener("input", () => {
    if (panelState) {
      panelState.question = input.value;
    }
  });
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.textContent = "Ask";
  setActionButtonStyles(submit);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void askQuestion(input.value);
  });
  form.append(label, input, submit);
  return form;
}

function renderAnswer(answer: string) {
  const wrapper = document.createElement("div");
  wrapper.className = "nt-answer";
  wrapper.textContent = answer;
  setElementStyles(wrapper, {
    borderTop: "1px solid #e2e8f0",
    color: "#172033",
    fontSize: "13px",
    lineHeight: "1.45",
    margin: "14px 18px",
    paddingTop: "12px",
    whiteSpace: "pre-wrap",
  });
  return wrapper;
}

function renderStatus(message: string) {
  const status = document.createElement("p");
  status.className = "nt-status";
  status.textContent = message;
  setElementStyles(status, {
    color: "#64748b",
    fontSize: "13px",
    lineHeight: "1.45",
    margin: "14px 18px",
  });
  return status;
}

function renderError(message: string) {
  const error = document.createElement("p");
  error.className = "nt-error";
  error.textContent = message;
  setElementStyles(error, {
    border: "1px solid #fecaca",
    borderRadius: "6px",
    background: "#fef2f2",
    color: "#b42318",
    fontSize: "13px",
    lineHeight: "1.45",
    margin: "14px 18px",
    padding: "10px 11px",
  });
  return error;
}

function actionButton(label: string, onClick: () => void | Promise<void>) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  setActionButtonStyles(button);
  button.addEventListener("click", () => void onClick());
  return button;
}

function setElementStyles(element: HTMLElement, stylesToApply: Partial<CSSStyleDeclaration>) {
  Object.assign(element.style, stylesToApply);
}

function setInsetBlockStyles(element: HTMLElement) {
  setElementStyles(element, {
    margin: "14px 18px",
  });
}

function setLabelStyles(element: HTMLElement) {
  setElementStyles(element, {
    display: "block",
    color: "#334155",
    fontSize: "13px",
    fontWeight: "700",
    margin: "0 0 6px",
  });
}

function setActionButtonStyles(button: HTMLButtonElement) {
  setElementStyles(button, {
    border: "1px solid #cbd5e1",
    borderRadius: "6px",
    background: "#ffffff",
    color: "#172033",
    cursor: "pointer",
    font: "inherit",
    fontSize: "12px",
    fontWeight: "700",
    minHeight: "34px",
    padding: "7px 11px",
  });
}

function setInputStyles(input: HTMLInputElement) {
  setElementStyles(input, {
    minWidth: "0",
    border: "1px solid #cbd5e1",
    borderRadius: "6px",
    color: "#172033",
    background: "#ffffff",
    font: "inherit",
    fontSize: "13px",
    minHeight: "38px",
    padding: "0 10px",
  });
  input.addEventListener("focus", () => {
    input.style.borderColor = "#2563eb";
    input.style.outline = "2px solid rgba(37, 99, 235, 0.22)";
  });
  input.addEventListener("blur", () => {
    input.style.borderColor = "#cbd5e1";
    input.style.outline = "none";
  });
}

async function askQuestion(question: string) {
  const trimmedQuestion = question.trim();

  if (!panelState || !trimmedQuestion) {
    return;
  }

  const requestId = panelRequestId;
  panelState.answer = undefined;
  panelState.error = undefined;
  renderPanel();

  const response = (await browser.runtime.sendMessage({
    type: "ask",
    text: panelState.selection.text,
    question: trimmedQuestion,
  })) as AskResponse;

  if (requestId !== panelRequestId || !panelState) {
    return;
  }

  if (response.ok) {
    panelState.answer = response.data.answer;
  } else {
    panelState.error = response.error;
  }

  renderPanel();
}

async function playDefaultAudio() {
  const stored = await browser.storage.local.get(defaultSettings);
  const mode = isPlaybackMode(stored.playbackMode)
    ? stored.playbackMode
    : defaultSettings.playbackMode;

  if (mode === "both") {
    await playAudio("both");
    return;
  }

  await playAudio(mode);
}

async function playAudio(kind: "original" | "translation" | "both", explicitText?: string) {
  if (!panelState) {
    return;
  }

  stopAudio();
  panelState.speaking = kind;
  panelState.error = undefined;
  renderPanel();

  try {
    if (kind === "both") {
      await playAudio("original");
      await playAudio("translation", panelState.translation?.translatedText);
      return;
    }

    const text =
      explicitText ||
      (kind === "original"
        ? panelState.selection.text
        : panelState.translation?.translatedText || "");
    const languageHint = kind === "original" ? panelState.translation?.detectedLanguage : undefined;
    const cacheKey = getAudioCacheKey(kind, text, languageHint);
    const cachedDataUrl = audioCache.get(cacheKey);

    if (cachedDataUrl) {
      await playDataUrl(cachedDataUrl);
      return;
    }

    const response = (await browser.runtime.sendMessage({
      type: "speak",
      text,
      languageHint,
      purpose: kind,
    })) as SpeakResponse;

    if (!panelState) {
      return;
    }

    if (!response.ok) {
      throw new Error(response.error);
    }

    audioCache.set(cacheKey, response.data.dataUrl);
    await playDataUrl(response.data.dataUrl);
  } catch (error) {
    if (panelState) {
      panelState.error = error instanceof Error ? error.message : "Unable to play audio.";
    }
  } finally {
    if (panelState) {
      panelState.speaking = undefined;
      renderPanel();
    }
  }
}

function startDragging(event: PointerEvent) {
  if (!panelState || event.target instanceof HTMLButtonElement) {
    return;
  }

  const position = panelState.position || getInitialPanelPosition(panelState.selection.rect);
  dragState = {
    startX: event.clientX,
    startY: event.clientY,
    initialLeft: position.left,
    initialTop: position.top,
  };
  event.preventDefault();
}

function isPlaybackMode(value: unknown): value is PlaybackMode {
  return value === "translation" || value === "original" || value === "both";
}

function destroyPanelAudio() {
  stopAudio();
  audioCache.clear();
}

function getAudioCacheKey(
  kind: "original" | "translation",
  text: string,
  languageHint: string | undefined,
) {
  return JSON.stringify([kind, text, languageHint || ""]);
}

function stopAudio() {
  if (!currentAudio) {
    return;
  }

  currentAudio.pause();
  currentAudio.currentTime = 0;
  currentAudio = undefined;
  resolveCurrentPlayback?.();
  resolveCurrentPlayback = undefined;
}

async function playDataUrl(dataUrl: string) {
  stopAudio();

  const audio = new Audio(dataUrl);
  currentAudio = audio;

  await new Promise<void>((resolve, reject) => {
    let settled = false;

    function cleanup() {
      audio.removeEventListener("ended", finish);
      audio.removeEventListener("error", fail);
      if (currentAudio === audio) {
        currentAudio = undefined;
      }
      if (resolveCurrentPlayback === finish) {
        resolveCurrentPlayback = undefined;
      }
    }

    function finish() {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve();
    }

    function fail() {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(new Error("Unable to play audio."));
    }

    resolveCurrentPlayback = finish;
    audio.addEventListener("ended", finish);
    audio.addEventListener("error", fail);
    void audio.play().catch(fail);
  });
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

function getButtonTop(rect: DOMRect) {
  const below = rect.bottom + 8;
  const above = rect.top - 44;

  return clamp(below > window.innerHeight - 44 ? above : below, 8, window.innerHeight - 44);
}

function getInitialPanelPosition(rect: DOMRect): PanelPosition {
  return clampPanelPosition({
    left: clamp(rect.left, 8, window.innerWidth - PANEL_WIDTH - 8),
    top: getPanelTop(rect),
  });
}

function clampPanelPosition(position: PanelPosition): PanelPosition {
  return {
    left: clamp(position.left, 8, Math.max(8, window.innerWidth - PANEL_WIDTH - 8)),
    top: clamp(position.top, 8, Math.max(8, window.innerHeight - PANEL_MIN_VISIBLE_HEIGHT)),
  };
}

function getFallbackRect() {
  return new DOMRect(Math.max(8, window.innerWidth / 2 - 190), 80, 380, 1);
}

function getSelectionState(maxSelectionChars: number): SelectionState | undefined {
  const selection = window.getSelection();
  const text = selection?.toString().replace(/\s+/g, " ").trim() || "";

  if (!selection || selection.rangeCount === 0 || text.length < 2) {
    return undefined;
  }

  const rect = selection.getRangeAt(0).getBoundingClientRect();

  if (rect.width === 0 && rect.height === 0) {
    return undefined;
  }

  return {
    text: text.slice(0, maxSelectionChars),
    rect,
  };
}

function getPanelTop(rect: DOMRect) {
  const below = rect.bottom + 10;
  const above = rect.top - 330;

  return clamp(below > window.innerHeight - 330 ? above : below, 8, window.innerHeight - 120);
}

const styles = `
  :host {
    all: initial;
    color-scheme: light;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-synthesis: none;
    line-height: 1.5;
    text-rendering: optimizeLegibility;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  button,
  input {
    font: inherit;
  }

  .nt-floating-button,
  .nt-panel {
    position: fixed;
    z-index: 2147483647;
    box-sizing: border-box;
    pointer-events: auto;
  }

  .nt-floating-button {
    border: 1px solid #1e40af;
    border-radius: 999px;
    background: #2563eb;
    color: #ffffff;
    cursor: pointer;
    font-size: 13px;
    font-weight: 800;
    line-height: 1;
    min-height: 34px;
    padding: 0 13px;
    box-shadow: 0 10px 24px rgba(15, 23, 42, 0.2);
  }

  .nt-floating-button:hover {
    background: #1d4ed8;
  }

  .nt-panel {
    width: min(360px, calc(100vw - 16px));
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    background: #f8fafc;
    color: #172033;
    box-shadow: 0 18px 44px rgba(15, 23, 42, 0.2);
    overflow: hidden;
  }

  .nt-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding: 18px 18px 14px;
    border-bottom: 1px solid #e2e8f0;
    background: #f8fafc;
    cursor: grab;
    user-select: none;
    touch-action: none;
  }

  .nt-title {
    flex: 1;
    color: #172033;
    font-size: 22px;
    line-height: 1.15;
    font-weight: 800;
  }

  .nt-badge {
    border-radius: 999px;
    background: #dcfce7;
    color: #166534;
    font-size: 12px;
    font-weight: 800;
    padding: 5px 9px;
    white-space: nowrap;
  }

  .nt-icon-button {
    width: 30px;
    height: 30px;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    background: #ffffff;
    color: #475569;
    cursor: pointer;
    line-height: 1;
  }

  .nt-icon-button:hover {
    border-color: #94a3b8;
    background: #f8fafc;
  }

  .nt-result,
  .nt-status,
  .nt-error,
  .nt-answer,
  .nt-question,
  .nt-actions {
    margin: 14px 18px;
  }

  .nt-section-label,
  .nt-question-label {
    display: block;
    color: #334155;
    font-size: 13px;
    font-weight: 700;
    margin: 0 0 6px;
  }

  .nt-result-text {
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    background: #ffffff;
    color: #172033;
    margin: 0;
    font-size: 15px;
    line-height: 1.55;
    padding: 10px 11px;
    white-space: pre-wrap;
  }

  .nt-meta {
    margin: 8px 0 0;
    color: #64748b;
    font-size: 12px;
    line-height: 1.45;
  }

  .nt-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .nt-actions button,
  .nt-question button {
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    background: #ffffff;
    color: #172033;
    cursor: pointer;
    font-size: 12px;
    font-weight: 700;
    min-height: 34px;
    padding: 7px 11px;
  }

  .nt-actions button:hover,
  .nt-question button:hover {
    border-color: #2563eb;
    background: #eff6ff;
  }

  .nt-question {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 8px;
  }

  .nt-question-label {
    grid-column: 1 / -1;
  }

  .nt-question input {
    min-width: 0;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    color: #172033;
    background: #ffffff;
    font-size: 13px;
    min-height: 38px;
    padding: 0 10px;
  }

  .nt-question input:focus {
    border-color: #2563eb;
    outline: 2px solid rgba(37, 99, 235, 0.22);
  }

  .nt-status,
  .nt-answer {
    font-size: 13px;
    line-height: 1.45;
  }

  .nt-status {
    color: #64748b;
  }

  .nt-error {
    border: 1px solid #fecaca;
    border-radius: 6px;
    background: #fef2f2;
    color: #b42318;
    font-size: 13px;
    line-height: 1.45;
    padding: 10px 11px;
  }

  .nt-answer {
    border-top: 1px solid #e2e8f0;
    color: #172033;
    padding-top: 12px;
    white-space: pre-wrap;
  }

  .nt-speaking {
    align-self: center;
    color: #64748b;
    font-size: 12px;
  }
`;
