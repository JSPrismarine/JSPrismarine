import { describe, expect, it } from 'vitest';

import { BlockRuntimeIds } from '../block/state/BlockRuntimeIds';
import { exposedFluidsOf } from './exposedFluids';
import Chunk from './chunk/Chunk';

const put = (chunk: Chunk, x: number, y: number, z: number, name: string): void =>
    chunk.setBlockRuntimeId(x, y, z, BlockRuntimeIds.getByName(name));

describe('exposedFluidsOf', () => {
    it('finds water that has air below it or beside it, and leaves settled water alone', () => {
        const chunk = new Chunk();
        // A source hanging over an empty cave.
        put(chunk, 4, 20, 4, 'minecraft:water');
        // A pool: water on stone with water beside it.
        for (const x of [8, 9]) {
            put(chunk, x, 19, 8, 'minecraft:stone');
            put(chunk, x, 20, 8, 'minecraft:water');
        }
        for (const y of [19, 20]) for (const x of [7, 10]) put(chunk, x, y, 8, 'minecraft:stone');
        for (const x of [8, 9]) for (const z of [7, 9]) put(chunk, x, 20, z, 'minecraft:stone');
        for (const x of [8, 9]) for (const z of [7, 9]) put(chunk, x, 19, z, 'minecraft:stone');

        const exposed = exposedFluidsOf(chunk).map(({ x, y, z, name }) => `${name}@${x},${y},${z}`);

        expect(exposed).toEqual(['minecraft:water@4,20,4']);
    });
});
