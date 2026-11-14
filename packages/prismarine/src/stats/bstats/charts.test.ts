import { afterEach, describe, expect, it, vi } from 'vitest';

import { BuildPlatform } from '@jsprismarine/minecraft';
import { registeredCodecs } from '../../network/codec/CodecRegistry';
import { TransportNames } from '../../network/transport/Transport';
import { DEVICE_OS_NAMES, ServerMetric } from '../serverMetrics';
import type { JoinedPlayer } from '../serverRegistry.test.helper';
import { metricsSettings, serverRegistry, testPlatform } from '../serverRegistry.test.helper';
import type { StatsReading } from '../StatsMetric';
import type { StatsSnapshot } from '../StatsRegistry';
import { matchesFilter } from './bstats.test.helper';
import type { BStatsChart, BStatsChartSpec } from './charts';
import { BSTATS_CHARTS, BSTATS_DEFAULT_CHART_IDS, chartId, encodeChart, encodeCharts } from './charts';

/** A snapshot of the test host holding the given readings. */
const snapshotOf = (readings: Record<string, StatsReading> = {}): StatsSnapshot => ({
    platform: testPlatform,
    metrics: new Map(Object.entries(readings))
});

const reading = {
    gauge: (value: number): StatsReading => ({ kind: 'gauge', value, description: 'Test.' }),
    label: (value: string): StatsReading => ({ kind: 'label', value, description: 'Test.' }),
    set: (value: string[]): StatsReading => ({ kind: 'set', value, description: 'Test.' }),
    distribution: (value: Record<string, number>): StatsReading => ({
        kind: 'distribution',
        value,
        description: 'Test.'
    }),
    breakdown: (value: Record<string, Record<string, number>>): StatsReading => ({
        kind: 'breakdown',
        value,
        description: 'Test.'
    })
};

/** A player per registered codec, device OS and transport, so every value a chart can take shows up. */
const everyPlayer: JoinedPlayer[] = registeredCodecs.flatMap((codec) =>
    [...Object.values(BuildPlatform).filter((os) => typeof os === 'number'), null].flatMap((os) =>
        Object.values(TransportNames).map((transport) => ({ os, codec, transport }))
    )
);

