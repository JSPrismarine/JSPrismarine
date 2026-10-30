import type { Logger } from '@jsprismarine/logger';
import { Vector3 } from '@jsprismarine/math';
import { describe, expect, it } from 'vitest';

import { BlockRuntimeIds } from '../block/state/BlockRuntimeIds';
import type Player from '../Player';
import type Server from '../Server';
import type { Config } from '../config/Config';
import { stub } from '../testing/stub.test.helper';
import type { World } from '../world/World';
import { Position } from '../world/Position';
import type ClientConnection from './ClientConnection';
import type PlayerSession from './PlayerSession';
import Codec2193 from './codec/Codec2193';
import { NetworkWorldReplicator } from './NetworkWorldReplicator';
import { PacketCompressionAlgorithm } from '@jsprismarine/minecraft';
import { BatchCodec } from '@jsprismarine/protocol';
import UpdateBlockPacket, { UpdateBlockFlagsType } from '@jsprismarine/protocol/packet/UpdateBlockPacket';

/** A player and the block updates the replicator batches for it. */
const replicatorFor = () => {
    const batches: Buffer[] = [];
    const connection = stub<ClientConnection>({
        codec: Codec2193,
        sendSharedBatch: (content) => void batches.push(content)
    });
    const session = stub<PlayerSession>({ getConnection: () => connection });
    const world = stub<World>({ getName: () => 'test' });
    const player = stub<Player>({
        getNetworkSession: () => session,
        getPosition: () => new Position(8, 64, 8, world),
        isOnline: () => true,
        viewDistance: 4
    });
    const visibleWorld = stub<World>({
        getName: () => 'test',
        getPlayers: () => [player]
    });
    const server = stub<Server>({
        getConfig: () => stub<Config>({ getProximityBroadcast: () => true, getPacketCompressionLevel: () => 1 }),
        getLogger: () => stub<Logger>({ error: () => {}, verbose: () => {} })
    });

    return { batches, replicator: new NetworkWorldReplicator(visibleWorld, server) };
};

describe('NetworkWorldReplicator block changes', () => {
    it('asks the client to update neighboring block visuals', async () => {
        const { batches, replicator } = replicatorFor();
        const fireRuntimeId = BlockRuntimeIds.tryGetByState('minecraft:fire', { age: 0 });
        if (fireRuntimeId === null) throw new Error('minecraft:fire age 0 must be in the block palette');

        replicator.worldChanged({ kind: 'block-set', position: new Vector3(8, 64, 8), blockRuntimeId: fireRuntimeId });
        await replicator.flushBlockChanges();

        const [packetBytes] = BatchCodec.compressed({ algorithm: PacketCompressionAlgorithm.ZLIB }).decode(batches[0]!);
        const update = new UpdateBlockPacket(packetBytes);
        update.decode();

        expect(update.blockRuntimeId).toBe(fireRuntimeId >>> 0);
        expect(update.flags).toBe(UpdateBlockFlagsType.Neighbors | UpdateBlockFlagsType.Network);
    });
});
