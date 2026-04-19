import type { BackendClientConfig, MuxBackend, PaneInfo } from "./types";

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createTmuxBackend(runCommand: (command: string, args: string[]) => Promise<string>): MuxBackend {
  const config: BackendClientConfig & { command: string } = {
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

  function run(args: string[]) {
    return runCommand(config.command, args);
  }

  async function sendEnterKey(paneId: string, shouldDelayBefore = false) {
    if (shouldDelayBefore) {
      await sleep(ENTER_DELAY_MS);
    }
    await run(["send-keys", "-t", paneId, "Enter"]);
  }

  return {
    ...config,
    isValidPaneId(paneId: string) {
      return typeof paneId === "string" && /^%[0-9]+$/.test(paneId);
    },
    isValidKeyName(key: string) {
      return typeof key === "string" && /^[!-~]{1,64}$/.test(key);
    },
    async listPanes(): Promise<PaneInfo[]> {
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
        .map((line): PaneInfo => {
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
    async capturePane(paneId: string, lines: number) {
      return run(["capture-pane", "-t", paneId, "-e", "-p", "-S", `-${lines}`]);
    },
    async sendTextToPane(paneId: string, text: string) {
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
    async sendEnterKey(paneId: string, shouldDelayBefore = false) {
      await sendEnterKey(paneId, shouldDelayBefore);
    },
    async sendKeyToPane(paneId: string, key: string) {
      await run(["send-keys", "-t", paneId, key]);
    },
    async resizePane(paneId: string, columns: number) {
      await run(["resize-pane", "-t", paneId, "-x", String(columns)]);
      return columns;
    },
  };
}
