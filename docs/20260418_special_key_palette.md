## Special key input decisions

- Added `Tab`, `Backspace`, and `Delete` as primary buttons because they are editing primitives that are frequently needed while composing shell input.
- Moved less common navigation and control keys behind a popover so the main input bar stays compact on desktop and mobile.
- Added a custom tmux key input field inside the popover so new key names can be sent without changing server code for every new need.
- Kept server-side validation at the level of a printable single-token tmux key name so the API remains generic without accepting malformed multi-token input.
