import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

import { ServerMetric } from '../serverMetrics';
import type { StatsReading } from '../StatsMetric';
import type { StatsSnapshot } from '../StatsRegistry';
import { buildPayload, buildRequest } from './payload';

const SERVER_UUID = '0b9c6a5e-3f1d-4c2a-9e8b-7d6f5a4b3c2d';

const readings: [string, StatsReading][] = [
    [ServerMetric.build_type, { kind: 'label', value: 'release', description: 'Build.' }],
    [ServerMetric.version, { kind: 'label', value: '0.20.0', description: 'Version.' }],
    [ServerMetric.online_mode, { kind: 'label', value: 'online', description: 'Mode.' }],
    [ServerMetric.transports, { kind: 'set', value: ['RakNet', 'NetherNet'], description: 'Transports.' }],
    [ServerMetric.players, { kind: 'gauge', value: 3, description: 'Players.' }],
    [ServerMetric.player_platform, { kind: 'distribution', value: { Windows: 2, Android: 1 }, description: 'P.' }],
    [ServerMetric.player_protocol, { kind: 'breakdown', value: { '1.26.60': { '1000': 3 } }, description: 'P.' }],
    [ServerMetric.player_transport, { kind: 'distribution', value: { RakNet: 3, NetherNet: 0 }, description: 'P.' }],
    ['myaddon:secret', { kind: 'label', value: 'not for bStats', description: 'Secret.' }]
];

const snapshot: StatsSnapshot = {
    platform: { type: 'Linux', release: '6.1.0', version: '#1 SMP', arch: 'x64', coreCount: 8, memoryGb: 16 },
    metrics: new Map(readings)
};

const expectedPayload = {
    osName: 'Linux',
    osArch: 'x64',
    osVersion: '6.1.0',
    coreCount: 8,
    serverUUID: SERVER_UUID,
    metricsVersion: '0.1.0',
    service: {
        id: 35257,
        customCharts: [
            { chartId: 'players', data: { value: 3 } },
            { chartId: 'buildType', data: { values: { release: { '0.20.0': 1 } } } },
            { chartId: 'memory', data: { value: '16 GB' } },
            { chartId: 'onlineMode', data: { value: 'online' } },
            { chartId: 'transports', data: { values: { RakNet: 1, NetherNet: 1 } } },
            { chartId: 'playerPlatform', data: { values: { Windows: 2, Android: 1 } } },
            { chartId: 'playerProtocol', data: { values: { '1.26.60': { '1000': 3 } } } },
            { chartId: 'playerTransport', data: { values: { RakNet: 3 } } }
        ]
    }
};

describe('stats/bstats/payload', () => {
    it('builds the payload for a snapshot', () => {
        expect(buildPayload(snapshot, SERVER_UUID)).toStrictEqual(expectedPayload);
    });

    it('sends the OS in the form Java names it', () => {
        const payload = buildPayload(
            { ...snapshot, platform: { ...snapshot.platform, type: 'Darwin', release: '23.5.0' } },
            SERVER_UUID
        );

        expect(payload).toMatchObject({ osName: 'Mac OS X', osVersion: '14.5' });
    });

    it('sends only the memory chart for a snapshot with no metrics', () => {
        const payload = buildPayload({ platform: snapshot.platform, metrics: new Map() }, SERVER_UUID);

        expect(payload.service).toStrictEqual({
            id: 35257,
            customCharts: [{ chartId: 'memory', data: { value: '16 GB' } }]
        });
    });

    it('posts the payload as gzip-compressed JSON to the server-implementation endpoint', () => {
        const { url, init } = buildRequest(buildPayload(snapshot, SERVER_UUID));

        expect(url).toBe('https://bStats.org/api/v2/data/server-implementation');
        expect(init.method).toBe('POST');
        expect(init.redirect).toBe('error');
        expect(init.headers).toStrictEqual({
            Accept: 'application/json',
            Connection: 'close',
            'Content-Encoding': 'gzip',
            'Content-Type': 'application/json',
            'User-Agent': 'Metrics-Service/1'
        });
        expect(JSON.parse(gunzipSync(init.body).toString('utf8'))).toStrictEqual(expectedPayload);
    });

    it('builds a url and init the Request constructor accepts', async () => {
        const { url, init } = buildRequest(buildPayload(snapshot, SERVER_UUID));

        const request = new Request(url, init);

        expect(request.method).toBe('POST');
        expect(request.redirect).toBe('error');
        expect(request.headers.get('content-encoding')).toBe('gzip');
        expect(JSON.parse(gunzipSync(new Uint8Array(await request.arrayBuffer())).toString('utf8'))).toStrictEqual(
            expectedPayload
        );
    });
});
