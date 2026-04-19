# Zellij backend support

- Introduced a backend adapter boundary in `server.js` so the HTTP API no longer depends directly on tmux pane IDs or command syntax.
  This was necessary because tmux uses `%123` style pane IDs while Zellij targets panes through `terminal_N` style IDs and session-scoped CLI actions.
- Kept the existing HTTP surface mostly stable and passed `sessionName` alongside pane operations.
  Zellij CLI control for capture and input is session-aware, so pane ID alone is not a stable target when the UI aggregates panes across sessions.
- Treated pane resizing as an optional capability instead of forcing a fake implementation.
  Zellij's current CLI automation docs clearly cover pane listing, screen dumping, paste, and send-keys, but this project only had a direct width-based resize flow for tmux.
- Switched Zellij text injection to `paste` and key injection to `send-keys`.
  This follows the current programmatic control guidance and avoids reimplementing multiline input behavior that Zellij already handles.
