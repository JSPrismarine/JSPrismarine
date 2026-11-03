import { describe, expect, it, vi } from 'vitest';

import { createEngine } from './engine';
import { createTestWorld } from './testWorld';
import type { BlockPosition, WorldAccess } from './world';
import { block } from './world';

const origin: BlockPosition = { x: 0, y: 0, z: 0 };

describe('createEngine redstone updates', () => {
    it('skips neighbor power reads when the block has no redstone hook', () => {
        const base = createTestWorld();
        let reads = 0;
        const world: WorldAccess = {
            ...base,
            getBlock(at) {
                reads++;
                return base.getBlock(at);
            }
        };
        const shouldCompute = vi.fn(() => false);
        const onRedstoneUpdate = vi.fn();
        const engine = createEngine(world, { onRedstoneUpdate, shouldComputeRedstoneUpdate: shouldCompute });

        engine.setBlockAndUpdate(origin, block('minecraft:stone'));

        expect(reads).toBe(7);
        expect(shouldCompute).toHaveBeenCalledTimes(7);
        expect(onRedstoneUpdate).not.toHaveBeenCalled();
    });

    it('keeps update order and power values when the host already wrote the block', () => {
        const base = createTestWorld();
        base.place(origin, block('minecraft:redstone_block'));
        let writes = 0;
        const world: WorldAccess = {
            ...base,
            setBlock(at, to, notifyNeighbors) {
                writes++;
                base.setBlock(at, to, notifyNeighbors);
            }
        };
        const updates: { readonly position: BlockPosition; readonly power: number }[] = [];
        const engine = createEngine(world, {
            onRedstoneUpdate: (at, _block, power) => updates.push({ position: at, power }),
            shouldComputeRedstoneUpdate: () => true
        });

        engine.updateAround(origin, 'minecraft:redstone_block');

        expect(writes).toBe(0);
        expect(updates).toEqual([
            { position: { x: 0, y: -1, z: 0 }, power: 15 },
            { position: { x: 0, y: 1, z: 0 }, power: 15 },
            { position: { x: 0, y: 0, z: -1 }, power: 15 },
            { position: { x: 0, y: 0, z: 1 }, power: 15 },
            { position: { x: -1, y: 0, z: 0 }, power: 15 },
            { position: { x: 1, y: 0, z: 0 }, power: 15 },
            { position: origin, power: 0 }
        ]);
    });
});
