/**
 * Runs the short commands a launcher probes the host with.
 *
 * `launcherForHost` in `runner.ts` takes its one effect as a parameter, so its selection logic is
 * tested without a container daemon. Every script that starts a real server passes this one.
 */
import { spawnSync } from 'node:child_process';

import type { ProbeCommand } from './runner.ts';

/**
 * Runs a command to completion and reports its status and output. A command that could not be
 * started reports a null status and the spawn error as its standard error.
 */
export const spawnProbe: ProbeCommand = (command, args) => {
    const result = spawnSync(command, [...args], { encoding: 'utf8' });
    return {
        status: result.error !== undefined ? null : result.status,
        stdout: result.stdout ?? '',
        stderr: result.error !== undefined ? result.error.message : (result.stderr ?? '')
    };
};
