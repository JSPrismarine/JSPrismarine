import { CI_VARIABLE } from '../stats/bstats/serverBStats';
import { DO_NOT_TRACK_VARIABLE, isDoNotTrack } from '../utils/doNotTrack';
import { ENV_SWITCH_VALUES, readEnvSwitch } from '../utils/envSwitch';
import { isTestRunner } from '../utils/isTestRunner';
import type { Environment } from '../utils/isTestRunner';
import { buildStamp, buildType } from '../version';
import type { BuildDefines } from '../version';
import { DEFAULT_UPDATE_SOURCE } from './feed';
import type { UpdateChannel } from './feed';
import type { UpdateSettings } from './settings';

/** The environment variable that turns update checks off, for containers and CI. The docs quote it. */
export const UPDATE_CHECK_OPT_OUT = {
    variable: 'JSP_UPDATE_CHECK',
    off: ENV_SWITCH_VALUES.off,
    on: ENV_SWITCH_VALUES.on
} as const;

/** What a check reads: the channel and where its feed is. */
export interface UpdateTarget {
    readonly channel: UpdateChannel;
    readonly source: string;
}

/**
 * The channel and source a server checks, from its settings and then its build. A nightly
 * executable follows `nightly` and every other build `release`: an npm `unstable` snapshot is not
 * in the nightly feed, and its release sorts above it. The source is `updates.source`, then the
 * source the build stamped, then the site.
 * @returns The target, or undefined when `updates` holds something that turned checks off.
 */
export const updateTargetOf = (settings: UpdateSettings, build: BuildDefines): UpdateTarget | undefined => {
    if (settings.disabledByProblem) return undefined;
    return {
        channel: settings.channel ?? (buildStamp(build) === 'nightly' ? 'nightly' : 'release'),
        source: settings.source ?? build.updateSource ?? DEFAULT_UPDATE_SOURCE
    };
};

/** Whether the server checks on a schedule, and when it does not, how it says why. */
export type UpdateCheckDecision =
    | { readonly on: true; readonly target: UpdateTarget }
    | { readonly on: false; readonly level: 'debug' | 'warn'; readonly reason: string };

/**
 * Decides whether the server checks for updates on its own. It does not under Vitest, when `CI`
 * is set, when `DO_NOT_TRACK` asks not to track, when `JSP_UPDATE_CHECK` turns it off or holds a
 * value it does not take, when `updates` holds something it cannot use, when `updates.enabled` is
 * false, and on a build run from a checkout unless `updates.enabled` is true.
 */
export const decideUpdateCheck = ({
    env,
    settings,
    build
}: {
    readonly env: Environment;
    readonly settings: UpdateSettings;
    readonly build: BuildDefines;
}): UpdateCheckDecision => {
    const { variable, off, on } = UPDATE_CHECK_OPT_OUT;
    if (isTestRunner(env)) return { on: false, level: 'debug', reason: 'the server runs under the test runner' };
    if (env[CI_VARIABLE] !== undefined) return { on: false, level: 'debug', reason: `${CI_VARIABLE} is set` };
    if (isDoNotTrack(env))
        return {
            on: false,
            level: 'debug',
            reason: `${DO_NOT_TRACK_VARIABLE}=${env[DO_NOT_TRACK_VARIABLE]} is set`
        };
    const optOut = readEnvSwitch(env[variable]);
    if (optOut === 'off') return { on: false, level: 'debug', reason: `${variable}=${env[variable]} is set` };
    if (optOut === 'invalid') {
        return {
            on: false,
            level: 'warn',
            reason: `${variable}=${env[variable]} is not a value it takes. Use ${off.join(', ')} to turn checks off, or ${on.join(', ')} to follow updates.enabled`
        };
    }
    const target = updateTargetOf(settings, build);
    if (target === undefined)
        return { on: false, level: 'warn', reason: 'config.json holds an updates setting it cannot use' };
    if (settings.enabled === false)
        return { on: false, level: 'debug', reason: 'updates.enabled is false in config.json' };
    if (settings.enabled === undefined && buildType(build) === 'dev') {
        return {
            on: false,
            level: 'debug',
            reason: 'the server runs from a checkout; set updates.enabled to true to check'
        };
    }
    return { on: true, target };
};
