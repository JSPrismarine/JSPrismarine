import { BuildPlatform } from '@jsprismarine/minecraft';

import type { Config } from '../config/Config';
import { TransportNames } from '../network/transport/Transport';
import type SessionManager from '../SessionManager';
import { buildType, serverVersion } from '../version';
import type { StatsMetric } from './StatsMetric';

/**
 * The names of the metrics the server registers about itself, keyed by the part after the
 * `jsprismarine:` namespace. A provider that reads one of them by name reads it from here.
 */
export const ServerMetric = {
    /** Players online, a `gauge`. */
    players: 'jsprismarine:players',
    /** `dev`, `nightly` or `release`, a `label`. */
    build_type: 'jsprismarine:build_type',
    /** The server version, such as `0.20.0`, a `label`. */
    version: 'jsprismarine:version',
    /** `online` or `offline`, a `label`. */
    online_mode: 'jsprismarine:online_mode',
    /** The enabled transports, a `set`. */
    transports: 'jsprismarine:transports',
    /** Online players per device platform, such as `Android`, a `distribution`. */
    player_platform: 'jsprismarine:player_platform',
    /** Online players per Minecraft release, then protocol number, a `breakdown`. */
    player_protocol: 'jsprismarine:player_protocol',
    /** Online players per transport they joined over, a `distribution`. */
    player_transport: 'jsprismarine:player_transport'
} as const;

/** One of the server's metric names, such as `jsprismarine:players`. */
export type ServerMetricName = (typeof ServerMetric)[keyof typeof ServerMetric];

/**
 * The name each device OS a client reports goes by, for every `BuildPlatform` member. `DEDICATED`
 * is Bedrock Dedicated Server's own value, which no player client sends.
 */
export const DEVICE_OS_NAMES = {
    [BuildPlatform.GOOGLE]: 'Android',
    [BuildPlatform.IOS]: 'iOS',
    [BuildPlatform.OSX]: 'macOS',
    [BuildPlatform.AMAZON]: 'Fire OS',
    [BuildPlatform.WIN32]: 'Windows',
    [BuildPlatform.DEDICATED]: 'Dedicated Server',
    [BuildPlatform.SONY]: 'PlayStation',
    [BuildPlatform.NINTENDO]: 'Nintendo Switch',
    [BuildPlatform.XBOX]: 'Xbox',
    [BuildPlatform.LINUX]: 'Linux',
    [BuildPlatform.UNKNOWN]: 'Unknown'
} as const satisfies Record<BuildPlatform, string>;

/** A device OS name by `BuildPlatform` value, built once from the enum's numeric members. */
const DEVICE_OS_BY_VALUE: ReadonlyMap<unknown, string> = new Map(
    Object.values(BuildPlatform)
        .filter((value): value is BuildPlatform => typeof value === 'number')
        .map((value) => [value, DEVICE_OS_NAMES[value]])
);

/**
 * The name of a device OS a client reported. The value comes from the client's login, so only a
 * number that is a `BuildPlatform` member counts, and anything else is `Unknown`.
 * @param os - The `DeviceOS` value from the client's login, or undefined for a player with no device.
 * @returns A name from {@link DEVICE_OS_NAMES}.
 */
export const deviceOsName = (os: unknown): string =>
    DEVICE_OS_BY_VALUE.get(os) ?? DEVICE_OS_NAMES[BuildPlatform.UNKNOWN];

/** What the server metrics read: the settings and the sessions. */
export interface ServerMetricSources {
    readonly config: Pick<Config, 'getOnlineMode' | 'getEnableRakNet' | 'getEnableNetherNet'>;
    readonly sessions: Pick<SessionManager, 'getSessions'>;
}

/** Adds one to a count, creating the entry at one. */
const increment = (counts: Record<string, number>, key: string): void => {
    counts[key] = (counts[key] ?? 0) + 1;
};

/**
 * The metrics the server registers about itself, one per {@link ServerMetric} name. Each reads
 * its source when a provider asks, so a config reload or a player joining shows up in the next
 * reading.
 *
 * A protocol is reported under the first Minecraft release that speaks it, such as `1.26.60` for
 * the protocol 1.26.60 to 1.26.62 share, since a client names only its protocol.
 * @param sources - The config and the session manager to read.
 * @returns The metrics, in {@link ServerMetric} order.
 */
export const serverMetrics = ({ config, sessions }: ServerMetricSources): StatsMetric[] => [
    {
        name: ServerMetric.players,
        kind: 'gauge',
        description: 'Players online.',
        unit: 'players',
        read: () => sessions.getSessions().length
    },
    {
        name: ServerMetric.build_type,
        kind: 'label',
        description: 'Whether the server is a `dev`, `nightly` or `release` build.',
        read: buildType
    },
    {
        name: ServerMetric.version,
        kind: 'label',
        description: 'The server version.',
        read: serverVersion
    },
    {
        name: ServerMetric.online_mode,
        kind: 'label',
        description: 'Whether `online-mode` is on, as `online` or `offline`.',
        read: () => (config.getOnlineMode() ? 'online' : 'offline')
    },
    {
        name: ServerMetric.transports,
        kind: 'set',
        description: 'The transports the server accepts players over.',
        read: () => [
            ...(config.getEnableRakNet() ? [TransportNames.raknet] : []),
            ...(config.getEnableNetherNet() ? [TransportNames.nethernet] : [])
        ]
    },
    {
        name: ServerMetric.player_platform,
        kind: 'distribution',
        description: 'Online players per device platform.',
        unit: 'players',
        read: () => {
            const counts: Record<string, number> = {};
            for (const session of sessions.getSessions())
                increment(counts, deviceOsName(session.getPlayer().device?.os));
            return counts;
        }
    },
    {
        name: ServerMetric.player_protocol,
        kind: 'breakdown',
        description: 'Online players per Minecraft release, then protocol number.',
        unit: 'players',
        read: () => {
            const counts: Record<string, Record<string, number>> = {};
            for (const session of sessions.getSessions()) {
                const { minecraftVersions, protocolVersion } = session.getConnection().codec;
                const release = minecraftVersions[0];
                if (release === undefined) continue;
                increment((counts[release] ??= {}), String(protocolVersion));
            }
            return counts;
        }
    },
    {
        name: ServerMetric.player_transport,
        kind: 'distribution',
        description: 'Online players per transport they joined over.',
        unit: 'players',
        read: () => {
            const counts: Record<string, number> = {};
            for (const session of sessions.getSessions()) {
                increment(counts, session.getConnection().getTransport());
            }
            return counts;
        }
    }
];
