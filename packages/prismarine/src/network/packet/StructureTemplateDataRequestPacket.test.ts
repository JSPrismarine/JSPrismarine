import { Vector3 } from '@jsprismarine/math';
import { describe, expect, it } from 'vitest';
import BlockPosition from '../../world/BlockPosition';
import type { StructureSettings } from '../type/StructureSettings';
import { AnimationMode, Mirror, Rotation } from '../type/StructureSettings';
import StructureTemplateDataRequestPacket, {
    StructureTemplateRequestOperation
} from './StructureTemplateDataRequestPacket';

const SETTINGS: StructureSettings = {
    structurePaletteName: 'default',
    shouldIgnoreEntities: true,
    shouldIgnoreBlocks: false,
    shouldAllowNonTickingPlayerAndTickingAreaChunks: false,
    structureSize: new BlockPosition(1, 2, 3),
    structureOffset: new BlockPosition(0, 0, 0),
    lastEditPlayer: 4n,
    rotation: Rotation.Rotate90,
    mirror: Mirror.X,
    animationMode: AnimationMode.Blocks,
    animationSeconds: 0.5,
    integrityValue: 1,
    integritySeed: 0x01020304,
    rotationPivot: new Vector3(0, 0, 0)
};

const ENCODED_SETTINGS = Buffer.concat([
    Buffer.from([0x07]),
    Buffer.from('default', 'utf8'), // Structure Palette Name.
    Buffer.from([0x01]), // Should ignore entities?
    Buffer.from([0x00]), // Should ignore blocks?
    Buffer.from([0x00]), // Should Allow Non Ticking Player and Ticking Area Chunks.
    Buffer.from([0x02, 0x04, 0x06]), // Structure Size 1, 2, 3.
    Buffer.from([0x00, 0x00, 0x00]), // Structure Offset 0, 0, 0.
    Buffer.from([0x08]), // Last Edit Player 4 as a ZigZag varint64.
    Buffer.from([0x01]), // Rotation Rotate90.
    Buffer.from([0x01]), // Mirror X.
    Buffer.from([0x02]), // Animation Mode Blocks.
    Buffer.from([0x00, 0x00, 0x00, 0x3f]), // Animation Seconds 0.5.
    Buffer.from([0x00, 0x00, 0x80, 0x3f]), // Integrity Value 1.
    Buffer.from([0x04, 0x03, 0x02, 0x01]), // Integrity Seed as a uint32 LE.
    Buffer.alloc(12) // Rotation Pivot 0, 0, 0.
]);

const ENCODED = Buffer.concat([
    Buffer.from([0x84, 0x01]), // Header: id 132 as LEB128.
    Buffer.from([0x01]),
    Buffer.from('s', 'utf8'), // Structure Name.
    Buffer.from([0x00, 0x02, 0x04]), // Structure Position 0, 1, 2.
    ENCODED_SETTINGS,
    Buffer.from([0x01]) // Requested Operation ExportFromSaveMode.
]);

describe('StructureTemplateDataRequestPacket', () => {
    it('encodes the name, the position, the settings and the operation in docs order', () => {
        const packet = Object.assign(new StructureTemplateDataRequestPacket(), {
            structureName: 's',
            structurePosition: new BlockPosition(0, 1, 2),
            structureSettings: SETTINGS,
            requestedOperation: StructureTemplateRequestOperation.ExportFromSaveMode
        });
        packet.encode();

        expect(packet.getBuffer()).toEqual(ENCODED);
    });

    it('decodes every settings field and consumes the whole buffer', () => {
        const packet = new StructureTemplateDataRequestPacket(ENCODED);
        packet.decode();

        expect(packet.structureName).toBe('s');
        expect(packet.structurePosition).toEqual(new BlockPosition(0, 1, 2));
        expect(packet.structureSettings).toEqual(SETTINGS);
        expect(packet.requestedOperation).toBe(StructureTemplateRequestOperation.ExportFromSaveMode);
        expect(packet.feof()).toBe(true);
    });
});
