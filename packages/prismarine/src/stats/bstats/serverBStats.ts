import type { BStatsSettings, Config } from '../../config/Config';
import { isTestRunner } from '../../utils/isTestRunner';
import type { Environment } from '../../utils/isTestRunner';
import { BStatsProvider } from './BStatsProvider';
import type { BStatsOff, BStatsProviderOptions } from './BStatsProvider';

/** The config reads the server's bStats provider makes. `Config` has them all. */
export type BStatsConfigSource = Pick<Config, 'getServerUuid' | 'getBStatsSettings' | 'wasBStatsSectionCreated'>;

/**
 * The environment variable that turns bStats off, for containers and CI, with the values it
 * takes, case aside. Any other value turns bStats off too, with a warning. The docs quote it.
 */
export const BSTATS_OPT_OUT = {
    variable: 'JSP_BSTATS',
    /** Turn bStats off. The first is the one the docs show. */
    off: ['0', 'false', 'off', 'no'],
    /** Leave the decision to `stats.bstats.enabled`, as an unset variable does. */
    on: ['1', 'true', 'on', 'yes']
} as const;

const OFF_VALUES: ReadonlySet<string> = new Set(BSTATS_OPT_OUT.off);
const ON_VALUES: ReadonlySet<string> = new Set(BSTATS_OPT_OUT.on);

/** Why bStats does not report on this start. */
export type BStatsOffReason =
    'test-runner' | 'ci' | 'environment' | 'invalid-environment' | 'invalid-config' | 'disabled';

/** What decides whether bStats reports, each read at the provider's start. */
export interface BStatsDecisionInputs {
    /** The process environment, for the test runner, `CI` and `JSP_BSTATS`. */
    readonly env: Environment;
    /** The `stats.bstats` settings: `enabled`, and the problem that turned it off, if any. */
    readonly settings: Pick<BStatsSettings, 'enabled' | 'problem'>;
}

/**
 * Decides whether bStats reports on this start. It stays off under Vitest, when `CI` is set (as
 * every CI service sets it), when `JSP_BSTATS` turns it off or holds a value it does not take,
 * when `config.json` holds something other than a boolean where `stats.bstats.enabled` goes, and
 * when `stats.bstats.enabled` is false.
 * @returns The first reason that applies, in that order, or undefined when bStats reports.
 */
export const bstatsOffReason = ({ env, settings }: BStatsDecisionInputs): BStatsOffReason | undefined => {
    if (isTestRunner(env)) return 'test-runner';
    if (env.CI !== undefined) return 'ci';
    const optOut = env[BSTATS_OPT_OUT.variable]?.toLowerCase();
    if (optOut !== undefined && OFF_VALUES.has(optOut)) return 'environment';
    if (optOut !== undefined && !ON_VALUES.has(optOut)) return 'invalid-environment';
    if (settings.problem !== undefined) return 'invalid-config';
    if (!settings.enabled) return 'disabled';
    return undefined;
};

/** How the server logs each reason, given the environment and the settings that produced it. */
const offMessage = (reason: BStatsOffReason, { env, settings }: BStatsDecisionInputs): BStatsOff => {
    const { variable, off, on } = BSTATS_OPT_OUT;
    switch (reason) {
        case 'test-runner':
            return { level: 'debug', message: 'bStats is off under the test runner' };
        case 'ci':
            return { level: 'debug', message: 'bStats is off because CI is set' };
        case 'environment':
            return { level: 'debug', message: `bStats is off because ${variable}=${env[variable]} is set` };
        case 'invalid-environment':
            return {
                level: 'warn',
                message: `bStats is off because ${variable}=${env[variable]} is not a value it takes. Use ${off.join(', ')} to turn it off, or ${on.join(', ')} to follow stats.bstats.enabled.`
            };
        case 'invalid-config':
            return { level: 'warn', message: settings.problem ?? 'bStats is off because of config.json' };
        case 'disabled':
            return { level: 'debug', message: 'bStats is off because stats.bstats.enabled is false in config.json' };
    }
};

/** Logged on the first start that reports, the one that wrote the `stats.bstats` section. */
export const BSTATS_NOTICE =
    'This server sends anonymous usage statistics to bStats (https://bStats.org). To turn this off, set stats.bstats.enabled to false in config.json.';

/** Options for {@link serverBStatsProvider}. */
export interface ServerBStatsOptions extends Pick<BStatsProviderOptions, 'fetch' | 'random'> {
    /** The environment to read at each start. The process's own by default. */
    readonly env?: Environment;
}

/**
 * The bStats provider a server registers. It reads the config at each start rather than when it
 * is built, because the server builds its kernel before it loads the config. A start that
 * {@link bstatsOffReason} rules out schedules nothing and logs why, as a warning when the
 * operator's value is not one bStats takes. The start that wrote the `stats.bstats` section, when
 * it reports, logs {@link BSTATS_NOTICE}.
 * @param config - The server's config, loaded before the provider starts.
 * @param options - The environment, and the `fetch` and random source to use.
 * @returns The provider, with the id `bstats`.
 */
export const serverBStatsProvider = (
    config: BStatsConfigSource,
    { env = process.env, fetch, random }: ServerBStatsOptions = {}
): BStatsProvider =>
    new BStatsProvider({
        serverUuid: () => config.getServerUuid(),
        gate: () => {
            const inputs = { env, settings: config.getBStatsSettings() };
            const reason = bstatsOffReason(inputs);
            return reason === undefined ? undefined : offMessage(reason, inputs);
        },
        settings: () => config.getBStatsSettings(),
        onReport: (logger) => {
            if (config.wasBStatsSectionCreated()) logger.info(BSTATS_NOTICE);
        },
        ...(fetch === undefined ? {} : { fetch }),
        ...(random === undefined ? {} : { random })
    });
