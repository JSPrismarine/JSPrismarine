import type { Logger } from '@jsprismarine/logger';
import { Vector3 } from '@jsprismarine/math';
import { describe, expect, it, vi } from 'vitest';
import type { ProtocolCodec } from '@jsprismarine/protocol';

import { BlockRuntimeIds } from '../block/state/BlockRuntimeIds';
import type Server from '../Server';
import type { Config } from '../config/Config';
import { stub } from '../testing/stub.test.helper';
import type { World } from '../world/World';
import { Position } from '../world/Position';
import type ClientConnection from './ClientConnection';
import type PlayerSession from './PlayerSession';
import Codec2193 from './codec/Codec2193';
import Codec2225 from './codec/Codec2225';
import { NetworkWorldReplicator } from './NetworkWorldReplicator';
import { PacketCompressionAlgorithm } from '@jsprismarine/minecraft';
import { BatchCodec } from '@jsprismarine/protocol';
import UpdateBlockPacket, { UpdateBlockFlagsType } from '@jsprismarine/protocol/packet/UpdateBlockPacket';
import UpdateSubChunkBlocksPacket from '@jsprismarine/protocol/packet/UpdateSubChunkBlocksPacket';
import NetworkBinaryStream from '@jsprismarine/protocol/NetworkBinaryStream';
import { readPacketId } from '@jsprismarine/protocol/NetworkPacket';
import { PacketIdentifier } from '@jsprismarine/protocol';
import { isInView } from '../world/Proximity';
import { sealBlockWrite } from '../testing/sealedBlocks.test.helper';

/** Viewers' sessions and the block updates the replicator batches for each. */
const replicatorFor = (
    viewers: readonly { readonly x: number; readonly z: number; readonly viewDistance: number }[],
    codec: ProtocolCodec | ((viewerIndex: number) => ProtocolCodec) = Codec2193,
    compression: (viewerIndex: number) => { algorithm: PacketCompressionAlgorithm; threshold: number } = () => ({
        algorithm: PacketCompressionAlgorithm.ZLIB,
        threshold: 256
    }),
    fullFlushFragments = false
) => {
    const world = stub<World>({ getName: () => 'test' });
    const batches = viewers.map((): Buffer[] => []);
    const players = viewers.map((viewer, index) => {
        const viewerCodec = typeof codec === 'function' ? codec(index) : codec;
        const { algorithm, threshold } = compression(index);
        const connection = stub<ClientConnection>({
            codec: viewerCodec,
            compressionAlgorithm: algorithm,
            compressionThreshold: threshold,
            sendSharedBatch: async (content) => void batches[index]!.push(content)
        });
        return stub<PlayerSession>({
            getConnection: () => connection,
            getViewPosition: () => new Position(viewer.x, 64, viewer.z, world),
            getViewDistance: () => viewer.viewDistance
        });
    });
    const visibleWorld = stub<World>({
        getName: () => 'test',
        getViewers: () => players
    });
    const server = stub<Server>({
        getConfig: () =>
            stub<Config>({
                getProximityBroadcast: () => true,
                getPacketCompressionLevel: () => 1,
                getPacketCompressionThreshold: () => 256,
                getPacketFullFlushFragments: () => fullFlushFragments
            }),
        getLogger: () => stub<Logger>({ error: () => {}, verbose: () => {} })
    });

    return { batches, players, replicator: new NetworkWorldReplicator(visibleWorld, server) };
};

/** One block change as the client receives it, whichever of the two packets carried it. */
interface ReceivedUpdate {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly runtimeId: number;
    readonly flags: number;
}

/** Every packet the batches hold, in order, decoded as whichever of the two it is. */
const packetsIn = (batches: readonly Buffer[]) =>
    batches.flatMap((batch) =>
        BatchCodec.compressed({ algorithm: PacketCompressionAlgorithm.ZLIB })
            .decode(batch)
            .map((packetBytes) => {
                if (readPacketId(packetBytes) === PacketIdentifier.UPDATE_SUB_CHUNK_BLOCKS) {
                    const stream = new NetworkBinaryStream(Buffer.from(packetBytes));
                    return { kind: 'sub-chunk' as const, data: new UpdateSubChunkBlocksPacket().deserialize(stream) };
                }

                const packet = new UpdateBlockPacket(packetBytes);
                packet.decode();
                return { kind: 'block' as const, packet };
            })
    );

