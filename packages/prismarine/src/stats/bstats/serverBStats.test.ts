import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Kernel } from '@jsprismarine/kernel';
import { Config } from '../../config/Config';
import { statsModule, statsProvidersModule } from '../../modules/stats';
import type { Environment } from '../../utils/isTestRunner';
import { testPlatform } from '../serverRegistry.test.helper';
import { manualTimer, recordingLogger, stubFetch } from '../stats.test.helper';
import { bstatsSettings } from './bstats.test.helper';
import type { BStatsConfigSource } from './serverBStats';
import { BSTATS_NOTICE, BSTATS_OPT_OUT, bstatsOffReason, serverBStatsProvider } from './serverBStats';

const SERVER_UUID = '0b9c6a5e-3f1d-4c2a-9e8b-7d6f5a4b3c2d';
const DAY = 24 * 60 * 60_000;

/** A loaded config with a stored UUID and the default bStats settings, on a later start. */
const configOf = (overrides: Partial<BStatsConfigSource> = {}): BStatsConfigSource => ({
    getServerUuid: () => SERVER_UUID,
    getBStatsSettings: () => bstatsSettings(),
    wasBStatsSectionCreated: () => false,
    ...overrides
});

/** Starts the stats modules with the server's bStats provider, a manual timer and a stub `fetch`. */
const startStats = async (config: BStatsConfigSource, env: Environment) => {
    const timer = manualTimer();
    const fetch = stubFetch();
    const { lines, logger } = recordingLogger();
    const kernel = new Kernel({ logger });
    kernel.register(statsModule({ platform: () => testPlatform }));
    kernel.register(
        statsProvidersModule({
            providers: [serverBStatsProvider(config, { env, fetch: fetch.fetch, random: () => 0.5 })],
            setTimer: timer.setTimer
        })
    );
    await kernel.start();
    return { kernel, timer, requests: fetch.requests, lines };
};

const isNotice = (line: string) => line.endsWith(BSTATS_NOTICE);

