import { describe, expect, it } from 'vitest';

import { testContent } from '../../../testing/entityServer';
import { Dimensions } from '../../Dimension';
import { voidGeneratorFactory, voidStem } from './void';

describe('the jsprismarine:void factory', () => {
    it('generates an empty chunk with the bounds of the dimension', async () => {
        const generator = voidGeneratorFactory.build({
            stem: voidStem(Dimensions.TheEnd.id),
            dimension: Dimensions.TheEnd,
            seed: 1n,
            content: testContent,
            worldgen: () => {
                throw new Error('A void world never reads the Java registries');
            },
            logger: { info: () => {}, warn: () => {} }
        });
        const chunk = await generator.generateChunk(2, 5, 1n);

        expect(chunk.getX()).toBe(2);
        expect(chunk.getZ()).toBe(5);
        expect(chunk.getDimension()).toBe(Dimensions.TheEnd);
        expect(chunk.getHighestBlockAt(0, 0)).toBeNull();
        expect(generator.surfaceAt?.(0, 0)).toBeUndefined();
    });
});
