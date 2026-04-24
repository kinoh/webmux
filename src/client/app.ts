type BackendClientConfig = {
  id: string;
  displayName: string;
  supportsResize: boolean;
  primarySpecialKeys: string[];
  mobilePrimarySpecialKeys: string[];
  extraSpecialKeys: string[];
  specialKeyLabels: Record<string, string>;
  customKeyPlaceholder: string;
  specialKeyHint: string;
};

type PaneInfo = {
  backendId: string;
  backendDisplayName: string;
  currentCommand: string;
  label: string;
  paneId: string;
  paneIndex: string;
  paneKey: string;
  sessionName: string;
  supportsResize: boolean;
  title: string;
  windowIndex: string;
};

type ApiOptions = RequestInit & {
  body?: BodyInit | null;
};

type ConfigResponse = {
  backendConfigs: BackendClientConfig[];
};

type PanesResponse = {
  panes: PaneInfo[];
  errors?: string[];
};

type CaptureResponse = {
  content: string;
};

type LoadCaptureOptions = {
  showLoadingStatus?: boolean;
};

const MOBILE_ACTION_ORDER: Record<string, number> = {
  "C-c": 2,
  "Ctrl c": 2,
  Up: 3,
  Tab: 4,
  BSpace: 5,
  Backspace: 5,
  Left: 7,
  Down: 8,
  Right: 9,
};

const ANSI_ESCAPE = String.fromCharCode(27);
const ANSI_BELL = String.fromCharCode(7);
const ANSI_SGR_PATTERN = new RegExp(`${ANSI_ESCAPE}\\[([0-9;]*)m`, "g");
const ANSI_CONTROL_PATTERN = new RegExp(`${ANSI_ESCAPE}(?:\\[[0-?]*[ -/]*[@-~]|\\][^${ANSI_BELL}]*(?:${ANSI_BELL}|${ANSI_ESCAPE}\\\\))`, "g");
const ANSI_BASE_COLORS = ["#000000", "#800000", "#008000", "#808000", "#000080", "#800080", "#008080", "#c0c0c0", "#808080", "#ff0000", "#00ff00", "#ffff00", "#0000ff", "#ff00ff", "#00ffff", "#ffffff"];

type AnsiState = {
  bold: boolean;
  dim: boolean;
  italic: boolean;
  underline: boolean;
  inverse: boolean;
  strike: boolean;
  fg: string | null;
  bg: string | null;
};

