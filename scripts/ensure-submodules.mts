import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Directories that Git populates from submodules, relative to the repository root. */
const SUBMODULE_PATHS = ['packages/bedrock-data/src/resources'];

const isPopulated = (directory: string): boolean =>
    existsSync(directory) && readdirSync(directory).some((entry) => entry !== '.git');

/**
 * Initializes and updates every Git submodule the build needs, when one is
 * still empty. A fresh clone without `--recursive` otherwise fails deep inside
 * the bedrock-data generator with a missing-file error.
 *
 * @returns Whether any submodule had to be fetched.
 */
export const ensureSubmodules = (): boolean => {
    const missing = SUBMODULE_PATHS.filter((relative) => !isPopulated(path.join(repoRoot, relative)));
    if (missing.length === 0) return false;

    console.log(`Initializing Git submodules: ${missing.join(', ')}`);
    execFileSync('git', ['submodule', 'update', '--init', '--recursive'], { cwd: repoRoot, stdio: 'inherit' });
    return true;
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    ensureSubmodules();
}
