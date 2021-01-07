import BaseGenerator from '../BaseGenerator';
import Chunk from '../chunk/Chunk';

export default class Flat extends BaseGenerator {
    public async generateChunk(cx: number, cz: number): Promise<Chunk> {
        return new Promise((resolve) => {
            const chunk = new Chunk(cx, cz);

            const bedrock = this.getBlockManager().getBlock(
                'minecraft:bedrock'
            );
            const dirt = this.getBlockManager().getBlock('minecraft:dirt');
            const grass = this.getBlockManager().getBlock('minecraft:grass');

            for (let x = 0; x < 16; x++) {
                for (let z = 0; z < 16; z++) {
                    chunk.setBlock(x, 0, z, bedrock);
                    chunk.setBlock(x, 1, z, dirt);
                    chunk.setBlock(x, 2, z, dirt);
                    chunk.setBlock(x, 3, z, dirt);
                    chunk.setBlock(x, 4, z, grass);
                }
            }

            resolve(chunk);
        });
    }
}
