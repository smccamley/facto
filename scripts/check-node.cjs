#!/usr/bin/env node
const major = Number(process.versions.node.split(".")[0]);

if (major < 24) {
  console.error(`Expo Facto requires Node.js 24 or newer. Current Node.js is ${process.version}.`);
  console.error("Install Node.js 24+, then run the expofacto command again.");
  process.exit(1);
}