describe('stats/bstats/serverBStats', () => {
    describe('bstatsOffReason', () => {
        const on = { env: {}, settings: { enabled: true } };

        it.each([
            {},
            ...BSTATS_OPT_OUT.on.flatMap((value) => [{ JSP_BSTATS: value }, { JSP_BSTATS: value.toUpperCase() }])
        ])('reports with bStats enabled and the environment %j', (env) => {
            expect(bstatsOffReason({ ...on, env })).toBeUndefined();
        });

        it.each(
            BSTATS_OPT_OUT.off.flatMap((value) => [
                value,
                value.toUpperCase(),
                value[0]?.toUpperCase() + value.slice(1)
            ])
        )('turns bStats off for JSP_BSTATS=%s', (value) => {
            expect(bstatsOffReason({ ...on, env: { JSP_BSTATS: value } })).toBe('environment');
        });

        it.each(['', '2', 'disable', 'nope', ' 0', 'null'])(
            'turns bStats off for the unknown JSP_BSTATS=%j',
            (value) => {
                expect(bstatsOffReason({ ...on, env: { JSP_BSTATS: value } })).toBe('invalid-environment');
            }
        );

        it.each([
            [{ ...on, env: { VITEST: 'true' } }, 'test-runner'],
            [{ ...on, env: { CI: 'true' } }, 'ci'],
            [{ ...on, env: { CI: '' } }, 'ci'],
            [{ ...on, settings: { enabled: false } }, 'disabled'],
            [{ ...on, settings: { enabled: false, problem: 'stats is false' } }, 'invalid-config'],
            [{ env: { VITEST: 'true', CI: '1', JSP_BSTATS: '0' }, settings: { enabled: false } }, 'test-runner'],
            [{ env: { CI: '1', JSP_BSTATS: '0' }, settings: { enabled: false } }, 'ci'],
            [{ env: { JSP_BSTATS: '0' }, settings: { enabled: false, problem: 'stats is false' } }, 'environment']
        ])('turns bStats off for %j with %s', (inputs, reason) => {
            expect(bstatsOffReason(inputs)).toBe(reason);
        });
    });

    describe('serverBStatsProvider', () => {
        it.each<[string, BStatsConfigSource, Environment]>([
            ['under this test run, reading the real environment', configOf(), process.env],
            ['under Vitest', configOf(), { VITEST: 'true' }],
            ['in CI', configOf(), { CI: 'true' }],
            ['with JSP_BSTATS=0', configOf(), { JSP_BSTATS: '0' }],
            ['with JSP_BSTATS=maybe', configOf(), { JSP_BSTATS: 'maybe' }],
            [
                'when stats.bstats.enabled is false',
                configOf({ getBStatsSettings: () => bstatsSettings({ enabled: false }) }),
                {}
            ],
            ['when the UUID was not stored', configOf({ getServerUuid: () => undefined }), {}]
        ])('schedules nothing and sends nothing %s', async (_case, config, env) => {
            const { kernel, timer, requests } = await startStats(config, env);
            await timer.advance(DAY);
            // Read before the stop, which arms its own timeout on the same timer.
            expect(timer.delays).toEqual([]);
            await kernel.stop();

            expect(requests).toEqual([]);
        });

        it('logs one warning naming the values JSP_BSTATS takes when it holds another', async () => {
            const { kernel, lines } = await startStats(configOf(), { JSP_BSTATS: 'maybe' });
            await kernel.stop();

            expect(lines.filter((line) => line.startsWith('warn:'))).toEqual([
                'warn: [prismarine:stats-providers] [bstats] bStats is off because JSP_BSTATS=maybe is not a value it takes. Use 0, false, off, no to turn it off, or 1, true, on, yes to follow stats.bstats.enabled.'
            ]);
        });

        it('logs no notice on a first start when bStats is off', async () => {
            const { kernel, lines } = await startStats(configOf({ wasBStatsSectionCreated: () => true }), {
                JSP_BSTATS: '0'
            });
            await kernel.stop();

            expect(lines.filter(isNotice)).toEqual([]);
            expect(
                lines.filter((line) => line.endsWith('[bstats] bStats is off because JSP_BSTATS=0 is set'))
            ).toHaveLength(1);
        });

        it('starts and stops cleanly with bStats on, leaving no pending timer and sending nothing', async () => {
            const { kernel, timer, requests } = await startStats(configOf(), {});
            expect(timer.pending.size).toBe(1);

            await kernel.stop();
            expect(timer.pending.size).toBe(0);

            await kernel.start();
            expect(timer.pending.size).toBe(1);
            await kernel.stop();
            expect(timer.pending.size).toBe(0);
            expect(requests).toEqual([]);
        });

        it('sends the UUID the config holds at start, not one from before the config loaded', async () => {
            let uuid: string | undefined;
            const { kernel, timer, requests } = await startStats(configOf({ getServerUuid: () => uuid }), {});
            await kernel.stop();
            uuid = SERVER_UUID;
            await kernel.start();
            await timer.advance(4.5 * 60_000);
            await kernel.stop();

            expect(requests).toHaveLength(1);
            const body = requests[0]?.init?.body;
            if (!(body instanceof Uint8Array)) throw new Error('The request body is not bytes');
            expect(JSON.parse(gunzipSync(body).toString('utf8'))).toMatchObject({ serverUUID: SERVER_UUID });
        });
    });

    describe('with a real config', () => {
        let configDirectory: string;

        beforeEach(() => {
            configDirectory = mkdtempSync(path.join(tmpdir(), 'jsprismarine-bstats-notice-test-'));
            vi.stubEnv('JSP_DIR', configDirectory);
        });

        afterEach(() => {
            vi.unstubAllEnvs();
            rmSync(configDirectory, { recursive: true, force: true });
        });

        const boot = async (env: Environment = {}) => {
            const config = new Config();
            await config.enable();
            const started = await startStats(config, env);
            // Read before the stop, which arms its own timeout on the same timer.
            const scheduled = [...started.timer.delays];
            await started.kernel.stop();
            return { ...started, scheduled };
        };

        it('logs the notice once on the start that writes stats.bstats, and not on the next', async () => {
            const first = (await boot()).lines.filter(isNotice);
            expect(first).toEqual([`info: [prismarine:stats-providers] [bstats] ${BSTATS_NOTICE}`]);
            expect((await boot()).lines.filter(isNotice)).toEqual([]);
        });

        it('warns once and schedules nothing for a stats section that is not well formed', async () => {
            writeFileSync(
                path.join(configDirectory, 'config.json'),
                JSON.stringify({ stats: { bstats: { enabled: 'yes' } } })
            );

            const { lines, scheduled } = await boot();

            expect(scheduled).toEqual([]);
            expect(lines.filter((line) => line.startsWith('warn:'))).toEqual([
                'warn: [prismarine:stats-providers] [bstats] stats.bstats.enabled in config.json is "yes", not true or false, so bStats is off. Set stats.bstats.enabled to true or false.'
            ]);
        });
    });
});
