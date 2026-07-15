// Patch server-only module to allow script execution
const Module = require("module");
const path = require("path");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent) {
  if (request === "server-only") {
    return path.join(__dirname, "server-only-empty.cjs");
  }
  return originalResolve.apply(this, arguments);
};
