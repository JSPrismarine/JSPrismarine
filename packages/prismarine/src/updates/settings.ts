import { isRecord } from '../utils/isRecord';
import { isUpdateSource, UPDATE_CHANNELS } from './feed';
import type { UpdateChannel } from './feed';

/** How often the server checks, in minutes: six hours by default, the nightly interval, and never more than hourly. */
export const UPDATE_INTERVAL_MINUTES = { default: 360, minimum: 60 } as const;

/** The `updates` settings as the file holds them. A key the file leaves out is undefined and follows the build. */
export interface UpdateSettings {
    /** `updates.enabled`; undefined follows the build, on unless it runs from a checkout. */
    readonly enabled: boolean | undefined;
    /** `updates.channel`; undefined follows the build. */
    readonly channel: UpdateChannel | undefined;
    /** `updates.source`; undefined follows the build's stamp, then the site. */
    readonly source: string | undefined;
    /** `updates.interval`, in minutes, at least {@link UPDATE_INTERVAL_MINUTES.minimum}. */
    readonly interval: number;
    /**
     * What the section holds that the server could not use, each a sentence. A problem with
     * `enabled` or `source` turns the checker off, so it never reads a feed nobody chose.
     */
    readonly problems: readonly string[];
    /** Whether a problem turned the checker off. */
    readonly disabledByProblem: boolean;
}

/** The settings of a file with no `updates` section, or an empty one. */
export const DEFAULT_UPDATE_SETTINGS: UpdateSettings = {
    enabled: undefined,
    channel: undefined,
    source: undefined,
    interval: UPDATE_INTERVAL_MINUTES.default,
    problems: [],
    disabledByProblem: false
};

const isChannel = (value: unknown): value is UpdateChannel =>
    typeof value === 'string' && (UPDATE_CHANNELS as readonly string[]).includes(value);

/**
 * Reads the `updates` section. A value of the wrong kind is reported in `problems`: an `enabled`
 * or `source` the server cannot use turns the checker off, a bad `channel` follows the build, and
 * an `interval` that is not a number reads as the default and one under the minimum as the minimum.
 * @param section - What `config.json` holds under `updates`; undefined when it has nothing.
 */
export const readUpdateSettings = (section: unknown): UpdateSettings => {
    if (section === undefined) return DEFAULT_UPDATE_SETTINGS;
    if (!isRecord(section)) {
        return {
            ...DEFAULT_UPDATE_SETTINGS,
            enabled: false,
            problems: [
                `updates in config.json is ${JSON.stringify(section)}, not a section, so update checks are off.`
            ],
            disabledByProblem: true
        };
    }
    const problems: string[] = [];
    let disabledByProblem = false;

    const { enabled, channel, source, interval } = section;
    if (enabled !== undefined && typeof enabled !== 'boolean') {
        problems.push(
            `updates.enabled in config.json is ${JSON.stringify(enabled)}, not true or false, so update checks are off.`
        );
        disabledByProblem = true;
    }
    if (channel !== undefined && !isChannel(channel)) {
        problems.push(
            `updates.channel in config.json is ${JSON.stringify(channel)}, not ${UPDATE_CHANNELS.join(' or ')}, so the server follows its build's channel.`
        );
    }
    if (source !== undefined && (typeof source !== 'string' || !isUpdateSource(source))) {
        problems.push(
            `updates.source in config.json is ${JSON.stringify(source)}, not owner/repo or an https URL, so update checks are off.`
        );
        disabledByProblem = true;
    }
    let minutes: number = UPDATE_INTERVAL_MINUTES.default;
    if (interval !== undefined) {
        if (typeof interval !== 'number' || !Number.isFinite(interval)) {
            problems.push(
                `updates.interval in config.json is ${JSON.stringify(interval)}, not a number of minutes, so the server checks every ${UPDATE_INTERVAL_MINUTES.default}.`
            );
        } else if (interval < UPDATE_INTERVAL_MINUTES.minimum) {
            problems.push(
                `updates.interval in config.json is ${interval}, under the minimum, so the server checks every ${UPDATE_INTERVAL_MINUTES.minimum} minutes.`
            );
            minutes = UPDATE_INTERVAL_MINUTES.minimum;
        } else {
            minutes = interval;
        }
    }
    return {
        enabled: disabledByProblem ? false : typeof enabled === 'boolean' ? enabled : undefined,
        channel: isChannel(channel) ? channel : undefined,
        source: typeof source === 'string' && isUpdateSource(source) ? source : undefined,
        interval: minutes,
        problems,
        disabledByProblem
    };
};
