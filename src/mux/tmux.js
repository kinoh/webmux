const ENTER_DELAY_MS = 10;

const TMUX_SPECIAL_KEY_LABELS = {
  "C-c": "Ctrl+C",
  "C-d": "Ctrl+D",
  "C-l": "Ctrl+L",
  "C-z": "Ctrl+Z",
  Escape: "Esc",
  Up: "↑",
  Down: "↓",
  Left: "←",
  Right: "→",
  Tab: "Tab",
  BSpace: "Backspace",
  DC: "Delete",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
};
const TMUX_PRIMARY_SPECIAL_KEYS = ["Tab", "BSpace", "DC", "Up", "Down", "Left", "Right", "C-c", "Escape"];
const TMUX_MOBILE_PRIMARY_SPECIAL_KEYS = ["C-c", "Up", "Tab", "BSpace", "Left", "Down", "Right"];
const TMUX_EXTRA_SPECIAL_KEYS = ["DC", "Escape", "Home", "End", "PageUp", "PageDown", "C-d", "C-z", "C-l"];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createTmuxBackend(runCommand) {
  const config = {
    id: "tmux",
    command: "tmux",
    displayName: "tmux",
    supportsResize: true,
    specialKeyLabels: TMUX_SPECIAL_KEY_LABELS,
    primarySpecialKeys: TMUX_PRIMARY_SPECIAL_KEYS,
    mobilePrimarySpecialKeys: TMUX_MOBILE_PRIMARY_SPECIAL_KEYS,
    extraSpecialKeys: TMUX_EXTRA_SPECIAL_KEYS,
    customKeyPlaceholder: "tmux key name",
    specialKeyHint: "Use tmux key notation like F1, M-Left, C-b, NPage.",
  };

  function run(args) {
    return runCommand(config.command, args);
  }

  async function sendEnterKey(paneId, shouldDelayBefore = false) {
    if (shouldDelayBefore) {
      await sleep(ENTER_DELAY_MS);
    }
    await run(["send-keys", "-t", paneId, "Enter"]);
  }

  return {
    ...config,
    isValidPaneId(paneId) {
      return typeof paneId === "string" && /^%[0-9]+$/.test(paneId);
    },
    isValidKeyName(key) {
      return typeof key === "string" && /^[!-~]{1,64}$/.test(key);
    },
    async listPanes() {
      const format = [
        "#{session_name}",
        "#{window_index}",
        "#{pane_index}",
        "#{pane_id}",
        "#{pane_title}",
        "#{pane_current_command}",
      ].join("\t");

      const stdout = await run(["list-panes", "-a", "-F", format]);

      return stdout
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
    },
    async capturePane(paneId, lines) {
      return run(["capture-pane", "-t", paneId, "-e", "-p", "-S", `-${lines}`]);
    },
    async sendTextToPane(paneId, text) {
      const normalizedText = text.replace(/\r\n?/g, "\n");
      const splitLines = normalizedText.split("\n");

      for (let index = 0; index < splitLines.length; index += 1) {
        const line = splitLines[index];
        const hasNextLine = index < splitLines.length - 1;

        if (line.length > 0) {
          await run(["send-keys", "-t", paneId, "-l", line]);
        }

        if (hasNextLine) {
          await sendEnterKey(paneId, line.length > 0);
        }
      }
    },
    async sendEnterKey(paneId, shouldDelayBefore = false) {
      await sendEnterKey(paneId, shouldDelayBefore);
    },
    async sendKeyToPane(paneId, key) {
      await run(["send-keys", "-t", paneId, key]);
    },
    async resizePane(paneId, columns) {
      await run(["resize-pane", "-t", paneId, "-x", String(columns)]);
      return columns;
    },
  };
}

module.exports = {
  createTmuxBackend,
};
