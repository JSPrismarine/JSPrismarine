/**
 * Benchmarks queued block-change delivery to many nearby and distant players.
 *
 * Run `pnpm --filter @jsprismarine/prismarine run bench:network [players] [changes] [samples] [--layout scattered|clustered]`.
 * Every sample flushes the production replicator, decodes its batches, and checks an output
 * digest against a full scan using the same `isInView` predicate.
 */
import { createHash } from 'node:crypto';
import os from 'node:os';
import { parseArgs } from 'node:util';

import type { Logger } from '@jsprismarine/logger';
import { Vector3 } from '@jsprismarine/math';
import { PacketCompressionAlgorithm } from '@jsprismarine/minecraft';
import { BatchCodec, type ProtocolCodec } from '@jsprismarine/protocol';
import UpdateBlockPacket, { UpdateBlockFlagsType } from '@jsprismarine/protocol/packet/UpdateBlockPacket';
import BlockPos from '@jsprismarine/protocol/structure/BlockPos';
import UpdateSubChunkBlocksPacket from '@jsprismarine/protocol/packet/UpdateSubChunkBlocksPacket';
import UpdateSubChunkNetworkBlockInfo from '@jsprismarine/protocol/structure/UpdateSubChunkNetworkBlockInfo';

import { BlockRuntimeIds } from '../src/block/state/BlockRuntimeIds';
import type Player from '../src/Player';
import type Server from '../src/Server';
import type { Config } from '../src/config/Config';
import { stub } from '../src/testing/stub.test.helper';
import type { World } from '../src/world/World';
import { Position } from '../src/world/Position';
import { isInView, toChunk } from '../src/world/Proximity';
import { NetworkWorldReplicator } from '../src/network/NetworkWorldReplicator';
import { encodePacketsForCodec } from '../src/network/encodePacketBatch';
import type ClientConnection from '../src/network/ClientConnection';
import type PlayerSession from '../src/network/PlayerSession';
import Codec2193 from '../src/network/codec/Codec2193';
import { percentile } from './percentile';

const { positionals, values } = parseArgs({
    args: process.argv.slice(2).filter((argument) => argument !== '--'),
    options: { layout: { type: 'string', default: 'scattered' } },
    allowPositionals: true
});
const layoutOption = values.layout ?? 'scattered';
if (layoutOption !== 'scattered' && layoutOption !== 'clustered') {
    throw new RangeError(`layout must be scattered or clustered, got ${layoutOption}`);
}
const LAYOUT = layoutOption;
const PLAYER_COUNT = Number.parseInt(positionals[0] ?? '256', 10);
const CHANGE_COUNT = Number.parseInt(positionals[1] ?? '25000', 10);
const SAMPLES = Number.parseInt(positionals[2] ?? '7', 10);
const WARMUPS = 2;
const SEED = 1234;
const Y = 64;

for (const [name, value] of [
    ['players', PLAYER_COUNT],
    ['changes', CHANGE_COUNT],
    ['samples', SAMPLES]
] as const) {
    if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(`${name} must be a positive integer`);
}

interface Viewer {
    readonly x: number;
    readonly z: number;
    readonly viewDistance: number;
}

interface Change {
    readonly position: Vector3;
    readonly runtimeId: number;
}

const world = stub<World>({ getName: () => 'block proximity benchmark' });
const chunkSpacing = LAYOUT === 'clustered' ? 1 : 64;
const viewers: Viewer[] = Array.from({ length: PLAYER_COUNT }, (_unused, index) => {
    const width = Math.ceil(Math.sqrt(PLAYER_COUNT));
    const chunkX = (index % width) * chunkSpacing - Math.trunc((width * chunkSpacing) / 2);
    const chunkZ = Math.trunc(index / width) * chunkSpacing - Math.trunc((width * chunkSpacing) / 2);
    return { x: chunkX * 16 + 8.25, z: chunkZ * 16 + 8.75, viewDistance: 4 + (index % 3) };
});

const batches: Buffer[][] = viewers.map(() => []);
const players = viewers.map((viewer, index) => {
    const connection = stub<ClientConnection>({
        codec: Codec2193,
        sendSharedBatch: (content) => void batches[index]!.push(content)
    });
    const session = stub<PlayerSession>({ getConnection: () => connection });
    return stub<Player>({
        getNetworkSession: () => session,
        getPosition: () => new Position(viewer.x, Y, viewer.z, world),
        isOnline: () => true,
        viewDistance: viewer.viewDistance
    });
});

const visibleWorld = stub<World>({ getName: () => 'block proximity benchmark', getPlayers: () => players });
const config = stub<Config>({
    getProximityBroadcast: () => true,
    getPacketCompressionLevel: () => 1,
    getPacketCompressionThreshold: () => 256
});
const logger = stub<Logger>({ error: () => undefined, verbose: () => undefined });
const server = stub<Server>({ getConfig: () => config, getLogger: () => logger });
const stone = BlockRuntimeIds.getByName('minecraft:stone');
const BLOCK_UPDATE_FLAGS = UpdateBlockFlagsType.Neighbors | UpdateBlockFlagsType.Network;

const changes: Change[] = Array.from({ length: CHANGE_COUNT }, (_unused, index) => {
    const viewerIndex = index % PLAYER_COUNT;
    const viewer = viewers[viewerIndex]!;
    const viewerChunkX = Math.floor(viewer.x) >> 4;
    const viewerChunkZ = Math.floor(viewer.z) >> 4;
    const changeIndex = Math.trunc(index / PLAYER_COUNT);
    const offsetX = (changeIndex % 11) - 5;
    const offsetZ = (Math.trunc(changeIndex / 11) % 11) - 5;
    const localX = (index * 7) % 16;
    const localZ = (index * 11) % 16;
    return {
        position: new Vector3(
            (viewerChunkX + offsetX) * 16 + localX,
            Y + changeIndex,
            (viewerChunkZ + offsetZ) * 16 + localZ
        ),
        runtimeId: stone
    };
});

