#!/usr/bin/env node

const express = require("express");
const { execFile } = require("child_process");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 5010;
const ENTER_DELAY_MS = 10;
const SPECIAL_KEYS = {
  "C-c": "Ctrl+C",
  Escape: "Esc",
};

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
    }
    .inputbar {
      display: grid;
      grid-template-columns: 1fr auto auto auto auto;
      gap: 8px;
      padding: 12px;
      border-top: 1px solid var(--border);
      background: var(--panel);
    }
    input[type="text"],
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
        align-items: center;
        padding-bottom: 8px;
      }
      .sidebar .title {
        width: auto;
        white-space: nowrap;
      }
      .pane-list {
        padding: 0 12px 10px;
        flex-direction: row;
        gap: 6px;
        overflow-x: auto;
        overflow-y: hidden;
        overscroll-behavior-x: contain;
        scrollbar-width: none;
      }
      .pane-list::-webkit-scrollbar {
        display: none;
      }
      .pane-item {
        flex: 0 0 auto;
        padding: 8px 12px;
        border-radius: 999px;
      }
      .pane-item .line1 {
        margin-bottom: 0;
        font-size: 12px;
        white-space: nowrap;
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
        grid-template-columns: 1fr 1fr;
      }
      .inputbar textarea {
        grid-column: 1 / -1;
      }
      .inputbar button {
        width: 100%;
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
        <button id="refreshPanesBtn">更新</button>
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
          <button id="refreshCaptureBtn">再読込</button>
        </div>
      </div>
      <pre id="capture"></pre>
      <div id="status" class="status">ready</div>
    </section>

    <section class="inputbar">
      <textarea id="commandInput" placeholder="送信する文字列を入力"></textarea>
      <button id="sendBtn">送信</button>
      <button id="sendEnterBtn">Enterだけ</button>
      <button id="sendCtrlCBtn">Ctrl+C</button>
      <button id="sendEscBtn">Esc</button>
    </section>
  </main>

  <script>
    const paneListEl = document.getElementById("paneList");
    const captureEl = document.getElementById("capture");
    const selectedTitleEl = document.getElementById("selectedTitle");
    const statusEl = document.getElementById("status");
    const commandInputEl = document.getElementById("commandInput");
    const linesInputEl = document.getElementById("linesInput");

    const refreshPanesBtn = document.getElementById("refreshPanesBtn");
    const refreshCaptureBtn = document.getElementById("refreshCaptureBtn");
    const sendBtn = document.getElementById("sendBtn");
    const sendEnterBtn = document.getElementById("sendEnterBtn");
    const sendCtrlCBtn = document.getElementById("sendCtrlCBtn");
    const sendEscBtn = document.getElementById("sendEscBtn");

    let panes = [];
    let selectedPaneId = null;
    let captureTimer = null;

    function setStatus(message, isError = false) {
      statusEl.textContent = message;
      statusEl.className = "status" + (isError ? " error" : "");
    }

    function escapeHtml(text) {
      return text
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
    }

    function renderPanes() {
      paneListEl.innerHTML = panes.map((pane) => {
        const active = pane.paneId === selectedPaneId ? "active" : "";
        const title = pane.title || "(no title)";
        const command = pane.currentCommand || "";
        const tooltip = [pane.label, pane.paneId, title, command].filter(Boolean).join(" / ");
        return \`
          <div class="pane-item \${active}" data-pane-id="\${pane.paneId}" title="\${escapeHtml(tooltip)}">
            <div class="line1">\${escapeHtml(pane.label)}</div>
            <div class="line2">\${escapeHtml(title)} / \${escapeHtml(command)}</div>
          </div>
        \`;
      }).join("");

      for (const el of paneListEl.querySelectorAll(".pane-item")) {
        el.addEventListener("click", async () => {
          selectedPaneId = el.dataset.paneId;
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

        renderPanes();

        if (selectedPaneId) {
          await loadCapture();
        } else {
          selectedTitleEl.textContent = "paneが見つからないよ";
          captureEl.textContent = "";
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
        captureEl.textContent = data.content;
        setStatus("capture更新ずみ");
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
        await loadCapture();
        setStatus(label + " を送信したよ");
      } catch (error) {
        setStatus(error.message, true);
      }
    }

    refreshPanesBtn.addEventListener("click", loadPanes);
    refreshCaptureBtn.addEventListener("click", loadCapture);
    sendBtn.addEventListener("click", () => sendInput(false));
    sendEnterBtn.addEventListener("click", () => sendInput(true));
    sendCtrlCBtn.addEventListener("click", () => sendSpecialKey("C-c", "Ctrl+C"));
    sendEscBtn.addEventListener("click", () => sendSpecialKey("Escape", "Esc"));

    linesInputEl.addEventListener("change", loadCapture);

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

    if (!Object.prototype.hasOwnProperty.call(SPECIAL_KEYS, key)) {
      res.status(400).json({ error: "invalid key" });
      return;
    }

    await runTmux(["send-keys", "-t", paneId, key]);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`tmux mini web UI: http://localhost:${PORT}`);
});
