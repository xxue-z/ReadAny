/**
 * Vite build wrapper.
 *
 * esbuild creates short-lived files in the OS temp directory. On Windows some
 * managed/antivirus setups deny deleting those files ("Access is denied"), which
 * aborts the production build. Point TMP/TEMP/TMPDIR at a workspace-local folder
 * before Vite (and therefore esbuild) starts.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const tempDir = path.resolve(scriptDir, "..", ".tmp");
mkdirSync(tempDir, { recursive: true });

process.env.TMP = tempDir;
process.env.TEMP = tempDir;
process.env.TMPDIR = tempDir;

const { build } = await import("vite");
await build();
