import { describe, expect, it } from 'vitest';
import UnlockedRecipesPacket, { UnlockedRecipesType } from './UnlockedRecipesPacket';

const ENCODED = Buffer.concat([
    Buffer.from([0xc7, 0x01]), // Header: id 199 as LEB128.
    Buffer.from([0x02, 0x00, 0x00, 0x00]), // Packet Type: NewlyUnlocked as a uint32 LE.
    Buffer.from([0x01]), // Unlocked Recipes List: one entry.
    Buffer.from([0x04, 0x63, 0x61, 0x6b, 0x65]) // "cake".
]);

describe('UnlockedRecipesPacket', () => {
    it('writes the type as a little-endian uint32 and the list as length-prefixed strings', () => {
        const packet = Object.assign(new UnlockedRecipesPacket(), {
            type: UnlockedRecipesType.NewlyUnlocked,
            recipes: ['cake']
        });
        packet.encode();

        expect(packet.getBuffer()).toEqual(ENCODED);
    });

    it('decodes both fields and consumes the whole buffer', () => {
        const packet = new UnlockedRecipesPacket(ENCODED);
        packet.decode();

        expect(packet.type).toBe(UnlockedRecipesType.NewlyUnlocked);
        expect(packet.recipes).toEqual(['cake']);
        expect(packet.feof()).toBe(true);
    });
});
