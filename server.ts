#!/usr/bin/env node

import { createApp } from "./src/server/createApp";

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 5010);
const app = createApp();

app.listen(PORT, HOST, () => {
  console.log(`webmux: http://${HOST}:${PORT}`);
});
