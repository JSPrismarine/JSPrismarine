/**
 * Measures accepted-packet recording and live dispatcher playback against decode-only work.
 * World ticking, snapshot restoration, and their digests are outside this packet benchmark.
 *
 * Run: pnpm --filter @jsprismarine/prismarine run bench:inbound-packets -- [packet count]
 */
import { performance } from 'node:perf_hooks';

import { readPacketId } from '@jsprismarine/protocol/NetworkPacket';
import type NetworkPacket from '@jsprismarine/protocol/NetworkPacket';
import TextPacket from '@jsprismarine/protocol/packet/TextPacket';
import { BatchCodec, TextPacketType } from '@jsprismarine/protocol';
import type { Logger } from '@jsprismarine/logger';
import type { InetAddress } from '@jsprismarine/raknet';
import type { EventEmitter } from '../src/events/EventEmitter';
import type Server from '../src/Server';
import { stub } from '../src/testing/stub.test.helper';
import SessionManager from '../src/SessionManager';
import type ClientConnection from '../src/network/ClientConnection';
import { PacketLogFilter } from '../src/network/PacketLogFilter';
import NetworkDispatcher from '../src/network/NetworkDispatcher';
import type PacketHandlerRegistry from '../src/network/PacketHandlerRegistry';
import type { InboundPacketRecorder } from '../src/network/InboundPacketTrace';
import type { SessionPhase } from '../src/network/SessionPhase';
import type { Transport, TransportCapabilities, TransportConnection } from '../src/network/transport/Transport';

import Codec2193 from '../src/network/codec/Codec2193';
import { InboundPacketTrace } from '../src/network/InboundPacketTrace';

const packetCount = Number(process.argv.slice(2).find((argument) => argument !== '--') ?? 50_000);
if (!Number.isSafeInteger(packetCount) || packetCount < 1) throw new Error('packet count must be a positive integer');

const payloads = Array.from({ length: 32 }, (_unused, index) => {
    const packet = new TextPacket({
        type: TextPacketType.Raw,
        needsTranslation: false,
        message: `trace sample ${index}`,
        xuid: '',
        platformChatId: '',
        filtered: `trace sample ${index}`
    });
    packet.encode(Codec2193.context);
    return Buffer.from(packet.getBuffer());
});

const decode = (payload: Buffer): NetworkPacket<unknown> => {
    const packet = Codec2193.createPacket(readPacketId(payload), payload);
    if (packet === null) throw new Error('benchmark packet id has no decoder');
    packet.decode(Codec2193.context);
    return packet;
};

const measureCpuMs = (work: () => void): { readonly wallMs: number; readonly cpuMs: number } => {
    const started = performance.now();
    const cpuStarted = process.cpuUsage();
    work();
    const cpu = process.cpuUsage(cpuStarted);
    return {
        wallMs: performance.now() - started,
        cpuMs: (cpu.user + cpu.system) / 1000
    };
};

const measureCpuMsAsync = async (
    work: () => Promise<void>
): Promise<{ readonly wallMs: number; readonly cpuMs: number }> => {
    const started = performance.now();
    const cpuStarted = process.cpuUsage();
    await work();
    const cpu = process.cpuUsage(cpuStarted);
    return {
        wallMs: performance.now() - started,
        cpuMs: (cpu.user + cpu.system) / 1000
    };
};

/** Transport seam for replay, which feeds records directly to the dispatcher. */
class ReplayTransport implements Transport<TransportConnection> {
    private connect: ((connection: TransportConnection) => Promise<void> | void) | undefined;
    private frame: ((payload: Buffer, address: InetAddress) => Promise<void> | void) | undefined;

    public onConnect(listener: (connection: TransportConnection) => Promise<void> | void): void {
        this.connect = listener;
    }

    public onDisconnect(): void {}

    public onFrame(listener: (payload: Buffer, address: InetAddress) => Promise<void> | void): void {
        this.frame = listener;
    }

    public onRaw(): void {}

    public close(): void {}

    public async admit(connection: TransportConnection): Promise<void> {
        await this.connect?.(connection);
    }

    public async emitFrame(payload: Buffer, address: InetAddress): Promise<void> {
        await this.frame?.(payload, address);
    }
}

const replayCapabilities: TransportCapabilities = {
    encrypted: false,
    reliableOrdered: true,
    maxFrameSize: Number.POSITIVE_INFINITY
};

const replayTransportConnection: TransportConnection = {
    token: 'benchmark:1',
    capabilities: replayCapabilities,
    sendFrame: () => {},
    close: () => {}
};

const replayAddress = stub<InetAddress>({ toToken: () => 'benchmark:1' });

