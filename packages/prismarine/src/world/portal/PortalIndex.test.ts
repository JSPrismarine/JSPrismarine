import { Vector3 } from '@jsprismarine/math';
import { describe, expect, it } from 'vitest';

import { BlockRuntimeIds } from '../../block/state/BlockRuntimeIds';
import Chunk from '../chunk/Chunk';
import { Dimensions } from '../Dimension';
import { PortalIndex } from './PortalIndex';

const portalId = (axis: 'x' | 'z'): number => {
    const id = BlockRuntimeIds.tryGetByState('minecraft:portal', { portal_axis: axis });
    if (id === null) throw new Error('the palette has no minecraft:portal');
    return id;
};

describe('PortalIndex', () => {
    it('holds each position once, and forgets it on remove', () => {
        const index = new PortalIndex();
        index.add({ x: 1, y: 70, z: 2 });
        index.add({ x: 1, y: 70, z: 2 });
        expect(index.size).toBe(1);
        expect(index.has({ x: 1, y: 70, z: 2 })).toBe(true);

        index.remove({ x: 1, y: 70, z: 2 });
        index.remove({ x: 9, y: 9, z: 9 });
        expect(index.size).toBe(0);
    });

    it('answers the nearest block by Euclidean distance, y included', () => {
        const index = new PortalIndex();
        index.add({ x: 10, y: 64, z: 0 });
        index.add({ x: 0, y: 69, z: 0 });

        // 5 blocks up beats 10 blocks sideways.
        expect(index.closest(new Vector3(0, 64, 0), 128)).toEqual(new Vector3(0, 69, 0));
    });

    it('takes the lower block when two are equally far, as Java tiebreaks on y', () => {
        const index = new PortalIndex();
        index.add({ x: 0, y: 70, z: 0 });
        index.add({ x: 0, y: 60, z: 0 });

        expect(index.closest(new Vector3(0, 65, 0), 128)?.getY()).toBe(60);
    });

    it('ignores a block outside the radius on any axis, and accepts one on the edge', () => {
        const index = new PortalIndex();
        index.add({ x: 129, y: 64, z: 0 });
        expect(index.closest(new Vector3(0, 64, 0), 128)).toBeUndefined();

        index.add({ x: 0, y: 64, z: 128 });
        expect(index.closest(new Vector3(0, 64, 0), 128)).toEqual(new Vector3(0, 64, 128));
    });

    it('tracks a block write: a portal arriving is added, one leaving is removed, anything else is ignored', () => {
        const index = new PortalIndex();
        index.blockChanged({ x: 0, y: 64, z: 0 }, 'minecraft:air', 'minecraft:portal');
        expect(index.has({ x: 0, y: 64, z: 0 })).toBe(true);

        index.blockChanged({ x: 0, y: 64, z: 0 }, 'minecraft:portal', 'minecraft:portal');
        expect(index.size).toBe(1);

        index.blockChanged({ x: 0, y: 64, z: 0 }, 'minecraft:portal', 'minecraft:air');
        expect(index.size).toBe(0);

        index.blockChanged({ x: 1, y: 64, z: 0 }, 'minecraft:air', 'minecraft:obsidian');
        expect(index.size).toBe(0);
    });

    it('reads every portal block out of a loaded chunk, at world coordinates', () => {
        const chunk = new Chunk(-2, 3, new Map(), Dimensions.Overworld);
        chunk.setBlockRuntimeId(4, 70, 9, portalId('x'));
        chunk.setBlockRuntimeId(4, 71, 9, portalId('x'));
        chunk.setBlockRuntimeId(0, -60, 0, portalId('z'));
        chunk.setBlockRuntimeId(1, 70, 9, BlockRuntimeIds.getByName('minecraft:obsidian'));

        const index = new PortalIndex();
        index.chunkLoaded(chunk);

        expect(index.size).toBe(3);
        expect(index.has({ x: -32 + 4, y: 70, z: 48 + 9 })).toBe(true);
        expect(index.has({ x: -32 + 4, y: 71, z: 48 + 9 })).toBe(true);
        expect(index.has({ x: -32, y: -60, z: 48 })).toBe(true);
    });
});
