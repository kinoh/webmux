#!/usr/bin/env node

import { createApp } from "./src/server/createApp";

const PORT = Number(process.env.PORT || 5010);
const app = createApp();

app.listen(PORT, () => {
  console.log(`webmux: http://localhost:${PORT}`);
});
