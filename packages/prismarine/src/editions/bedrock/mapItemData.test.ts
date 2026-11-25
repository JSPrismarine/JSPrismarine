import { describe, expect, it } from 'vitest';

import {
    MapDecorationType,
    MapItemTrackedActorType
} from '@jsprismarine/protocol/bedrock/packet/ClientboundMapItemDataPacket';

import type { SavedMap } from '../../world/savedMap';
import { MAP_SIZE } from '../../world/savedMap';
import { mapItemDataOf, wholeMap } from './mapItemData';

const map: SavedMap = {
    dimension: 'minecraft:overworld',
    centerX: 320,
    centerZ: -704,
    scale: 1,
    decorations: [
        { type: 'minecraft:red_x', x: 80, y: -95, rotation: 8 },
        { type: 'minecraft:village_taiga', x: 0, y: 0, rotation: 8 },
        { type: 'example:unknown', x: 1, y: 1, rotation: 0 }
    ],
    trackingPosition: true,
    unlimitedTracking: true,
    locked: false,
    colors: new Uint8Array(MAP_SIZE * MAP_SIZE)
};

describe('a saved map on the wire', () => {
    const data = mapItemDataOf(7, map, 0, wholeMap(new Uint8Array(MAP_SIZE * MAP_SIZE), map.decorations));

    it('names itself by the id the client asked for, as a new map', () => {
        expect(data.mapId).toBe(7n);
        expect(data.creationMapIds).toEqual([7n]);
        expect(data.scale).toBe(1);
        expect(data.isLocked).toBe(false);
    });

    it('draws each marker Bedrock has, with its Java bytes and one tracked actor apiece', () => {
        // The unknown type is left off rather than drawn as something else.
        expect(data.decorations?.map((decoration) => decoration.imageType)).toEqual([
            MapDecorationType.XWhite,
            MapDecorationType.VillageTaiga
        ]);
        // Java's -95 is the same byte as Bedrock's 161, and an untinted marker is white.
        expect(data.decorations?.[0]).toMatchObject({ x: 80, y: 161, rotation: 8, color: -1 });
        expect(data.trackedActorIds).toEqual([
            { type: MapItemTrackedActorType.Entity, entityId: 0n, blockPosition: null },
            { type: MapItemTrackedActorType.Entity, entityId: 1n, blockPosition: null }
        ]);
    });

    it('sends the whole map, one pixel per entry', () => {
        expect(data).toMatchObject({ width: MAP_SIZE, height: MAP_SIZE, startX: 0, startY: 0 });
        expect(data.pixels).toHaveLength(MAP_SIZE * MAP_SIZE);
    });
});

describe('part of a map on the wire', () => {
    it('sends only the pixels that changed, and leaves the markers as the client has them', () => {
        const data = mapItemDataOf(7, map, 0, {
            patch: { startX: 3, startY: 5, width: 2, height: 1, colors: new Uint8Array([0, 0]) }
        });

        expect(data).toMatchObject({ startX: 3, startY: 5, width: 2, height: 1 });
        expect(data.pixels).toHaveLength(2);
        expect(data.decorations).toBeNull();
        expect(data.trackedActorIds).toBeNull();
    });

    it('sends only the markers when no pixel changed', () => {
        const data = mapItemDataOf(7, map, 0, { decorations: [] });

        expect(data.pixels).toBeNull();
        expect(data.decorations).toEqual([]);
    });

    it('tells the client a locked map is locked', () => {
        expect(mapItemDataOf(7, { ...map, locked: true }, 0, {}).isLocked).toBe(true);
    });
});
