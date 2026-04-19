# webmux

Minimal web UI for local tmux and zellij panes.

## Security model

`webmux` is designed for trusted networks only.

- The server binds to `127.0.0.1` by default.
- The app does not provide authentication or authorization.
- Remote access should be added outside this codebase, for example through a VPN, SSH tunnel, or a reverse proxy that enforces its own access control.
- Publishing the server directly to a LAN or the public internet is unsafe because the API can read pane contents and send input to panes.

## Requirements

- Node.js
- tmux and/or zellij available on the host

## Getting started

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env` if you want to override defaults.
3. Start the server with `npm run start`.
4. Open `http://127.0.0.1:5010`.

## Configuration

Environment variables:

- `HOST`: bind address for the Express server. Default: `127.0.0.1`
- `PORT`: bind port for the Express server. Default: `5010`

## Development

- `npm run typecheck`
- `npm run build:client`
- `npm run start`

## Project status

This repository is intended to be self-hosted in a trusted environment. The current API surface is intentionally small and optimized for local operation rather than multi-user deployments.
