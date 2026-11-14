import { afterEach, describe, expect, it, vi } from 'vitest';

import { BuildPlatform } from '@jsprismarine/minecraft';
import type { ProtocolCodec } from '@jsprismarine/protocol';
import pkg from '../../package.json' with { type: 'json' };
import Codec2193 from '../network/codec/Codec2193';
import Codec2225 from '../network/codec/Codec2225';
import { DEVICE_OS_NAMES, ServerMetric, deviceOsName, serverMetrics } from './serverMetrics';
import { metricsSettings as settings, serverRegistry, sessionsWith } from './serverRegistry.test.helper';

const firstRelease = (codec: ProtocolCodec): string => {
    const release = codec.minecraftVersions[0];
    if (release === undefined) throw new Error(`Codec ${codec.protocolVersion} names no release`);
    return release;
};

/** Each reading's value by metric name. */
const valuesOf = (registry: ReturnType<typeof serverRegistry>) =>
    Object.fromEntries([...registry.snapshot().metrics].map(([name, { value }]) => [name, value]));

describe('stats/serverMetrics', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('builds one metric per server metric name, each described', () => {
        const metrics = serverMetrics({ config: settings(true, true, true), sessions: sessionsWith([]) });

        expect(metrics.map(({ name }) => name)).toEqual(Object.values(ServerMetric));
        for (const metric of metrics) expect(metric.description, metric.name).toMatch(/\.$/);
    });

    it('reports every server metric for a server with known players and settings', () => {
        const registry = serverRegistry(
            [
                { os: BuildPlatform.WIN32, codec: Codec2225, transport: 'NetherNet' },
                { os: BuildPlatform.GOOGLE, codec: Codec2225, transport: 'RakNet' },
                { os: BuildPlatform.GOOGLE, codec: Codec2193, transport: 'RakNet' },
                { os: null, codec: Codec2193, transport: 'RakNet' },
                // Still logging in, so not counted anywhere.
                { os: BuildPlatform.IOS, codec: Codec2225, transport: 'RakNet', online: false }
            ],
            settings(true, true, true)
        );

        expect(valuesOf(registry)).toEqual({
            [ServerMetric.players]: 4,
            [ServerMetric.build_type]: 'dev',
            [ServerMetric.version]: pkg.version,
            [ServerMetric.online_mode]: 'online',
            [ServerMetric.transports]: ['RakNet', 'NetherNet'],
            [ServerMetric.player_platform]: { Windows: 1, Android: 2, Unknown: 1 },
            [ServerMetric.player_protocol]: {
                [firstRelease(Codec2225)]: { [String(Codec2225.protocolVersion)]: 2 },
                [firstRelease(Codec2193)]: { [String(Codec2193.protocolVersion)]: 2 }
            },
            [ServerMetric.player_transport]: { NetherNet: 1, RakNet: 3 }
        });
    });

    it('names each protocol by the first release that speaks it', () => {
        expect(firstRelease(Codec2225)).toBe('1.26.60');
    });

    it('reports an empty server as zero players and empty player counts', () => {
        const values = valuesOf(serverRegistry([], settings(false, true, false)));

        expect(values[ServerMetric.players]).toBe(0);
        expect(values[ServerMetric.player_platform]).toEqual({});
        expect(values[ServerMetric.player_protocol]).toEqual({});
        expect(values[ServerMetric.player_transport]).toEqual({});
    });

    it.each([
        { onlineMode: false, rakNet: true, netherNet: false, mode: 'offline', transports: ['RakNet'] },
        { onlineMode: true, rakNet: false, netherNet: true, mode: 'online', transports: ['NetherNet'] },
        { onlineMode: true, rakNet: false, netherNet: false, mode: 'online', transports: [] }
    ])(
        'reports online mode $mode and transports $transports from the settings',
        ({ onlineMode, rakNet, netherNet, mode, transports }) => {
            const values = valuesOf(serverRegistry([], settings(onlineMode, rakNet, netherNet)));

            expect(values[ServerMetric.online_mode]).toBe(mode);
            expect(values[ServerMetric.transports]).toEqual(transports);
        }
    );

    it.each([
        ['release', '0.20.0'],
        ['nightly', '0.20.0-nightly.20261112.1']
    ])('reports a stamped %s build and its version', (type, version) => {
        vi.stubGlobal('BUILD_TYPE', type);
        vi.stubGlobal('BUILD_VERSION', version);

        const values = valuesOf(serverRegistry([], settings(true, true, true)));

        expect(values[ServerMetric.build_type]).toBe(type);
        expect(values[ServerMetric.version]).toBe(version);
    });

    describe('deviceOsName', () => {
        it('names every BuildPlatform member', () => {
            const members = Object.values(BuildPlatform).filter((value) => typeof value === 'number');

            expect(Object.keys(DEVICE_OS_NAMES).map(Number).sort()).toEqual([...members].sort());
            expect(members.filter((os) => deviceOsName(os) === 'Unknown')).toEqual([BuildPlatform.UNKNOWN]);
            expect(new Set(members.map(deviceOsName)).size).toBe(members.length);
        });

        it.each([
            [BuildPlatform.GOOGLE, 'Android'],
            [BuildPlatform.IOS, 'iOS'],
            [BuildPlatform.OSX, 'macOS'],
            [BuildPlatform.AMAZON, 'Fire OS'],
            [BuildPlatform.WIN32, 'Windows'],
            [BuildPlatform.SONY, 'PlayStation'],
            [BuildPlatform.NINTENDO, 'Nintendo Switch'],
            [BuildPlatform.XBOX, 'Xbox'],
            [BuildPlatform.LINUX, 'Linux'],
            [BuildPlatform.UNKNOWN, 'Unknown']
        ])('names %s %s', (os, name) => {
            expect(deviceOsName(os)).toBe(name);
        });

        it.each([
            ['an unlisted number', 7],
            ['an out-of-range number', 1_000_000],
            ['a fraction', 1.5],
            ['NaN', Number.NaN],
            ['a numeric string', '1'],
            ['a member name', 'GOOGLE'],
            ['__proto__', '__proto__'],
            ['toString', 'toString'],
            ['constructor', 'constructor'],
            ['null', null],
            ['undefined', undefined],
            ['an object', { valueOf: (): number => 1 }]
        ])('counts %s as Unknown', (_case, os) => {
            expect(deviceOsName(os)).toBe('Unknown');
        });

        it('counts a player whose client sent a made-up device OS as Unknown', () => {
            const values = valuesOf(
                serverRegistry(
                    [
                        { os: '__proto__', codec: Codec2225, transport: 'RakNet' },
                        { os: 99, codec: Codec2225, transport: 'RakNet' },
                        { os: BuildPlatform.XBOX, codec: Codec2225, transport: 'RakNet' }
                    ],
                    settings(true, true, true)
                )
            );

            expect(values[ServerMetric.player_platform]).toEqual({ Unknown: 2, Xbox: 1 });
        });
    });
});
