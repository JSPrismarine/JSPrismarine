import { createVoxelWorld } from '@jsprismarine/block-behaviors';
import type { PortalAxis, VoxelDimension } from '@jsprismarine/block-behaviors';
import type { BlockPosition } from '@jsprismarine/blocks';
import { Vector3 } from '@jsprismarine/math';
import { describe, expect, it } from 'vitest';

import { Dimensions } from '../Dimension';
import { createNetherPortal, creationBounds } from './create';

const TARGET: BlockPosition = { x: 40, y: 64, z: 40 };

/** A three deep netherrack shelf under a 4 by 5 footprint, which the first pass of the search accepts. */
const shelf = (world: VoxelDimension, at: BlockPosition, axis: PortalAxis): void => {
    for (let a = -1; a <= 2; a += 1) {
        for (let across = -1; across <= 1; across += 1) {
            const x = axis === 'x' ? at.x + a : at.x + across;
            const z = axis === 'z' ? at.z + a : at.z + across;
            world.set({ x, y: at.y - 1, z }, 'minecraft:netherrack');
        }
    }
};

const count = (world: VoxelDimension, identifier: string, from: BlockPosition, to: BlockPosition): number => {
    let total = 0;
    for (let x = from.x; x <= to.x; x += 1) {
        for (let y = from.y; y <= to.y; y += 1) {
            for (let z = from.z; z <= to.z; z += 1) {
                if (world.identifierAt({ x, y, z }) === identifier) total += 1;
            }
        }
    }
    return total;
};

describe('creationBounds', () => {
    it('spans the floor to one past the ceiling: 0..128 in the Nether and -64..320 in the Overworld', () => {
        expect(creationBounds(Dimensions.Nether)).toEqual({ minY: 0, maxY: 128 });
        expect(creationBounds(Dimensions.Overworld)).toEqual({ minY: -64, maxY: 320 });
    });
});

describe('createNetherPortal', () => {
    it('builds on the closest valid spot and answers a 2 by 3 interior there', () => {
        const world = createVoxelWorld().overworld;
        const near = { x: 44, y: 66, z: 40 };
        const far = { x: 30, y: 60, z: 50 };
        shelf(world, near, 'z');
        shelf(world, far, 'z');

        const created = createNetherPortal(world, TARGET, 'z', Dimensions.Nether);

        expect(created).toEqual({
            rectangle: { minCorner: new Vector3(44, 66, 40), axis: 'z', width: 2, height: 3 },
            forced: false
        });
    });

    it('writes a 4 by 5 obsidian frame with corners and six portal blocks on the source axis', () => {
        const world = createVoxelWorld().overworld;
        const site = { x: 44, y: 66, z: 40 };
        shelf(world, site, 'x');

        createNetherPortal(world, TARGET, 'x', Dimensions.Nether);

        // The frame runs from one block before the interior to one past it, floor to lintel.
        const frame = { from: { x: 43, y: 65, z: 40 }, to: { x: 46, y: 69, z: 40 } };
        expect(count(world, 'minecraft:obsidian', frame.from, frame.to)).toBe(14);
        expect(count(world, 'minecraft:portal', frame.from, frame.to)).toBe(6);
        expect(world.block({ x: 44, y: 66, z: 40 }).states).toEqual({ portal_axis: 'x' });
        expect(world.identifierAt({ x: 43, y: 65, z: 40 })).toBe('minecraft:obsidian');
        expect(world.identifierAt({ x: 46, y: 69, z: 40 })).toBe('minecraft:obsidian');
    });

    it("forces a portal one block back along the axis with y clamped to Java's [70, maxY - 10]", () => {
        const world = createVoxelWorld().overworld;

        const low = createNetherPortal(world, { x: 40, y: 20, z: 40 }, 'x', Dimensions.Nether);
        expect(low.forced).toBe(true);
        // `bipush 70` is the floor.
        expect(low.rectangle.minCorner).toEqual(new Vector3(39, 70, 40));

        const high = createNetherPortal(createVoxelWorld().overworld, { x: 40, y: 125, z: 40 }, 'z', Dimensions.Nether);
        // 128 - 10 is the ceiling in the Nether; 320 - 10 would be the Overworld's.
        expect(high.rectangle.minCorner).toEqual(new Vector3(40, 118, 39));
    });

    it('flanks a forced platform with netherrack beyond the obsidian, as Bedrock does', () => {
        const world = createVoxelWorld().overworld;

        const created = createNetherPortal(world, TARGET, 'x', Dimensions.Nether);
        const corner = created.rectangle.minCorner;
        const floorY = corner.getY() - 1;

        // Obsidian under the two interior columns and one block to each side across the axis.
        for (const dz of [-1, 0, 1]) {
            expect(world.identifierAt({ x: corner.getX(), y: floorY, z: corner.getZ() + dz })).toBe(
                'minecraft:obsidian'
            );
            expect(world.identifierAt({ x: corner.getX() + 1, y: floorY, z: corner.getZ() + dz })).toBe(
                'minecraft:obsidian'
            );
        }
        // Netherrack two blocks out on each side, along the whole frame.
        for (const a of [-1, 0, 1, 2]) {
            expect(world.identifierAt({ x: corner.getX() + a, y: floorY, z: corner.getZ() - 2 })).toBe(
                'minecraft:netherrack'
            );
            expect(world.identifierAt({ x: corner.getX() + a, y: floorY, z: corner.getZ() + 2 })).toBe(
                'minecraft:netherrack'
            );
        }
    });
});
