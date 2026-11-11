import type { Logger } from '@jsprismarine/logger';
import { Vector3 } from '@jsprismarine/math';
import { NBTTagCompound, Types } from '@jsprismarine/nbt';
import { describe, expect, it } from 'vitest';

import type Server from '../Server';
import type { Config } from '../config/Config';
import { sealBlockEntityWrite } from '../testing/sealedBlocks.test.helper';
import { stub } from '../testing/stub.test.helper';
import { Position } from '../world/Position';
import type { World } from '../world/World';
import BlockActorDataPacket from '@jsprismarine/protocol/packet/BlockActorDataPacket';
import type NetworkPacket from '@jsprismarine/protocol/NetworkPacket';
import NetworkBinaryStream from '@jsprismarine/protocol/NetworkBinaryStream';
import BlockPos from '@jsprismarine/protocol/structure/BlockPos';
import type PlayerSession from './PlayerSession';
import { NetworkWorldReplicator } from './NetworkWorldReplicator';

/**
 * What a block entity change puts on the wire, and who gets it.
 *
 * The bytes are asserted rather than the packet object, because the bug underneath this was
 * that nothing was encoded at all: `BlockActorDataPacket` was registered for decoding and no
 * code path ever built one. A test that only checked which packet class was handed over would
 * have passed against an encoder that wrote nothing.
 */

/** The session of a player at a block position, recording every packet it is handed. */
const playerAt = (x: number, z: number) => {
    const sent: NetworkPacket[] = [];

    const player = stub<PlayerSession>({
        getViewPosition: () => new Position(x, 64, z, stub<World>()),
        getViewDistance: () => 4,
        send: async (packet: NetworkPacket) => void sent.push(packet)
    });

    return { player, sent };
};

const replicatorOver = (players: PlayerSession[]) => {
    const world = stub<World>({ getName: () => 'test', getViewers: () => players });
    const server = stub<Server>({
        getConfig: () =>
            stub<Config>({
                getProximityBroadcast: () => true,
                getPacketCompressionLevel: () => 1,
                getPacketCompressionThreshold: () => 256
            }),
        getLogger: () => stub<Logger>({ verbose: () => {}, error: () => {} })
    });

    const replicator = new NetworkWorldReplicator(world, server);
    // The chunks the tests write into, held empty, as a world hands them over when they enter.
    replicator.chunkEntered(0, 0, []);
    replicator.chunkEntered(-1, 0, []);
    return replicator;
};

/** An unmodeled block entity, so its tags reach the wire as written, with the position the chunk adds. */
const plainTags = (at: Vector3, id = 'Unmodeled'): NBTTagCompound => {
    const tags = new NBTTagCompound('');
    tags.addValue('id', new Types.StringVal(id));
    tags.addValue('x', new Types.NumberVal(at.getX()));
    tags.addValue('y', new Types.NumberVal(at.getY()));
    tags.addValue('z', new Types.NumberVal(at.getZ()));
    return tags;
};

const AT = new Vector3(1, 2, 3);

describe('network', () => {
    describe('NetworkWorldReplicator block entities', () => {
        // Header 0x38, then the position 1, 2, 3 as three zigzag varints, then network NBT: an
        // unnamed root compound holding the string tag "id" with the value "Unmodeled" and the
        // int tags x, y and z as zigzag varints, closed by TAG_End.
        const expected = Buffer.from([
            0x38, 0x02, 0x04, 0x06, 0x0a, 0x00, 0x08, 0x02, 0x69, 0x64, 0x09, 0x55, 0x6e, 0x6d, 0x6f, 0x64, 0x65, 0x6c,
            0x65, 0x64, 0x03, 0x01, 0x78, 0x02, 0x03, 0x01, 0x79, 0x04, 0x03, 0x01, 0x7a, 0x06, 0x00
        ]);

        it('encodes the position and the whole compound', async () => {
            const near = playerAt(8, 8);
            const replicator = replicatorOver([near.player]);

            sealBlockEntityWrite(replicator, AT, null, plainTags(AT));
            await replicator.flushBlockEntities();

            expect(near.sent).toHaveLength(1);
            const packet = near.sent[0]!;
            expect(packet).toBeInstanceOf(BlockActorDataPacket);

            packet.encode();
            expect(packet.getBuffer()).toEqual(expected);
        });

        it('sends nothing until the flush', () => {
            const near = playerAt(8, 8);
            const replicator = replicatorOver([near.player]);

            sealBlockEntityWrite(replicator, AT, null, plainTags(AT));

            // The flush runs after the tick's block changes have gone out. A block entity
            // update that overtook the block update it belongs to would be dropped by the
            // client, which has no block entity at that position yet.
            expect(near.sent).toEqual([]);
        });

        it('sends one packet for a position written several times in a tick', async () => {
            const near = playerAt(8, 8);
            const replicator = replicatorOver([near.player]);

            const first = plainTags(AT, 'Superseded');

            sealBlockEntityWrite(replicator, AT, null, first);
            sealBlockEntityWrite(replicator, AT, first, plainTags(AT));
            await replicator.flushBlockEntities();

            // The last write wins, and the superseded one costs nothing.
            expect(near.sent).toHaveLength(1);
            near.sent[0]!.encode();
            expect(near.sent[0]!.getBuffer()).toEqual(expected);
        });

        it('leaves out a player who does not have the chunk', async () => {
            const near = playerAt(8, 8);
            // Forty chunks east, well outside a view distance of four.
            const far = playerAt(40 * 16 + 8, 8);
            const replicator = replicatorOver([near.player, far.player]);

            sealBlockEntityWrite(replicator, AT, null, plainTags(AT));
            await replicator.flushBlockEntities();

            expect(near.sent).toHaveLength(1);
            expect(far.sent).toEqual([]);
        });

        it('forgets what it flushed', async () => {
            const near = playerAt(8, 8);
            const replicator = replicatorOver([near.player]);

            sealBlockEntityWrite(replicator, AT, null, plainTags(AT));
            await replicator.flushBlockEntities();
            await replicator.flushBlockEntities();

            expect(near.sent).toHaveLength(1);
        });

        it('carries a sign the client can read back', async () => {
            const near = playerAt(8, 8);
            const replicator = replicatorOver([near.player]);

            // The shape 1.19.80 and later write: the face's own compound, with the text inside
            // a further `SignTextComponent`.
            const text = new NBTTagCompound('SignTextComponent');
            text.addValue('Text', new Types.StringVal('hello\nthere'));
            const front = new NBTTagCompound('FrontText');
            front.addValue('SignTextComponent', text);
            const at = new Vector3(-7, 70, 12);
            const tags = plainTags(at, 'Sign');
            tags.addValue('FrontText', front);

            sealBlockEntityWrite(replicator, at, null, tags);
            await replicator.flushBlockEntities();

            near.sent[0]!.encode();
            const decoded = new BlockActorDataPacket().deserialize(new NetworkBinaryStream(near.sent[0]!.getBuffer()));

            expect(decoded.blockPosition).toEqual(new BlockPos(-7, 70, 12));
            expect(
                decoded.actorDataTags
                    .getCompound('FrontText', false)
                    ?.getCompound('SignTextComponent', false)
                    ?.getString('Text', '')
            ).toBe('hello\nthere');
        });
    });
});