function mustElement<T extends Element>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing element: ${id}`);
  }
  return element as unknown as T;
}

const paneListEl = mustElement<HTMLDivElement>("paneList");
const captureEl = mustElement<HTMLPreElement>("capture");
const selectedTitleEl = mustElement<HTMLDivElement>("selectedTitle");
const statusEl = mustElement<HTMLDivElement>("status");
const commandInputEl = mustElement<HTMLTextAreaElement>("commandInput");
const linesInputEl = mustElement<HTMLInputElement>("linesInput");
const sessionSelectEl = mustElement<HTMLSelectElement>("sessionSelect");
const decreaseFontSizeBtn = mustElement<HTMLButtonElement>("decreaseFontSizeBtn");
const increaseFontSizeBtn = mustElement<HTMLButtonElement>("increaseFontSizeBtn");
const fitWidthBtn = mustElement<HTMLButtonElement>("fitWidthBtn");
const refreshCaptureBtn = mustElement<HTMLButtonElement>("refreshCaptureBtn");
const sendBtn = mustElement<HTMLButtonElement>("sendBtn");
const sendEnterBtn = mustElement<HTMLButtonElement>("sendEnterBtn");
const primarySpecialKeysEl = mustElement<HTMLDivElement>("primarySpecialKeys");
const toggleSpecialKeysBtn = mustElement<HTMLButtonElement>("toggleSpecialKeysBtn");
const specialKeyPopoverEl = mustElement<HTMLDivElement>("specialKeyPopover");
const extraSpecialKeysEl = mustElement<HTMLDivElement>("extraSpecialKeys");
const customSpecialKeyFormEl = mustElement<HTMLFormElement>("customSpecialKeyForm");
const customSpecialKeyInputEl = mustElement<HTMLInputElement>("customSpecialKeyInput");
const specialKeyHintEl = mustElement<HTMLParagraphElement>("specialKeyHint");
const linesControlEl = mustElement<HTMLLabelElement>("linesControl");
const compactLayoutQuery = window.matchMedia("(max-width: 800px)");

let backendConfigs: BackendClientConfig[] = [];
let backendConfigById: Record<string, BackendClientConfig> = {};
let panes: PaneInfo[] = [];
let selectedPaneKey: string | null = null;
let selectedSessionKey = "";
let captureTimer: number | null = null;
let lastCaptureRaw = "";
let textMeasureContext: CanvasRenderingContext2D | null = null;

const CAPTURE_FONT_SIZE_KEY = "webmux.captureFontSize";
const SELECTED_PANE_KEY = "webmux.selectedPaneKey";
const SELECTED_SESSION_KEY = "webmux.selectedSessionKey";
const DEFAULT_CAPTURE_FONT_SIZE = 13;
const MIN_CAPTURE_FONT_SIZE = 11;
const MAX_CAPTURE_FONT_SIZE = 20;
const CAPTURE_FONT_SIZE_STEP = 1;

function isCompactLayout(): boolean {
  return compactLayoutQuery.matches;
}

function getSessionKeys(): string[] {
  return [...new Set(panes.map((pane) => `${pane.backendId}:${pane.sessionName}`))];
}

function getPaneSessionKey(pane: PaneInfo): string {
  return `${pane.backendId}:${pane.sessionName}`;
}

function getSessionLabel(sessionKey: string): string {
  const [backendId, ...sessionParts] = sessionKey.split(":");
  const sessionName = sessionParts.join(":");
  const backendConfig = backendConfigById[backendId];
  return backendConfig ? `${backendConfig.displayName}:${sessionName}` : sessionKey;
}

function getSelectedPane(): PaneInfo | null {
  return panes.find((pane) => pane.paneKey === selectedPaneKey) || null;
}

function getSelectedBackendConfig(): BackendClientConfig {
  const pane = getSelectedPane();
  if (!pane) {
    return backendConfigs[0];
  }
  return backendConfigById[pane.backendId] || backendConfigs[0];
}

function getStoredString(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function setStoredString(key: string, value: string | null): void {
  try {
    if (value === null) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // Ignore storage errors and keep the in-memory selection.
  }
}

function restoreStoredSelection(): void {
  selectedPaneKey = getStoredString(SELECTED_PANE_KEY);
  selectedSessionKey = getStoredString(SELECTED_SESSION_KEY) || "";
}

function persistSelection(): void {
  setStoredString(SELECTED_PANE_KEY, selectedPaneKey);
  setStoredString(SELECTED_SESSION_KEY, selectedSessionKey || null);
}

function syncSelectedSession(): void {
  const pane = getSelectedPane();
  const sessionKeys = getSessionKeys();

  if (pane) {
    selectedSessionKey = getPaneSessionKey(pane);
    return;
  }

  if (sessionKeys.includes(selectedSessionKey)) {
    return;
  }

  selectedSessionKey = sessionKeys[0] || "";
}

function renderSessionOptions(): void {
  const sessionKeys = getSessionKeys();
  syncSelectedSession();
  sessionSelectEl.innerHTML = sessionKeys
    .map((sessionKey) => `<option value="${escapeHtml(sessionKey)}">${escapeHtml(getSessionLabel(sessionKey))}</option>`)
    .join("");
  sessionSelectEl.value = selectedSessionKey;
}

function getVisiblePanes(): PaneInfo[] {
  if (!isCompactLayout()) {
    return panes;
  }
  return panes.filter((pane) => getPaneSessionKey(pane) === selectedSessionKey);
}

function setStatus(message: string, isError = false): void {
  statusEl.textContent = message;
  statusEl.className = `status${isError ? " error" : ""}`;
}

function clampCaptureFontSize(value: number): number {
  return Math.min(MAX_CAPTURE_FONT_SIZE, Math.max(MIN_CAPTURE_FONT_SIZE, value));
}

function updateCaptureFontButtons(fontSize: number): void {
  decreaseFontSizeBtn.disabled = fontSize <= MIN_CAPTURE_FONT_SIZE;
  increaseFontSizeBtn.disabled = fontSize >= MAX_CAPTURE_FONT_SIZE;
}

function getStoredCaptureFontSize(): number {
  try {
    const storedValue = window.localStorage.getItem(CAPTURE_FONT_SIZE_KEY);
    const parsedValue = storedValue ? Number.parseInt(storedValue, 10) : Number.NaN;
    if (Number.isFinite(parsedValue)) {
      return clampCaptureFontSize(parsedValue);
    }
  } catch {
    // Ignore storage errors and fall back to the default size.
  }
  return DEFAULT_CAPTURE_FONT_SIZE;
}

function getCurrentCaptureFontSize(): number {
  const rawValue = document.documentElement.style.getPropertyValue("--capture-font-size").trim();
  const parsedValue = rawValue.endsWith("px") ? Number.parseFloat(rawValue) : Number.NaN;
  if (Number.isFinite(parsedValue)) {
    return clampCaptureFontSize(parsedValue);
  }
  return getStoredCaptureFontSize();
}

function setCaptureFontSize(fontSize: number): void {
  const nextFontSize = clampCaptureFontSize(fontSize);
  document.documentElement.style.setProperty("--capture-font-size", `${nextFontSize}px`);
  updateCaptureFontButtons(nextFontSize);
  try {
    window.localStorage.setItem(CAPTURE_FONT_SIZE_KEY, String(nextFontSize));
  } catch {
    // Ignore storage errors and keep the in-memory font size.
  }
}

function adjustCaptureFontSize(delta: number): void {
  setCaptureFontSize(getCurrentCaptureFontSize() + delta);
}

function getSpecialKeyLabel(key: string): string {
  const backendConfig = getSelectedBackendConfig();
  return backendConfig?.specialKeyLabels[key] || key;
}

function setSpecialKeyPopoverOpen(isOpen: boolean): void {
  specialKeyPopoverEl.hidden = !isOpen;
  toggleSpecialKeysBtn.setAttribute("aria-expanded", String(isOpen));
}

function renderSpecialKeyButtons(container: HTMLDivElement, keys: string[]): void {
  container.innerHTML = keys
    .map((key) => `<button type="button" data-special-key="${escapeHtml(key)}">${escapeHtml(getSpecialKeyLabel(key))}</button>`)
    .join("");

  for (const buttonEl of container.querySelectorAll<HTMLButtonElement>("[data-special-key]")) {
    if (isCompactLayout() && MOBILE_ACTION_ORDER[buttonEl.dataset.specialKey || ""]) {
      buttonEl.style.order = String(MOBILE_ACTION_ORDER[buttonEl.dataset.specialKey || ""]);
    } else {
      buttonEl.style.removeProperty("order");
    }
    buttonEl.addEventListener("click", async () => {
      const key = buttonEl.dataset.specialKey || "";
      await sendSpecialKey(key, getSpecialKeyLabel(key));
    });
  }
}

function renderActionButtons(): void {
  const backendConfig = getSelectedBackendConfig();
  const keys = isCompactLayout() ? backendConfig.mobilePrimarySpecialKeys : backendConfig.primarySpecialKeys;
  renderSpecialKeyButtons(primarySpecialKeysEl, keys);
  renderSpecialKeyButtons(extraSpecialKeysEl, backendConfig.extraSpecialKeys);
  customSpecialKeyInputEl.placeholder = backendConfig.customKeyPlaceholder;
  specialKeyHintEl.textContent = backendConfig.specialKeyHint;
  const canResize = Boolean(getSelectedPane()?.supportsResize);
  fitWidthBtn.hidden = !canResize;
  linesControlEl.hidden = getSelectedPane()?.backendId === "zellij";
}

function escapeHtml(text: string): string {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function createAnsiState(): AnsiState {
  return {
    bold: false,
    dim: false,
    italic: false,
    underline: false,
    inverse: false,
    strike: false,
    fg: null,
    bg: null,
  };
}

function resetAnsiState(state: AnsiState): void {
  Object.assign(state, createAnsiState());
}

function paletteColor(index: number): string | null {
  if (index < 0 || index > 255) {
    return null;
  }

  if (index < 16) {
    return ANSI_BASE_COLORS[index];
  }

  if (index < 232) {
    const offset = index - 16;
    const red = Math.floor(offset / 36);
    const green = Math.floor((offset % 36) / 6);
    const blue = offset % 6;
    const steps = [0, 95, 135, 175, 215, 255];
    return `rgb(${steps[red]}, ${steps[green]}, ${steps[blue]})`;
  }

  const value = 8 + ((index - 232) * 10);
  return `rgb(${value}, ${value}, ${value})`;
}

function readExtendedColor(codes: number[], index: number): { color: string | null; nextIndex: number } {
  const mode = codes[index + 1];
  if (mode === 5 && Number.isInteger(codes[index + 2])) {
    return { color: paletteColor(codes[index + 2]), nextIndex: index + 2 };
  }
  if (mode === 2 && Number.isInteger(codes[index + 2]) && Number.isInteger(codes[index + 3]) && Number.isInteger(codes[index + 4])) {
    const red = Math.max(0, Math.min(255, codes[index + 2]));
    const green = Math.max(0, Math.min(255, codes[index + 3]));
    const blue = Math.max(0, Math.min(255, codes[index + 4]));
    return { color: `rgb(${red}, ${green}, ${blue})`, nextIndex: index + 4 };
  }
  return { color: null, nextIndex: index };
}

function applyAnsiCodes(state: AnsiState, rawCodes: string[]): void {
  const codes = rawCodes.length === 0
    ? [0]
    : rawCodes.map((code) => (code === "" ? 0 : Number(code))).filter(Number.isFinite);

  if (codes.length === 0) {
    resetAnsiState(state);
    return;
  }

  for (let index = 0; index < codes.length; index += 1) {
    const code = codes[index];
    if (code === 0) {
      resetAnsiState(state);
    } else if (code === 1) {
      state.bold = true;
    } else if (code === 2) {
      state.dim = true;
    } else if (code === 3) {
      state.italic = true;
    } else if (code === 4) {
      state.underline = true;
    } else if (code === 7) {
      state.inverse = true;
    } else if (code === 9) {
      state.strike = true;
    } else if (code === 22) {
      state.bold = false;
      state.dim = false;
    } else if (code === 23) {
      state.italic = false;
    } else if (code === 24) {
      state.underline = false;
    } else if (code === 27) {
      state.inverse = false;
    } else if (code === 29) {
      state.strike = false;
    } else if (code >= 30 && code <= 37) {
      state.fg = ANSI_BASE_COLORS[code - 30];
    } else if (code === 39) {
      state.fg = null;
    } else if (code >= 40 && code <= 47) {
      state.bg = ANSI_BASE_COLORS[code - 40];
    } else if (code === 49) {
      state.bg = null;
    } else if (code >= 90 && code <= 97) {
      state.fg = ANSI_BASE_COLORS[code - 90 + 8];
    } else if (code >= 100 && code <= 107) {
      state.bg = ANSI_BASE_COLORS[code - 100 + 8];
    } else if (code === 38 || code === 48) {
      const target = code === 38 ? "fg" : "bg";
      const { color, nextIndex } = readExtendedColor(codes, index);
      if (color) {
        state[target] = color;
      }
      index = nextIndex;
    }
  }
}

function buildAnsiStyle(state: AnsiState): string {
  let foreground = state.fg;
  let background = state.bg;

  if (state.inverse) {
    foreground = state.bg || "var(--ansi-default-bg)";
    background = state.fg || "var(--ansi-default-fg)";
  }

  const declarations: string[] = [];
  if (foreground) declarations.push(`color:${foreground}`);
  if (background) declarations.push(`background-color:${background}`);
  if (state.bold) declarations.push("font-weight:700");
  if (state.dim) declarations.push("opacity:0.75");
  if (state.italic) declarations.push("font-style:italic");

  const decorations: string[] = [];
  if (state.underline) decorations.push("underline");
  if (state.strike) decorations.push("line-through");
  if (decorations.length > 0) declarations.push(`text-decoration:${decorations.join(" ")}`);

  return declarations.join(";");
}

function renderAnsiToHtml(text: string): string {
  const state = createAnsiState();
  let html = "";
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = ANSI_SGR_PATTERN.exec(text)) !== null) {
    const chunk = text.slice(lastIndex, match.index).replaceAll(ANSI_CONTROL_PATTERN, "");
    if (chunk.length > 0) {
      const escapedChunk = escapeHtml(chunk);
      const style = buildAnsiStyle(state);
      html += style ? `<span style="${style}">${escapedChunk}</span>` : escapedChunk;
    }
    applyAnsiCodes(state, match[1] ? match[1].split(";") : []);
    lastIndex = ANSI_SGR_PATTERN.lastIndex;
  }

  const tail = text.slice(lastIndex).replaceAll(ANSI_CONTROL_PATTERN, "");
  if (tail.length > 0) {
    const escapedTail = escapeHtml(tail);
    const style = buildAnsiStyle(state);
    html += style ? `<span style="${style}">${escapedTail}</span>` : escapedTail;
  }

  return html;
}

function getTextMeasureContext(): CanvasRenderingContext2D | null {
  if (!textMeasureContext) {
    textMeasureContext = document.createElement("canvas").getContext("2d");
  }
  return textMeasureContext;
}

function buildCanvasFont(style: CSSStyleDeclaration): string {
  return [style.fontStyle, style.fontVariant, style.fontWeight, style.fontSize, style.fontFamily].filter(Boolean).join(" ");
}

function getCaptureColumnCount(): number | null {
  const style = window.getComputedStyle(captureEl);
  const horizontalPadding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  const availableWidth = captureEl.clientWidth - horizontalPadding;
  if (availableWidth <= 0) {
    return null;
  }
  const context = getTextMeasureContext();
  if (!context) {
    return null;
  }
  context.font = buildCanvasFont(style);
  const charWidth = context.measureText("0").width;
  if (!(charWidth > 0)) {
    return null;
  }
  return Math.max(20, Math.floor(availableWidth / charWidth));
}

function renderPanes(): void {
  renderSessionOptions();
  renderActionButtons();
  paneListEl.innerHTML = getVisiblePanes()
    .map((pane) => {
      const active = pane.paneKey === selectedPaneKey ? "active" : "";
      const title = pane.title || "(no title)";
      const command = pane.currentCommand || "";
      const tooltip = [pane.backendDisplayName, pane.label, pane.paneId, title, command].filter(Boolean).join(" / ");
      const compactLabel = `${pane.windowIndex}.${pane.paneIndex}`;
      const label = isCompactLayout() ? compactLabel : `${pane.backendDisplayName}:${pane.label}`;
      return `<div class="pane-item ${active}" data-pane-key="${escapeHtml(pane.paneKey)}" title="${escapeHtml(tooltip)}"><div class="line1">${escapeHtml(label)}</div><div class="line2">${escapeHtml(title)} / ${escapeHtml(command)}</div></div>`;
    })
    .join("");

  for (const el of paneListEl.querySelectorAll<HTMLDivElement>(".pane-item")) {
    el.addEventListener("click", async () => {
      selectedPaneKey = el.dataset.paneKey || null;
      syncSelectedSession();
      persistSelection();
      renderPanes();
      await loadCapture();
    });
  }
}

async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
  }
  return data as T;
}

async function loadConfig(): Promise<void> {
  const data = await api<ConfigResponse>("/api/config");
  backendConfigs = data.backendConfigs;
  backendConfigById = Object.fromEntries(backendConfigs.map((config) => [config.id, config]));
}

async function loadPanes(): Promise<void> {
  try {
    const data = await api<PanesResponse>("/api/panes");
    panes = data.panes;
    if (!selectedPaneKey || !panes.some((pane) => pane.paneKey === selectedPaneKey)) {
      const sessionPane = panes.find((pane) => getPaneSessionKey(pane) === selectedSessionKey);
      selectedPaneKey = sessionPane?.paneKey || panes[0]?.paneKey || null;
    }
    syncSelectedSession();
    if (selectedPaneKey) {
      persistSelection();
    }
    renderPanes();
    if (selectedPaneKey) {
      await loadCapture();
    } else {
      selectedTitleEl.textContent = "No pane found";
      captureEl.innerHTML = "";
      lastCaptureRaw = "";
      setStatus(data.errors?.length ? data.errors.join(" | ") : "No panes available");
    }
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  }
}

async function loadCapture(options: LoadCaptureOptions = {}): Promise<void> {
  if (!selectedPaneKey) return;
  const { showLoadingStatus = false } = options;
  try {
    const lines = Math.max(1, Math.min(5000, Number(linesInputEl.value) || 300));
    const pane = getSelectedPane();
    selectedTitleEl.textContent = pane
      ? `[${pane.backendDisplayName}] ${pane.label} ${pane.paneId} / ${pane.title || "(no title)"}`
      : selectedPaneKey;
    if (showLoadingStatus) {
      setStatus("Loading capture...");
    }
    const backendQuery = pane?.backendId ? `&backendId=${encodeURIComponent(pane.backendId)}` : "";
    const sessionQuery = pane?.sessionName ? `&sessionName=${encodeURIComponent(pane.sessionName)}` : "";
    const data = await api<CaptureResponse>(`/api/capture?paneId=${encodeURIComponent(pane?.paneId || "")}&lines=${lines}${backendQuery}${sessionQuery}`);
    if (lastCaptureRaw !== data.content) {
      captureEl.innerHTML = renderAnsiToHtml(data.content);
      lastCaptureRaw = data.content;
    }
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  }
}

async function sendInput(withEnter: boolean): Promise<void> {
  if (!selectedPaneKey) {
    setStatus("Select a pane", true);
    return;
  }
  try {
    const text = commandInputEl.value;
    const pane = getSelectedPane();
    await api("/api/send", {
      method: "POST",
      body: JSON.stringify({
        backendId: pane?.backendId || "",
        paneId: pane?.paneId || "",
        sessionName: pane?.sessionName || "",
        text,
        enter: withEnter,
      }),
    });
    commandInputEl.value = "";
    await loadCapture();
    setStatus("Sent");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  }
}

async function sendSpecialKey(key: string, label: string): Promise<void> {
  if (!selectedPaneKey) {
    setStatus("Select a pane", true);
    return;
  }
  try {
    const pane = getSelectedPane();
    await api("/api/send-key", {
      method: "POST",
      body: JSON.stringify({
        backendId: pane?.backendId || "",
        paneId: pane?.paneId || "",
        sessionName: pane?.sessionName || "",
        key,
      }),
    });
    customSpecialKeyInputEl.value = "";
    setSpecialKeyPopoverOpen(false);
    await loadCapture();
    setStatus(`Sent ${label}`);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  }
}

async function fitPaneWidthToCapture(): Promise<void> {
  if (!selectedPaneKey) {
    setStatus("Select a pane", true);
    return;
  }

  const columns = getCaptureColumnCount();
  if (!columns) {
    setStatus("Could not measure the visible width", true);
    return;
  }

  try {
    setStatus("Resizing pane width...");
    const pane = getSelectedPane();
    await api("/api/resize-pane", {
      method: "POST",
      body: JSON.stringify({
        backendId: pane?.backendId || "",
        paneId: pane?.paneId || "",
        sessionName: pane?.sessionName || "",
        columns,
      }),
    });
    await loadCapture();
    setStatus(`Pane width set to ${columns} columns`);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  }
}

refreshCaptureBtn.addEventListener("click", () => {
  void loadCapture({ showLoadingStatus: true });
});

fitWidthBtn.addEventListener("click", () => {
  void fitPaneWidthToCapture();
});

decreaseFontSizeBtn.addEventListener("click", () => {
  adjustCaptureFontSize(-CAPTURE_FONT_SIZE_STEP);
});

increaseFontSizeBtn.addEventListener("click", () => {
  adjustCaptureFontSize(CAPTURE_FONT_SIZE_STEP);
});

sessionSelectEl.addEventListener("change", async () => {
  selectedSessionKey = sessionSelectEl.value;
  const sessionPanes = panes.filter((pane) => getPaneSessionKey(pane) === selectedSessionKey);
  if (!sessionPanes.some((pane) => pane.paneKey === selectedPaneKey)) {
    selectedPaneKey = sessionPanes[0]?.paneKey || null;
  }
  persistSelection();
  renderPanes();
  if (selectedPaneKey) {
    await loadCapture();
  }
});

sendBtn.addEventListener("click", () => {
  void sendInput(false);
});

sendEnterBtn.addEventListener("click", () => {
  void sendInput(true);
});

toggleSpecialKeysBtn.addEventListener("click", () => {
  setSpecialKeyPopoverOpen(Boolean(specialKeyPopoverEl.hidden));
  if (!specialKeyPopoverEl.hidden) {
    customSpecialKeyInputEl.focus();
  }
});

customSpecialKeyFormEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  const key = customSpecialKeyInputEl.value.trim();
  if (!key) {
    setStatus(`Enter a ${getSelectedBackendConfig().displayName} key name`, true);
    return;
  }
  await sendSpecialKey(key, key);
});

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!specialKeyPopoverEl.hidden && target instanceof Element && !target.closest(".special-key-popover-wrap")) {
    setSpecialKeyPopoverOpen(false);
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !specialKeyPopoverEl.hidden) {
    setSpecialKeyPopoverOpen(false);
  }
});

linesInputEl.addEventListener("change", () => {
  void loadCapture({ showLoadingStatus: true });
});

const handleLayoutChange = () => {
  renderPanes();
  renderActionButtons();
};

if (typeof compactLayoutQuery.addEventListener === "function") {
  compactLayoutQuery.addEventListener("change", handleLayoutChange);
} else {
  compactLayoutQuery.addListener(handleLayoutChange);
}

async function start(): Promise<void> {
  setCaptureFontSize(getStoredCaptureFontSize());
  restoreStoredSelection();
  await loadConfig();
  await loadPanes();
  if (captureTimer !== null) {
    window.clearInterval(captureTimer);
  }
  captureTimer = window.setInterval(() => {
    void loadCapture();
  }, 1000);
}

start().catch((error) => {
  setStatus(error instanceof Error ? error.message : String(error), true);
});
