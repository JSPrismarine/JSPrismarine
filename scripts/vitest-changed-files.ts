import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

import type { VCSProvider } from 'vitest/node';
import { GitVCSProvider } from 'vitest/node';

const run = promisify(execFile);

/** A TypeScript module, which a suite reaches through its imports or not at all. */
const MODULE = /\.[cm]?tsx?$/;

/** A Vite or Vitest config. It is TypeScript, but it configures a package and nothing imports it. */
const CONFIG = /^vite(?:st)?\.config\./;

/**
 * Finds the packages a change affects as a whole.
 *
 * `--changed` runs the suites whose imports reach a changed file. A package's manifest, its
 * `tsconfig`, its Vite config and the data files its suites read from disk are on no import path,
 * so a change to one of them selects nothing. Every file of such a package then counts as changed,
 * which selects the package's suites and the suites of the packages that import it.
 *
 * @param changed - Changed files, relative to the repository root, with forward slashes.
 * @param packageRoots - Directories that hold a `package.json`, relative to the repository root.
 * @returns The roots among `packageRoots` whose files all count as changed.
 */
export const packagesToRerun = (changed: readonly string[], packageRoots: readonly string[]): string[] => {
    // The longest root first, so a file belongs to the innermost package that holds it.
    const roots = packageRoots.toSorted((left, right) => right.length - left.length);
    const affected = new Set<string>();
    for (const file of changed) {
        if (MODULE.test(file) && !CONFIG.test(path.posix.basename(file))) continue;
        const root = roots.find((candidate) => file.startsWith(`${candidate}/`));
        if (root !== undefined) affected.add(root);
    }
    return [...affected];
};

const git = async (cwd: string, args: readonly string[]): Promise<string[]> => {
    const { stdout } = await run('git', [...args], { cwd, maxBuffer: 64 * 1024 * 1024 });
    return stdout.split('\0').filter((entry) => entry !== '');
};

const builtin = new GitVCSProvider();

/**
 * The changed files `--changed` reads: what Git reports, plus every file of a package that
 * {@link packagesToRerun} names. `experimental.vcsProvider` in `vitest.config.ts` loads it.
 */
const provider: VCSProvider = {
    async findChangedFiles(options) {
        const changed = await builtin.findChangedFiles(options);
        // `rev-parse` has no NUL-separated output, so its one line arrives with a newline.
        const [top = ''] = await git(options.root, ['rev-parse', '--show-toplevel']);
        const root = path.resolve(top.trim());

        const manifests = await git(root, ['ls-files', '-z', '--', '*/package.json']);
        const relative = changed.map((file) => path.relative(root, file).split(path.sep).join('/'));
        const packages = packagesToRerun(relative, manifests.map(path.posix.dirname));
        if (packages.length === 0) return changed;

        const files = await git(root, ['ls-files', '-z', '--', ...packages]);
        return [...new Set([...changed, ...files.map((file) => path.resolve(root, file))])];
    }
};

export default provider;
