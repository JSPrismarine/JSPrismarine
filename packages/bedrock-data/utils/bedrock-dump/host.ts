/**
 * How the capture starts the host-side halves of its passes.
 *
 * Two passes finish outside the server: `palette` reads the save back with
 * `packages/minecraft/datagen/extract-block-palette.mjs`, and `packets` drives
 * `packages/client/tools/capture-server-data.mjs`. Both reach workspace packages, and a
 * workspace package resolves to its TypeScript sources, whose relative imports carry no file
 * extension. Plain Node rejects those with `ERR_MODULE_NOT_FOUND`, so both halves died on an
 * import before they did any work.
 *
 * `tsx` is the resolver the server already starts under (`packages/server`'s `start` and `dev`
 * scripts), so the capture uses the same one rather than changing what any package publishes.
 * It is resolved from this package instead of being named on the command line, because the
 * child's working directory is the repository root and nothing there depends on `tsx`.
 */
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);

/** The `tsx` ESM loader, as a URL `--import` accepts from any working directory. */
export const tsxLoader = (): string => pathToFileURL(require.resolve('tsx')).href;

/**
 * Builds the argument vector for a host-side script, run under the same resolver as the server.
 *
 * @param script Absolute path of the script to run.
 * @param args The script's own arguments.
 * @returns Arguments for `process.execPath`, with the loader ahead of the script.
 */
export const hostNodeArgs = (script: string, args: readonly string[]): string[] => [
    '--import',
    tsxLoader(),
    script,
    ...args
];
