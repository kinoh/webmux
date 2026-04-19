export type BackendId = "tmux" | "zellij";

export type PaneInfo = {
  sessionName: string;
  windowIndex: string;
  paneIndex: string;
  paneId: string;
  title: string;
  currentCommand: string;
  label: string;
  tabName?: string;
};

export type NormalizedPaneInfo = PaneInfo & {
  backendId: BackendId;
  backendDisplayName: string;
  supportsResize: boolean;
  paneKey: string;
};

export type BackendClientConfig = {
  id: BackendId;
  displayName: string;
  supportsResize: boolean;
  primarySpecialKeys: string[];
  mobilePrimarySpecialKeys: string[];
  extraSpecialKeys: string[];
  specialKeyLabels: Record<string, string>;
  customKeyPlaceholder: string;
  specialKeyHint: string;
};

export type MuxBackend = BackendClientConfig & {
  command: string;
  isValidPaneId(paneId: string): boolean;
  isValidKeyName(key: string): boolean;
  listPanes(): Promise<PaneInfo[]>;
  capturePane(paneId: string, lines: number, sessionName?: string): Promise<string>;
  sendTextToPane(paneId: string, text: string, sessionName?: string): Promise<void>;
  sendEnterKey(paneId: string, shouldDelayBefore?: boolean, sessionName?: string): Promise<void>;
  sendKeyToPane(paneId: string, key: string, sessionName?: string): Promise<void>;
  resizePane(paneId: string, columns: number, sessionName?: string): Promise<number>;
};
