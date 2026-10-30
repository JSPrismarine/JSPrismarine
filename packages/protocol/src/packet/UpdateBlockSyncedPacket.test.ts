import { describe, expect, it } from 'vitest';
import NetworkBinaryStream from '../NetworkBinaryStream';
import BlockPos from '../structure/BlockPos';
import UpdateBlockSyncedPacket, { ActorSyncMessage } from './UpdateBlockSyncedPacket';

const ENCODED = Buffer.from([
    0x6e, // Header: id 110 as LEB128.
    0x02,
    0x04,
    0x06, // Block Position 1, 2, 3 as ZigZag varint32.
    0xac,
    0x02, // Block Runtime ID 300 as a varuint32.
    0x03, // Flags.
    0x01, // Layer.
    0x05, // Unique Actor Id as a varuint64.
    0x01 // Actor Sync Message BlockToEntity as a varuint64.
]);

describe('UpdateBlockSyncedPacket', () => {
    it('encodes the position, block state, and paired actor in docs order', () => {
        const packet = new UpdateBlockSyncedPacket({
            blockPosition: new BlockPos(1, 2, 3),
            blockRuntimeId: 300,
            flags: 3,
            layer: 1,
            uniqueActorId: 5n,
            actorSyncMessage: ActorSyncMessage.BlockToEntity
        });

        expect(packet.serialize(new NetworkBinaryStream())).toEqual(ENCODED);
    });

    it('decodes every field and consumes the whole buffer', () => {
        const stream = new NetworkBinaryStream(ENCODED);
        const data = new UpdateBlockSyncedPacket().deserialize(stream);

        expect(data.blockPosition).toEqual(new BlockPos(1, 2, 3));
        expect(data.blockRuntimeId).toBe(300);
        expect(data.flags).toBe(3);
        expect(data.layer).toBe(1);
        expect(data.uniqueActorId).toBe(5n);
        expect(data.actorSyncMessage).toBe(ActorSyncMessage.BlockToEntity);
        expect(stream.feof()).toBe(true);
    });
});
