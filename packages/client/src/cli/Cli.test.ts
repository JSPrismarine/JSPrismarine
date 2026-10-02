import { Logger } from '@jsprismarine/logger';
import { Config, Server } from '@jsprismarine/prismarine';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PROTOCOL_VERSION } from '../Client';
import { parseDuration, parseRate, run } from './Cli';

/** Collects what the command would have printed, so a test can read it. */
const capture = () => {
    const out: string[] = [];
    const err: string[] = [];
    return { out, err, io: { out: (line: string) => out.push(line), err: (line: string) => err.push(line) } };
};

describe('argument parsing', () => {
    it('reads a bare number as seconds, not milliseconds', () => {
        // `--duration 60` meaning a sixteenth of a second is the kind of surprise that
        // wastes an afternoon of load testing.
        expect(parseDuration('60')).toBe(60_000);
        expect(parseDuration('30s')).toBe(30_000);
        expect(parseDuration('10m')).toBe(600_000);
        expect(parseDuration('1h')).toBe(3_600_000);
        expect(parseDuration('500ms')).toBe(500);
    });

    it('says what it wanted instead of silently defaulting', () => {
        expect(() => parseDuration('soon')).toThrow(/Try 30s, 10m, or 500ms/);
        expect(() => parseRate('lots')).toThrow(/Try 5 or 5\/s/);
    });

    it('takes a rate with or without the unit', () => {
        expect(parseRate('5')).toBe(5);
        expect(parseRate('5/s')).toBe(5);
        expect(parseRate('0')).toBe(0);
    });
});

describe('the command line', () => {
    it('prints help and exits 2 when told nothing, 0 when asked', async () => {
        // Different codes on purpose: a script has to be able to tell "you forgot the
        // command" from "you asked for help".
        const bare = capture();
        expect(await run([], bare.io)).toBe(2);
        expect(bare.out.join('\n')).toContain('jsp-client bot');

        const asked = capture();
        expect(await run(['--help'], asked.io)).toBe(0);
    });

    it('refuses an unknown command rather than doing nothing quietly', async () => {
        const { io, err } = capture();

        expect(await run(['fly', '--host', '127.0.0.1'], io)).toBe(2);
        expect(err.join('')).toContain('Unknown command "fly"');
    });

    it('names the flag that is missing', async () => {
        const { io, err } = capture();

        expect(await run(['bot', '--count', '4'], io)).toBe(2);
        expect(err.join('')).toContain('--host is required');
    });

    it('rejects a behaviour it does not know before connecting to anything', async () => {
        const { io, err } = capture();

        // A load test silently missing half its traffic is worse than one that will not start.
        expect(await run(['bot', '--host', '127.0.0.1', '--count', '1', '--behaviour', 'teleport'], io)).toBe(1);
        expect(err.join('')).toContain('Unknown behaviour "teleport"');
    });

    it('rejects a count of zero', async () => {
        const { io, err } = capture();

        expect(await run(['bot', '--host', '127.0.0.1', '--count', '0'], io)).toBe(2);
        expect(err.join('')).toContain('--count must be at least 1');
    });
});

describe('against a real server', () => {
    let stateRoot: string;
    let server: Server | null = null;
    const port = 19280;

    beforeAll(async () => {
        stateRoot = mkdtempSync(path.join(tmpdir(), 'jsprismarine-cli-'));
        vi.stubEnv('JSP_DIR', stateRoot);

        server = new Server({ logger: new Logger('error'), config: new Config(), headless: true });
        await server.bootstrap('127.0.0.1', port);
    }, 60_000);

    afterAll(() => {
        server?.getRaknet()?.kill();
        vi.unstubAllEnvs();
        rmSync(stateRoot, { recursive: true, force: true });
    }, 30_000);

    it('pings a server and reads its MOTD', async () => {
        const { io, out } = capture();

        expect(await run(['ping', '--host', '127.0.0.1', '--port', String(port)], io)).toBe(0);
        // Against the constant rather than a number written out: the server under test and
        // the client that pings it are the same version by construction, and a literal here
        // goes stale on the next protocol bump without anything being wrong.
        expect(out.join('\n')).toMatch(new RegExp(`version .* \\(protocol ${PROTOCOL_VERSION}\\)`));
        expect(out.join('\n')).toContain('players');
    }, 30_000);

    it('runs a fleet, prints a report and exits 0', async () => {
        const { io, out } = capture();

        const code = await run(
            [
                'bot',
                '--host',
                '127.0.0.1',
                '--port',
                String(port),
                '--count',
                '3',
                '--behaviour',
                'walk,chat',
                '--duration',
                '1s',
                '--ramp',
                '0',
                '--seed',
                '99'
            ],
            io
        );

        expect(code).toBe(0);
        const text = out.join('\n');
        expect(text).toContain('Connecting 3 bot(s)');
        expect(text).toContain('connected  3/3');
        expect(text).toContain('seed 99');
    }, 60_000);

    it('writes the report as JSON when asked', async () => {
        const reportPath = path.join(stateRoot, 'report.json');
        const { io } = capture();

        await run(
            [
                'bot',
                '--host',
                '127.0.0.1',
                '--port',
                String(port),
                '--count',
                '2',
                '--duration',
                '600ms',
                '--ramp',
                '0',
                '--report',
                reportPath
            ],
            io
        );

        const report = JSON.parse(readFileSync(reportPath, 'utf-8'));
        expect(report.connected).toBe(2);
        expect(report.seed).toBe(1);
        expect(report.loginLatencyMs.count).toBe(2);
    }, 60_000);

    it('exits 1 when a bot could not get in, so CI can gate on it', async () => {
        const { io } = capture();

        // Nothing is listening on this port, so every bot times out.
        const code = await run(
            [
                'bot',
                '--host',
                '127.0.0.1',
                '--port',
                '19281',
                '--count',
                '2',
                '--duration',
                '1ms',
                '--ramp',
                '0',
                '--timeout',
                '400ms'
            ],
            io
        );

        expect(code).toBe(1);
    }, 30_000);
});
