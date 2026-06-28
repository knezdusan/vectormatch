#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

const REAL_SERVER =
  "/Users/knez/Documents/WebDev/vectormatch/node_modules/.bin/fallow-mcp";

const server = spawn(REAL_SERVER, { stdio: ["pipe", "pipe", "inherit"] });

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });

let initialized = false;

rl.on("line", (line) => {
  if (!line.trim()) return;
  server.stdin.write(`${line}\n`);
});

rl.on("close", () => {
  server.stdin.end();
});

const serverRl = createInterface({ input: server.stdout, crlfDelay: Infinity });

serverRl.on("line", (line) => {
  if (!line.trim()) return;

  if (!initialized) {
    try {
      const msg = JSON.parse(line);
      if (msg.id && msg.result && msg.result.instructions !== undefined) {
        delete msg.result.instructions;
        line = JSON.stringify(msg);
      }
      initialized = true;
    } catch {
      // pass through unchanged
    }
  }

  process.stdout.write(`${line}\n`);
});

server.on("exit", (code) => {
  process.exit(code ?? 0);
});
