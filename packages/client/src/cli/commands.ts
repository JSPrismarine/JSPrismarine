import { Logger } from '@jsprismarine/logger';
import { PacketIdentifier } from '@jsprismarine/protocol';
import { ClientSocket } from '@jsprismarine/raknet';
import { writeFile } from 'node:fs/promises';
import Client from '../Client';
import Fleet from '../bot/Fleet';
import { formatReport } from '../bot/Metrics';
import { UsageError, parseCount, parseDuration, parseRate } from './Cli';

import type { Text } from '@jsprismarine/protocol';
import type { DecodedPacket } from '../net/ClientPacketRegistry';
import type { CliIo, Values } from './Cli';

const DEFAULT_PORT = 19132;

const requireString = (values: Values, flag: string): string => {
    const value = values[flag];
    if (typeof value !== 'string' || value.length === 0) throw new UsageError(`--${flag} is required`);

    return value;
};

const optionalString = (values: Values, flag: string): string | undefined => {
    const value = values[flag];
    return typeof value === 'string' ? value : undefined;
};

const port = (values: Values): number => {
    const value = optionalString(values, 'port');
    return value === undefined ? DEFAULT_PORT : parseCount(value, '--port');
};

const logger = (values: Values): Logger => new Logger(values.verbose === true ? 'silly' : 'error');

/** Resolves when the process is asked to stop, so a long-running command can tidy up. */
const untilInterrupted = (): Promise<void> =>
    new Promise((resolve) => {
        const stop = () => {
            process.off('SIGINT', stop);
            process.off('SIGTERM', stop);
            resolve();
        };

        process.once('SIGINT', stop);
        process.once('SIGTERM', stop);
    });

/** Joins a server and prints its chat until interrupted. */
export const runConnect = async (values: Values, io: CliIo): Promise<number> => {
    const host = requireString(values, 'host');
    const client = new Client({
        host,
        port: port(values),
        displayName: optionalString(values, 'name') ?? 'Player',
        logger: logger(values),
        loginTimeoutMs: optionalString(values, 'timeout') ? parseDuration(values.timeout as string) : undefined
    });

    client.on('packet', (packet: DecodedPacket) => {
        if (packet.id !== PacketIdentifier.TEXT) return;

        const text = packet.data as Text;
        io.out(text.sourceName ? `<${text.sourceName}> ${text.message}` : text.message);
    });

    const startGame = await client.connect();
    const identity = await client.getIdentity();

    io.out(`Joined ${host} as ${identity.displayName} (runtime entity ${startGame.runtimeEntityId})`);
    io.out(
        `Spawned at ${startGame.position.x.toFixed(1)}, ${startGame.position.y.toFixed(1)}, ${startGame.position.z.toFixed(1)}`
    );

    await untilInterrupted();
    client.disconnect();
    io.out('Disconnected.');

    return 0;
};

/** Asks a server for its MOTD without connecting. */
export const runPing = async (values: Values, io: CliIo): Promise<number> => {
    const host = requireString(values, 'host');
    const socket = new ClientSocket(logger(values));

    try {
        const result = await socket.ping(host, port(values));

        // Semicolon-separated, and the fields are positional: MCPE;motd;protocol;version;
        // players;max;serverId;levelName;gamemode.
        const [, motd, protocol, version, players, max] = result.serverName.split(';');
        io.out(`${motd ?? result.serverName}`);
        io.out(`  version   ${version ?? '?'} (protocol ${protocol ?? '?'})`);
        io.out(`  players   ${players ?? '?'}/${max ?? '?'}`);
        io.out(`  rtt       ${result.rtt.toFixed(1)} ms`);

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
export const runBot = async (values: Values, io: CliIo): Promise<number> => {
    const host = requireString(values, 'host');
    const count = parseCount(requireString(values, 'count'), '--count');
    if (count === 0) throw new UsageError('--count must be at least 1');

    const behaviours = (optionalString(values, 'behaviour') ?? '')
        .split(',')
        .map((name) => name.trim())
        .filter((name) => name.length > 0);

    const duration = parseDuration(optionalString(values, 'duration') ?? '60s');
    const ramp = parseRate(optionalString(values, 'ramp') ?? '10');

    const fleet = new Fleet({
        host,
        port: port(values),
        count,
        behaviours,
        ramp,
        seed: optionalString(values, 'seed') ? parseCount(values.seed as string, '--seed') : 1,
        viewDistance: optionalString(values, 'view-distance')
            ? parseCount(values['view-distance'] as string, '--view-distance')
            : 4,
        namePrefix: optionalString(values, 'name-prefix') ?? 'Bot',
        logger: logger(values),
        loginTimeoutMs: optionalString(values, 'timeout') ? parseDuration(values.timeout as string) : undefined
    });

    io.out(`Connecting ${count} bot(s) to ${host}:${port(values)}${ramp > 0 ? ` at ${ramp}/s` : ' all at once'}…`);
    await fleet.connect();
    io.out(`Connected ${fleet.report().connected}/${count}. Running for ${(duration / 1000).toFixed(0)}s…`);

    // Interruptible, so a run that is clearly going wrong can be stopped without losing the
    // report - which is often the only reason it was worth starting.
    await Promise.race([fleet.run(duration), untilInterrupted()]);
    fleet.stop();

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
