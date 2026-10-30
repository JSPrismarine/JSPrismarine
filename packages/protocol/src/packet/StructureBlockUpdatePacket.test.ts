import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import BlockPos from '../structure/BlockPos';
import Vec3 from '../structure/Vec3';
import { AnimationMode, Mirror, StructureRotation } from '../structure/StructureSettings';
import StructureBlockUpdatePacket, {
    StructureBlockType,
    StructureRedstoneSaveMode
} from './StructureBlockUpdatePacket';

describe('StructureBlockUpdatePacket', () => {
    const encoded = Buffer.concat([
        Buffer.from([0x5a, 0x02, 0x04, 0x06, 0x05]),
        Buffer.from('house'),
        Buffer.from([0x01, 0x01]),
        Buffer.from('h'),
        Buffer.from([0x00, 0x01, 0x00, 0x0a, 0x07]),
        Buffer.from('default'),
        Buffer.from([0x00, 0x01, 0x00, 0x08, 0x0a, 0x0c, 0x01, 0x00, 0x02, 0x0e, 0x01, 0x02, 0x02]),
        Buffer.from([0x00, 0x00, 0xc0, 0x3f, 0x00, 0x00, 0x80, 0x3f]),
        Buffer.from([0x09, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x3f, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x80, 0xbf]),
        Buffer.from([0x02, 0x01, 0x00])
    ]);
    const data = {
        blockPosition: new BlockPos(1, 2, 3),
        structureData: {
            structureName: { unredacted: 'house', redacted: 'h' },
            dataField: '',
            shouldIncludePlayers: true,
            shouldShowBoundingBox: false,
            structureBlockType: StructureBlockType.Export,
            structureSettings: {
                structurePaletteName: 'default',
                shouldIgnoreEntities: false,
                shouldIgnoreBlocks: true,
                shouldAllowNonTickingPlayerAndTickingAreaChunks: false,
                structureSize: new BlockPos(4, 5, 6),
                structureOffset: new BlockPos(-1, 0, 1),
                lastEditPlayer: 7n,
                rotation: StructureRotation.Rotate90,
                mirror: Mirror.Z,
                animationMode: AnimationMode.Blocks,
                animationSeconds: 1.5,
                integrityValue: 1,
                integritySeed: 9,
                rotationPivot: new Vec3(0.5, 0, -1)
            },
            redstoneSaveMode: StructureRedstoneSaveMode.SavesToDisk
        },
        trigger: true,
        isWaterlogged: false
    };

    it('decodes every editor field and consumes the whole buffer', () => {
        const stream = new NetworkBinaryStream(encoded);

        expect(new StructureBlockUpdatePacket().deserialize(stream)).toEqual(data);
        expect(stream.feof()).toBe(true);
    });

    it('encodes the same bytes back', () => {
        expect(new StructureBlockUpdatePacket(data).serialize(new NetworkBinaryStream())).toEqual(encoded);
    });

    it('leaves out the redacted structure name when there is none', () => {
        const packetData = {
            ...data,
            blockPosition: new BlockPos(0, 0, 0),
            structureData: {
                ...data.structureData,
                structureName: { unredacted: 'a', redacted: null }
            }
        };
        const encodedPacket = new StructureBlockUpdatePacket(packetData).serialize(new NetworkBinaryStream());

        expect(encodedPacket.subarray(0, 7)).toEqual(Buffer.from([0x5a, 0x00, 0x00, 0x00, 0x01, 0x61, 0x00]));
    });
});
