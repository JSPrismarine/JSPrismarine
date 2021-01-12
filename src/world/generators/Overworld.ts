import BaseGenerator from '../BaseGenerator';
import Chunk from '../chunk/Chunk';
import Noise from '../synth/Noise';
import SharedSeedRandom from '../util/SharedSeedRandom';

const CHUNK_WIDTH = 16;
// Const CHUNK_HEIGHT = 256; 1.17: 16?
const CHUNK_LENGTH = 16;
const SEA_LEVEL = 62;

export default class Overworld extends BaseGenerator {
    private noise: Noise | null = null;

    public async generateChunk(
        cx: number,
        cz: number,
        seed: SharedSeedRandom
    ): Promise<Chunk> {
        return new Promise((resolve) => {
            if (!this.noise) {
                this.noise = new Noise(seed);
            }

            const noise = this.noise;
            const chunk = new Chunk(cx, cz);

            const bedrock = this.getBlockManager().getBlock(
                'minecraft:bedrock'
            );
            const stone = this.getBlockManager().getBlock('minecraft:stone');
            const dirt = this.getBlockManager().getBlock('minecraft:dirt');
            const grass = this.getBlockManager().getBlock('minecraft:grass');
            const water = this.getBlockManager().getBlock('minecraft:water');

            for (let x = 0; x < CHUNK_WIDTH; x++) {
                for (let z = 0; z < CHUNK_LENGTH; z++) {
                    const height = Math.floor(
                        60 +
                            20 *
                                noise.perlin2(
                                    (cx * CHUNK_WIDTH + x) * 0.04,
                                    (cz * CHUNK_WIDTH + z) * 0.04
                                )
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

                    for (let y = 0; y < SEA_LEVEL; y++) {
                        if (chunk.getBlock(x, y, z).id === 0) {
                            chunk.setBlock(x, y, z, water);
                        }
                    }

                    chunk.setBlock(x, 0, z, bedrock);
                }
            }

            resolve(chunk);
        });
    }
}
