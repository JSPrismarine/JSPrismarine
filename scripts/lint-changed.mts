/**
 * Runs a lint or format command on the files this branch changed.
 *
 * node scripts/lint-changed.mts prettier --check
 * JSP_LINT_ALL=1 node scripts/lint-changed.mts biome check   # every file
 * JSP_LINT_BASE=HEAD node scripts/lint-changed.mts biome check # uncommitted files only
 *
 * A changed file is one that differs from the merge base with the default branch: committed on this
 * branch, staged, unstaged or untracked. The command gets those paths in place of `.`, or nothing
 * runs when there are none. A change to a formatter's own configuration restyles every file, so it
 * runs the command on everything, as `JSP_LINT_ALL=1` does. CI's plan job runs `lint:all`, which
 * sets it, so a formatter upgrade in `package.json` or the lockfile is checked against every file
 * there; locally those two files are linted like any other.
 * `JSP_LINT_BASE` names another commit to compare against; the agent lint gate sets it to `HEAD`.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Files whose change can restyle any file: the formatters' configuration. The manifest and lockfile
 * that pin the formatters' versions are left out, since nearly every dependency change touches
 * them; CI's `lint:all` checks a formatter upgrade.
 */
export const LINT_INPUTS: readonly string[] = ['.editorconfig', '.prettierignore', 'biome.json'];

/**
 * Chooses what a lint command runs on.
 *
 * @param changed - Changed files, relative to the repository root, with forward slashes.
 * @param exists - Whether a file is on disk to check; see {@link isCheckable}.
 * @returns `all` to run on every file, or the existing changed files, which may be none.
 */
export const lintTargets = (changed: readonly string[], exists: (file: string) => boolean): 'all' | string[] => {
    if (changed.some((file) => LINT_INPUTS.includes(file) || /^\.prettierrc/.test(file))) return 'all';
    return [...new Set(changed)].filter(exists).sort();
};

/**
 * Whether a changed path is a file the formatters can check. A deleted file has nothing to check, and
 * a symbolic link, such as a skill's `.claude/skills` entry, makes Prettier fail when named explicitly.
 *
 * @param file - An absolute path.
 */
export const isCheckable = (file: string): boolean => {
    try {
        return !fs.lstatSync(file).isSymbolicLink();
    } catch {
        return false;
    }
};

/**
 * Splits the script's arguments into the command and the arguments it gets. `pnpm run lint:biome --
 * --max-diagnostics=500` forwards the `--` too, and the tool would read every option after it as a
 * path, so the first `--` is dropped.
 *
 * @param argv - The arguments after the script's path.
 */
export const commandLine = (argv: readonly string[]): { command: string | undefined; args: string[] } => {
    const [command, ...args] = argv;
    const separator = args.indexOf('--');
    if (separator !== -1) args.splice(separator, 1);
    return { command, args };
};

const git = (root: string, args: readonly string[]): string | undefined => {
    try {
        return execFileSync('git', [...args], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
        return undefined;
    }
};

const nul = (output: string): string[] => output.split('\0').filter((entry) => entry !== '');

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

/**
 * The files that differ from `JSP_LINT_BASE`, or from the merge base when it is unset, relative to
 * `root`. `undefined` when Git cannot say, which runs the command on everything.
 */
export const changedFiles = (root: string): string[] | undefined => {
    const base = process.env.JSP_LINT_BASE || mergeBase(root);
    if (base === undefined) return undefined;
    const tracked = git(root, ['diff', '-z', '--name-only', '--no-renames', base]);
    const untracked = git(root, ['ls-files', '-z', '--others', '--exclude-standard']);
    if (tracked === undefined || untracked === undefined) return undefined;
    return [...nul(tracked), ...nul(untracked)];
};

/** Paths per invocation, which keeps a long list under the operating system's argument limit. */
const BATCH = 400;

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const { command, args } = commandLine(process.argv.slice(2));
    if (command === undefined) {
        console.error('usage: node scripts/lint-changed.mts <command> [arguments...]');
        process.exit(2);
    }
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const changed = process.env.JSP_LINT_ALL === '1' ? undefined : changedFiles(root);
    const targets = changed === undefined ? 'all' : lintTargets(changed, (file) => isCheckable(path.join(root, file)));

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
