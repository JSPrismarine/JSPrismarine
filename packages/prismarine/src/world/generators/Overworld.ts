import BaseGenerator from '../BaseGenerator';
// import BlockMappings from '../../block/BlockMappings';
import Chunk from '../chunk/Chunk';
import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';

const CHUNK_WIDTH = 16;
// Const CHUNK_HEIGHT = 256; 1.17: 16?
const CHUNK_LENGTH = 16;
const SEA_LEVEL = 62;
const FOLIAGE_OFFSET = 0.1337;

export default class Overworld extends BaseGenerator {
    private worldNoise: NoiseFunction2D | null = null;
    private foliagNoise: NoiseFunction2D | null = null;

    public async generateChunk(cx: number, cz: number, seed: number): Promise<Chunk> {
        return new Promise((resolve) => {
            if (!this.worldNoise || !this.foliagNoise) {
                this.worldNoise = createNoise2D(() => seed);
                this.foliagNoise = createNoise2D(() => seed * FOLIAGE_OFFSET);
            }

            const chunk = new Chunk(cx, cz);

            const bedrock = this.getBlockManager().getBlock('minecraft:bedrock');
            const stone = this.getBlockManager().getBlock('minecraft:stone');
            const dirt = this.getBlockManager().getBlock('minecraft:dirt');
            const grass = this.getBlockManager().getBlock('minecraft:grass');
            const tall_grass = this.getBlockManager().getBlock('minecraft:double_plant');
            const water = this.getBlockManager().getBlock('minecraft:water');
            const poppy = this.getBlockManager().getBlock('minecraft:red_flower');
            const dandelion = this.getBlockManager().getBlock('minecraft:yellow_flower');
            const oxeye_daisy = this.getBlockManager().getBlock('minecraft:red_flower'); // TODO: Will be the same as red_flower state 0 as states are not properly implemented

            for (let x = 0; x < CHUNK_WIDTH; x++) {
                for (let z = 0; z < CHUNK_LENGTH; z++) {
                    const height = Math.floor(
                        60 + 20 * this.worldNoise((cx * CHUNK_WIDTH + x) * 0.005, (cz * CHUNK_WIDTH + z) * 0.005)
                    );

                    for (let y = 0; y < height; y++) {
                        if (y >= height - 4) {
                            chunk.setBlock(x, y, z, dirt);
                        } else {
                            chunk.setBlock(x, y, z, stone);
                        }
                    }

                    if (height < SEA_LEVEL - 1) {
                        chunk.setBlock(x, height, z, dirt);
                    } else {
                        chunk.setBlock(x, height, z, grass);
                    }

                    if (height <= SEA_LEVEL)
                        for (let y = 0; y < SEA_LEVEL; y++) {
                            if (chunk.getBlock(x, y, z).id === 0) {
                                chunk.setBlock(x, y, z, water);
                            }
                        }
                    else {
                        const foliageMap = Math.floor(
                            55 + 20 * this.foliagNoise((cx * CHUNK_WIDTH + x) * 0.1, (cz * CHUNK_WIDTH + z) * 0.1)
                        );

                        // TODO: Do this properly
                        if (foliageMap > 60 && foliageMap !== 67 && foliageMap !== 72 && foliageMap !== 78) {
                            if (foliageMap < 65) chunk.setBlock(x, height + 1, z, tall_grass);
                            else if (foliageMap < 70) chunk.setBlock(x, height + 1, z, oxeye_daisy);
                            else if (foliageMap < 75) chunk.setBlock(x, height + 1, z, dandelion);
                            else chunk.setBlock(x, height + 1, z, poppy);
                        }
                    }

                    chunk.setBlock(x, 0, z, bedrock);
                }
            }

            resolve(chunk);
        });
    }
}
