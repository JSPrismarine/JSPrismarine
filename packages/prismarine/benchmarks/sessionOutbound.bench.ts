/**
 * Compares one-packet batches, the per-session queue, and one packet batch per tick
 * through MinecraftSession, RakNetTransportConnection, and a connected RakNet loopback pair.
 *
 * Run `pnpm --filter @jsprismarine/prismarine run bench:session-outbound -- [packets] [players] [ticks]`.
 */
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';

import { Logger } from '@jsprismarine/logger';
import { LoopbackSocket } from '@jsprismarine/raknet';
import type { RakNetSession } from '@jsprismarine/raknet';
import { PacketCompressionAlgorithm } from '@jsprismarine/minecraft';
import { BatchCodec, CompressionCodec } from '@jsprismarine/protocol';
import type { Frame } from '@jsprismarine/raknet';
import AnimatePacket from '@jsprismarine/protocol/packet/AnimatePacket';

import Codec2225 from '../src/network/codec/Codec2225';
import MinecraftSession from '../src/network/MinecraftSession';
import { RakNetTransportConnection } from '../src/network/transport/RakNetTransport';

const argumentsAfterScript = process.argv.slice(2).filter((argument) => argument !== '--');
const PACKETS_PER_TICK = Number.parseInt(argumentsAfterScript[0] ?? '8', 10);
const PLAYERS = Number.parseInt(argumentsAfterScript[1] ?? '16', 10);
const TICKS = Number.parseInt(argumentsAfterScript[2] ?? '200', 10);

for (const [name, value] of [
    ['packets per tick', PACKETS_PER_TICK],
    ['players', PLAYERS],
    ['ticks', TICKS]
] as const) {
    if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(`${name} must be a positive integer`);
}

interface SessionMetrics {
    readonly frames: Buffer[];
    datagrams: number;
    datagramBytes: number;
}

interface PlayerConnection {
    readonly loopback: LoopbackSocket;
    readonly raknet: RakNetSession;
    readonly minecraft: MinecraftSession;
    readonly metrics: SessionMetrics;
}

const logger = new Logger('error');
const connections: PlayerConnection[] = [];
let deflateCalls = 0;
const originalCompress = CompressionCodec.prototype.compress;

CompressionCodec.prototype.compress = function (this: CompressionCodec, payload: Buffer): Buffer {
    const compressed = originalCompress.call(this, payload);
    if (compressed !== payload) deflateCalls++;
    return compressed;
};

const createConnections = async (): Promise<void> => {
    for (let player = 0; player < PLAYERS; player++) {
        const loopback = new LoopbackSocket(logger, {
            serverPort: 19132 + player,
            clientPort: 19133 + player
        });
        const metrics: SessionMetrics = { frames: [], datagrams: 0, datagramBytes: 0 };
        const sendDatagram = loopback.server.sendBuffer.bind(loopback.server);
        loopback.server.sendBuffer = (buffer, address): void => {
            metrics.datagrams++;
            metrics.datagramBytes += buffer.byteLength;
            sendDatagram(buffer, address);
        };

        await loopback.connect();
        const raknet = loopback.server.getSession();
        if (raknet === null) throw new Error(`Player ${player} did not complete the RakNet handshake`);
        const sendFrame = raknet.sendFrame.bind(raknet);
        raknet.sendFrame = (frame: Frame, priority): void => {
            metrics.frames.push(Buffer.from(frame.content));
            sendFrame(frame, priority);
        };

        const minecraft = new MinecraftSession(new RakNetTransportConnection(1, raknet), logger);
        minecraft.codec = Codec2225;
        connections.push({ loopback, raknet, minecraft, metrics });
    }
};

const packetsAt = (tick: number, player: number): AnimatePacket[] =>
    Array.from({ length: PACKETS_PER_TICK }, (_, index) => {
        const packet = new AnimatePacket();
        packet.action = 1;
        packet.runtimeEntityId = BigInt(player * PACKETS_PER_TICK + index + 1);
        packet.swingSource = `tick-${tick}`;
        return packet;
    });

const resetMetrics = (): void => {
    deflateCalls = 0;
    for (const { metrics } of connections) {
        metrics.frames.length = 0;
        metrics.datagrams = 0;
        metrics.datagramBytes = 0;
    }
};

const packetStreamDigest = (frames: readonly Buffer[]): string => {
    const decoder = BatchCodec.compressed({ algorithm: PacketCompressionAlgorithm.ZLIB });
    const packetBuffers = frames.flatMap((frame) => decoder.decode(frame));
    return createHash('sha256').update(Buffer.concat(packetBuffers)).digest('hex');
};

const sessionDigests = (): string[] => connections.map(({ metrics }) => packetStreamDigest(metrics.frames));

type Mode = 'one-packet-batches' | 'queued-per-tick' | 'sendPackets-batch';

const measure = async (mode: Mode): Promise<{ readonly mode: Mode; readonly result: Record<string, unknown> }> => {
    resetMetrics();
    const started = performance.now();

    for (let tick = 0; tick < TICKS; tick++) {
        if (mode === 'one-packet-batches') {
            await Promise.all(
                connections.map(async ({ minecraft, raknet }, player) => {
                    // The former send path formed one protocol batch per sendDataPacket;
                    // normal-priority RakNet frames still shared datagrams at the tick flush.
                    for (const packet of packetsAt(tick, player)) {
                        minecraft.sendPackets([packet], { direct: false });
                        await minecraft.flushOutboundPackets();
                    }
                    raknet.sendFrameQueue();
                })
            );
        } else if (mode === 'queued-per-tick') {
            await Promise.all(
                connections.map(async ({ minecraft, raknet }, player) => {
                    const sends = packetsAt(tick, player).map((packet) => minecraft.sendDataPacket(packet));
                    const flush = minecraft.flushOutboundPackets();
                    await Promise.all([...sends, flush]);
                    raknet.sendFrameQueue();
                })
            );
        } else {
            for (const [player, { minecraft, raknet }] of connections.entries()) {
                minecraft.sendPackets(packetsAt(tick, player));
                raknet.sendFrameQueue();
            }
        }
    }

    const microsecondsPerTick = ((performance.now() - started) * 1000) / TICKS;
    const digests = sessionDigests();
    return {
        mode,
        result: {
            microsecondsPerTick,
            deflateCalls,
            frames: connections.reduce((total, { metrics }) => total + metrics.frames.length, 0),
            datagrams: connections.reduce((total, { metrics }) => total + metrics.datagrams, 0),
            wireBytes: connections.reduce((total, { metrics }) => total + metrics.datagramBytes, 0),
            digest: createHash('sha256').update(digests.join(':')).digest('hex'),
            packetsPerTick: PACKETS_PER_TICK,
            players: PLAYERS,
            ticks: TICKS
        }
    };
};

try {
    await createConnections();
    const results = [];
    for (const mode of ['one-packet-batches', 'queued-per-tick', 'sendPackets-batch'] as const) {
        results.push(await measure(mode));
    }

    // Metrics are reset after each mode, so verify digest parity from the recorded outputs.
    const digests = new Set(results.map(({ result }) => result.digest));
    if (digests.size !== 1) throw new Error('Outbound modes produced different decoded packet streams');
    console.log(JSON.stringify({ benchmark: 'session-outbound', results }, null, 2));
} finally {
    CompressionCodec.prototype.compress = originalCompress;
    for (const { loopback } of connections) loopback.kill();
    await logger.disable();
}
