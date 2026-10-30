import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import BlockPos from '../structure/BlockPos';
import ClientboundMapItemDataPacket, {
    MapDecorationType,
    MapItemTrackedActorType
} from './ClientboundMapItemDataPacket';

describe('ClientboundMapItemDataPacket', () => {
    const empty = Buffer.from([
        0x43, 0x02, 0x00, 0x00, 0x00, 0x80, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
    ]);
    const full = Buffer.from([
        0x43, 0x0a, 0x01, 0x01, 0x02, 0x04, 0x06, 0x01, 0x02, 0x0a, 0x05, 0x01, 0x02, 0x01, 0x01, 0x00, 0x00, 0x00,
        0x00, 0x01, 0x0e, 0x00, 0x01, 0x01, 0x02, 0x04, 0x08, 0x09, 0x02, 0x68, 0x69, 0x04, 0x03, 0x02, 0x01, 0x01,
        0x04, 0x01, 0x06, 0x01, 0x00, 0x01, 0x02, 0x01, 0x02, 0x33, 0x22, 0x11, 0xff, 0x66, 0x55, 0x44, 0x80
    ]);

    it('decodes a packet whose optional sections are all absent', () => {
        const stream = new NetworkBinaryStream(empty);
        const data = new ClientboundMapItemDataPacket().deserialize(stream);

        expect(data.mapId).toBe(1n);
        expect(data.dimension).toBe(0);
        expect(data.isLocked).toBe(false);
        expect(data.mapOrigin).toEqual(new BlockPos(0, 64, 0));
        expect(data.creationMapIds).toBeNull();
        expect(data.scale).toBeNull();
        expect(data.trackedActorIds).toBeNull();
        expect(data.decorations).toBeNull();
        expect(data.width).toBeNull();
        expect(data.height).toBeNull();
        expect(data.startX).toBeNull();
        expect(data.startY).toBeNull();
        expect(data.pixels).toBeNull();
        expect(stream.feof()).toBe(true);
    });

    it('encodes an empty update back to the same bytes', () => {
        const data = {
            mapId: 1n,
            dimension: 0,
            isLocked: false,
            mapOrigin: new BlockPos(0, 64, 0),
            creationMapIds: null,
            scale: null,
            trackedActorIds: null,
            decorations: null,
            width: null,
            height: null,
            startX: null,
            startY: null,
            pixels: null
        };

        expect(new ClientboundMapItemDataPacket(data).serialize(new NetworkBinaryStream())).toEqual(empty);
    });

    it('decodes every optional section, consuming the whole buffer', () => {
        const stream = new NetworkBinaryStream(full);
        const data = new ClientboundMapItemDataPacket().deserialize(stream);

        expect(data.mapId).toBe(5n);
        expect(data.dimension).toBe(1);
        expect(data.isLocked).toBe(true);
        expect(data.mapOrigin).toEqual(new BlockPos(1, 2, 3));
        expect(data.creationMapIds).toEqual([5n, -3n]);
        expect(data.scale).toBe(2);
        expect(data.trackedActorIds).toEqual([
            { type: MapItemTrackedActorType.Entity, entityId: 7n, blockPosition: null }
        ]);
        expect(data.decorations).toEqual([
            {
                imageType: MapDecorationType.MarkerRed,
                rotation: 4,
                x: 8,
                y: 9,
                label: 'hi',
                color: 0x01020304
            }
        ]);
        expect(data.width).toBe(2);
        expect(data.height).toBe(3);
        expect(data.startX).toBe(0);
        expect(data.startY).toBe(1);
        expect(data.pixels).toEqual([0xff112233, 0x80445566]);
        expect(stream.feof()).toBe(true);
    });

    it('encodes every optional section back to the same bytes', () => {
        const data = {
            mapId: 5n,
            dimension: 1,
            isLocked: true,
            mapOrigin: new BlockPos(1, 2, 3),
            creationMapIds: [5n, -3n],
            scale: 2,
            trackedActorIds: [{ type: MapItemTrackedActorType.Entity, entityId: 7n, blockPosition: null }],
            decorations: [
                { imageType: MapDecorationType.MarkerRed, rotation: 4, x: 8, y: 9, label: 'hi', color: 0x01020304 }
            ],
            width: 2,
            height: 3,
            startX: 0,
            startY: 1,
            pixels: [0xff112233, 0x80445566]
        };

        expect(new ClientboundMapItemDataPacket(data).serialize(new NetworkBinaryStream())).toEqual(full);
    });

    it('decodes a tracked block entity position instead of an entity id', () => {
        const bytes = Buffer.from([
            0x43, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02,
            0x04, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
        ]);
        const stream = new NetworkBinaryStream(bytes);
        const data = new ClientboundMapItemDataPacket().deserialize(stream);

        expect(data.trackedActorIds).toEqual([
            { type: MapItemTrackedActorType.BlockEntity, entityId: null, blockPosition: new BlockPos(1, 2, 3) }
        ]);
        expect(stream.feof()).toBe(true);
    });
});
