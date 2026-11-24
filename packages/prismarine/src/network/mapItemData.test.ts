import { describe, expect, it } from 'vitest';

import {
    MapDecorationType,
    MapItemTrackedActorType
} from '@jsprismarine/protocol/bedrock/packet/ClientboundMapItemDataPacket';

import type { SavedMap } from '../world/savedMap';
import { MAP_SIZE } from '../world/savedMap';
import { mapItemDataOf } from './mapItemData';

const map: SavedMap = {
    dimension: 'minecraft:overworld',
    centerX: 320,
    centerZ: -704,
    scale: 1,
    decorations: [
        { type: 'minecraft:red_x', x: 80, y: -95, rotation: 8 },
        { type: 'minecraft:village_taiga', x: 0, y: 0, rotation: 8 },
        { type: 'example:unknown', x: 1, y: 1, rotation: 0 }
    ]
};

describe('a saved map on the wire', () => {
    const data = mapItemDataOf(7, map, 0, new Uint8Array(MAP_SIZE * MAP_SIZE));

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
