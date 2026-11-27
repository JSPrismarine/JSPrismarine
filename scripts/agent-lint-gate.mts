/**
 * Hook that keeps coding agents from committing or finishing with failing
 * lint. Claude Code and Codex both pipe the hook event as JSON on stdin, so
 * `.claude/settings.json` and `.codex/hooks.json` run this same file.
 *
 * - `PreToolUse` on a shell command that runs `git commit`: lints the
 *   uncommitted changes and denies the command when they fail.
 * - `Stop`: lints the uncommitted changes and asks the agent to keep going
 *   when they fail.
 *
 * Both lint only what differs from `HEAD`, so a clean tree costs nothing and
 * a push is never gated: every commit it carries passed the commit gate.
 * Prettier and Biome check the changed files, and of the checks `lint:custom`
 * lists, only those whose inputs changed run (`lint-gate-checks.mts`). A
 * passing run records a fingerprint of the changes, and a later run on the
 * same changes, such as the commit after a passing `Stop`, skips the lint.
 */

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { ChangedPath } from './lint-gate-checks.mts';
import { customChecks, gateScripts } from './lint-gate-checks.mts';

/** Matches `git commit`, including `git -C dir commit`. */
const GATED_GIT_COMMAND = /\bgit\s+(?:-\S+\s+(?:[^\s-]\S*\s+)?)*commit\b/;

/** Lines of lint output handed back to the agent. */
const OUTPUT_TAIL_LINES = 60;

interface HookInput {
    hook_event_name?: string;
    cwd?: string;
    tool_name?: string;
    tool_input?: { command?: unknown };
    stop_hook_active?: boolean;
}

const git = (cwd: string, args: readonly string[], input?: string): string | undefined => {
    const result = spawnSync('git', args, { cwd, input, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
    return result.status === 0 ? result.stdout : undefined;
};

/**
 * Identifies the uncommitted changes: `HEAD`, the diff against it and the
 * contents of untracked files. `undefined` when Git cannot say, which lints.
 */
const fingerprint = (cwd: string): string | undefined => {
    const head = git(cwd, ['rev-parse', 'HEAD']);
    const diff = git(cwd, ['diff', 'HEAD', '--binary', '--no-ext-diff']);
    const untracked = git(cwd, ['ls-files', '--others', '--exclude-standard']);
    if (head === undefined || diff === undefined || untracked === undefined) return undefined;
    const blobs = untracked.trim() === '' ? '' : git(cwd, ['hash-object', '--stdin-paths'], untracked);
    if (blobs === undefined) return undefined;
    return createHash('sha256').update(head).update(diff).update(untracked).update(blobs).digest('hex');
};

/** Where the last passing fingerprint lives; per worktree, inside its Git directory. */
const passFile = (cwd: string): string | undefined => {
    const file = git(cwd, ['rev-parse', '--path-format=absolute', '--git-path', 'agent-lint-gate'])?.trim();
    return file ? path.resolve(cwd, file) : undefined;
};

const lastPass = (file: string): string | undefined => {
    try {
        return readFileSync(file, 'utf8').trim();
    } catch {
        return undefined;
    }
};

/**
 * The uncommitted changes from `git status`, with renamed files' old paths. `undefined` when Git
 * cannot say.
 */
const changedPaths = (cwd: string): ChangedPath[] | undefined => {
    const status = git(cwd, ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
    if (status === undefined) return undefined;
    const entries = status.split('\0');
    const changes: ChangedPath[] = [];
    for (let index = 0; index < entries.length; index++) {
        const entry = entries[index];
        if (entry === undefined || entry.length < 4) continue;
        const code = entry.slice(0, 2);
        changes.push({ path: entry.slice(3), added: /[?ARC]/.test(code) });
        // A rename or copy is followed by the path it came from.
        if (/[RC]/.test(code)) {
            const origin = entries[++index];
            if (origin) changes.push({ path: origin, added: false });
        }
    }
    return changes;
};

/** The scripts `lint:custom` runs, from the root `package.json`; `undefined` when it cannot be read. */
const lintCustomChecks = (cwd: string): string[] | undefined => {
    const root = git(cwd, ['rev-parse', '--show-toplevel'])?.trim();
    if (!root) return undefined;
    try {
        // The manifest is JSON the repository owns; only `scripts` is read, and checked.
        const manifest: { scripts?: Record<string, unknown> } = JSON.parse(
            readFileSync(path.join(root, 'package.json'), 'utf8')
        );
        const command = manifest.scripts?.['lint:custom'];
        return typeof command === 'string' ? customChecks(command) : undefined;
    } catch {
        return undefined;
    }
};

/**
 * Lints the uncommitted changes in `cwd` and returns the trimmed output when
 * they fail. Skips a clean tree and changes that already passed.
 */
const lintFailure = (cwd: string): string | undefined => {
    if (git(cwd, ['status', '--porcelain'])?.trim() === '') return undefined;
    const changes = fingerprint(cwd);
    const file = passFile(cwd);
    if (changes !== undefined && file !== undefined && lastPass(file) === changes) return undefined;

    const changed = changedPaths(cwd);
    const checks = lintCustomChecks(cwd);
    // Without the changes or the check list, run the whole lint rather than guess.
    const scripts = changed === undefined || checks === undefined ? undefined : gateScripts(checks, changed);
    if (scripts?.length === 0) return undefined;
    const command =
        scripts === undefined
            ? ['run', 'lint']
            : ['exec', 'concurrently', '--prefix', '{name}', ...scripts.map((script) => `pnpm:${script}`)];

    const result = spawnSync('pnpm', command, {
        cwd,
        env: { ...process.env, JSP_LINT_BASE: 'HEAD' },
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024
    });
    if (result.status === 0) {
        if (changes !== undefined && file !== undefined) {
            try {
                writeFileSync(file, `${changes}\n`);
            } catch {
                // A missing record only costs the next run a lint.
            }
        }
        return undefined;
    }
    const output = `${result.stdout}${result.stderr}${result.error ? `\n${result.error.message}` : ''}`;
    return output.split('\n').slice(-OUTPUT_TAIL_LINES).join('\n').trim();
};

let input: HookInput;
try {
    // Hook payloads are untrusted JSON from the agent host.
    input = JSON.parse(
        await new Promise<string>((resolve) => {
            let data = '';
            process.stdin.setEncoding('utf8');
            process.stdin.on('data', (chunk) => (data += chunk));
            process.stdin.on('end', () => resolve(data));
        })
    );
} catch {
    process.exit(0);
}

const cwd = input.cwd ?? process.cwd();

if (input.hook_event_name === 'PreToolUse') {
    const command = input.tool_input?.command;
    if (typeof command !== 'string' || !GATED_GIT_COMMAND.test(command)) process.exit(0);
    const failure = lintFailure(cwd);
    if (failure === undefined) process.exit(0);
    console.error(`Lint fails, so this git command is blocked. Fix the problems and run it again.\n\n${failure}`);
    process.exit(2);
}

if (input.hook_event_name === 'Stop') {
    // Blocking a second time would loop forever when the agent cannot fix the failure.
    if (input.stop_hook_active) process.exit(0);
    const failure = lintFailure(cwd);
    if (failure === undefined) process.exit(0);
    console.log(
        JSON.stringify({
            decision: 'block',
            reason: `Lint fails on the uncommitted changes. Fix the problems before finishing.\n\n${failure}`
        })
    );
}
