#!/usr/bin/env node

const express = require("express");
const { execFile } = require("child_process");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 5010;
const ENTER_DELAY_MS = 10;
const SPECIAL_KEY_LABELS = {
  "C-c": "Ctrl+C",
  "C-d": "Ctrl+D",
  "C-l": "Ctrl+L",
  "C-z": "Ctrl+Z",
  Escape: "Esc",
  Up: "Up",
  Down: "Down",
  Left: "Left",
  Right: "Right",
  Tab: "Tab",
  BSpace: "Backspace",
  DC: "Delete",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
};
const PRIMARY_SPECIAL_KEYS = [
  "Tab",
  "BSpace",
  "DC",
  "Up",
  "Down",
  "Left",
  "Right",
  "C-c",
  "Escape",
];
const MOBILE_PRIMARY_SPECIAL_KEYS = [
  "C-c",
  "Up",
  "Tab",
  "BSpace",
  "Left",
  "Down",
  "Right",
];
const MOBILE_ACTION_ORDER = {
  "C-c": 2,
  Up: 3,
  Tab: 4,
  BSpace: 5,
  Left: 7,
  Down: 8,
  Right: 9,
};
const EXTRA_SPECIAL_KEYS = [
  "DC",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "C-d",
  "C-z",
  "C-l",
];

app.use(express.json({ limit: "64kb" }));

function runTmux(args) {
  return new Promise((resolve, reject) => {
    execFile("tmux", args, { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        const msg = stderr?.trim() || error.message || "tmux command failed";
        reject(new Error(msg));
        return;
      }
      resolve(stdout);
    });
  });
}

function isValidPaneId(paneId) {
  return typeof paneId === "string" && /^%[0-9]+$/.test(paneId);
}

function isValidTmuxKeyName(key) {
  return typeof key === "string" && /^[!-~]{1,64}$/.test(key);
}

function getSpecialKeyLabel(key) {
  return SPECIAL_KEY_LABELS[key] || key;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendEnterKey(paneId, shouldDelayBefore = false) {
  if (shouldDelayBefore) {
    await sleep(ENTER_DELAY_MS);
  }
  await runTmux(["send-keys", "-t", paneId, "Enter"]);
}

async function sendTextToPane(paneId, text) {
  const normalizedText = text.replace(/\r\n?/g, "\n");
  const lines = normalizedText.split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const hasNextLine = index < lines.length - 1;

    if (line.length > 0) {
      await runTmux(["send-keys", "-t", paneId, "-l", line]);
    }

    if (hasNextLine) {
      await sendEnterKey(paneId, line.length > 0);
    }
  }
}

function clampPaneWidth(columns) {
  return Math.max(20, Math.min(2000, columns));
}

