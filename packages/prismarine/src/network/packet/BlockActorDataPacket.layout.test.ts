import BinaryStream from '@jsprismarine/binaryutils';
import { ByteOrder, NBTTagCompound, NBTWriter, Types } from '@jsprismarine/nbt';
import { blockActorDataPacket, layoutAt } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

import BlockPosition from '../../world/BlockPosition';
import BlockActorDataPacket from './BlockActorDataPacket';

/**
 * The layout must write the bytes the hand-written encoder wrote, the empty root name of the
 * NBT compound included, and must read the compound back whole.
 */
describe('the declarative BlockActorData layout', () => {
    const tags = (): NBTTagCompound => {
        const compound = new NBTTagCompound('a-name-the-wire-drops');
        compound.addValue('id', new Types.StringVal('Chest'));
        compound.addValue('isMovable', new Types.ByteVal(1));
        return compound;
    };

    const fill = (): BlockActorDataPacket => {
        const packet = new BlockActorDataPacket();
        packet.blockPosition = new BlockPosition(3, -7, 11);
        packet.actorDataTags = tags();
        return packet;
    };

    it('matches the bytes the class wrote', () => {
        const packet = fill();

        const expected = new BinaryStream();
        expected.writeVarInt(packet.blockPosition.getX());
        expected.writeVarInt(packet.blockPosition.getY());
        expected.writeVarInt(packet.blockPosition.getZ());
        const writer = new NBTWriter(expected, ByteOrder.LITTLE_ENDIAN);
        writer.setUseVarint(true);
        const root = new NBTTagCompound('');
        for (const [name, value] of packet.actorDataTags.children) root.children.set(name, value);
        writer.writeCompound(root);

        const stream = new BinaryStream();
        layoutAt(blockActorDataPacket, 2193).encode(stream, {
            position: {
                x: packet.blockPosition.getX(),
                y: packet.blockPosition.getY(),
                z: packet.blockPosition.getZ()
            },
            actorDataTags: packet.actorDataTags
        });

        expect(stream.getBuffer()).toEqual(expected.getBuffer());
    });

    it('round-trips through the packet class and consumes the payload', () => {
        const sent = fill();
        sent.encodePayload();

        const received = new BlockActorDataPacket(sent.getBuffer());
        received.decodePayload();

        expect(received.blockPosition).toEqual(sent.blockPosition);
        expect(received.actorDataTags.getString('id', '')).toBe('Chest');
        expect(received.feof()).toBe(true);
    });
});
