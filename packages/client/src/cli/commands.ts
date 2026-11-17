import { Logger, terminalText } from '@jsprismarine/logger';
import { TextPacket } from '@jsprismarine/protocol';
import { ClientSocket } from '@jsprismarine/raknet';
import { writeFile } from 'node:fs/promises';
import Client from '../Client';
import Fleet from '../bot/Fleet';
import { formatReport } from '../bot/Metrics';
import { parseCount, parseDuration, parseNetwork, parsePercent, parseRate } from './Cli';
import { conditionLink } from '../net/LinkConditions';

import type { CliIo, Values } from './Cli';
import { ClientErrors } from '@jsprismarine/errors/client';

const DEFAULT_PORT = 19132;

const requireString = (values: Values, flag: string): string => {
    const value = values[flag];
    if (typeof value !== 'string' || value.length === 0) throw new ClientErrors.MissingOption({ flag });

    return value;
};

const optionalString = (values: Values, flag: string): string | undefined => {
    const value = values[flag];
    return typeof value === 'string' ? value : undefined;
};

/** Parses a flag when it was given and is not empty; an absent or empty flag is undefined. */
const optionalParsed = <T>(values: Values, flag: string, parse: (value: string) => T): T | undefined => {
    const value = optionalString(values, flag);
    return value ? parse(value) : undefined;
};

const port = (values: Values): number => {
    const value = optionalString(values, 'port');
    return value === undefined ? DEFAULT_PORT : parseCount(value, '--port');
};

const network = (values: Values): 'raknet' | 'nethernet' => parseNetwork(optionalString(values, 'network') ?? 'raknet');

/**
 * Runs a command over the path `--latency` and `--loss` describe, or directly when neither is
 * given. The conditions are read before anything connects, so a typo fails first.
 */
const overLink = async (values: Values, command: () => Promise<number>): Promise<number> => {
    const latencyMs = optionalParsed(values, 'latency', parseDuration);
    const loss = optionalParsed(values, 'loss', (value) => parsePercent(value, '--loss'));
    if (latencyMs === undefined && loss === undefined) return command();

    const link = conditionLink({ latencyMs, loss });
    try {
        return await command();
    } finally {
        link.restore();
    }
};

const logger = (values: Values): Logger => new Logger(values.verbose === true ? 'silly' : 'error');

/**
 * Calls `stop` on the first SIGINT or SIGTERM, so a long-running command can tidy up.
 * @param stop - What the signal does in place of ending the process.
 * @returns A function that removes the listeners again, so a later signal ends the process.
 */
export const onInterrupt = (stop: () => void): (() => void) => {
    const release = () => {
        process.off('SIGINT', handle);
        process.off('SIGTERM', handle);
    };
    const handle = () => {
        release();
        stop();
    };

    process.once('SIGINT', handle);
    process.once('SIGTERM', handle);
    return release;
};

/** Resolves on the first SIGINT or SIGTERM. */
const untilInterrupted = (): Promise<void> => new Promise((resolve) => onInterrupt(resolve));

/** Joins a server and prints its chat until interrupted. */
export const runConnect = async (values: Values, io: CliIo): Promise<number> =>
    overLink(values, () => connect(values, io));

const connect = async (values: Values, io: CliIo): Promise<number> => {
    const host = requireString(values, 'host');
    const client = new Client({
        host,
        port: port(values),
        network: network(values),
        displayName: optionalString(values, 'name') ?? 'Player',
        logger: logger(values),
        loginTimeoutMs: optionalParsed(values, 'timeout', parseDuration)
    });

    client.getSession().registerHandler(TextPacket, {
        phases: ['login', 'play'],
        handle: (text) => {
            const message = terminalText(text.message);
            io.out(text.sourceName ? `<${terminalText(text.sourceName)}> ${message}` : message);
        }
    });

    const startGame = await client.connect();
    const identity = await client.getIdentity();

    io.out(`Joined ${host} as ${terminalText(identity.displayName)} (runtime entity ${startGame.runtimeEntityId})`);
    io.out(
        `Spawned at ${startGame.position.x.toFixed(1)}, ${startGame.position.y.toFixed(1)}, ${startGame.position.z.toFixed(1)}`
    );

    await untilInterrupted();
    client.disconnect();
    io.out('Disconnected.');

    return 0;
};