app.get("/", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>tmux mini web UI</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0f1115;
      --panel: #171a21;
      --panel2: #1f2430;
      --border: #2d3445;
      --text: #e6e9ef;
      --muted: #9aa4b2;
      --accent: #78a6ff;
      --danger: #ff7b7b;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100dvh;
      display: grid;
      grid-template-columns: 320px 1fr;
    }
    .sidebar {
      border-right: 1px solid var(--border);
      background: var(--panel);
      overflow: auto;
    }
    .main {
      display: grid;
      grid-template-rows: 1fr auto;
      min-width: 0;
      min-height: 0;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px;
      border-bottom: 1px solid var(--border);
      background: var(--panel);
      gap: 12px;
    }
    .title {
      font-size: 14px;
      color: var(--muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .toolbar {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
    }
    .session-picker {
      display: none;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: var(--muted);
    }
    button {
      background: var(--panel2);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 8px 12px;
      cursor: pointer;
    }
    button:hover { border-color: var(--accent); }
    .pane-list {
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .pane-item {
      padding: 10px 12px;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: var(--panel2);
      cursor: pointer;
      min-width: 0;
    }
    .pane-item.active {
      border-color: var(--accent);
      outline: 1px solid var(--accent);
    }
    .pane-item .line1 {
      font-weight: 700;
      margin-bottom: 4px;
      word-break: break-all;
    }
    .pane-item .line2 {
      font-size: 12px;
      color: var(--muted);
      word-break: break-all;
    }
    .capture-wrap {
      min-height: 0;
      display: flex;
      flex-direction: column;
    }
    pre {
      margin: 0;
      padding: 14px;
      overflow: auto;
      white-space: pre-wrap;
      word-break: break-word;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 13px;
      line-height: 1.45;
      flex: 1;
      background: var(--bg);
      --ansi-default-fg: var(--text);
      --ansi-default-bg: var(--bg);
    }
    .inputbar {
      display: grid;
      grid-template-columns: 1fr;
      gap: 8px;
      padding: 12px;
      border-top: 1px solid var(--border);
      background: var(--panel);
    }
    .command-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }
    .command-actions button {
      min-width: 72px;
    }
    .special-key-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }
    .special-key-popover-wrap {
      position: relative;
    }
    .special-key-popover {
      position: absolute;
      right: 0;
      bottom: calc(100% + 8px);
      width: min(360px, calc(100vw - 24px));
      padding: 12px;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: var(--panel);
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
      display: grid;
      gap: 10px;
      z-index: 20;
    }
    .special-key-popover[hidden] {
      display: none;
    }
    .special-key-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
    }
    .special-key-grid button {
      width: 100%;
      min-width: 0;
    }
    .special-key-custom {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 8px;
      align-items: center;
    }
    .special-key-hint {
      margin: 0;
      font-size: 12px;
      color: var(--muted);
    }
    input[type="text"],
    select,
    textarea {
      width: 100%;
      background: var(--panel2);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 10px 12px;
      outline: none;
    }
    textarea {
      min-height: 96px;
      resize: vertical;
      font: inherit;
    }
    input[type="text"]:focus,
    select:focus,
    textarea:focus {
      border-color: var(--accent);
    }
    .status {
      padding: 8px 12px;
      font-size: 12px;
      color: var(--muted);
      border-top: 1px solid var(--border);
      background: var(--panel);
    }
    .error { color: var(--danger); }
    @media (max-width: 800px) {
      body {
        grid-template-columns: 1fr;
        grid-template-rows: auto 1fr;
      }
      .sidebar {
        position: sticky;
        top: 0;
        z-index: 10;
        border-right: 0;
        border-bottom: 1px solid var(--border);
        overflow: visible;
      }
      .sidebar .header {
        align-items: flex-start;
        flex-wrap: wrap;
        padding-bottom: 8px;
      }
      .sidebar .title {
        width: auto;
        white-space: nowrap;
      }
      .session-picker {
        display: inline-flex;
        width: 100%;
      }
      .session-picker select {
        flex: 1;
        min-width: 0;
      }
      .pane-list {
        padding: 0 12px 10px;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(72px, 1fr));
        gap: 6px;
      }
      .pane-item {
        padding: 8px 12px;
        border-radius: 10px;
        text-align: center;
      }
      .pane-item .line1 {
        margin-bottom: 0;
        font-size: 12px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .pane-item .line2 {
        display: none;
      }
      .main .header {
        align-items: flex-start;
        flex-wrap: wrap;
      }
      .main .title {
        width: 100%;
        white-space: normal;
      }
      .inputbar {
        grid-template-columns: 1fr;
      }
      .command-actions {
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        position: relative;
      }
      .command-actions button {
        width: 100%;
        min-width: 0;
      }
      #sendBtn {
        order: 1;
      }
      #sendEnterBtn {
        order: 6;
      }
      .special-key-row {
        display: contents;
      }
      .special-key-popover-wrap {
        position: static;
        order: 10;
      }
      .special-key-popover {
        left: 0;
        right: 0;
        width: auto;
        max-width: none;
      }
    }
    @media (max-width: 480px) {
      .header,
      .inputbar,
      pre,
      .status {
        padding-left: 10px;
        padding-right: 10px;
      }
      .pane-list {
        padding-left: 10px;
        padding-right: 10px;
      }
      button,
      input[type="text"],
      select,
      textarea {
        min-height: 42px;
      }
      textarea {
        min-height: 96px;
      }
      #linesInput {
        width: 64px !important;
      }
    }
  </style>