/** Creates a dispatcher run with the same input and handler path, with capture optional. */
const createReplayHarness = async (recorder?: InboundPacketRecorder) => {
    let tick = 0;
    let checksum = 0;
    const handler = {
        phases: ['handshake'] as const satisfies readonly SessionPhase[],
        handle: async (packet: unknown) => {
            if (packet instanceof TextPacket) checksum += packet.getPacketData()!.message.length;
        }
    };
    const logger = stub<Logger>({
        error: () => {},
        warn: () => {},
        info: () => {},
        debug: () => {},
        verbose: () => {},
        silly: () => {}
    });
    const transport = new ReplayTransport();
    const dispatcher = new NetworkDispatcher({
        transport,
        sessionManager: new SessionManager(),
        packetHandlerRegistry: stub<PacketHandlerRegistry>({ getHandler: () => handler }),
        events: stub<EventEmitter>({ emit: async () => {} }),
        server: stub<Server>({ getTick: () => tick }),
        logger,
        logFilter: new PacketLogFilter(),
        ...(recorder === undefined ? {} : { inboundPacketRecorder: recorder }),
        createConnection: () =>
            stub<ClientConnection>({
                codec: Codec2193,
                hasCompression: false,
                phase: 'handshake',
                getPlayerSession: () => null
            }),
        query: { enabled: () => false, onRaw: async () => undefined }
    });
    await transport.admit(replayTransportConnection);

    return {
        checksum: () => checksum,
        setTick: (value: number) => {
            tick = value;
        },
        dispatchFrame: async (payload: Buffer, atTick: number) => {
            tick = atTick;
            await transport.emitFrame(BatchCodec.uncompressed().encode([payload]), replayAddress);
        },
        replayRecord: async (record: Parameters<typeof dispatcher.replayInboundRecord>[0]) => {
            tick = record.tick;
            await dispatcher.replayInboundRecord(record);
        }
    };
};

let decodeChecksum = 0;
const decodeBaseline = measureCpuMs(() => {
    for (let index = 0; index < packetCount; index += 1) {
        decodeChecksum += decode(payloads[index % payloads.length]!).getName().length;
    }
});

const trace = new InboundPacketTrace();
let encodedTrace = Buffer.alloc(0);
const baselineHarness = await createReplayHarness();
const baseline = await measureCpuMsAsync(async () => {
    for (let index = 0; index < packetCount; index += 1) {
        const payload = payloads[index % payloads.length]!;
        await baselineHarness.dispatchFrame(payload, Math.floor(index / 20));
    }
});

const recordingHarness = await createReplayHarness(trace);
const recording = await measureCpuMsAsync(async () => {
    for (let index = 0; index < packetCount; index += 1) {
        const payload = payloads[index % payloads.length]!;
        await recordingHarness.dispatchFrame(payload, Math.floor(index / 20));
    }
    encodedTrace = trace.serialize();
});

const replay = measureCpuMs(() => {
    const restored = InboundPacketTrace.deserialize(encodedTrace);
    for (const record of restored.records()) decodeChecksum += decode(Buffer.from(record.payload)).getName().length;
});

const replayHarness = await createReplayHarness();
const dispatcherReplay = await measureCpuMsAsync(async () => {
    const restored = InboundPacketTrace.deserialize(encodedTrace);
    for (const record of restored.records()) {
        await replayHarness.replayRecord(record);
    }
});

const ratio = (measured: number, reference: number): string =>
    reference === 0 ? 'n/a' : `${(measured / reference).toFixed(2)}x`;

console.log(
    `dispatched ${packetCount} packets per pass; checksums ${decodeChecksum}, ${baselineHarness.checksum()}, ${recordingHarness.checksum()}, ${replayHarness.checksum()}`
);
console.log(
    `decode only: ${decodeBaseline.cpuMs.toFixed(1)} CPU ms, ${decodeBaseline.wallMs.toFixed(1)} wall ms (packet decoder reference)`
);
console.log(
    `unrecorded:  ${baseline.cpuMs.toFixed(1)} CPU ms, ${baseline.wallMs.toFixed(1)} wall ms (batch decode, phase gate, and handler)`
);
console.log(
    `record:      ${recording.cpuMs.toFixed(1)} CPU ms, ${recording.wallMs.toFixed(1)} wall ms (${ratio(recording.cpuMs, baseline.cpuMs)} unrecorded)`
);
console.log(
    `decode replay: ${replay.cpuMs.toFixed(1)} CPU ms, ${replay.wallMs.toFixed(1)} wall ms (${ratio(replay.cpuMs, baseline.cpuMs)} unrecorded, trace parse plus decode)`
);
console.log(
    `dispatch replay: ${dispatcherReplay.cpuMs.toFixed(1)} CPU ms, ${dispatcherReplay.wallMs.toFixed(1)} wall ms (${ratio(dispatcherReplay.cpuMs, baseline.cpuMs)} unrecorded, trace parse, decode, phase gate, and handler)`
);
console.log(
    `storage:  ${trace.getPayloadBytes()} raw payload bytes, ${encodedTrace.byteLength} serialized bytes (${(encodedTrace.byteLength / Math.max(1, trace.getPayloadBytes())).toFixed(2)}x raw)`
);
