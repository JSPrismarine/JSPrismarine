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
import { InetAddress } from '@jsprismarine/raknet';
import type { ConnectionId } from '../src/network/transport/ConnectionId';
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
    private frame: ((payload: Buffer, id: ConnectionId) => Promise<void> | void) | undefined;

    public onConnect(listener: (connection: TransportConnection) => Promise<void> | void): void {
        this.connect = listener;
    }

    public onDisconnect(): void {}

    public onFrame(listener: (payload: Buffer, id: ConnectionId) => Promise<void> | void): void {
        this.frame = listener;
    }

    public onRaw(): void {}

    public close(): void {}

    public async admit(connection: TransportConnection): Promise<void> {
        await this.connect?.(connection);
    }

    public async emitFrame(payload: Buffer, id: ConnectionId): Promise<void> {
        await this.frame?.(payload, id);
    }
}

const replayCapabilities: TransportCapabilities = {
    encrypted: false,
    reliableOrdered: true,
    maxFrameSize: Number.POSITIVE_INFINITY
};

const replayTransportConnection: TransportConnection = {
    id: 1,
    address: new InetAddress('127.0.0.1', 19132),
    capabilities: replayCapabilities,
    sendFrame: () => {},
    close: () => {}
};

/** Creates a dispatcher run with the same input and handler path, with capture optional. */
const createReplayHarness = async (recorder?: InboundPacketRecorder) => {
    let tick = 0;
    let checksum = 0;
    const handler = {
        phases: ['handshake'] as const satisfies readonly SessionPhase[],
        handle: async (packet: unknown) => {
            if (packet instanceof TextPacket) checksum += packet.getName().length;
        }
    };
    const logLines: string[] = [];
    const recordLog =
        (level: string) =>
        (...messages: unknown[]) => {
            logLines.push(`${level}: ${messages.map(String).join(' ')}`);
        };
    const logger = stub<Logger>({
        isEnabled: () => false,
        error: recordLog('error'),
        warn: recordLog('warn'),
        info: recordLog('info'),
        debug: recordLog('debug'),
        verbose: recordLog('verbose'),
        silly: recordLog('silly')
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
                decryptFrame: (frame: Buffer) => frame,
                getPlayerSession: () => null
            })
    });
    await transport.admit(replayTransportConnection);

    return {
        checksum: () => checksum,
        logLines: () => logLines,
        setTick: (value: number) => {
            tick = value;
        },
        dispatchFrame: async (payload: Buffer, atTick: number) => {
            tick = atTick;
            await transport.emitFrame(BatchCodec.uncompressed().encode([payload]), replayTransportConnection.id);
        },
        replayRecord: async (record: Parameters<typeof dispatcher.replayInboundRecord>[0]) => {
            tick = record.tick;
            await dispatcher.replayInboundRecord(record);
        }
    };
};

const dispatchPackets = async (
    harness: Awaited<ReturnType<typeof createReplayHarness>>,
    count: number
): Promise<void> => {
    for (let index = 0; index < count; index += 1) {
        const payload = payloads[index % payloads.length]!;
        await harness.dispatchFrame(payload, Math.floor(index / 20));
    }
};

const warmupCount = Math.min(packetCount, 5_000);
for (let index = 0; index < warmupCount; index += 1) {
    decode(payloads[index % payloads.length]!);
}

// Warm each async dispatcher path separately so its first run does not absorb JIT and setup costs.
const warmupBaseline = await createReplayHarness();
await dispatchPackets(warmupBaseline, warmupCount);
const warmupTrace = new InboundPacketTrace();
const warmupRecording = await createReplayHarness(warmupTrace);
await dispatchPackets(warmupRecording, warmupCount);
const warmupEncodedTrace = warmupTrace.serialize();
const warmupReplay = await createReplayHarness();
for (const record of InboundPacketTrace.deserialize(warmupEncodedTrace).records()) {
    await warmupReplay.replayRecord(record);
}

const SAMPLE_COUNT = 3;
const decodeSamples: { readonly wallMs: number; readonly cpuMs: number }[] = [];
const baselineSamples: { readonly wallMs: number; readonly cpuMs: number }[] = [];
const recordingSamples: { readonly wallMs: number; readonly cpuMs: number }[] = [];
const replaySamples: { readonly wallMs: number; readonly cpuMs: number }[] = [];
const dispatcherReplaySamples: { readonly wallMs: number; readonly cpuMs: number }[] = [];
let trace: InboundPacketTrace | undefined;
let encodedTrace: Buffer = Buffer.alloc(0);
let checksums = { decoded: 0, baseline: 0, recording: 0, replay: 0 };
let recorderLogLines: readonly string[] = [];