</head>
<body>
  <aside class="sidebar">
    <div class="header">
      <div class="title">tmux panes</div>
      <div class="toolbar">
        <label class="session-picker">
          <span>session</span>
          <select id="sessionSelect"></select>
        </label>
      </div>
    </div>
    <div id="paneList" class="pane-list"></div>
  </aside>

  <main class="main">
    <section class="capture-wrap">
      <div class="header">
        <div id="selectedTitle" class="title">paneを選んでね</div>
        <div class="toolbar">
          <label style="font-size:12px;color:var(--muted);display:flex;gap:6px;align-items:center;">
            行数
            <input id="linesInput" type="text" value="300" style="width:72px;" />
          </label>
          <button id="fitWidthBtn">幅合わせ</button>
          <button id="refreshCaptureBtn">再読込</button>
        </div>
      </div>
      <pre id="capture"></pre>
      <div id="status" class="status">ready</div>
    </section>

    <section class="inputbar">
      <textarea id="commandInput" placeholder="送信する文字列を入力"></textarea>
      <div class="command-actions">
        <button id="sendBtn">送信</button>
        <button id="sendEnterBtn">Enter</button>
        <div id="primarySpecialKeys" class="special-key-row"></div>
        <div class="special-key-popover-wrap">
          <button id="toggleSpecialKeysBtn" type="button" aria-expanded="false" aria-controls="specialKeyPopover">More</button>
          <div id="specialKeyPopover" class="special-key-popover" hidden>
            <div id="extraSpecialKeys" class="special-key-grid"></div>
            <form id="customSpecialKeyForm" class="special-key-custom">
              <input id="customSpecialKeyInput" type="text" placeholder="tmux key name" spellcheck="false" />
              <button type="submit">Send key</button>
            </form>
            <p class="special-key-hint">Use tmux key notation like F1, M-Left, C-b, NPage.</p>
          </div>
        </div>
      </div>
    </section>
  </main>

  <script>
    const paneListEl = document.getElementById("paneList");
    const captureEl = document.getElementById("capture");
    const selectedTitleEl = document.getElementById("selectedTitle");
    const statusEl = document.getElementById("status");
    const commandInputEl = document.getElementById("commandInput");
    const linesInputEl = document.getElementById("linesInput");
    const sessionSelectEl = document.getElementById("sessionSelect");

    const fitWidthBtn = document.getElementById("fitWidthBtn");
    const refreshCaptureBtn = document.getElementById("refreshCaptureBtn");
    const sendBtn = document.getElementById("sendBtn");
    const sendEnterBtn = document.getElementById("sendEnterBtn");
    const primarySpecialKeysEl = document.getElementById("primarySpecialKeys");
    const toggleSpecialKeysBtn = document.getElementById("toggleSpecialKeysBtn");
    const specialKeyPopoverEl = document.getElementById("specialKeyPopover");
    const extraSpecialKeysEl = document.getElementById("extraSpecialKeys");
    const customSpecialKeyFormEl = document.getElementById("customSpecialKeyForm");
    const customSpecialKeyInputEl = document.getElementById("customSpecialKeyInput");
    const compactLayoutQuery = window.matchMedia("(max-width: 800px)");
    const primarySpecialKeys = ${JSON.stringify(PRIMARY_SPECIAL_KEYS)};
    const mobilePrimarySpecialKeys = ${JSON.stringify(MOBILE_PRIMARY_SPECIAL_KEYS)};
    const mobileActionOrder = ${JSON.stringify(MOBILE_ACTION_ORDER)};
    const extraSpecialKeys = ${JSON.stringify(EXTRA_SPECIAL_KEYS)};
    const specialKeyLabels = ${JSON.stringify(SPECIAL_KEY_LABELS)};
    const ANSI_ESCAPE = String.fromCharCode(27);
    const ANSI_BELL = String.fromCharCode(7);
    const ANSI_SGR_PATTERN = new RegExp(ANSI_ESCAPE + "\\\\[([0-9;]*)m", "g");
    const ANSI_CONTROL_PATTERN = new RegExp(
      ANSI_ESCAPE + "(?:\\\\[[0-?]*[ -/]*[@-~]|\\\\][^" + ANSI_BELL + "]*(?:" + ANSI_BELL + "|" + ANSI_ESCAPE + "\\\\\\\\))",
      "g"
    );
    const ANSI_BASE_COLORS = [
      "#000000",
      "#800000",
      "#008000",
      "#808000",
      "#000080",
      "#800080",
      "#008080",
      "#c0c0c0",
      "#808080",
      "#ff0000",
      "#00ff00",
      "#ffff00",
      "#0000ff",
      "#ff00ff",
      "#00ffff",
      "#ffffff",
    ];

    let panes = [];
    let selectedPaneId = null;
    let selectedSessionName = "";
    let captureTimer = null;
    let lastCaptureRaw = "";
    let textMeasureContext = null;

    function isCompactLayout() {
      return compactLayoutQuery.matches;
    }

    function getSessionNames() {
      return [...new Set(panes.map((pane) => pane.sessionName))];
    }

    function syncSelectedSession() {
      const pane = panes.find((item) => item.paneId === selectedPaneId);
      const sessionNames = getSessionNames();

      if (pane) {
        selectedSessionName = pane.sessionName;
        return;
      }

      if (sessionNames.includes(selectedSessionName)) {
        return;
      }

      selectedSessionName = sessionNames[0] || "";
    }

    function renderSessionOptions() {
      const sessionNames = getSessionNames();
      syncSelectedSession();
      sessionSelectEl.innerHTML = sessionNames.map((sessionName) => (
        \`<option value="\${escapeHtml(sessionName)}">\${escapeHtml(sessionName)}</option>\`
      )).join("");
      sessionSelectEl.value = selectedSessionName;
    }

    function getVisiblePanes() {
      if (!isCompactLayout()) {
        return panes;
      }
      return panes.filter((pane) => pane.sessionName === selectedSessionName);
    }

    function setStatus(message, isError = false) {
      statusEl.textContent = message;
      statusEl.className = "status" + (isError ? " error" : "");
    }

    function getSpecialKeyLabel(key) {
      return specialKeyLabels[key] || key;
    }

    function setSpecialKeyPopoverOpen(isOpen) {
      specialKeyPopoverEl.hidden = !isOpen;
      toggleSpecialKeysBtn.setAttribute("aria-expanded", String(isOpen));
    }

    function renderSpecialKeyButtons(container, keys) {
      container.innerHTML = keys.map((key) => (
        \`<button type="button" data-special-key="\${escapeHtml(key)}">\${escapeHtml(getSpecialKeyLabel(key))}</button>\`
      )).join("");

      for (const buttonEl of container.querySelectorAll("[data-special-key]")) {
        if (isCompactLayout() && mobileActionOrder[buttonEl.dataset.specialKey]) {
          buttonEl.style.order = String(mobileActionOrder[buttonEl.dataset.specialKey]);
        } else {
          buttonEl.style.removeProperty("order");
        }
        buttonEl.addEventListener("click", async () => {
          await sendSpecialKey(buttonEl.dataset.specialKey, getSpecialKeyLabel(buttonEl.dataset.specialKey));
        });
      }
    }

    function renderActionButtons() {
      const keys = isCompactLayout() ? mobilePrimarySpecialKeys : primarySpecialKeys;
      renderSpecialKeyButtons(primarySpecialKeysEl, keys);
    }

    function escapeHtml(text) {
      return text
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
    }

    function createAnsiState() {
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

    function resetAnsiState(state) {
      Object.assign(state, createAnsiState());
    }

    function paletteColor(index) {
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
        return \`rgb(\${steps[red]}, \${steps[green]}, \${steps[blue]})\`;
      }

      const value = 8 + ((index - 232) * 10);
      return \`rgb(\${value}, \${value}, \${value})\`;
    }

    function readExtendedColor(codes, index) {
      const mode = codes[index + 1];

      if (mode === 5 && Number.isInteger(codes[index + 2])) {
        return {
          color: paletteColor(codes[index + 2]),
          nextIndex: index + 2,
        };
      }

      if (
        mode === 2 &&
        Number.isInteger(codes[index + 2]) &&
        Number.isInteger(codes[index + 3]) &&
        Number.isInteger(codes[index + 4])
      ) {
        const red = Math.max(0, Math.min(255, codes[index + 2]));
        const green = Math.max(0, Math.min(255, codes[index + 3]));
        const blue = Math.max(0, Math.min(255, codes[index + 4]));
        return {
          color: \`rgb(\${red}, \${green}, \${blue})\`,
          nextIndex: index + 4,
        };
      }

      return {
        color: null,
        nextIndex: index,
      };
    }

    function applyAnsiCodes(state, rawCodes) {
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

    function buildAnsiStyle(state) {
      let foreground = state.fg;
      let background = state.bg;

      if (state.inverse) {
        foreground = state.bg || "var(--ansi-default-bg)";
        background = state.fg || "var(--ansi-default-fg)";
      }

      const declarations = [];

      if (foreground) {
        declarations.push(\`color:\${foreground}\`);
      }
      if (background) {
        declarations.push(\`background-color:\${background}\`);
      }
      if (state.bold) {
        declarations.push("font-weight:700");
      }
      if (state.dim) {
        declarations.push("opacity:0.75");
      }
      if (state.italic) {
        declarations.push("font-style:italic");
      }

      const decorations = [];
      if (state.underline) {
        decorations.push("underline");
      }
      if (state.strike) {
        decorations.push("line-through");
      }
      if (decorations.length > 0) {
        declarations.push(\`text-decoration:\${decorations.join(" ")}\`);
      }

      return declarations.join(";");
    }

    function renderAnsiToHtml(text) {
      const state = createAnsiState();
      let html = "";
      let lastIndex = 0;
      let match;

      while ((match = ANSI_SGR_PATTERN.exec(text)) !== null) {
        const chunk = text
          .slice(lastIndex, match.index)
          .replaceAll(ANSI_CONTROL_PATTERN, "");
        if (chunk.length > 0) {
          const escapedChunk = escapeHtml(chunk);
          const style = buildAnsiStyle(state);
          html += style
            ? \`<span style="\${style}">\${escapedChunk}</span>\`
            : escapedChunk;
        }

        applyAnsiCodes(state, match[1] ? match[1].split(";") : []);
        lastIndex = ANSI_SGR_PATTERN.lastIndex;
      }

      const tail = text.slice(lastIndex).replaceAll(ANSI_CONTROL_PATTERN, "");
      if (tail.length > 0) {
        const escapedTail = escapeHtml(tail);
        const style = buildAnsiStyle(state);
        html += style
          ? \`<span style="\${style}">\${escapedTail}</span>\`
          : escapedTail;
      }

      return html;
    }

    function getTextMeasureContext() {
      if (!textMeasureContext) {
        textMeasureContext = document.createElement("canvas").getContext("2d");
      }
      return textMeasureContext;
    }

    function buildCanvasFont(style) {
      return [
        style.fontStyle,
        style.fontVariant,
        style.fontWeight,
        style.fontSize,
        style.fontFamily,
      ].filter(Boolean).join(" ");
    }

    function getCaptureColumnCount() {
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

    function renderPanes() {
      renderSessionOptions();

      paneListEl.innerHTML = getVisiblePanes().map((pane) => {
        const active = pane.paneId === selectedPaneId ? "active" : "";
        const title = pane.title || "(no title)";
        const command = pane.currentCommand || "";
        const tooltip = [pane.label, pane.paneId, title, command].filter(Boolean).join(" / ");
        const compactLabel = pane.windowIndex + "." + pane.paneIndex;
        const label = isCompactLayout() ? compactLabel : pane.label;
        return \`
          <div class="pane-item \${active}" data-pane-id="\${pane.paneId}" title="\${escapeHtml(tooltip)}">
            <div class="line1">\${escapeHtml(label)}</div>
            <div class="line2">\${escapeHtml(title)} / \${escapeHtml(command)}</div>
          </div>
        \`;
      }).join("");

      for (const el of paneListEl.querySelectorAll(".pane-item")) {
        el.addEventListener("click", async () => {
          selectedPaneId = el.dataset.paneId;
          syncSelectedSession();
          renderPanes();
          await loadCapture();
        });
      }
    }

    async function api(path, options = {}) {
      const res = await fetch(path, {
        headers: { "Content-Type": "application/json" },
        ...options
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || ("HTTP " + res.status));
      }
      return data;
    }

    async function loadPanes() {
      try {
        setStatus("pane一覧を取得中...");
        const data = await api("/api/panes");
        panes = data.panes;

        if (!selectedPaneId || !panes.some((p) => p.paneId === selectedPaneId)) {
          selectedPaneId = panes[0]?.paneId || null;
        }

        syncSelectedSession();
        renderPanes();

        if (selectedPaneId) {
          await loadCapture();
        } else {
          selectedTitleEl.textContent = "paneが見つからないよ";
          captureEl.innerHTML = "";
          lastCaptureRaw = "";
          setStatus("tmux paneなし");
        }
      } catch (error) {
        setStatus(error.message, true);
      }
    }

    async function loadCapture() {
      if (!selectedPaneId) return;

      try {
        const lines = Math.max(1, Math.min(5000, Number(linesInputEl.value) || 300));
        const pane = panes.find((p) => p.paneId === selectedPaneId);
        selectedTitleEl.textContent = pane
          ? \`\${pane.label} \${pane.paneId} / \${pane.title || "(no title)"}\`
          : selectedPaneId;

        setStatus("capture取得中...");
        const data = await api(\`/api/capture?paneId=\${encodeURIComponent(selectedPaneId)}&lines=\${lines}\`);
        if (lastCaptureRaw !== data.content) {
          captureEl.innerHTML = renderAnsiToHtml(data.content);
          lastCaptureRaw = data.content;
          setStatus("capture更新ずみ");
          return;
        }

        setStatus("capture変更なし");
      } catch (error) {
        setStatus(error.message, true);
      }
    }

    async function sendInput(withEnter) {
      if (!selectedPaneId) {
        setStatus("paneを選んでね", true);
        return;
      }

      try {
        const text = commandInputEl.value;
        await api("/api/send", {
          method: "POST",
          body: JSON.stringify({
            paneId: selectedPaneId,
            text,
            enter: withEnter
          })
        });
        commandInputEl.value = "";
        await loadCapture();
        setStatus("送信したよ");
      } catch (error) {
        setStatus(error.message, true);
      }
    }

    async function sendSpecialKey(key, label) {
      if (!selectedPaneId) {
        setStatus("paneを選んでね", true);
        return;
      }

      try {
        await api("/api/send-key", {
          method: "POST",
          body: JSON.stringify({
            paneId: selectedPaneId,
            key
          })
        });
        customSpecialKeyInputEl.value = "";
        setSpecialKeyPopoverOpen(false);
        await loadCapture();
        setStatus(label + " を送信したよ");
      } catch (error) {
        setStatus(error.message, true);
      }
    }

    async function fitPaneWidthToCapture() {
      if (!selectedPaneId) {
        setStatus("paneを選んでね", true);
        return;
      }

      const columns = getCaptureColumnCount();
      if (!columns) {
        setStatus("表示幅を測れなかった", true);
        return;
      }

      try {
        setStatus("pane幅を調整中...");
        await api("/api/resize-pane", {
          method: "POST",
          body: JSON.stringify({
            paneId: selectedPaneId,
            columns,
          })
        });
        await loadCapture();
        setStatus("pane幅を " + columns + " 桁に合わせたよ");
      } catch (error) {
        setStatus(error.message, true);
      }
    }

    fitWidthBtn.addEventListener("click", fitPaneWidthToCapture);
    refreshCaptureBtn.addEventListener("click", loadCapture);
    sessionSelectEl.addEventListener("change", async () => {
      selectedSessionName = sessionSelectEl.value;
      const sessionPanes = panes.filter((pane) => pane.sessionName === selectedSessionName);
      if (!sessionPanes.some((pane) => pane.paneId === selectedPaneId)) {
        selectedPaneId = sessionPanes[0]?.paneId || null;
      }
      renderPanes();
      if (selectedPaneId) {
        await loadCapture();
      }
    });
    sendBtn.addEventListener("click", () => sendInput(false));
    sendEnterBtn.addEventListener("click", () => sendInput(true));
    renderActionButtons();
    renderSpecialKeyButtons(extraSpecialKeysEl, extraSpecialKeys);
    toggleSpecialKeysBtn.addEventListener("click", () => {
      setSpecialKeyPopoverOpen(specialKeyPopoverEl.hidden);
      if (!specialKeyPopoverEl.hidden) {
        customSpecialKeyInputEl.focus();
      }
    });
    customSpecialKeyFormEl.addEventListener("submit", async (event) => {
      event.preventDefault();
      const key = customSpecialKeyInputEl.value.trim();
      if (!key) {
        setStatus("tmux key name を入れてね", true);
        return;
      }
      await sendSpecialKey(key, key);
    });
    document.addEventListener("click", (event) => {
      if (!specialKeyPopoverEl.hidden && !event.target.closest(".special-key-popover-wrap")) {
        setSpecialKeyPopoverOpen(false);
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !specialKeyPopoverEl.hidden) {
        setSpecialKeyPopoverOpen(false);
      }
    });

    linesInputEl.addEventListener("change", loadCapture);
    const handleLayoutChange = () => {
      renderPanes();
      renderActionButtons();
    };
    if (typeof compactLayoutQuery.addEventListener === "function") {
      compactLayoutQuery.addEventListener("change", handleLayoutChange);
    } else if (typeof compactLayoutQuery.addListener === "function") {
      compactLayoutQuery.addListener(handleLayoutChange);
    }

    async function start() {
      await loadPanes();
      clearInterval(captureTimer);
      captureTimer = setInterval(loadCapture, 1000);
    }

    start();
  </script>
</body>
</html>`);
});

