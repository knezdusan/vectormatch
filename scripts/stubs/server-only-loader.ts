// Stub server-only module for script execution
// This allows scripts to import modules that have `import "server-only"`
// without throwing the "cannot be imported from a Client Component" error.
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./scripts/stubs/server-only-hook.ts", pathToFileURL("./"));
