import type { BackendClientConfig, MuxBackend, PaneInfo } from "./types";

const ZELLIJ_SPECIAL_KEY_LABELS = {
  "Ctrl c": "Ctrl+C",
  "Ctrl d": "Ctrl+D",
  "Ctrl l": "Ctrl+L",
  "Ctrl z": "Ctrl+Z",
  Esc: "Esc",
  Up: "↑",
  Down: "↓",
  Left: "←",
  Right: "→",
  Tab: "Tab",
  Backspace: "Backspace",
  Delete: "Delete",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
};
const ZELLIJ_PRIMARY_SPECIAL_KEYS = ["Tab", "Backspace", "Delete", "Up", "Down", "Left", "Right", "Ctrl c", "Esc"];
const ZELLIJ_MOBILE_PRIMARY_SPECIAL_KEYS = ["Ctrl c", "Up", "Tab", "Backspace", "Left", "Down", "Right"];
const ZELLIJ_EXTRA_SPECIAL_KEYS = ["Delete", "Esc", "Home", "End", "PageUp", "PageDown", "Ctrl d", "Ctrl z", "Ctrl l"];

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function stripAnsi(text: string): string {
  return String(text).replace(/\u001b\[[0-9;]*m/g, "");
}

function parseZellijSessionNames(stdout: string): string[] {
  return unique(
    stdout
      .split("\n")
      .map((line) => stripAnsi(line).trim())
      .filter(Boolean)
      .filter((line) => !line.includes("(EXITED"))
      .map((line) => line.split(" [")[0]?.trim())
      .filter(Boolean)
  );
}

export function createZellijBackend(runCommand: (command: string, args: string[]) => Promise<string>): MuxBackend {
  const config: BackendClientConfig & { command: string } = {
    id: "zellij",
    command: "zellij",
    displayName: "zellij",
    supportsResize: false,
    specialKeyLabels: ZELLIJ_SPECIAL_KEY_LABELS,
    primarySpecialKeys: ZELLIJ_PRIMARY_SPECIAL_KEYS,
    mobilePrimarySpecialKeys: ZELLIJ_MOBILE_PRIMARY_SPECIAL_KEYS,
    extraSpecialKeys: ZELLIJ_EXTRA_SPECIAL_KEYS,
    customKeyPlaceholder: "zellij key name",
    specialKeyHint: "Use Zellij key names like F1, Ctrl c, Alt Left, PageDown.",
  };

  function run(args: string[]) {
    return runCommand(config.command, args);
  }

  function parseTargetPaneId(paneId: string) {
    if (typeof paneId !== "string") {
      return null;
    }
    const match = /^(terminal|plugin)_([0-9]+)$/.exec(paneId);
    if (!match) {
      return null;
    }
    return {
      type: match[1],
      numericId: match[2],
      fullId: paneId,
    };
  }

  function buildSessionArgs(sessionName?: string) {
    return sessionName ? ["--session", sessionName] : [];
  }

  async function listSessionNames(): Promise<string[]> {
    const stdout = await run(["list-sessions"]);
    return parseZellijSessionNames(stdout);
  }

  async function listTabsForSession(sessionName: string): Promise<Map<string, { position: number; name: string }>> {
    const stdout = await run([...buildSessionArgs(sessionName), "action", "list-tabs", "--json"]);
    const tabs = JSON.parse(stdout) as Array<{ tab_id: number; position: number; name: string }>;
    return new Map(
      tabs.map((tab: { tab_id: number; position: number; name: string }) => [
        String(tab.tab_id),
        {
          position: tab.position,
          name: tab.name,
        },
      ])
    );
  }

  return {
    ...config,
    isValidPaneId(paneId: string) {
      return parseTargetPaneId(paneId) !== null;
    },
    isValidKeyName(key: string) {
      return typeof key === "string" && /^[A-Za-z0-9 ][A-Za-z0-9 +_-]{0,63}$/.test(key);
    },
    async listPanes(): Promise<PaneInfo[]> {
      const sessionNames = await listSessionNames();
      const allPanes = [];

      for (const sessionName of sessionNames) {
        const [paneStdout, tabsById] = await Promise.all([
          run([...buildSessionArgs(sessionName), "action", "list-panes", "--json"]),
          listTabsForSession(sessionName),
        ]);
        const panes = JSON.parse(paneStdout) as Array<{
          id: number;
          is_plugin: boolean;
          tab_id?: number;
          tab_name?: string;
          title?: string;
          pane_command?: string;
        }>;
        const paneIndexes = new Map();

        for (const pane of panes) {
          if (pane.is_plugin) {
            continue;
          }

          const tabId = String(pane.tab_id ?? "");
          const tabInfo = tabsById.get(tabId);
          const paneKey = `${sessionName}:${tabId}`;
          const nextPaneIndex = (paneIndexes.get(paneKey) || 0) + 1;
          paneIndexes.set(paneKey, nextPaneIndex);

          allPanes.push({
            sessionName,
            windowIndex: String(tabInfo?.position ?? pane.tab_id ?? 0),
            paneIndex: String(nextPaneIndex),
            paneId: `terminal_${pane.id}`,
            title: pane.title || "",
            currentCommand: pane.pane_command || "",
            label: `${sessionName}:${String(tabInfo?.position ?? pane.tab_id ?? 0)}.${String(nextPaneIndex)}`,
            tabName: tabInfo?.name || pane.tab_name || "",
          });
        }
      }

      return allPanes;
    },
    async capturePane(paneId: string, _lines: number, sessionName?: string) {
      const targetPane = parseTargetPaneId(paneId);
      if (!targetPane) {
        throw new Error("invalid paneId");
      }
      return run([...buildSessionArgs(sessionName), "action", "dump-screen", "--pane-id", targetPane.fullId, "--full", "--ansi"]);
    },
    async sendTextToPane(paneId: string, text: string, sessionName?: string) {
      const targetPane = parseTargetPaneId(paneId);
      if (!targetPane) {
        throw new Error("invalid paneId");
      }
      if (text.length === 0) {
        return;
      }
      await run([...buildSessionArgs(sessionName), "action", "paste", "--pane-id", targetPane.fullId, text]);
    },
    async sendEnterKey(paneId: string, _shouldDelayBefore = false, sessionName?: string) {
      const targetPane = parseTargetPaneId(paneId);
      if (!targetPane) {
        throw new Error("invalid paneId");
      }
      await run([...buildSessionArgs(sessionName), "action", "send-keys", "--pane-id", targetPane.fullId, "Enter"]);
    },
    async sendKeyToPane(paneId: string, key: string, sessionName?: string) {
      const targetPane = parseTargetPaneId(paneId);
      if (!targetPane) {
        throw new Error("invalid paneId");
      }
      await run([...buildSessionArgs(sessionName), "action", "send-keys", "--pane-id", targetPane.fullId, key]);
    },
    async resizePane() {
      throw new Error("resize-pane is not supported for zellij yet");
    },
  };
}
