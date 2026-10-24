import { Vector3 } from '@jsprismarine/math';
import { describe, expect, it } from 'vitest';
import BlockPosition from '../../world/BlockPosition';
import StructureBlockUpdatePacket, {
    AnimationMode,
    Mirror,
    Rotation,
    StructureBlockType,
    StructureRedstoneSaveMode
} from './StructureBlockUpdatePacket';

describe('StructureBlockUpdatePacket', () => {
    // One Buffer per docs field, in wire order.
    const encoded = Buffer.concat([
        Buffer.from([0x5a]), // Header, packet 90
        Buffer.from([0x02, 0x04, 0x06]), // Block Position: 1, 2, 3 as zigzag varint32
        Buffer.from([0x05]),
        Buffer.from('house'), // Structure Name: Unredacted
        Buffer.from([0x01, 0x01]),
        Buffer.from('h'), // Structure Name: Redacted, present
        Buffer.from([0x00]), // Data Field: empty
        Buffer.from([0x01]), // Should include players?
        Buffer.from([0x00]), // Should show bounding box?
        Buffer.from([0x0a]), // Structure Block Type: varint32 5 (Export) zigzags to 10
        Buffer.from([0x07]),
        Buffer.from('default'), // Structure Palette Name
        Buffer.from([0x00]), // Should ignore entities?
        Buffer.from([0x01]), // Should ignore blocks?
        Buffer.from([0x00]), // Should Allow Non Ticking Chunks
        Buffer.from([0x08, 0x0a, 0x0c]), // Structure Size: 4, 5, 6
        Buffer.from([0x01, 0x00, 0x02]), // Structure Offset: -1, 0, 1
        Buffer.from([0x0e]), // Last Edit Player: varint64 7 zigzags to 14
        Buffer.from([0x01]), // Rotation: Rotate90
        Buffer.from([0x02]), // Mirror: Z
        Buffer.from([0x02]), // Animation Mode: Blocks
        Buffer.from([0x00, 0x00, 0xc0, 0x3f]), // Animation Seconds: float LE 1.5
        Buffer.from([0x00, 0x00, 0x80, 0x3f]), // Integrity Value: float LE 1
        Buffer.from([0x09, 0x00, 0x00, 0x00]), // Integrity Seed: uint32 LE 9
        Buffer.from([0x00, 0x00, 0x00, 0x3f]), // Rotation Pivot: x, float LE 0.5
        Buffer.from([0x00, 0x00, 0x00, 0x00]), // Rotation Pivot: y
        Buffer.from([0x00, 0x00, 0x80, 0xbf]), // Rotation Pivot: z, float LE -1
        Buffer.from([0x02]), // Redstone Save Mode: varint32 1 (SavesToDisk) zigzags to 2
        Buffer.from([0x01]), // Trigger?
        Buffer.from([0x00]) // IsWaterlogged
    ]);

    const structureData = () => ({
        structureName: { unredacted: 'house', redacted: 'h' },
        dataField: '',
        includePlayers: true,
        showBoundingBox: false,
        structureBlockType: StructureBlockType.Export,
        structureSettings: {
            structurePaletteName: 'default',
            ignoreEntities: false,
            ignoreBlocks: true,
            allowNonTickingChunks: false,
            structureSize: new BlockPosition(4, 5, 6),
            structureOffset: new BlockPosition(-1, 0, 1),
            lastEditPlayer: 7n,
            rotation: Rotation.Rotate90,
            mirror: Mirror.Z,
            animationMode: AnimationMode.Blocks,
            animationSeconds: 1.5,
            integrityValue: 1,
            integritySeed: 9,
            rotationPivot: new Vector3(0.5, 0, -1)
        },
        redstoneSaveMode: StructureRedstoneSaveMode.SavesToDisk
    });

    it('decodes every field and consumes the whole buffer', () => {
        const packet = new StructureBlockUpdatePacket(encoded);
        packet.decode();

        expect(packet.blockPosition).toEqual(new BlockPosition(1, 2, 3));
        expect(packet.structureData).toEqual(structureData());
        expect(packet.trigger).toBe(true);
        expect(packet.isWaterlogged).toBe(false);
        expect(packet.feof()).toBe(true);
    });

    it('encodes the same bytes back', () => {
        const packet = new StructureBlockUpdatePacket();
        packet.blockPosition = new BlockPosition(1, 2, 3);
        packet.structureData = structureData();
        packet.trigger = true;
        packet.encode();

        expect(packet.getBuffer()).toEqual(encoded);
    });

    it('leaves out the redacted structure name when there is none', () => {
        const packet = new StructureBlockUpdatePacket();
        packet.structureData = { ...structureData(), structureName: { unredacted: 'a', redacted: null } };
        packet.encode();

        // Header, the three position varints, the name, then the absent redacted name.
        expect(packet.getBuffer().subarray(0, 7)).toEqual(
            Buffer.concat([Buffer.from([0x5a, 0x00, 0x00, 0x00, 0x01]), Buffer.from('a'), Buffer.from([0x00])])
        );
    });
});
