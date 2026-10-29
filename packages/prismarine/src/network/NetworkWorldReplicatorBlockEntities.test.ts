import type { Logger } from '@jsprismarine/logger';
import { Vector3 } from '@jsprismarine/math';
import { NBTTagCompound, Types } from '@jsprismarine/nbt';
import { describe, expect, it } from 'vitest';

import Player from '../Player';
import type Server from '../Server';
import type { Config } from '../config/Config';
import { stub, stubOf } from '../testing/stub.test.helper';
import { Position } from '../world/Position';
import type { World } from '../world/World';
import BlockActorDataPacket from './packet/BlockActorDataPacket';
import type { DataPacket } from './Packets';
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

/** A player at a block position, recording every packet its session is handed. */
const playerAt = (x: number, z: number) => {
    const sent: DataPacket[] = [];

    const player = stubOf(Player, {
        getPosition: () => new Position(x, 64, z, stub<World>()),
        getNetworkSession: () => stub<PlayerSession>({ send: async (packet: DataPacket) => void sent.push(packet) }),
        isOnline: () => true,
        viewDistance: 4
    });

    return { player, sent };
};

const replicatorOver = (players: Player[]) => {
    const world = stub<World>({ getName: () => 'test', getPlayers: () => players });
    const server = stub<Server>({
        getConfig: () => stub<Config>({ getProximityBroadcast: () => true, getPacketCompressionLevel: () => 1 }),
        getLogger: () => stub<Logger>({ verbose: () => {}, error: () => {} })
    });

    return new NetworkWorldReplicator(world, server);
};

/** The compound the existing `BlockActorDataPacket` byte test uses, so the bytes are comparable. */
const signTags = (): NBTTagCompound => {
    const tags = new NBTTagCompound('');
    tags.addValue('id', new Types.StringVal('Sign'));
    return tags;
};

describe('network', () => {
    describe('NetworkWorldReplicator block entities', () => {
        // Header 0x38, then the position 1, 2, 3 as three zigzag varints, then network NBT: an
        // unnamed root compound holding the string tag "id" with the value "Sign", closed by
        // TAG_End. The same bytes `BlockActorDataPacket.test.ts` pins for that compound.
        const expected = Buffer.from([
            0x38, 0x02, 0x04, 0x06, 0x0a, 0x00, 0x08, 0x02, 0x69, 0x64, 0x04, 0x53, 0x69, 0x67, 0x6e, 0x00
        ]);

        it('encodes the position and the whole compound', async () => {
            const near = playerAt(8, 8);
            const replicator = replicatorOver([near.player]);

            replicator.worldChanged({ kind: 'block-entity-set', position: new Vector3(1, 2, 3), tags: signTags() });
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

            replicator.worldChanged({ kind: 'block-entity-set', position: new Vector3(1, 2, 3), tags: signTags() });

            // The flush runs after the tick's block changes have gone out. A block entity
            // update that overtook the block update it belongs to would be dropped by the
            // client, which has no block entity at that position yet.
            expect(near.sent).toEqual([]);
        });

        it('sends one packet for a position written several times in a tick', async () => {
            const near = playerAt(8, 8);
            const replicator = replicatorOver([near.player]);

            const first = new NBTTagCompound('');
            first.addValue('id', new Types.StringVal('Chest'));

            replicator.worldChanged({ kind: 'block-entity-set', position: new Vector3(1, 2, 3), tags: first });
            replicator.worldChanged({ kind: 'block-entity-set', position: new Vector3(1, 2, 3), tags: signTags() });
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

            replicator.worldChanged({ kind: 'block-entity-set', position: new Vector3(1, 2, 3), tags: signTags() });
            await replicator.flushBlockEntities();

            expect(near.sent).toHaveLength(1);
            expect(far.sent).toEqual([]);
        });

        it('forgets what it flushed', async () => {
            const near = playerAt(8, 8);
            const replicator = replicatorOver([near.player]);

            replicator.worldChanged({ kind: 'block-entity-set', position: new Vector3(1, 2, 3), tags: signTags() });
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
            const tags = new NBTTagCompound('');
            tags.addValue('id', new Types.StringVal('Sign'));
            tags.addValue('FrontText', front);

            replicator.worldChanged({ kind: 'block-entity-set', position: new Vector3(-7, 70, 12), tags });
            await replicator.flushBlockEntities();

            near.sent[0]!.encode();
            const decoded = new BlockActorDataPacket(near.sent[0]!.getBuffer());
            decoded.decode();

            expect(decoded.blockPosition).toEqual({ x: -7, y: 70, z: 12 });
            expect(
                decoded.actorDataTags
                    .getCompound('FrontText', false)
                    ?.getCompound('SignTextComponent', false)
                    ?.getString('Text', '')
            ).toBe('hello\nthere');
            expect(decoded.feof()).toBe(true);
        });
    });
});