app.get("/api/panes", async (_req, res) => {
  try {
    const format = [
      "#{session_name}",
      "#{window_index}",
      "#{pane_index}",
      "#{pane_id}",
      "#{pane_title}",
      "#{pane_current_command}",
    ].join("\t");

    const stdout = await runTmux(["list-panes", "-a", "-F", format]);

    const panes = stdout
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [sessionName, windowIndex, paneIndex, paneId, title, currentCommand] = line.split("\t");
        return {
          sessionName,
          windowIndex,
          paneIndex,
          paneId,
          title,
          currentCommand,
          label: `${sessionName}:${windowIndex}.${paneIndex}`,
        };
      });

    res.json({ panes });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/capture", async (req, res) => {
  try {
    const paneId = String(req.query.paneId || "");
    const lines = Math.max(1, Math.min(5000, Number(req.query.lines) || 300));

    if (!isValidPaneId(paneId)) {
      res.status(400).json({ error: "invalid paneId" });
      return;
    }

    const stdout = await runTmux([
      "capture-pane",
      "-t",
      paneId,
      "-e",
      "-p",
      "-S",
      `-${lines}`,
    ]);

    res.json({ content: stdout });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/send", async (req, res) => {
  try {
    const paneId = String(req.body?.paneId || "");
    const text = String(req.body?.text || "");
    const enter = Boolean(req.body?.enter);

    if (!isValidPaneId(paneId)) {
      res.status(400).json({ error: "invalid paneId" });
      return;
    }

    if (text.length > 0) {
      await sendTextToPane(paneId, text);
    }

    if (enter) {
      await sendEnterKey(paneId, text.length > 0);
    }
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/send-key", async (req, res) => {
  try {
    const paneId = String(req.body?.paneId || "");
    const key = String(req.body?.key || "");

    if (!isValidPaneId(paneId)) {
      res.status(400).json({ error: "invalid paneId" });
      return;
    }

    if (!isValidTmuxKeyName(key)) {
      res.status(400).json({ error: "invalid key" });
      return;
    }

    await runTmux(["send-keys", "-t", paneId, key]);
    res.json({ ok: true, label: getSpecialKeyLabel(key) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/resize-pane", async (req, res) => {
  try {
    const paneId = String(req.body?.paneId || "");
    const columns = clampPaneWidth(Math.floor(Number(req.body?.columns)));

    if (!isValidPaneId(paneId)) {
      res.status(400).json({ error: "invalid paneId" });
      return;
    }

    if (!Number.isFinite(columns)) {
      res.status(400).json({ error: "invalid columns" });
      return;
    }

    await runTmux(["resize-pane", "-t", paneId, "-x", String(columns)]);
    res.json({ ok: true, columns });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`tmux mini web UI: http://localhost:${PORT}`);
});
