#!/usr/bin/env node

const { createApp } = require("./src/server/createApp");

const PORT = process.env.PORT || 5010;
const app = createApp();

app.listen(PORT, () => {
  console.log(`webmux: http://localhost:${PORT}`);
});
