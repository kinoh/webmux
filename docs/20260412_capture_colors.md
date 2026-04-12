## Capture color rendering decisions

- Enabled `tmux capture-pane -e` so the server can retrieve SGR color and style escape sequences instead of already flattened text.
- Kept ANSI parsing inside the client and did not add a dependency.
  The current need is limited to readable colored logs, so a focused SGR renderer is sufficient and avoids introducing a terminal emulator or HTML conversion package.
- Stored the last raw capture payload separately from the rendered DOM.
  This preserves the existing optimization that skips DOM replacement when pane output is unchanged, which matters because replacing the `pre` subtree clears the user's current text selection.
