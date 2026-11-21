import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../../NetworkBinaryStream';
import BlockPos from '../structure/BlockPos';
import Vec3 from '../structure/Vec3';
import type { StructureSettings } from '../structure/StructureSettings';
import { AnimationMode, Mirror, StructureRotation } from '../structure/StructureSettings';
import StructureTemplateDataRequestPacket, {
    StructureTemplateRequestOperation
} from './StructureTemplateDataRequestPacket';
import { enumDumpMembers } from '../../testing/evidence.test.helper';

const SETTINGS: StructureSettings = {
    structurePaletteName: 'default',
    shouldIgnoreEntities: true,
    shouldIgnoreBlocks: false,
    shouldAllowNonTickingPlayerAndTickingAreaChunks: false,
    structureSize: new BlockPos(1, 2, 3),
    structureOffset: new BlockPos(0, 0, 0),
    lastEditPlayer: 4n,
    rotation: StructureRotation.Rotate90,
    mirror: Mirror.X,
    animationMode: AnimationMode.Blocks,
    animationSeconds: 0.5,
    integrityValue: 1,
    integritySeed: 0x01020304,
    rotationPivot: new Vec3(0, 0, 0)
};

const ENCODED = Buffer.concat([
    Buffer.from([0x84, 0x01, 0x01, 0x73, 0x00, 0x02, 0x04, 0x07]),
    Buffer.from('default'),
    Buffer.from([0x01, 0x00, 0x00, 0x02, 0x04, 0x06, 0x00, 0x00, 0x00, 0x08, 0x01, 0x01, 0x02]),
    Buffer.from([0x00, 0x00, 0x00, 0x3f, 0x00, 0x00, 0x80, 0x3f, 0x04, 0x03, 0x02, 0x01]),
    Buffer.alloc(12),
    Buffer.from([0x01])
]);

const DATA = {
    structureName: 's',
    structurePosition: new BlockPos(0, 1, 2),
    structureSettings: SETTINGS,
    requestedOperation: StructureTemplateRequestOperation.ExportFromSaveMode
};

describe.each([2193, 2225] as const)('StructureTemplateDataRequestPacket at protocol %i', (protocolVersion) => {
    const context = { protocolVersion };

    it('encodes the name, position, settings, and operation in docs order', () => {
        expect(new StructureTemplateDataRequestPacket(DATA).serialize(new NetworkBinaryStream(), context)).toEqual(
            ENCODED
        );
    });

    it('decodes every settings field and consumes the whole buffer', () => {
        const stream = new NetworkBinaryStream(ENCODED);

        expect(new StructureTemplateDataRequestPacket().deserialize(stream, context)).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });

    it('numbers every Rotation alias as the 1.26.40 dump does', () => {
        // The 1.26.50 page numbers `Clockwise90`, `Clockwise180` and `CounterClockwise90` as 4, 5
        // and 6; the dump and the 1.26.60 page give 1, 2, 3.
        const rotations = Object.fromEntries(enumDumpMembers('Rotation').map(({ name, value }) => [name, value]));

        expect(rotations).toEqual({
            None: StructureRotation.None,
            Rotate90: StructureRotation.Rotate90,
            Rotate180: StructureRotation.Rotate180,
            Rotate270: StructureRotation.Rotate270,
            Clockwise90: StructureRotation.Clockwise90,
            Clockwise180: StructureRotation.Clockwise180,
            CounterClockwise90: StructureRotation.CounterClockwise90
        });
        expect(Object.keys(rotations)).toHaveLength(7);
    });
});
