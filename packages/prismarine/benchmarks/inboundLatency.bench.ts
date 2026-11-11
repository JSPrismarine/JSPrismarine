/**
 * Measures frame-to-handler latency while libuv's pool runs chunk-sized zlib deflates.
 *
 * Run `pnpm --filter @jsprismarine/prismarine run bench:inbound-latency [pool-jobs] [frames] [samples]`.
 */
import { performance } from 'node:perf_hooks';
import { promisify } from 'node:util';
import { deflateRaw } from 'node:zlib';

import type { Logger } from '@jsprismarine/logger';
import { PacketCompressionAlgorithm } from '@jsprismarine/minecraft';
import { InetAddress } from '@jsprismarine/raknet';
import type { ConnectionId } from '../src/network/transport/ConnectionId';
import { BatchCodec } from '@jsprismarine/protocol';
import TextPacket from '@jsprismarine/protocol/packet/TextPacket';
import { TextPacketType } from '@jsprismarine/protocol';

import type { EventEmitter } from '../src/events/EventEmitter';
import type Server from '../src/Server';
import SessionManager from '../src/SessionManager';
import { stub } from '../src/testing/stub.test.helper';
import type ClientConnection from '../src/network/ClientConnection';
import type { ConnectionHandler } from '../src/network/handler/ConnectionContext';
import { PacketLogFilter } from '../src/network/PacketLogFilter';
import NetworkDispatcher from '../src/network/NetworkDispatcher';
import type PacketHandlerRegistry from '../src/network/PacketHandlerRegistry';
import Codec2193 from '../src/network/codec/Codec2193';
import type { Transport, TransportConnection } from '../src/network/transport/Transport';

const args = process.argv.slice(2).filter((argument) => argument !== '--');
const POOL_JOBS = Number.parseInt(args[0] ?? '8', 10);
const FRAMES_PER_SAMPLE = Number.parseInt(args[1] ?? '1000', 10);
const SAMPLES = Number.parseInt(args[2] ?? '5', 10);
const WARMUPS = 1;
const CHUNK_BYTES = 400 * 1024;
const deflateRawAsync = promisify(deflateRaw);

for (const [name, value] of [
    ['pool-jobs', POOL_JOBS],
    ['frames', FRAMES_PER_SAMPLE],
    ['samples', SAMPLES]
] as const) {
    if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(`${name} must be a positive integer`);
}

const noisyBytes = (length: number): Buffer => {
    const bytes = Buffer.allocUnsafe(length);
    let state = 0x6d2b79f5;
    for (let index = 0; index < length; index++) {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        bytes[index] = state & 0xff;
    }
    return bytes;
};

const randomText = (length: number): string =>
    Array.from(noisyBytes(length), (byte) => String.fromCharCode(33 + (byte % 94))).join('');

class BenchTransport implements Transport<TransportConnection> {
    private connectListener: ((connection: TransportConnection) => Promise<void> | void) | undefined;
    private frameListener: ((payload: Buffer, id: ConnectionId) => Promise<void> | void) | undefined;

    public onConnect(listener: (connection: TransportConnection) => Promise<void> | void): void {
        this.connectListener = listener;
    }

    public onDisconnect(): void {}

    public onFrame(listener: (payload: Buffer, id: ConnectionId) => Promise<void> | void): void {
        this.frameListener = listener;
    }

    public onRaw(): void {}

    public close(): void {}

    public async emitConnect(connection: TransportConnection): Promise<void> {
        await this.connectListener?.(connection);
    }

    public async emitFrame(payload: Buffer, id: ConnectionId): Promise<void> {
        await this.frameListener?.(payload, id);
    }
}

const transport = new BenchTransport();
const sessionManager = new SessionManager();
let frameArrival = 0;
let recordLatency = false;
let handledFrames = 0;
const latenciesUs: number[] = [];
const errors: string[] = [];
const logger = stub<Logger>({
    error: (message) => void errors.push(String(message)),
    warn: () => {},
    info: () => {},
    debug: () => {},
    verbose: () => {},
    silly: () => {}
});
const server = stub<Server>();
const handler = stub<ConnectionHandler<TextPacket>>({
    phases: ['handshake'],
    handle: async () => {
        handledFrames++;
        if (recordLatency) latenciesUs.push((performance.now() - frameArrival) * 1000);
    }
});
const packetHandlerRegistry = stub<PacketHandlerRegistry>({ getHandler: () => handler });

new NetworkDispatcher({
    transport,
    sessionManager,
    packetHandlerRegistry,
    events: stub<EventEmitter>({ emit: async () => {} }),
    server,
    logger,
    logFilter: new PacketLogFilter(),
    createConnection: () =>
        stub<ClientConnection>({
            hasCompression: true,
            codec: Codec2193,
            phase: 'handshake',
            getPlayerSession: () => null
        })
});

const transportConnection: TransportConnection = {
    id: 1,
    address: new InetAddress('127.0.0.1', 19132),
    capabilities: { encrypted: false, reliableOrdered: true, maxFrameSize: Number.POSITIVE_INFINITY },
    sendFrame: () => {},
    close: () => {}
};
const inboundPacket = new TextPacket({
    type: TextPacketType.Raw,
    needsTranslation: false,
    message: randomText(128),
    xuid: '',
    platformChatId: '',
    filtered: randomText(128)
});
const preparedPacket = Codec2193.prepareOutbound(inboundPacket);
const packetId = Codec2193.netIdOf(preparedPacket.getName());
if (packetId === undefined) throw new Error('TextPacket is missing from protocol 2193');
preparedPacket.setNetId(packetId);
preparedPacket.encode(Codec2193.context);
const packetBytes = preparedPacket.getBuffer();
const frame = BatchCodec.compressed({ algorithm: PacketCompressionAlgorithm.ZLIB }).encode([packetBytes]);
const compressedBodyBytes = frame.subarray(2).byteLength;

const work = noisyBytes(CHUNK_BYTES);
const percentile = (values: readonly number[], percentage: number): number => {
    const ordered = [...values].sort((left, right) => left - right);
    return ordered[Math.ceil((percentage / 100) * ordered.length) - 1]!;
};

await transport.emitConnect(transportConnection);
for (let sample = 0; sample < WARMUPS + SAMPLES; sample++) {
    const poolWork = Promise.all(Array.from({ length: POOL_JOBS }, () => deflateRawAsync(work, { level: 7 })));
    recordLatency = sample >= WARMUPS;

    for (let index = 0; index < FRAMES_PER_SAMPLE; index++) {
        frameArrival = performance.now();
        await transport.emitFrame(frame, transportConnection.id);
    }

    await poolWork;
}

if (latenciesUs.length !== SAMPLES * FRAMES_PER_SAMPLE) {
    throw new Error(
        `Handled ${handledFrames} frames, recorded ${latenciesUs.length} latencies; errors: ${errors.join('; ')}`
    );
}

console.log(
    JSON.stringify({
        benchmark: 'inbound-frame-to-handler-latency',
        node: process.version,
        platform: `${process.platform}-${process.arch}`,
        poolJobs: POOL_JOBS,
        poolJobBytes: CHUNK_BYTES,
        packetBytes: packetBytes.byteLength,
        compressedBodyBytes,
        frameBytes: frame.byteLength,
        handledFrames,
        frames: latenciesUs.length,
        samples: SAMPLES,
        p50Microseconds: percentile(latenciesUs, 50),
        p99Microseconds: percentile(latenciesUs, 99)
    })
);
