# Zellij backend support

- Introduced a backend adapter boundary in `server.js` so the HTTP API no longer depends directly on tmux pane IDs or command syntax.
  This was necessary because tmux uses `%123` style pane IDs while Zellij targets panes through `terminal_N` style IDs and session-scoped CLI actions.
- Kept the existing HTTP surface mostly stable and passed `sessionName` alongside pane operations.
  Zellij CLI control for capture and input is session-aware, so pane ID alone is not a stable target when the UI aggregates panes across sessions.
- Treated pane resizing as an optional capability instead of forcing a fake implementation.
  Zellij's current CLI automation docs clearly cover pane listing, screen dumping, paste, and send-keys, but this project only had a direct width-based resize flow for tmux.
- Switched Zellij text injection to `paste` and key injection to `send-keys`.
  This follows the current programmatic control guidance and avoids reimplementing multiline input behavior that Zellij already handles.
- Replaced backend process-wide switching with per-pane backend routing.
  The UI needs to list and operate on tmux and Zellij panes at the same time, so selecting a single active backend in process state was the wrong dependency direction.
- Split the server runtime into mux, server, and web modules before converting it to TypeScript.
  This kept the first TypeScript pass focused on backend routing and HTTP boundaries, instead of mixing type errors with a single oversized file that still carried unrelated responsibilities.
- Replaced server-side HTML/JS string embedding with static files in `public/` and an `/api/config` bootstrap endpoint.
  This makes the browser runtime observable and editable as normal files, which is a better foundation for a later client-side TypeScript pass than keeping UI behavior hidden inside a server template string.
