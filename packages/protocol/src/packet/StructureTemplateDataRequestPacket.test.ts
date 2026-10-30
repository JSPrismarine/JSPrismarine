import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import BlockPos from '../structure/BlockPos';
import Vec3 from '../structure/Vec3';
import type { StructureSettings } from '../structure/StructureSettings';
import { AnimationMode, Mirror, StructureRotation } from '../structure/StructureSettings';
import StructureTemplateDataRequestPacket, {
    StructureTemplateRequestOperation
} from './StructureTemplateDataRequestPacket';

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

describe('StructureTemplateDataRequestPacket', () => {
    it('encodes the name, position, settings, and operation in docs order', () => {
        expect(new StructureTemplateDataRequestPacket(DATA).serialize(new NetworkBinaryStream())).toEqual(ENCODED);
    });

    it('decodes every settings field and consumes the whole buffer', () => {
        const stream = new NetworkBinaryStream(ENCODED);

        expect(new StructureTemplateDataRequestPacket().deserialize(stream)).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });
});
