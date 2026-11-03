/**
 * Compares per-viewer actor movement encoding with the production per-codec fan-out.
 *
 * Run `pnpm --filter @jsprismarine/prismarine run bench:entity-movement-fanout [entities] [viewers] [iterations]`.
 * The benchmark decodes every viewer's frames and requires each packet-stream digest to match.
 */
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';

import type { Logger } from '@jsprismarine/logger';
import { PacketCompressionAlgorithm } from '@jsprismarine/minecraft';
import { BatchCodec } from '@jsprismarine/protocol';
import type { ProtocolCodec } from '@jsprismarine/protocol';
import MoveActorAbsolutePacket from '@jsprismarine/protocol/packet/MoveActorAbsolutePacket';

import type Player from '../src/Player';
import type Server from '../src/Server';
import type { Config } from '../src/config/Config';
import type { Entity } from '../src/entity/Entity';
import { stub } from '../src/testing/stub.test.helper';
import { Position } from '../src/world/Position';
import type { World } from '../src/world/World';
import type ClientConnection from '../src/network/ClientConnection';
import type PlayerSession from '../src/network/PlayerSession';
import { NetworkWorldReplicator } from '../src/network/NetworkWorldReplicator';
import { encodePacketBatch } from '../src/network/encodePacketBatch';
import Codec2193 from '../src/network/codec/Codec2193';
import Codec2225 from '../src/network/codec/Codec2225';

const argumentsAfterScript = process.argv.slice(2).filter((argument) => argument !== '--');
const ENTITY_COUNT = Number.parseInt(argumentsAfterScript[0] ?? '30', 10);
const VIEWER_COUNT = Number.parseInt(argumentsAfterScript[1] ?? '20', 10);
const ITERATIONS = Number.parseInt(argumentsAfterScript[2] ?? '300', 10);
const WARMUPS = 1;
const SAMPLES = 5;

for (const [name, value] of [
    ['entities', ENTITY_COUNT],
    ['viewers', VIEWER_COUNT],
    ['iterations', ITERATIONS]
] as const) {
    if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(`${name} must be a positive integer`);
}

const countedCodec = (base: ProtocolCodec) => {
    let encodes = 0;
    const codec: ProtocolCodec = {
        ...base,
        prepareOutbound: (packet) => {
            encodes++;
            return base.prepareOutbound(packet);
        }
    };
    return {
        codec,
        reset: () => (encodes = 0),
        get encodes() {
            return encodes;
        }
    };
};

const counters = [countedCodec(Codec2193), countedCodec(Codec2225)];
const codecs = Array.from({ length: VIEWER_COUNT }, (_unused, index) => counters[index % counters.length]!.codec);
const frames: Buffer[][] = codecs.map(() => []);
const world = stub<World>({ getName: () => 'entity movement fan-out benchmark' });
const positions = Array.from({ length: ENTITY_COUNT }, (_unused, index) => ({ x: index * 2 + 0.25 }));
const entities: Entity[] = positions.map((position, index) =>
    stub<Entity>({
        getRuntimeId: () => BigInt(index + 1),
        getPosition: () => new Position(position.x, 64, index % 11, world),
        pitch: index % 23,
        yaw: index % 360,
        headYaw: index % 360,
        isOnGround: () => true
    })
);
const players = codecs.map((codec, index) => {
    const tracked = new Set(entities.map((entity) => entity.getRuntimeId()));
    const connection = stub<ClientConnection>({
        codec,
        sendSharedBatch: async (content) => void frames[index]!.push(content),
        sendSharedBatchAsync: async (batch) => void frames[index]!.push((await batch).content)
    });
    const session = stub<PlayerSession>({
        tracks: (runtimeId: bigint) => tracked.has(runtimeId),
        getConnection: () => connection
    });
    return stub<Player>({ getRuntimeId: () => BigInt(index + 10_000), getNetworkSession: () => session });
});
const visibleWorld = stub<World>({ getName: () => 'entity movement fan-out benchmark', getPlayers: () => players });
const config = stub<Config>({ getPacketCompressionLevel: () => 1, getPacketCompressionThreshold: () => 256 });
const logger = stub<Logger>({ error: () => {} });
const server = stub<Server>({ getConfig: () => config, getLogger: () => logger });
const replicator = new NetworkWorldReplicator(visibleWorld, server);

