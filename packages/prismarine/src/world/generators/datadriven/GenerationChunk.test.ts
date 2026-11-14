import { describe, expect, it } from 'vitest';

import Chunk from '../../chunk/Chunk';
import { GenerationChunk } from './GenerationChunk';
import { GenerationRegion } from './GenerationRegion';
import { createJavaBlockOracle } from './javaBlockOracle';

const region = (): GenerationRegion =>
    new GenerationRegion({
        chunkX: 2,
        chunkZ: -1,
        minY: -64,
        height: 384,
        radius: 0,
        seaLevel: 63,
        seed: 1234n,
        blocks: createJavaBlockOracle(new Map()),
        biomeAt: () => 'minecraft:plains'
    });

describe('GenerationChunk', () => {
    it('lets the merged region go once the Bedrock chunk is recorded, and keeps the terrain', () => {
        const staged = new GenerationChunk(2, -1);
        const terrain = region();
        staged.recordTerrain(terrain);
        staged.recordFinalRegion(region());

        const chunk = new Chunk(2, -1);
        staged.recordChunk(chunk);

        expect(staged.finalRegion).toBeUndefined();
        expect(staged.bedrockChunk).toBe(chunk);
        expect(staged.terrain).toBe(terrain);
    });
});
