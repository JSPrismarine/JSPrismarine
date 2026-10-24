import { describe, expect, it } from 'vitest';
import BlockPosition from '../../world/BlockPosition';
import UpdateBlockSyncedPacket, { ActorSyncMessage } from './UpdateBlockSyncedPacket';

const ENCODED = Buffer.concat([
    Buffer.from([0x6e]), // Header: id 110 as LEB128.
    Buffer.from([0x02, 0x04, 0x06]), // Block Position 1, 2, 3 as ZigZag varint32.
    Buffer.from([0xac, 0x02]), // Block Runtime ID 300 as a varuint32.
    Buffer.from([0x03]), // Flags.
    Buffer.from([0x01]), // Layer.
    Buffer.from([0x05]), // Unique Actor Id as a varuint64.
    Buffer.from([0x01]) // Actor Sync Message BlockToEntity as a varuint64.
]);

describe('UpdateBlockSyncedPacket', () => {
    it('encodes the position, the block and the paired actor in docs order', () => {
        const packet = Object.assign(new UpdateBlockSyncedPacket(), {
            blockPosition: new BlockPosition(1, 2, 3),
            blockRuntimeId: 300,
            flags: 3,
            layer: 1,
            uniqueActorId: 5n,
            actorSyncMessage: ActorSyncMessage.BlockToEntity
        });
        packet.encode();

        expect(packet.getBuffer()).toEqual(ENCODED);
    });

    it('decodes every field and consumes the whole buffer', () => {
        const packet = new UpdateBlockSyncedPacket(ENCODED);
        packet.decode();

        expect(packet.blockPosition).toEqual(new BlockPosition(1, 2, 3));
        expect(packet.blockRuntimeId).toBe(300);
        expect(packet.flags).toBe(3);
        expect(packet.layer).toBe(1);
        expect(packet.uniqueActorId).toBe(5n);
        expect(packet.actorSyncMessage).toBe(ActorSyncMessage.BlockToEntity);
        expect(packet.feof()).toBe(true);
    });
});
