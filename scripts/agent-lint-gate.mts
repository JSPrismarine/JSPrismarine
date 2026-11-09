/**
 * Hook that keeps coding agents from committing, pushing, or finishing with
 * failing lint. Claude Code and Codex both pipe the hook event as JSON on
 * stdin, so `.claude/settings.json` and `.codex/hooks.json` run this same file.
 *
 * - `PreToolUse` on a shell command that runs `git commit` or `git push`:
 *   runs `pnpm run lint` and denies the command when it fails.
 * - `Stop`: runs `pnpm run lint` when the working tree has uncommitted
 *   changes and asks the agent to keep going when it fails. Clean trees were
 *   already linted by the commit gate.
 */

import { spawnSync } from 'node:child_process';

/** Matches `git commit` and `git push`, including `git -C dir commit`. */
const GATED_GIT_COMMAND = /\bgit\s+(?:-\S+\s+(?:\S+\s+)?)*(?:commit|push)\b/;

/** Lines of lint output handed back to the agent. */
const OUTPUT_TAIL_LINES = 60;

interface HookInput {
    hook_event_name?: string;
    cwd?: string;
    tool_name?: string;
    tool_input?: { command?: unknown };
    stop_hook_active?: boolean;
}

/** Runs the lint script in `cwd` and returns its trimmed output when it fails. */
const lintFailure = (cwd: string): string | undefined => {
    const result = spawnSync('pnpm', ['run', 'lint'], { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (result.status === 0) return undefined;
    const output = `${result.stdout}${result.stderr}${result.error ? `\n${result.error.message}` : ''}`;
    return output.split('\n').slice(-OUTPUT_TAIL_LINES).join('\n').trim();
};

const hasUncommittedChanges = (cwd: string): boolean => {
    const result = spawnSync('git', ['status', '--porcelain'], { cwd, encoding: 'utf8' });
    return result.status !== 0 || result.stdout.trim().length > 0;
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
    if (input.stop_hook_active || !hasUncommittedChanges(cwd)) process.exit(0);
    const failure = lintFailure(cwd);
    if (failure === undefined) process.exit(0);
    console.log(
        JSON.stringify({
            decision: 'block',
            reason: `\`pnpm run lint\` fails. Fix the problems before finishing.\n\n${failure}`
        })
    );
}
