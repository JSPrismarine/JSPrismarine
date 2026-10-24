import { describe, expect, it } from 'vitest';
import BlockPosition from '../../world/BlockPosition';
import ClientboundMapItemDataPacket, {
    MapDecorationType,
    MapItemTrackedActorType
} from './ClientboundMapItemDataPacket';

describe('ClientboundMapItemDataPacket', () => {
    // Header 0x43, map id 1 zigzagged to 2, the overworld, unlocked, and the origin 0, 64, 0
    // whose y zigzags to 128. Then the nine optional blocks, each absent.
    const empty = Buffer.from([
        0x43, 0x02, 0x00, 0x00, 0x00, 0x80, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
    ]);

    // The same header fields with map id 5, the nether and a locked map, the origin 1, 2, 3,
    // and every optional block present:
    // - two creation map ids, 5 and -3, zigzagged to 10 and 5
    // - scale 2 as a single signed byte
    // - one tracked actor: type Entity as a little-endian int32, the unique id 7 present,
    //   and no block position
    // - one decoration: MarkerRed, rotation 4, at 8, 9, labelled "hi", coloured 0x01020304
    //   as a little-endian int32, so the bytes run 04 03 02 01
    // - the region 2 by 3 at 0, 1, with the four values zigzagged
    // - two packed ARGB pixels, each a little-endian uint32: 0xff112233 is 33 22 11 ff on
    //   the wire and 0x80445566 is 66 55 44 80
    const full = Buffer.from([
        0x43, 0x0a, 0x01, 0x01, 0x02, 0x04, 0x06, 0x01, 0x02, 0x0a, 0x05, 0x01, 0x02, 0x01, 0x01, 0x00, 0x00, 0x00,
        0x00, 0x01, 0x0e, 0x00, 0x01, 0x01, 0x02, 0x04, 0x08, 0x09, 0x02, 0x68, 0x69, 0x04, 0x03, 0x02, 0x01, 0x01,
        0x04, 0x01, 0x06, 0x01, 0x00, 0x01, 0x02, 0x01, 0x02, 0x33, 0x22, 0x11, 0xff, 0x66, 0x55, 0x44, 0x80
    ]);

    it('decodes a packet whose optional blocks are all absent', () => {
        const packet = new ClientboundMapItemDataPacket(empty);
        packet.decode();

        expect(packet.mapId).toBe(1n);
        expect(packet.dimension).toBe(0);
        expect(packet.isLocked).toBe(false);
        expect(packet.mapOrigin).toEqual(new BlockPosition(0, 64, 0));
        expect(packet.creationMapIds).toBeNull();
        expect(packet.scale).toBeNull();
        expect(packet.trackedActorIds).toBeNull();
        expect(packet.decorations).toBeNull();
        expect(packet.width).toBeNull();
        expect(packet.height).toBeNull();
        expect(packet.startX).toBeNull();
        expect(packet.startY).toBeNull();
        expect(packet.pixels).toBeNull();
        expect(packet.feof()).toBe(true);
    });

    it('encodes an empty update back to the same bytes', () => {
        const packet = new ClientboundMapItemDataPacket();
        packet.mapId = 1n;
        packet.mapOrigin = new BlockPosition(0, 64, 0);
        packet.encode();

        expect(packet.getBuffer()).toEqual(empty);
    });

    it('decodes every optional block, consuming the whole buffer', () => {
        const packet = new ClientboundMapItemDataPacket(full);
        packet.decode();

        expect(packet.mapId).toBe(5n);
        expect(packet.dimension).toBe(1);
        expect(packet.isLocked).toBe(true);
        expect(packet.mapOrigin).toEqual(new BlockPosition(1, 2, 3));
        expect(packet.creationMapIds).toEqual([5n, -3n]);
        expect(packet.scale).toBe(2);
        expect(packet.trackedActorIds).toEqual([
            { type: MapItemTrackedActorType.Entity, entityId: 7n, blockPosition: null }
        ]);
        expect(packet.decorations).toEqual([
            {
                imageType: MapDecorationType.MarkerRed,
                rotation: 4,
                x: 8,
                y: 9,
                label: 'hi',
                color: 0x01020304
            }
        ]);
        expect(packet.width).toBe(2);
        expect(packet.height).toBe(3);
        expect(packet.startX).toBe(0);
        expect(packet.startY).toBe(1);
        expect(packet.pixels).toEqual([0xff112233, 0x80445566]);
        expect(packet.feof()).toBe(true);
    });

    it('encodes every optional block back to the same bytes', () => {
        const packet = new ClientboundMapItemDataPacket();
        packet.mapId = 5n;
        packet.dimension = 1;
        packet.isLocked = true;
        packet.mapOrigin = new BlockPosition(1, 2, 3);
        packet.creationMapIds = [5n, -3n];
        packet.scale = 2;
        packet.trackedActorIds = [{ type: MapItemTrackedActorType.Entity, entityId: 7n, blockPosition: null }];
        packet.decorations = [
            { imageType: MapDecorationType.MarkerRed, rotation: 4, x: 8, y: 9, label: 'hi', color: 0x01020304 }
        ];
        packet.width = 2;
        packet.height = 3;
        packet.startX = 0;
        packet.startY = 1;
        packet.pixels = [0xff112233, 0x80445566];
        packet.encode();

        expect(packet.getBuffer()).toEqual(full);
    });

    it('decodes a tracked block entity, which carries a position instead of a unique id', () => {
        // Type BlockEntity, no unique id, and the position 1, 2, 3.
        const packet = new ClientboundMapItemDataPacket(
            Buffer.from([
                0x43, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x01,
                0x02, 0x04, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
            ])
        );
        packet.decode();

        expect(packet.trackedActorIds).toEqual([
            {
                type: MapItemTrackedActorType.BlockEntity,
                entityId: null,
                blockPosition: new BlockPosition(1, 2, 3)
            }
        ]);
        expect(packet.feof()).toBe(true);
    });
});