describe('stats/bstats/charts', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('maps every chart to its camelCase chart ID', () => {
        expect(Object.keys(BSTATS_CHARTS).map(chartId)).toEqual([
            'players',
            'buildType',
            'memory',
            'onlineMode',
            'transports',
            'playerPlatform',
            'playerProtocol',
            'playerTransport'
        ]);
    });

    it.each([
        ['servers', 'servers'],
        ['coreCount', 'core_count'],
        ['osArch', 'os_arch'],
        ['os', 'os'],
        ['location', 'location'],
        ['locationMap', 'location_map']
    ])('rejects a chart name that maps onto the default chart %s', (id, name) => {
        expect(BSTATS_DEFAULT_CHART_IDS).toContain(id);
        expect(() => chartId(name)).toThrow(`default chart "${id}"`);
    });

    it.each(['jsprismarine:players', 'playerProtocol', 'player-protocol', '_players', ''])(
        'rejects %s, which is not a snake_case chart name',
        (name) => {
            expect(() => chartId(name)).toThrow('is not snake_case');
        }
    );

    describe('encodeChart', () => {
        const players = BSTATS_CHARTS.players;
        const onlineMode = BSTATS_CHARTS.online_mode;
        const transports = BSTATS_CHARTS.transports;
        const protocol = BSTATS_CHARTS.player_protocol;

        it('encodes a SingleLineChart as one value and leaves out 0 and a missing reading', () => {
            expect(encodeChart('players', players, snapshotOf({ [ServerMetric.players]: reading.gauge(4) }))).toEqual({
                chartId: 'players',
                data: { value: 4 }
            });
            expect(
                encodeChart('players', players, snapshotOf({ [ServerMetric.players]: reading.gauge(0) }))
            ).toBeUndefined();
            expect(encodeChart('players', players, snapshotOf())).toBeUndefined();
        });

        it('encodes a SimplePie as one value and leaves out an empty one', () => {
            const of = (value: string) => snapshotOf({ [ServerMetric.online_mode]: reading.label(value) });

            expect(encodeChart('online_mode', onlineMode, of('online'))).toEqual({
                chartId: 'onlineMode',
                data: { value: 'online' }
            });
            expect(encodeChart('online_mode', onlineMode, of(''))).toBeUndefined();
        });

        it('encodes an AdvancedPie without its zero entries and leaves it out when none are left', () => {
            const fixed = (counts?: Record<string, number>): BStatsChartSpec => ({
                type: 'AdvancedPie',
                title: 'Test',
                description: 'Test.',
                maxValue: 1,
                build: () => counts
            });

            expect(encodeChart('test', fixed(), snapshotOf())).toBeUndefined();
            expect(encodeChart('test', fixed({ RakNet: 1, NetherNet: 0 }), snapshotOf())).toEqual({
                chartId: 'test',
                data: { values: { RakNet: 1 } }
            });
            expect(encodeChart('test', fixed({ RakNet: 0 }), snapshotOf())).toBeUndefined();
            expect(encodeChart('test', fixed({}), snapshotOf())).toBeUndefined();
        });

        it('encodes a DrilldownPie without its empty inner maps and leaves it out when none are left', () => {
            const of = (value: Record<string, Record<string, number>>) =>
                snapshotOf({ [ServerMetric.player_protocol]: reading.breakdown(value) });

            expect(encodeChart('player_protocol', protocol, of({ '1.26.60': { '2225': 1 }, '1.26.50': {} }))).toEqual({
                chartId: 'playerProtocol',
                data: { values: { '1.26.60': { '2225': 1 } } }
            });
            expect(encodeChart('player_protocol', protocol, of({ '1.26.60': {} }))).toBeUndefined();
            expect(encodeChart('player_protocol', protocol, of({}))).toBeUndefined();
        });

        it('sends each enabled transport as one entry, and no chart when none is enabled', () => {
            const of = (value: string[]) => snapshotOf({ [ServerMetric.transports]: reading.set(value) });

            expect(encodeChart('transports', transports, of(['RakNet', 'NetherNet']))).toEqual({
                chartId: 'transports',
                data: { values: { RakNet: 1, NetherNet: 1 } }
            });
            expect(encodeChart('transports', transports, of([]))).toBeUndefined();
        });

        it('sends the build type with the version under it, and nothing when either is missing', () => {
            const buildType = BSTATS_CHARTS.build_type;
            const both = snapshotOf({
                [ServerMetric.build_type]: reading.label('release'),
                [ServerMetric.version]: reading.label('0.20.0')
            });

            expect(encodeChart('build_type', buildType, both)).toEqual({
                chartId: 'buildType',
                data: { values: { release: { '0.20.0': 1 } } }
            });
            expect(
                encodeChart('build_type', buildType, snapshotOf({ [ServerMetric.build_type]: reading.label('dev') }))
            ).toBeUndefined();
        });

        it('sends the platform memory as whole gigabytes', () => {
            expect(encodeChart('memory', BSTATS_CHARTS.memory, snapshotOf())).toEqual({
                chartId: 'memory',
                data: { value: '8 GB' }
            });
        });

        it('leaves out a chart whose metric has a reading of another kind', () => {
            expect(
                encodeChart('players', players, snapshotOf({ [ServerMetric.players]: reading.label('4') }))
            ).toBeUndefined();
            expect(
                encodeChart('online_mode', onlineMode, snapshotOf({ [ServerMetric.online_mode]: reading.gauge(4) }))
            ).toBeUndefined();
        });
    });

    it('sends only the charted metrics, in table order', () => {
        const charts = encodeCharts(
            snapshotOf({
                'myaddon:players': reading.gauge(3),
                [ServerMetric.online_mode]: reading.label('offline'),
                [ServerMetric.players]: reading.gauge(2)
            })
        );

        expect(charts).toEqual([
            { chartId: 'players', data: { value: 2 } },
            { chartId: 'memory', data: { value: '8 GB' } },
            { chartId: 'onlineMode', data: { value: 'offline' } }
        ]);
    });

    it('sends a chart for every chart in the table for a server with players', () => {
        const charts = encodeCharts(serverRegistry(everyPlayer, metricsSettings(true, true, true)).snapshot());

        expect(charts.map((chart) => chart.chartId)).toEqual(Object.keys(BSTATS_CHARTS).map(chartId));
    });

    it('sends the player platforms under the display names of the device OS table', () => {
        const charts = encodeCharts(serverRegistry(everyPlayer, metricsSettings(true, true, true)).snapshot());
        const platform = charts.find((chart) => chart.chartId === 'playerPlatform')?.data;

        expect(platform && 'values' in platform ? Object.keys(platform.values).sort() : []).toEqual(
            [...new Set(Object.values(DEVICE_OS_NAMES))].sort()
        );
    });

    describe('the filters on bstats.org', () => {
        /** The values bstats.org filters: a pie's value, or an advanced or drilldown pie's keys. */
        const filteredValues = (data: BStatsChart['data']): string[] =>
            'values' in data ? Object.keys(data.values) : [String(data.value)];

        /** The counts bstats.org caps with a chart's max value. */
        const counts = (data: BStatsChart['data']): number[] =>
            'values' in data
                ? Object.values(data.values).flatMap((entry) =>
                      typeof entry === 'number' ? [entry] : Object.values(entry)
                  )
                : [];

        it.each([
            { build: 'dev', onlineMode: true, rakNet: true, netherNet: true, memoryGb: 8 },
            { build: 'release', onlineMode: false, rakNet: true, netherNet: false, memoryGb: 1 },
            { build: 'nightly', onlineMode: true, rakNet: false, netherNet: true, memoryGb: 1024 }
        ])(
            'accept every value a $build build sends with $memoryGb GB and online mode $onlineMode',
            ({ build, onlineMode, rakNet, netherNet, memoryGb }) => {
                if (build !== 'dev') {
                    vi.stubGlobal('BUILD_TYPE', build);
                    vi.stubGlobal('BUILD_VERSION', '0.20.0');
                }
                const registry = serverRegistry(everyPlayer, metricsSettings(onlineMode, rakNet, netherNet), {
                    ...testPlatform,
                    memoryGb
                });

                const charts = encodeCharts(registry.snapshot());

                for (const [name, spec] of Object.entries(BSTATS_CHARTS)) {
                    const chart = charts.find((candidate) => candidate.chartId === chartId(name));
                    expect(chart, name).toBeDefined();
                    if (chart === undefined) continue;
                    if ('filter' in spec) {
                        for (const value of filteredValues(chart.data)) {
                            expect(matchesFilter(spec.filter, value), `${name} value ${value}`).toBe(true);
                        }
                    }
                    if ('maxValue' in spec) {
                        for (const count of counts(chart.data)) expect(count, name).toBeLessThanOrEqual(spec.maxValue);
                    }
                }
            }
        );

        it('accept the release every registered protocol is named by', () => {
            const { filter } = BSTATS_CHARTS.player_protocol;
            for (const codec of registeredCodecs) {
                expect(matchesFilter(filter, codec.minecraftVersions[0] ?? ''), String(codec.protocolVersion)).toBe(
                    true
                );
            }
        });

        it.each([
            { name: 'memory', value: '16384 GB' },
            { name: 'build_type', value: 'beta' },
            { name: 'online_mode', value: 'Online' },
            { name: 'transports', value: 'raknet' },
            { name: 'player_protocol', value: '1.26.60.1' },
            { name: 'player_transport', value: 'Steam' }
        ] as const)('drop a made-up $name value such as $value', ({ name, value }) => {
            expect(matchesFilter(BSTATS_CHARTS[name].filter, value)).toBe(false);
        });
    });
});
