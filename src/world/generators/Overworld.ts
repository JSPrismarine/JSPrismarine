import Block from '../../block/Block';
import Chunk from '../chunk/Chunk';
import Noise from '../synth/Noise';
import type Random from '../util/Random';
import type Server from '../../Server';
import type Vector3 from '../../math/Vector3';

const CHUNK_WIDTH = 16;
// Const CHUNK_HEIGHT = 256; 1.17: 16?
const CHUNK_LENGTH = 16;
const SEA_LEVEL = 62;

export default class Overworld {
    noise?: Noise;

    async getChunk({
        pos,
        seed,
        server
    }: {
        pos: Vector3;
        seed: Random;
        server: Server;
    }) {
        if (!this.noise) this.noise = new Noise(seed);

        const noise = this.noise;
        const chunk = new Chunk(pos.getX(), pos.getZ());

        const bedrock = server
            .getBlockManager()
            .getBlock('minecraft:bedrock') as Block;
        const stone = server
            .getBlockManager()
            .getBlock('minecraft:stone') as Block;
        const dirt = server
            .getBlockManager()
            .getBlock('minecraft:dirt') as Block;
        const grass = server
            .getBlockManager()
            .getBlock('minecraft:grass') as Block;
        // const water = server.getBlockManager().getBlock('minecraft:water') as Block;
        for (let x = 0; x < CHUNK_WIDTH; x++) {
            for (let z = 0; z < CHUNK_LENGTH; z++) {
                const noise_height = noise.perlin2(
                    (pos.getX() * CHUNK_WIDTH + x) * 0.04,
                    (pos.getZ() * CHUNK_WIDTH + z) * 0.04
                );
                const height = Math.floor(60 + 20 * noise_height);

                for (let y = 0; y < height; y++) {
                    if (y >= height - 4) chunk.setBlock(x, y, z, dirt);
                    else chunk.setBlock(x, y, z, stone);
                }

                /* for (let y = 0; y < SEA_LEVEL; y++) {
                    const subChunk = chunk.getSubChunk(y >> 4);
                    if (subChunk.getBlockId(x, y & 0x0f, z) === 0) {
                        subChunk.setBlock(x, y & 0x0f, z, water);
                    }
                } */

                if (height < SEA_LEVEL - 1) chunk.setBlock(x, height, z, dirt);
                else chunk.setBlock(x, height, z, grass);

                chunk.setBlock(x, 0, z, bedrock);
            }
        }

        // chunk.recalculateHeightMap();
        return chunk;
    }
}