/**
 * The lines `ping` prints for a server's answer. Every field is the server's to choose, so each
 * is made terminal-safe before it is printed.
 * @param serverName - The pong's semicolon-separated advertisement.
 * @param rtt - The measured round trip, in milliseconds.
 * @returns The lines, in order.
 */
export const formatPong = (serverName: string, rtt: number): string[] => {
    // Semicolon-separated, and the fields are positional: MCPE;motd;protocol;version;
    // players;max;serverId;levelName;gamemode.
    const [, motd, protocol, version, players, max] = serverName.split(';');
    return [
        terminalText(motd ?? serverName),
        `  version   ${terminalText(version ?? '?')} (protocol ${terminalText(protocol ?? '?')})`,
        `  players   ${terminalText(players ?? '?')}/${terminalText(max ?? '?')}`,
        `  rtt       ${rtt.toFixed(1)} ms`
    ];
};

/** Asks a server for its MOTD without connecting. */
export const runPing = async (values: Values, io: CliIo): Promise<number> => {
    const host = requireString(values, 'host');
    const socket = new ClientSocket(logger(values));

    try {
        const result = await socket.ping(host, port(values));
        for (const line of formatPong(result.serverName, result.rtt)) io.out(line);

        return 0;
    } finally {
        socket.kill();
    }
};

/**
 * Runs a fleet and reports what happened.
 *
 * Exits non-zero when any bot failed to connect, so this is usable as a CI gate rather than
 * only as something to read.
 */
export const runBot = async (values: Values, io: CliIo): Promise<number> => overLink(values, () => bot(values, io));

const bot = async (values: Values, io: CliIo): Promise<number> => {
    const host = requireString(values, 'host');
    const count = parseCount(requireString(values, 'count'), '--count');
    if (count === 0) throw new ClientErrors.CountBelowOne();

    const behaviors = (optionalString(values, 'behavior') ?? '')
        .split(',')
        .map((name) => name.trim())
        .filter((name) => name.length > 0);

    const duration = parseDuration(optionalString(values, 'duration') ?? '60s');
    const ramp = parseRate(optionalString(values, 'ramp') ?? '10');

    const fleet = new Fleet({
        host,
        port: port(values),
        network: network(values),
        count,
        behaviors,
        ramp,
        seed: optionalParsed(values, 'seed', (value) => parseCount(value, '--seed')) ?? 1,
        viewDistance: optionalParsed(values, 'view-distance', (value) => parseCount(value, '--view-distance')) ?? 4,
        namePrefix: optionalString(values, 'name-prefix') ?? 'Bot',
        logger: logger(values),
        loginTimeoutMs: optionalParsed(values, 'timeout', parseDuration)
    });

    // Interruptible from the first connection, so a run that is clearly going wrong can be
    // stopped without losing the report - which is often the only reason it was worth starting.
    // Stopping clears the ramp and duration timers, so the process exits once the report is out.
    let interrupted = false;
    const release = onInterrupt(() => {
        interrupted = true;
        fleet.stop();
    });

    try {
        io.out(`Connecting ${count} bot(s) to ${host}:${port(values)}${ramp > 0 ? ` at ${ramp}/s` : ' all at once'}…`);
        await fleet.connect();
        if (!interrupted) {
            io.out(`Connected ${fleet.report().connected}/${count}. Running for ${(duration / 1000).toFixed(0)}s…`);
        }

        await fleet.run(duration);
    } finally {
        release();
        fleet.stop();
    }

    const report = fleet.report();
    io.out('');
    io.out(formatReport(report));

    const reportPath = optionalString(values, 'report');
    if (reportPath !== undefined) {
        await writeFile(reportPath, `${JSON.stringify(report, null, 4)}\n`, 'utf-8');
        io.out(`\nWrote ${reportPath}`);
    }

    return report.failed > 0 ? 1 : 0;
};