const movePacketFor = (entity: Entity): MoveActorAbsolutePacket => {
    const packet = new MoveActorAbsolutePacket();
    packet.runtimeEntityId = entity.getRuntimeId();
    packet.position = entity.getPosition();
    packet.pitch = entity.pitch;
    packet.yaw = entity.yaw;
    packet.headYaw = entity.headYaw;
    packet.flags = entity.isOnGround() ? MoveActorAbsolutePacket.FLAG_ON_GROUND : 0;
    return packet;
};

const clearFrames = (): void => {
    for (const viewerFrames of frames) viewerFrames.length = 0;
    for (const counter of counters) counter.reset();
};

const resetActors = (): void => {
    for (const [index, position] of positions.entries()) position.x = index * 2 + 0.25;
};

const advanceActors = (tick: number): void => {
    for (const [index, position] of positions.entries()) position.x += (tick + index + 1) / 10_000;
};

const runIndependent = (): void => {
    clearFrames();
    resetActors();
    for (let tick = 0; tick < ITERATIONS; tick++) {
        advanceActors(tick);
        for (const [viewerIndex, codec] of codecs.entries()) {
            const packets = entities.map(movePacketFor);
            const batch = encodePacketBatch(packets, codec, { compressionLevel: 1, compressionThreshold: 256 });
            frames[viewerIndex]!.push(batch.content);
        }
    }
};

const runShared = async (): Promise<void> => {
    clearFrames();
    resetActors();
    for (let tick = 0; tick < ITERATIONS; tick++) {
        advanceActors(tick);
        for (const entity of entities) replicator.entityMoved(entity);
        await replicator.flushMovement();
    }
};

const viewerDigests = (): string[] =>
    frames.map((viewerFrames) => {
        const hash = createHash('sha256');
        const decoder = BatchCodec.compressed({ algorithm: PacketCompressionAlgorithm.ZLIB, threshold: 256 });
        for (const frame of viewerFrames) {
            for (const packet of decoder.decode(frame)) hash.update(packet);
        }
        return hash.digest('hex');
    });

const measure = async (run: () => void | Promise<void>) => {
    const samples: number[] = [];
    let digests: string[] = [];
    let encodes = 0;
    for (let sample = 0; sample < WARMUPS + SAMPLES; sample++) {
        const started = performance.now();
        await run();
        const elapsed = performance.now() - started;
        digests = viewerDigests();
        encodes = counters.reduce((total, counter) => total + counter.encodes, 0);
        if (sample >= WARMUPS) samples.push((elapsed * 1000) / ITERATIONS);
    }
    samples.sort((left, right) => left - right);
    return {
        microsecondsPerTick: samples[Math.floor(samples.length / 2)]!,
        packetEncodesPerTick: encodes / ITERATIONS,
        viewerDigests: digests
    };
};

const independent = await measure(runIndependent);
const shared = await measure(runShared);
if (JSON.stringify(independent.viewerDigests) !== JSON.stringify(shared.viewerDigests)) {
    throw new Error('Shared actor movement changed a viewer decoded-packet stream');
}

console.log(
    JSON.stringify({
        benchmark: 'entity-movement-fanout',
        entities: ENTITY_COUNT,
        viewers: VIEWER_COUNT,
        iterations: ITERATIONS,
        independent: {
            microsecondsPerTick: independent.microsecondsPerTick,
            packetEncodesPerTick: independent.packetEncodesPerTick
        },
        shared: {
            microsecondsPerTick: shared.microsecondsPerTick,
            packetEncodesPerTick: shared.packetEncodesPerTick
        },
        speedup: independent.microsecondsPerTick / shared.microsecondsPerTick,
        viewerDigests: shared.viewerDigests
    })
);
