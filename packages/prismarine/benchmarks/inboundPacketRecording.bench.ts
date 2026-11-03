/**
 * Measures opt-in packet trace recording and offline trace decoding against the same packet
 * decode workload. This is a packet-trace microbenchmark, not a live world replay benchmark.
 *
 * Run: pnpm --filter @jsprismarine/prismarine run bench:inbound-packets -- [packet count]
 */
import { performance } from 'node:perf_hooks';

import { readPacketId } from '@jsprismarine/protocol/NetworkPacket';
import type NetworkPacket from '@jsprismarine/protocol/NetworkPacket';
import TextPacket from '@jsprismarine/protocol/packet/TextPacket';
import { TextPacketType } from '@jsprismarine/protocol';

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

let checksum = 0;
const baseline = measureCpuMs(() => {
    for (let index = 0; index < packetCount; index += 1) {
        checksum += decode(payloads[index % payloads.length]!).getName().length;
    }
});

const trace = new InboundPacketTrace();
let encodedTrace = Buffer.alloc(0);
const recording = measureCpuMs(() => {
    for (let index = 0; index < packetCount; index += 1) {
        const payload = payloads[index % payloads.length]!;
        const packet = decode(payload);
        checksum += packet.getName().length;
        trace.record({
            connectionId: 1,
            sequence: index,
            tick: Math.floor(index / 20),
            protocolVersion: Codec2193.protocolVersion,
            packetName: packet.getName(),
            payload: Buffer.from(payload)
        });
    }
    encodedTrace = trace.serialize();
});

const replay = measureCpuMs(() => {
    const restored = InboundPacketTrace.deserialize(encodedTrace);
    for (const record of restored.records()) checksum += decode(Buffer.from(record.payload)).getName().length;
});

const ratio = (measured: number, reference: number): string =>
    reference === 0 ? 'n/a' : `${(measured / reference).toFixed(2)}x`;

console.log(`decoded ${packetCount} packets per pass; checksum ${checksum}`);
console.log(`baseline: ${baseline.cpuMs.toFixed(1)} CPU ms, ${baseline.wallMs.toFixed(1)} wall ms (decode only)`);
console.log(
    `record:   ${recording.cpuMs.toFixed(1)} CPU ms, ${recording.wallMs.toFixed(1)} wall ms (${ratio(recording.cpuMs, baseline.cpuMs)} baseline)`
);
console.log(
    `replay:   ${replay.cpuMs.toFixed(1)} CPU ms, ${replay.wallMs.toFixed(1)} wall ms (${ratio(replay.cpuMs, baseline.cpuMs)} baseline, trace parse plus decode)`
);
console.log(
    `storage:  ${trace.getPayloadBytes()} raw payload bytes, ${encodedTrace.byteLength} serialized bytes (${(encodedTrace.byteLength / Math.max(1, trace.getPayloadBytes())).toFixed(2)}x raw)`
);