const blockPacketsFor = (visibleChanges: readonly Change[]): (UpdateBlockPacket | UpdateSubChunkBlocksPacket)[] => {
    const bySubChunk = new Map<string, Change[]>();
    for (const change of visibleChanges) {
        const { position } = change;
        const key = `${toChunk(position.getX())},${Math.floor(position.getY() / 16)},${toChunk(position.getZ())}`;
        const bucket = bySubChunk.get(key);
        if (bucket === undefined) bySubChunk.set(key, [change]);
        else bucket.push(change);
    }

    return [...bySubChunk.values()].map((bucket) => {
        if (bucket.length === 1) {
            const change = bucket[0]!;
            const packet = new UpdateBlockPacket();
            packet.x = change.position.getX();
            packet.y = change.position.getY();
            packet.z = change.position.getZ();
            packet.blockRuntimeId = change.runtimeId;
            packet.flags = BLOCK_UPDATE_FLAGS;
            return packet;
        }

        const first = bucket[0]!;
        return new UpdateSubChunkBlocksPacket({
            subChunkBlockPosition: new BlockPos(
                toChunk(first.position.getX()) * 16,
                Math.floor(first.position.getY() / 16) * 16,
                toChunk(first.position.getZ()) * 16
            ),
            blocksChanged: {
                standards: bucket.map(
                    ({ position, runtimeId }) =>
                        new UpdateSubChunkNetworkBlockInfo(
                            new BlockPos(position.getX(), position.getY(), position.getZ()),
                            runtimeId,
                            BLOCK_UPDATE_FLAGS,
                            0n,
                            0
                        )
                ),
                extras: []
            }
        });
    });
};

/** Hashes the exact per-viewer packet sequence after independently rebuilding its reference batches. */
const expectedDigest = (codec: ProtocolCodec): string => {
    const hash = createHash('sha256');
    for (const [playerIndex, viewer] of viewers.entries()) {
        const viewerPosition = new Position(viewer.x, Y, viewer.z, world);
        const visibleChanges = changes.filter(({ position }) =>
            isInView({ event: position, viewer: viewerPosition, viewDistance: viewer.viewDistance })
        );
        for (const buffer of encodePacketsForCodec(blockPacketsFor(visibleChanges), codec).buffers) {
            hash.update(`${playerIndex}:${buffer.byteLength}:`);
            hash.update(buffer);
        }
        hash.update('|');
    }
    return hash.digest('hex');
};

const digestBatches = (): string => {
    const hash = createHash('sha256');
    const codec = BatchCodec.compressed({ algorithm: PacketCompressionAlgorithm.ZLIB });
    for (const [playerIndex, playerBatches] of batches.entries()) {
        for (const batch of playerBatches) {
            for (const packetBytes of codec.decode(batch)) {
                hash.update(`${playerIndex}:${packetBytes.byteLength}:`);
                hash.update(packetBytes);
            }
        }
        hash.update('|');
    }
    return hash.digest('hex');
};

interface Sample {
    readonly ms: number;
    readonly outputDigest: string;
    readonly deliveredUpdates: number;
}

const run = async (): Promise<Sample> => {
    for (const playerBatches of batches) playerBatches.length = 0;
    const replicator = new NetworkWorldReplicator(visibleWorld, server);
    for (const { position, runtimeId } of changes) {
        replicator.worldChanged({ kind: 'block-set', position, blockRuntimeId: runtimeId });
    }

    const started = performance.now();
    await replicator.flushBlockChanges();
    const ms = performance.now() - started;
    let deliveredUpdates = 0;
    for (const playerBatches of batches) {
        for (const batch of playerBatches) {
            deliveredUpdates += BatchCodec.compressed({ algorithm: PacketCompressionAlgorithm.ZLIB }).decode(
                batch
            ).length;
        }
    }
    return { ms, outputDigest: digestBatches(), deliveredUpdates };
};

const main = async (): Promise<void> => {
    const reference = expectedDigest(Codec2193);
    for (let warmup = 0; warmup < WARMUPS; warmup++) {
        const sample = await run();
        if (sample.outputDigest !== reference)
            throw new Error('Proximity flush output differs from the full-scan digest');
    }

    const runs = await Promise.all(Array.from({ length: SAMPLES }, run));
    const times = runs.map(({ ms }) => ms).sort((left, right) => left - right);
    const digests = new Set(runs.map(({ outputDigest }) => outputDigest));
    if (digests.size !== 1 || runs[0]?.outputDigest !== reference) {
        throw new Error('Proximity flush output digest changed from the full-scan result');
    }

    process.stdout.write(
        `${JSON.stringify({
            benchmark: 'proximity-block-change-flush',
            seed: SEED,
            node: process.version,
            platform: `${os.platform()}-${os.arch()}`,
            cpu: os.cpus()[0]?.model ?? 'unknown',
            workerCount: 0,
            players: PLAYER_COUNT,
            layout: LAYOUT,
            pendingChanges: CHANGE_COUNT,
            baselinePairChecks: PLAYER_COUNT * CHANGE_COUNT,
            deliveredUpdates: runs[0]?.deliveredUpdates ?? 0,
            warmups: WARMUPS,
            samples: SAMPLES,
            distributionMs: {
                min: times[0] ?? 0,
                p50: percentile(times, 0.5),
                p95: percentile(times, 0.95),
                max: times.at(-1) ?? 0
            },
            outputDigest: runs[0]?.outputDigest
        })}\n`
    );
};

await main();
