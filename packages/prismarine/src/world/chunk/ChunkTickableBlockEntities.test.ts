import type { Vector3 } from '@jsprismarine/math';
import { NBTTagCompound, Types } from '@jsprismarine/nbt';
import { describe, expect, it } from 'vitest';

import { BlockRuntimeIds } from '../../block/state/BlockRuntimeIds';
import { BlockEntityRegistry } from '../../blockentity/BlockEntityRegistry';
import Chunk from './Chunk';

const entityAt = (id: string, x: number) => {
    const root = new NBTTagCompound('');
    root.addValue('id', new Types.StringVal(id));
    root.addValue('x', new Types.NumberVal(x));
    root.addValue('y', new Types.NumberVal(64));
    root.addValue('z', new Types.NumberVal(0));
    return BlockEntityRegistry.fromNBT(root);
};

const xOf = (entity: { getPosition(): Vector3 }): number => entity.getPosition().getX();

describe('chunk tickable block-entity indexes', () => {
    it('keeps furnaces and spawners in block-entity insertion order as entries change type', () => {
        const chunk = new Chunk(0, 0);
        chunk.setBlockEntity(entityAt('Furnace', 0));
        chunk.setBlockEntity(entityAt('MobSpawner', 1));
        chunk.setBlockEntity(entityAt('Chest', 2));
        chunk.setBlockEntity(entityAt('Furnace', 3));

        expect([...chunk.getFurnaces()].map(xOf)).toEqual([0, 3]);
        expect([...chunk.getMobSpawners()].map(xOf)).toEqual([1]);
        expect(chunk.getTickableBlockEntityCount()).toBe(3);

        chunk.setBlockEntity(entityAt('Furnace', 2));
        expect([...chunk.getFurnaces()].map(xOf)).toEqual([0, 2, 3]);

        chunk.setBlockEntity(entityAt('Chest', 0));
        expect([...chunk.getFurnaces()].map(xOf)).toEqual([2, 3]);
        expect(chunk.getTickableBlockEntityCount()).toBe(3);

        const furnacesBeforeRemoval = chunk.getFurnaces();
        expect(chunk.removeBlockEntity(2, 64, 0)).toBe(true);
        expect([...furnacesBeforeRemoval].map(xOf)).toEqual([2, 3]);
        expect([...chunk.getFurnaces()].map(xOf)).toEqual([3]);
        expect(chunk.getTickableBlockEntityCount()).toBe(2);
    });

    it('removes a tickable entry when its owning block is replaced', () => {
        const chunk = new Chunk(0, 0);
        chunk.setBlockEntity(entityAt('Furnace', 1));

        chunk.setBlockRuntimeId(1, 64, 0, BlockRuntimeIds.getByName('minecraft:stone'));

        expect([...chunk.getFurnaces()]).toEqual([]);
        expect(chunk.getTickableBlockEntityCount()).toBe(0);
    });
});
