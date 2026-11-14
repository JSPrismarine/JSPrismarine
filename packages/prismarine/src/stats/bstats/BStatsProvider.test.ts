import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

import { ServerMetric } from '../serverMetrics';
import { testPlatform } from '../serverRegistry.test.helper';
import { manualTimer, recordingLogger, stubFetch } from '../stats.test.helper';
import type { StatsProviderContext } from '../StatsProvider';
import { StatsRegistry } from '../StatsRegistry';
import { bstatsSettings } from './bstats.test.helper';
import type { BStatsLogSettings, BStatsOff } from './BStatsProvider';
import { BStatsProvider } from './BStatsProvider';

const MINUTE = 60_000;
const SERVER_UUID = '0b9c6a5e-3f1d-4c2a-9e8b-7d6f5a4b3c2d';

/** A `fetch` that never answers, and rejects with the abort reason once its signal aborts. */
const hangingFetch = () =>
    stubFetch(
        (init) =>
            new Promise<Response>((_resolve, reject) => {
                init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
            })
    );

/**
 * A provider with its context: a registry with two players online, fixed random values and a stub
 * `fetch`. `current` holds what the gate, the UUID and the settings read at the next start.
 */
const setup = ({
    settings = bstatsSettings(),
    random = [0.5, 0.5],
    fetch = stubFetch(),
    off,
    serverUuid = SERVER_UUID
}: {
    settings?: BStatsLogSettings;
    random?: readonly number[];
    fetch?: ReturnType<typeof stubFetch>;
    off?: BStatsOff;
    serverUuid?: string;
} = {}) => {
    const timer = manualTimer();
    const { lines, logger } = recordingLogger();
    const registry = new StatsRegistry({ logger, platform: () => testPlatform });
    registry.register({ name: ServerMetric.players, kind: 'gauge', description: 'Players online.', read: () => 2 });
    const draws = [...random];
    const context: StatsProviderContext = { registry, logger, setTimer: timer.setTimer };
    const current: { settings: BStatsLogSettings; off: BStatsOff | undefined; serverUuid: string | undefined } = {
        settings,
        off,
        serverUuid
    };
    const reports: number[] = [];
    const provider = new BStatsProvider({
        serverUuid: () => current.serverUuid,
        gate: () => current.off,
        settings: () => current.settings,
        onReport: () => void reports.push(timer.delays.length),
        fetch: fetch.fetch,
        random: () => draws.shift() ?? 0
    });
    return { provider, context, timer, lines, requests: fetch.requests, current, reports };
};

