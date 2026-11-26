import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { promisify } from 'node:util';

import { AddonToolsErrors } from '@jsprismarine/errors/addon-tools';

import { isRecord } from './isRecord';

/**
 * An addon whose folder has a `tsconfig.json` writes its scripts in TypeScript. `tsc-ts` compiles
 * the project into the folder, where the manifest's script entry names the output, and the pack
 * leaves out the project that built it.
 */

/** The TypeScript project file that makes an addon a TypeScript addon. */
export const ADDON_TSCONFIG_FILE = 'tsconfig.json';

/**
 * The top-level entries of a TypeScript addon's folder that build its scripts and stay out of its
 * pack: the project, its build configuration, its sources and its dependencies.
 */
export const ADDON_SOURCE_ENTRIES: readonly string[] = [
    'package.json',
    ADDON_TSCONFIG_FILE,
    'turbo.json',
    'src',
    'node_modules'
];

/** The extension of the source maps a TypeScript addon's build writes, which its pack leaves out. */
export const ADDON_SOURCE_MAP_EXTENSION = '.map';

/** Whether the addon in a folder writes its scripts in TypeScript. */
export const isTypeScriptAddon = (directory: string): boolean => existsSync(path.join(directory, ADDON_TSCONFIG_FILE));

/** The `tsc-ts` command line script this package depends on. */
const tscTs = (): string =>
    path.join(path.dirname(createRequire(import.meta.url).resolve('tsc-ts/package.json')), 'bin', 'tsc-ts.js');

/** Options for {@link compileAddon}. */
export interface CompileAddonOptions {
    /** Writes the scripts here instead of the project's `outDir`. */
    readonly outDirectory?: string;
}

/**
 * Compiles a TypeScript addon's scripts with `tsc-ts`, as its `tsconfig.json` says. An addon
 * without one is left as it is.
 *
 * @param directory - The addon's folder.
 * @returns Whether the addon is a TypeScript addon, and so was compiled.
 * @throws {InvalidAddonError} `AddonCompileFailed` when the compiler reports an error.
 */
export const compileAddon = async (directory: string, options: CompileAddonOptions = {}): Promise<boolean> => {
    if (!isTypeScriptAddon(directory)) return false;
    const root = path.resolve(directory);
    const outDirectory = options.outDirectory === undefined ? [] : ['--outDir', path.resolve(options.outDirectory)];
    try {
        await promisify(execFile)(
            process.execPath,
            [tscTs(), '-p', path.join(root, ADDON_TSCONFIG_FILE), '--pretty', 'false', ...outDirectory],
            // The run records are off, as in the repository's declaration build: tsc-ts 0.1.2 stored
            // a NaN for a project with nothing to measure and failed the next run that read it.
            { cwd: root, env: { ...process.env, TSC_TS_CACHE: '0' } }
        );
    } catch (cause) {
        // execFile's error carries the child's output beside the exit code.
        const output = isRecord(cause)
            ? [cause.stdout, cause.stderr]
                  .filter((text) => typeof text === 'string')
                  .join('')
                  .trim()
            : '';
        throw new AddonToolsErrors.AddonCompileFailed({
            addon: path.basename(root),
            output: output || String(cause)
        });
    }
    return true;
};
