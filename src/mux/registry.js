const { createTmuxBackend } = require("./tmux");
const { createZellijBackend } = require("./zellij");

function createMuxBackend(backendId, runCommand) {
  if (backendId === "tmux") {
    return createTmuxBackend(runCommand);
  }
  if (backendId === "zellij") {
    return createZellijBackend(runCommand);
  }
  throw new Error(`unsupported MUX backend: ${backendId}`);
}

function createMuxRegistry(runCommand) {
  const backends = [
    createMuxBackend("tmux", runCommand),
    createMuxBackend("zellij", runCommand),
  ];

  return {
    backends,
    clientBackendConfigs: backends.map((backend) => ({
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
    getBackendById(backendId) {
      return backends.find((backend) => backend.id === backendId) || null;
    },
    normalizePane(backend, pane) {
      return {
        ...pane,
        backendId: backend.id,
        backendDisplayName: backend.displayName,
        supportsResize: backend.supportsResize,
        paneKey: [backend.id, pane.sessionName, pane.paneId].join(":"),
      };
    },
    async listAllPanes() {
      const results = await Promise.allSettled(backends.map((backend) => backend.listPanes()));
      const panes = [];
      const errors = [];

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

module.exports = {
  createMuxRegistry,
};