/** Decodes every block change sent in one player's batches, in packet order. */
const updatesIn = (batches: readonly Buffer[]): ReceivedUpdate[] =>
    packetsIn(batches).flatMap((decoded): ReceivedUpdate[] => {
        if (decoded.kind === 'block') {
            const { x, y, z, blockRuntimeId, flags } = decoded.packet;
            return [{ x, y, z, runtimeId: blockRuntimeId, flags }];
        }

        return decoded.data.blocksChanged.standards.map((info) => ({
            x: info.position.x,
            y: info.position.y,
            z: info.position.z,
            runtimeId: info.runtimeId,
            flags: info.updateFlags
        }));
    });

describe('NetworkWorldReplicator block changes', () => {
    it('asks the client to update neighboring block visuals', async () => {
        const { batches, replicator } = replicatorFor([{ x: 8, z: 8, viewDistance: 4 }]);
        const fireRuntimeId = BlockRuntimeIds.tryGetByState('minecraft:fire', { age: 0 });
        if (fireRuntimeId === null) throw new Error('minecraft:fire age 0 must be in the block palette');

        sealBlockWrite(replicator, new Vector3(8, 64, 8), fireRuntimeId);
        await replicator.flushBlockChanges();

        const [update] = updatesIn(batches[0]!);
        if (update === undefined) throw new Error('Expected one block update');

        expect(update.runtimeId).toBe(fireRuntimeId >>> 0);
        expect(update.flags).toBe(UpdateBlockFlagsType.Neighbors | UpdateBlockFlagsType.Network);
    });

    it('matches the exact view test at chunk edges and preserves packet order for negative coordinates', async () => {
        const viewers = [
            { x: -0.1, z: -0.1, viewDistance: 2 },
            { x: 64.1, z: 64.1, viewDistance: 1 }
        ];
        const changes = [
            new Vector3(-64, 64, -16), // first viewer's west boundary, including the margin
            new Vector3(-64, 64, -32), // outside the circular corner
            new Vector3(-16, 64, -16),
            new Vector3(96, 64, 64), // second viewer's east boundary
            new Vector3(96, 64, 96), // outside the circular corner
            new Vector3(-80, 64, -16), // outside the first viewer's range
            new Vector3(63, 64, 63)
        ];
        const { batches, players, replicator } = replicatorFor(viewers);
        const stone = BlockRuntimeIds.getByName('minecraft:stone');
        const fire = BlockRuntimeIds.tryGetByState('minecraft:fire', { age: 0 });
        if (fire === null) throw new Error('minecraft:fire age 0 must be in the block palette');

        const expectedChanges = new Map<string, { readonly position: Vector3; readonly runtimeId: number }>();
        for (const [index, position] of changes.entries()) {
            const runtimeId = index === 2 ? stone : fire;
            const key = `${position.getX()},${position.getY()},${position.getZ()}`;
            expectedChanges.set(key, { position, runtimeId });
            sealBlockWrite(replicator, position, runtimeId);
        }
        // Replacing an existing position keeps its original position in the pending packet order.
        const first = changes[0]!;
        sealBlockWrite(replicator, first, stone);
        expectedChanges.set(`${first.getX()},${first.getY()},${first.getZ()}`, { position: first, runtimeId: stone });

        await replicator.flushBlockChanges();

        for (const [index, viewer] of viewers.entries()) {
            const expected = [...expectedChanges.values()]
                .filter(({ position }) =>
                    isInView({
                        event: position,
                        viewer: players[index]!.getViewPosition(),
                        viewDistance: viewer.viewDistance
                    })
                )
                .map(({ position, runtimeId }) => ({
                    x: position.getX(),
                    y: position.getY(),
                    z: position.getZ(),
                    runtimeId: runtimeId >>> 0,
                    flags: UpdateBlockFlagsType.Neighbors | UpdateBlockFlagsType.Network
                }));

            expect(updatesIn(batches[index]!)).toEqual(expected);
        }
    });

    /**
     * A `/fill` used to go out as one `UpdateBlockPacket` per block, and a real client drops
     * the connection a few seconds after a batch of twenty thousand of them. The sub chunk
     * packet is what the protocol has for a bulk change, and it is what keeps the count down.
     */
    it('sends one sub chunk packet for the blocks a fill changed inside it', async () => {
        const { batches, replicator } = replicatorFor([{ x: 8, z: 8, viewDistance: 4 }]);
        const stone = BlockRuntimeIds.getByName('minecraft:stone');
        const changed: Vector3[] = [];

        // One whole sub chunk layer at the origin, which is 256 blocks in one sub chunk.
        for (let x = 0; x < 16; x += 1) {
            for (let z = 0; z < 16; z += 1) {
                const position = new Vector3(x, 64, z);
                changed.push(position);
                sealBlockWrite(replicator, position, stone);
            }
        }

        await replicator.flushBlockChanges();

        const packets = packetsIn(batches[0]!);
        expect(packets).toHaveLength(1);
        const [only] = packets;
        if (only?.kind !== 'sub-chunk') throw new Error('Expected one sub chunk packet');

        const origin = only.data.subChunkBlockPosition;
        expect([origin.x, origin.y, origin.z]).toEqual([0, 64, 0]);
        expect(only.data.blocksChanged.extras).toEqual([]);
        expect(updatesIn(batches[0]!)).toEqual(
            changed.map((position) => ({
                x: position.getX(),
                y: position.getY(),
                z: position.getZ(),
                runtimeId: stone >>> 0,
                flags: UpdateBlockFlagsType.Neighbors | UpdateBlockFlagsType.Network
            }))
        );
    });

    it('keeps a lone change in a sub chunk as a single block update', async () => {
        const { batches, replicator } = replicatorFor([{ x: 8, z: 8, viewDistance: 4 }]);
        const stone = BlockRuntimeIds.getByName('minecraft:stone');

        // Two changes, one sub chunk apart on each axis, so neither has company.
        sealBlockWrite(replicator, new Vector3(1, 64, 1), stone);
        sealBlockWrite(replicator, new Vector3(1, 80, 1), stone);

        await replicator.flushBlockChanges();

        expect(packetsIn(batches[0]!).map(({ kind }) => kind)).toEqual(['block', 'block']);
    });

    it('names the sub chunk a negative column belongs to by its own origin corner', async () => {
        const { batches, replicator } = replicatorFor([{ x: -8, z: -8, viewDistance: 4 }]);
        const stone = BlockRuntimeIds.getByName('minecraft:stone');

        for (const position of [new Vector3(-1, -1, -1), new Vector3(-16, -16, -16)]) {
            sealBlockWrite(replicator, position, stone);
        }

        await replicator.flushBlockChanges();

        const packets = packetsIn(batches[0]!);
        expect(packets).toHaveLength(1);
        const [only] = packets;
        if (only?.kind !== 'sub-chunk') throw new Error('Expected one sub chunk packet');

        // Both positions are in the sub chunk that starts at -16 on every axis, and the
        // corner floors rather than truncating, which is what keeps -1 out of sub chunk 0.
        const origin = only.data.subChunkBlockPosition;
        expect([origin.x, origin.y, origin.z]).toEqual([-16, -16, -16]);
    });

    it('encodes each change once per codec and shares an identical visible batch', async () => {
        const encodesByCodec = { codec2193: 0, codec2225: 0 };
        const codec2193: ProtocolCodec = {
            ...Codec2193,
            prepareOutbound: (packet) => {
                encodesByCodec.codec2193++;
                return Codec2193.prepareOutbound(packet);
            }
        };
        const codec2225: ProtocolCodec = {
            ...Codec2225,
            prepareOutbound: (packet) => {
                encodesByCodec.codec2225++;
                return Codec2225.prepareOutbound(packet);
            }
        };
        const { batches, replicator } = replicatorFor(
            [
                { x: 8, z: 8, viewDistance: 4 },
                { x: 9, z: 9, viewDistance: 4 },
                { x: 10, z: 10, viewDistance: 4 }
            ],
            (index) => (index === 2 ? codec2225 : codec2193)
        );
        const stone = BlockRuntimeIds.getByName('minecraft:stone');
        sealBlockWrite(replicator, new Vector3(8, 64, 8), stone);

        await replicator.flushBlockChanges();

        expect(encodesByCodec).toStrictEqual({ codec2193: 1, codec2225: 1 });
        expect(batches[0]).toHaveLength(1);
        expect(batches[1]).toStrictEqual(batches[0]);
        expect(batches[2]).toHaveLength(1);
        expect(updatesIn(batches[2]!)).toHaveLength(1);
    });

    it('reuses encoded subchunk packets across overlapping but different viewer sets', async () => {
        let encodes = 0;
        const codec: ProtocolCodec = {
            ...Codec2193,
            prepareOutbound: (packet) => {
                encodes++;
                return Codec2193.prepareOutbound(packet);
            }
        };
        const { batches, replicator } = replicatorFor(
            [
                { x: 8, z: 8, viewDistance: 1 },
                { x: 72, z: 8, viewDistance: 1 }
            ],
            codec
        );
        const stone = BlockRuntimeIds.getByName('minecraft:stone');
        sealBlockWrite(replicator, new Vector3(8, 64, 8), stone);
        sealBlockWrite(replicator, new Vector3(40, 64, 8), stone);
        sealBlockWrite(replicator, new Vector3(41, 64, 8), stone);
        sealBlockWrite(replicator, new Vector3(72, 64, 8), stone);

        // The viewers have different visible chunk sets, but both see the middle chunk.
        // Cache whole packets per chunk so its shared update is encoded only once.
        await replicator.flushBlockChanges();

        expect(encodes).toBe(3);
        expect(updatesIn(batches[0]!).map(({ x }) => x)).toEqual([8, 40, 41]);
        expect(updatesIn(batches[1]!).map(({ x }) => x)).toEqual([40, 41, 72]);
    });

    it('uses each viewer’s negotiated algorithm for a shared block update', async () => {
        const { batches, replicator } = replicatorFor(
            [
                { x: 8, z: 8, viewDistance: 4 },
                { x: 8, z: 8, viewDistance: 4 }
            ],
            Codec2193,
            (index) =>
                index === 0
                    ? { algorithm: PacketCompressionAlgorithm.SNAPPY, threshold: 1 }
                    : { algorithm: PacketCompressionAlgorithm.NONE, threshold: 0 }
        );
        const stone = BlockRuntimeIds.getByName('minecraft:stone');
        sealBlockWrite(replicator, new Vector3(8, 64, 8), stone);

        await replicator.flushBlockChanges();

        expect(batches[0]![0]![1]).toBe(PacketCompressionAlgorithm.SNAPPY);
        expect(batches[1]![0]![1]).toBe(0xff);
        expect(updatesIn(batches[0]!)).toHaveLength(1);
        expect(updatesIn(batches[1]!)).toHaveLength(1);
    });

    it('assembles opted-in clustered block updates from cached full-flush fragments', async () => {
        const { batches, replicator } = replicatorFor(
            [
                { x: 8, z: 8, viewDistance: 4 },
                { x: 9, z: 8, viewDistance: 4 }
            ],
            Codec2193,
            () => ({ algorithm: PacketCompressionAlgorithm.ZLIB, threshold: 256 }),
            true
        );
        const stoneRuntimeId = BlockRuntimeIds.tryGetByState('minecraft:stone', {});
        if (stoneRuntimeId === null) throw new Error('minecraft:stone must be in the block palette');
        const encodeFragment = vi.spyOn(BatchCodec.prototype, 'encodeFullFlushFragment');
        try {
            for (let index = 0; index < 32; index++) {
                sealBlockWrite(replicator, new Vector3(index % 8, 64, Math.trunc(index / 8)), stoneRuntimeId);
            }
            await replicator.flushBlockChanges();

            // All 32 changes share a sub chunk packet, so that one packet contributes one fragment.
            expect(encodeFragment).toHaveBeenCalledTimes(1);
            expect(updatesIn(batches[0]!)).toHaveLength(32);
            expect(updatesIn(batches[1]!)).toEqual(updatesIn(batches[0]!));
        } finally {
            vi.restoreAllMocks();
        }
    });
});