describe('stats/bstats/BStatsProvider', () => {
    it('submits at the first delay, at the second and every 30 minutes after', async () => {
        // 3 + 0.5 * 3 = 4.5 minutes, then a further 0.5 * 30 = 15 minutes.
        const { provider, context, timer, requests } = setup({ random: [0.5, 0.5] });
        provider.start(context);

        await timer.advance(4.5 * MINUTE - 1);
        expect(requests).toHaveLength(0);
        await timer.advance(1);
        expect(requests).toHaveLength(1);

        await timer.advance(15 * MINUTE - 1);
        expect(requests).toHaveLength(1);
        await timer.advance(1);
        expect(requests).toHaveLength(2);

        for (let submits = 3; submits <= 5; submits++) {
            await timer.advance(30 * MINUTE - 1);
            expect(requests).toHaveLength(submits - 1);
            await timer.advance(1);
            expect(requests).toHaveLength(submits);
        }
        provider.stop();
    });

    it('waits 3 minutes and then no further when the random source draws 0', async () => {
        const { provider, context, timer, requests } = setup({ random: [0, 0] });
        provider.start(context);

        await timer.advance(3 * MINUTE);
        expect(requests).toHaveLength(2);
        expect(timer.delays.slice(0, 2)).toEqual([3 * MINUTE, 0]);
        provider.stop();
    });

    it('waits just under 6 minutes and then just under 30 when the random source draws just under 1', async () => {
        const nearlyOne = 0.999_999;
        const { provider, context, timer } = setup({ random: [nearlyOne, nearlyOne] });
        provider.start(context);

        await timer.advance(6 * MINUTE);
        const [first, second] = timer.delays;
        expect(first).toBeGreaterThan(6 * MINUTE - 1000);
        expect(first).toBeLessThan(6 * MINUTE);
        expect(second).toBeGreaterThan(30 * MINUTE - 1000);
        expect(second).toBeLessThan(30 * MINUTE);
        provider.stop();
    });

    it('posts the payload as gzip-compressed JSON to the bStats endpoint, with an abort signal', async () => {
        const { provider, context, timer, requests } = setup();
        provider.start(context);
        await timer.advance(6 * MINUTE);

        const [request] = requests;
        expect(request?.url).toBe('https://bStats.org/api/v2/data/server-implementation');
        expect(request?.init?.method).toBe('POST');
        expect(request?.init?.signal).toBeInstanceOf(AbortSignal);
        const body = request?.init?.body;
        if (!(body instanceof Uint8Array)) throw new Error('The request body is not bytes');
        expect(JSON.parse(gunzipSync(body).toString('utf8'))).toStrictEqual({
            osName: 'Linux',
            osArch: 'x64',
            osVersion: '6.1.0',
            coreCount: 8,
            serverUUID: SERVER_UUID,
            metricsVersion: '0.1.0',
            service: {
                id: 35257,
                customCharts: [
                    { chartId: 'players', data: { value: 2 } },
                    { chartId: 'memory', data: { value: '8 GB' } }
                ]
            }
        });
        provider.stop();
    });

    it.each<BStatsOff>([
        { level: 'debug', message: 'bStats is off for a test' },
        { level: 'warn', message: 'bStats is off because of a bad value' }
    ])('schedules nothing, sends nothing and logs at $level when the gate says it is off', async (off) => {
        const { provider, context, timer, requests, lines, reports } = setup({ off });
        provider.start(context);

        expect(timer.delays).toEqual([]);
        await timer.advance(24 * 60 * MINUTE);
        expect(requests).toHaveLength(0);
        expect(reports).toEqual([]);
        expect(lines).toEqual([`${off.level}: ${off.message}`]);
        provider.stop();
    });

    it('schedules nothing and says so when the server UUID could not be stored', async () => {
        const { provider, context, timer, requests, lines, current } = setup();
        current.serverUuid = undefined;
        provider.start(context);

        await timer.advance(24 * 60 * MINUTE);
        expect(timer.delays).toEqual([]);
        expect(requests).toHaveLength(0);
        expect(lines).toEqual([
            'info: bStats is off because the server UUID could not be stored, and a new UUID on every start would count this server more than once'
        ]);
    });

    it('runs the report hook once per start that reports, before scheduling', () => {
        const { provider, context, reports } = setup();
        provider.start(context);
        provider.stop();
        provider.start(context);

        expect(reports).toEqual([0, 1]);
        provider.stop();
    });

    it('reads the gate and the settings again on the next start, as after /reload', async () => {
        const { provider, context, timer, requests, current, lines } = setup({ random: [0, 0, 0, 0] });
        provider.start(context);
        await timer.advance(3 * MINUTE);
        expect(requests).toHaveLength(2);

        provider.stop();
        current.off = { level: 'debug', message: 'off now' };
        provider.start(context);
        await timer.advance(24 * 60 * MINUTE);
        expect(requests).toHaveLength(2);

        provider.stop();
        current.off = undefined;
        current.settings = bstatsSettings({ 'log-sent-data': true });
        provider.start(context);
        await timer.advance(3 * MINUTE);
        expect(requests).toHaveLength(4);
        expect(lines.filter((line) => line.startsWith('info: Sending bStats data:'))).toHaveLength(2);
        provider.stop();
    });

    it('sends nothing from a timer that fires after stop', async () => {
        const timer = manualTimer();
        const fetch = stubFetch();
        const callbacks: (() => void)[] = [];
        // A timer whose cancel does nothing, so its callback runs even after the provider stopped.
        const leakyTimer: StatsProviderContext['setTimer'] = (callback, delayMs) => {
            callbacks.push(callback);
            return timer.setTimer(() => {}, delayMs);
        };
        const { logger } = recordingLogger();
        const registry = new StatsRegistry({ logger, platform: () => testPlatform });
        const provider = new BStatsProvider({
            serverUuid: () => SERVER_UUID,
            gate: () => undefined,
            settings: () => bstatsSettings(),
            fetch: fetch.fetch,
            random: () => 0
        });
        provider.start({ registry, logger, setTimer: leakyTimer });
        provider.stop();

        for (const callback of callbacks) callback();
        await timer.advance(0);
        expect(fetch.requests).toHaveLength(0);
    });

    it('logs nothing for a submit or a failure when every logging flag is off', async () => {
        const { provider, context, timer, lines } = setup({
            fetch: stubFetch(async () => new Response('down', { status: 503 }))
        });
        provider.start(context);
        await timer.advance(6 * MINUTE);

        expect(lines).toEqual([]);
        provider.stop();
    });

    it('logs the JSON it sends when log-sent-data is on', async () => {
        const { provider, context, timer, lines } = setup({ settings: bstatsSettings({ 'log-sent-data': true }) });
        provider.start(context);
        await timer.advance(6 * MINUTE);

        expect(lines).toHaveLength(1);
        expect(lines[0]).toMatch(/^info: Sending bStats data: \{"osName":"Linux",.*"serverUUID":"0b9c6a5e-/);
        provider.stop();
    });

    it('logs the answer when log-response-status-text is on', async () => {
        const { provider, context, timer, lines } = setup({
            settings: bstatsSettings({ 'log-response-status-text': true }),
            fetch: stubFetch(async () => new Response('{"status":"ok"}', { status: 200 }))
        });
        provider.start(context);
        await timer.advance(6 * MINUTE);

        expect(lines).toEqual(['info: bStats answered 200: {"status":"ok"}']);
        provider.stop();
    });

    describe('a 429 answer, two submits in one 30-minute window', () => {
        const tooMany = () => stubFetch(async () => new Response('', { status: 429, statusText: 'Too Many Requests' }));

        it('logs nothing when log-errors is off', async () => {
            const { provider, context, timer, lines } = setup({ fetch: tooMany() });
            provider.start(context);
            await timer.advance(6 * MINUTE);

            expect(lines).toEqual([]);
            provider.stop();
        });

        it('says why at info level, not as a failure, when log-errors is on', async () => {
            const { provider, context, timer, lines } = setup({
                settings: bstatsSettings({ 'log-errors': true }),
                fetch: tooMany()
            });
            provider.start(context);
            await timer.advance(6 * MINUTE);

            expect(lines).toEqual([
                'info: bStats already has a submit from this server in this 30-minute window and skipped this one'
            ]);
            provider.stop();
        });
    });

    it.each([
        {
            failure: 'a rejected fetch',
            fetch: () => stubFetch(async () => Promise.reject(new Error('getaddrinfo ENOTFOUND bStats.org'))),
            line: 'warn: Could not submit bStats data: getaddrinfo ENOTFOUND bStats.org'
        },
        {
            failure: 'a non-2xx answer',
            fetch: () => stubFetch(async () => new Response('', { status: 500, statusText: 'Internal Server Error' })),
            line: 'warn: Could not submit bStats data: bStats answered 500 Internal Server Error'
        },
        {
            failure: 'no answer within 10 seconds',
            fetch: hangingFetch,
            line: 'warn: Could not submit bStats data: no answer within 10 seconds'
        }
    ])('logs $failure once when log-errors is on and keeps the schedule running', async ({ fetch, line }) => {
        const { provider, context, timer, lines, requests } = setup({
            settings: bstatsSettings({ 'log-errors': true }),
            random: [0, 0],
            fetch: fetch()
        });
        provider.start(context);

        await timer.advance(3 * MINUTE);
        expect(requests).toHaveLength(2);
        await timer.advance(10_000);
        expect(lines).toEqual([line, line]);

        await timer.advance(30 * MINUTE);
        expect(requests).toHaveLength(3);
        provider.stop();
    });

    it('aborts a submit after 10 seconds and not before', async () => {
        const { provider, context, timer, requests } = setup({ fetch: hangingFetch() });
        provider.start(context);
        await timer.advance(4.5 * MINUTE);
        const signal = requests[0]?.init?.signal;

        await timer.advance(10_000 - 1);
        expect(signal?.aborted).toBe(false);
        await timer.advance(1);
        expect(signal?.aborted).toBe(true);
        provider.stop();
    });

    it('leaves no timer pending after stop, aborts the request in flight and logs nothing', async () => {
        const { provider, context, timer, lines, requests } = setup({
            settings: bstatsSettings({ 'log-errors': true, 'log-response-status-text': true }),
            fetch: hangingFetch()
        });
        provider.start(context);
        await timer.advance(4.5 * MINUTE);
        expect(requests).toHaveLength(1);

        provider.stop();
        await timer.advance(0);

        expect(timer.pending.size).toBe(0);
        expect(requests[0]?.init?.signal?.aborted).toBe(true);
        expect(lines).toEqual([]);
        await timer.advance(24 * 60 * MINUTE);
        expect(requests).toHaveLength(1);
    });

    it('schedules once after a stop and a start, as on a kernel restart', async () => {
        const { provider, context, timer, requests } = setup({ random: [0.5, 0.5, 0.5, 0.5] });
        provider.start(context);
        provider.stop();
        provider.start(context);

        expect(timer.pending.size).toBe(1);
        await timer.advance(4.5 * MINUTE);
        expect(requests).toHaveLength(1);
        await timer.advance(15 * MINUTE);
        expect(requests).toHaveLength(2);
        provider.stop();
    });
});
