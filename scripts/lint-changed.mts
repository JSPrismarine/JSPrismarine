/**
 * Runs a lint or format command on the files this branch changed.
 *
 * node scripts/lint-changed.mts prettier --check
 * JSP_LINT_ALL=1 node scripts/lint-changed.mts biome check   # every file
 *
 * A changed file is one that differs from the merge base with the default branch: committed on this
 * branch, staged, unstaged or untracked. The command gets those paths in place of `.`, or nothing
 * runs when there are none. A change to a formatter's own configuration or version restyles every
 * file, so it runs the command on everything, as `JSP_LINT_ALL=1` does. The lint workflow sets it.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Files whose change can restyle any file: the formatters' configuration, and the manifest and
 * lockfile that pin their versions.
 */
export const LINT_INPUTS: readonly string[] = [
    '.editorconfig',
    '.prettierignore',
    'biome.json',
    'package.json',
    'pnpm-lock.yaml'
];

/**
 * Chooses what a lint command runs on.
 *
 * @param changed - Changed files, relative to the repository root, with forward slashes.
 * @param exists - Whether a file is still on disk; a deleted file has nothing to check.
 * @returns `all` to run on every file, or the existing changed files, which may be none.
 */
export const lintTargets = (changed: readonly string[], exists: (file: string) => boolean): 'all' | string[] => {
    if (changed.some((file) => LINT_INPUTS.includes(file) || /^\.prettierrc/.test(file))) return 'all';
    return [...new Set(changed)].filter(exists).sort();
};

const git = (root: string, args: readonly string[]): string | undefined => {
    try {
        return execFileSync('git', [...args], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
        return undefined;
    }
};

const nul = (output: string | undefined): string[] => (output ?? '').split('\0').filter((entry) => entry !== '');

/** The commit this branch left the default branch at, or `undefined` when none is found. */
const mergeBase = (root: string): string | undefined => {
    const remoteHead = git(root, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'])?.trim();
    for (const ref of [remoteHead, 'origin/master', 'master']) {
        if (!ref) continue;
        const base = git(root, ['merge-base', 'HEAD', ref])?.trim();
        if (base) return base;
    }
    return undefined;
};

/** The changed files, or `undefined` when Git cannot say, which runs the command on everything. */
const changedFiles = (root: string): string[] | undefined => {
    const base = mergeBase(root);
    if (base === undefined) return undefined;
    return [
        ...nul(git(root, ['diff', '-z', '--name-only', '--no-renames', base])),
        ...nul(git(root, ['ls-files', '-z', '--others', '--exclude-standard']))
    ];
};

/** Paths per invocation, which keeps a long list under the operating system's argument limit. */
const BATCH = 400;

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const [command, ...args] = process.argv.slice(2);
    if (command === undefined) {
        console.error('usage: node scripts/lint-changed.mts <command> [arguments...]');
        process.exit(2);
    }
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const changed = process.env.JSP_LINT_ALL === '1' ? undefined : changedFiles(root);
    const targets =
        changed === undefined ? 'all' : lintTargets(changed, (file) => fs.existsSync(path.join(root, file)));

    // Both tools skip a path their own configuration ignores, and these flags keep a path they do
    // not handle, such as an image, from failing the run.
    const unmatched =
        command === 'prettier' ? ['--ignore-unknown'] : ['--no-errors-on-unmatched', '--files-ignore-unknown=true'];
    const run = (paths: readonly string[]): number =>
        spawnSync('pnpm', ['exec', command, ...args, ...paths], { cwd: root, stdio: 'inherit' }).status ?? 1;

    if (targets === 'all') {
        process.exit(run(['.']));
    }
    if (targets.length === 0) {
        console.log(`${command}: no changed files`);
        process.exit(0);
    }
    console.log(`${command}: ${targets.length} changed file(s); JSP_LINT_ALL=1 checks every file`);
    let status = 0;
    for (let start = 0; start < targets.length; start += BATCH) {
        status = Math.max(status, run([...unmatched, ...targets.slice(start, start + BATCH)]));
    }
    process.exit(status);
}
