import BinaryStream from '@jsprismarine/binaryutils';
import { ByteOrder, NBTTagCompound, NBTWriter, Types } from '@jsprismarine/nbt';
import { describe, expect, it } from 'vitest';
import NetworkBinaryStream from '../NetworkBinaryStream';
import BlockPos from '../structure/BlockPos';
import { blockActorDataPacket } from '../wire/definitions/blocks';
import { layoutAt } from '../wire/WireLayout';
import BlockActorDataPacket from './BlockActorDataPacket';

describe('BlockActorDataPacket', () => {
    // Header 0x38. Position 1, 2, 3 zigzags to 2, 4, 6. Then network NBT: an unnamed root
    // compound holding the string tag (0x08) "id" with the value "Sign", closed by TAG_End.
    const encoded = Buffer.from([
        0x38, 0x02, 0x04, 0x06, 0x0a, 0x00, 0x08, 0x02, 0x69, 0x64, 0x04, 0x53, 0x69, 0x67, 0x6e, 0x00
    ]);

    const signTags = (rootName = ''): NBTTagCompound => {
        const tags = new NBTTagCompound(rootName);
        tags.addValue('id', new Types.StringVal('Sign'));
        return tags;
    };

    it('decodes the position and the tags, consuming the whole buffer', () => {
        const stream = new NetworkBinaryStream(encoded);
        const data = new BlockActorDataPacket().deserialize(stream);

        expect(data.blockPosition).toEqual(new BlockPos(1, 2, 3));
        expect(data.actorDataTags.getString('id', '')).toBe('Sign');
        expect(stream.feof()).toBe(true);
    });

    it('encodes the tags back to the same bytes', () => {
        const packet = new BlockActorDataPacket({ blockPosition: new BlockPos(1, 2, 3), actorDataTags: signTags() });

        expect(packet.serialize(new NetworkBinaryStream())).toEqual(encoded);
    });

    it('writes an empty root name whatever the compound is called', () => {
        const tags = signTags('Sign');
        const packet = new BlockActorDataPacket({ blockPosition: new BlockPos(1, 2, 3), actorDataTags: tags });

        expect(packet.serialize(new NetworkBinaryStream())).toEqual(encoded);
        expect(tags.getName()).toBe('Sign');
    });

    it('matches the declared layout when the root compound has a name', () => {
        const tags = signTags('a-name-the-wire-drops');
        tags.addValue('isMovable', new Types.ByteVal(1));

        const expected = new BinaryStream();
        expected.writeVarInt(3);
        expected.writeVarInt(-7);
        expected.writeVarInt(11);
        const writer = new NBTWriter(expected, ByteOrder.LITTLE_ENDIAN);
        writer.setUseVarint(true);
        const root = new NBTTagCompound('');
        for (const [name, value] of tags.children) root.children.set(name, value);
        writer.writeCompound(root);

        const stream = new BinaryStream();
        layoutAt(blockActorDataPacket, 2193).encode(stream, {
            position: { x: 3, y: -7, z: 11 },
            actorDataTags: tags
        });

        expect(stream.getBuffer()).toEqual(expected.getBuffer());
    });
});
