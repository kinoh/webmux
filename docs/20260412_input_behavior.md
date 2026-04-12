## Input behavior decisions

- Switched the command field from a single-line input to a textarea so the physical Enter key inserts a newline instead of triggering submission.
- Cleared the command field after every successful send action because both "Send" and "Enter only" complete a dispatch and should leave the next input in a clean state.
- Normalized multiline text on the server and replayed it into tmux line by line with explicit Enter key events between lines.
  This avoids depending on tmux literal mode to interpret newline characters consistently.
