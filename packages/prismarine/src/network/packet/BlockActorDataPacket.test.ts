import { NBTTagCompound, Types } from '@jsprismarine/nbt';
import { describe, expect, it } from 'vitest';
import BlockPosition from '../../world/BlockPosition';
import BlockActorDataPacket from './BlockActorDataPacket';

describe('BlockActorDataPacket', () => {
    // Header 0x38. Position 1, 2, 3 zigzags to 2, 4, 6. Then network NBT: an unnamed root
    // compound (0x0a and a zero length name) holding the string tag (0x08) "id" with the
    // value "Sign", closed by TAG_End. Network NBT counts string bytes with varints, so
    // every length here is one byte.
    const encoded = Buffer.from([
        0x38, 0x02, 0x04, 0x06, 0x0a, 0x00, 0x08, 0x02, 0x69, 0x64, 0x04, 0x53, 0x69, 0x67, 0x6e, 0x00
    ]);

    it('decodes the position and the tags, consuming the whole buffer', () => {
        const packet = new BlockActorDataPacket(encoded);
        packet.decode();

        expect(packet.blockPosition).toEqual(new BlockPosition(1, 2, 3));
        expect(packet.actorDataTags.getString('id', '')).toBe('Sign');
        expect(packet.feof()).toBe(true);
    });

    it('encodes the tags back to the same bytes', () => {
        const packet = new BlockActorDataPacket();
        packet.blockPosition = new BlockPosition(1, 2, 3);
        packet.actorDataTags = new NBTTagCompound('');
        packet.actorDataTags.addValue('id', new Types.StringVal('Sign'));
        packet.encode();

        expect(packet.getBuffer()).toEqual(encoded);
    });

    it('writes an empty root name whatever the compound is called', () => {
        // A vanilla compound has no name, so the client only ever sees an empty one here.
        const packet = new BlockActorDataPacket();
        packet.blockPosition = new BlockPosition(1, 2, 3);
        packet.actorDataTags = new NBTTagCompound('Sign');
        packet.actorDataTags.addValue('id', new Types.StringVal('Sign'));
        packet.encode();

        expect(packet.getBuffer()).toEqual(encoded);
        expect(packet.actorDataTags.getName()).toBe('Sign');
    });
});
