import { createTmuxBackend } from "./tmux";
import { createZellijBackend } from "./zellij";
import type { BackendId, BackendClientConfig, MuxBackend, NormalizedPaneInfo, PaneInfo } from "./types";

function createMuxBackend(backendId: BackendId, runCommand: (command: string, args: string[]) => Promise<string>): MuxBackend {
  if (backendId === "tmux") {
    return createTmuxBackend(runCommand);
  }
  if (backendId === "zellij") {
    return createZellijBackend(runCommand);
  }
  throw new Error(`unsupported MUX backend: ${backendId}`);
}

export function createMuxRegistry(runCommand: (command: string, args: string[]) => Promise<string>) {
  const backends = [
    createMuxBackend("tmux", runCommand),
    createMuxBackend("zellij", runCommand),
  ];

  return {
    backends,
    clientBackendConfigs: backends.map((backend): BackendClientConfig => ({
      id: backend.id,
      displayName: backend.displayName,
      supportsResize: backend.supportsResize,
      primarySpecialKeys: backend.primarySpecialKeys,
      mobilePrimarySpecialKeys: backend.mobilePrimarySpecialKeys,
      extraSpecialKeys: backend.extraSpecialKeys,
      specialKeyLabels: backend.specialKeyLabels,
      customKeyPlaceholder: backend.customKeyPlaceholder,
      specialKeyHint: backend.specialKeyHint,
    })),
    getBackendById(backendId: string): MuxBackend | null {
      return backends.find((backend) => backend.id === backendId) || null;
    },
    normalizePane(backend: MuxBackend, pane: PaneInfo): NormalizedPaneInfo {
      return {
        ...pane,
        backendId: backend.id,
        backendDisplayName: backend.displayName,
        supportsResize: backend.supportsResize,
        paneKey: [backend.id, pane.sessionName, pane.paneId].join(":"),
      };
    },
    async listAllPanes(): Promise<{ panes: NormalizedPaneInfo[]; errors: string[] }> {
      const results = await Promise.allSettled(backends.map((backend) => backend.listPanes()));
      const panes: NormalizedPaneInfo[] = [];
      const errors: string[] = [];

      for (let index = 0; index < results.length; index += 1) {
        const backend = backends[index];
        const result = results[index];
        if (result.status === "fulfilled") {
          panes.push(...result.value.map((pane) => this.normalizePane(backend, pane)));
          continue;
        }
        errors.push(`${backend.displayName}: ${result.reason?.message || "failed to list panes"}`);
      }

      return { panes, errors };
    },
  };
}