for (let sample = 0; sample < SAMPLE_COUNT; sample += 1) {
    const decodeBaseline = measureCpuMs(() => {
        for (let index = 0; index < packetCount; index += 1) {
            decode(payloads[index % payloads.length]!);
        }
    });
    decodeSamples.push(decodeBaseline);

    const baselineHarness = await createReplayHarness();
    const baseline = await measureCpuMsAsync(() => dispatchPackets(baselineHarness, packetCount));
    baselineSamples.push(baseline);

    const currentTrace = new InboundPacketTrace();
    trace = currentTrace;
    const recordingHarness = await createReplayHarness(currentTrace);
    const recording = await measureCpuMsAsync(async () => {
        await dispatchPackets(recordingHarness, packetCount);
        encodedTrace = currentTrace.serialize();
    });
    recorderLogLines = recordingHarness.logLines();
    recordingSamples.push(recording);

    const replay = measureCpuMs(() => {
        const restored = InboundPacketTrace.deserialize(encodedTrace);
        for (const record of restored.records()) decode(Buffer.from(record.payload));
    });
    replaySamples.push(replay);

    const replayHarness = await createReplayHarness();
    const dispatcherReplay = await measureCpuMsAsync(async () => {
        const restored = InboundPacketTrace.deserialize(encodedTrace);
        for (const record of restored.records()) {
            await replayHarness.replayRecord(record);
        }
    });
    dispatcherReplaySamples.push(dispatcherReplay);
    checksums = {
        decoded: packetCount * decode(payloads[0]!).getName().length,
        baseline: baselineHarness.checksum(),
        recording: recordingHarness.checksum(),
        replay: replayHarness.checksum()
    };
}

if (trace === undefined) throw new Error('benchmark did not collect a packet trace');
if (trace.records().length !== packetCount || trace.getPayloadBytes() === 0) {
    throw new Error(
        `Benchmark captured ${trace.records().length} of ${packetCount} packets; first logs: ${recorderLogLines.slice(0, 5).join(' | ')}`
    );
}
if (
    checksums.baseline !== checksums.decoded ||
    checksums.recording !== checksums.baseline ||
    checksums.replay !== checksums.baseline
) {
    throw new Error(
        `Benchmark workloads diverged: decode ${checksums.decoded}, unrecorded ${checksums.baseline}, recorded ${checksums.recording}, replayed ${checksums.replay}`
    );
}

const median = (values: readonly number[]): number =>
    [...values].sort((left, right) => left - right)[Math.floor(values.length / 2)]!;
const medianSample = (samples: readonly { readonly wallMs: number; readonly cpuMs: number }[]) => ({
    cpuMs: median(samples.map((sample) => sample.cpuMs)),
    wallMs: median(samples.map((sample) => sample.wallMs))
});
const decodeBaseline = medianSample(decodeSamples);
const baseline = medianSample(baselineSamples);
const recording = medianSample(recordingSamples);
const replay = medianSample(replaySamples);
const dispatcherReplay = medianSample(dispatcherReplaySamples);

const ratio = (measured: number, reference: number): string =>
    reference === 0 ? 'n/a' : `${(measured / reference).toFixed(2)}x`;

console.log(
    `dispatched ${packetCount} packets per pass across ${SAMPLE_COUNT} measured passes; checksums ${checksums.decoded}, ${checksums.baseline}, ${checksums.recording}, ${checksums.replay}`
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
    `dispatch replay: ${dispatcherReplay.cpuMs.toFixed(1)} CPU ms, ${dispatcherReplay.wallMs.toFixed(1)} wall ms (${ratio(dispatcherReplay.cpuMs, baseline.cpuMs)} unrecorded, trace parse, batch framing, decode, phase gate, and handler)`
);
console.log(
    `storage:  ${trace.getPayloadBytes()} raw payload bytes, ${encodedTrace.byteLength} serialized bytes (${(encodedTrace.byteLength / Math.max(1, trace.getPayloadBytes())).toFixed(2)}x raw)`
);
