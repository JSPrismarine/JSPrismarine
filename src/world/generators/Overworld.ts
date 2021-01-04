import Chunk from '../chunk/Chunk';
import Generator from '../Generator';
import Noise from '../synth/Noise';
import Server from '../../Server';
import SharedSeedRandom from '../util/SharedSeedRandom';

const CHUNK_WIDTH = 16;
// Const CHUNK_HEIGHT = 256; 1.17: 16?
const CHUNK_LENGTH = 16;
const SEA_LEVEL = 62;

export default class Overworld implements Generator {
    private noise: Noise | null = null;

    public generateChunk(
        cx: number,
        cz: number,
        seed: SharedSeedRandom
    ): Chunk {
        if (!this.noise) {
            this.noise = new Noise(seed);
        }

        const noise = this.noise;
        const chunk = new Chunk(cx, cz);
        const server = Server.instance; // Temp solution

        const bedrock = server.getBlockManager().getBlock('minecraft:bedrock')!;
        const stone = server.getBlockManager().getBlock('minecraft:stone')!;
        const dirt = server.getBlockManager().getBlock('minecraft:dirt')!;
        const grass = server.getBlockManager().getBlock('minecraft:grass')!;
        const water = server.getBlockManager().getBlock('minecraft:water')!;
        for (let x = 0; x < CHUNK_WIDTH; x++) {
            for (let z = 0; z < CHUNK_LENGTH; z++) {
                const noise_height = noise.perlin2(
                    (cx * CHUNK_WIDTH + x) * 0.04,
                    (cz * CHUNK_WIDTH + z) * 0.04
                );
                const height = Math.floor(60 + 20 * noise_height);

                for (let y = 0; y < height; y++) {
                    if (y >= height - 4) chunk.setBlock(x, y, z, dirt);
                    else chunk.setBlock(x, y, z, stone);
                }

                if (height < SEA_LEVEL - 1) chunk.setBlock(x, height, z, dirt);
                else chunk.setBlock(x, height, z, grass);

                for (let y = 0; y < SEA_LEVEL; y++) {
                    if (chunk.getBlockId(x, y, z) === 0)
                        chunk.setBlock(x, y, z, water);
                }

                chunk.setBlock(x, 0, z, bedrock);
            }
        }

        return chunk;
    }
}
