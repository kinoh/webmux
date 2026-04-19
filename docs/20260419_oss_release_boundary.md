# OSS release boundary

## Decision

Treat `webmux` as a trusted-network tool and keep authentication outside the application.

## Why

- The server can read pane contents and send arbitrary input to running panes, so weak built-in authentication would create a false sense of safety.
- Network access control is easier to reason about when it is owned by the deployment layer, such as a VPN, SSH tunnel, or a reverse proxy with established access control.
- A localhost default reduces accidental exposure without changing the product scope.

## Consequences

- The server must bind to `127.0.0.1` by default.
- Public documentation must clearly state that the app does not implement authentication.
- Operators who need remote access must add transport and access control outside this repository.
