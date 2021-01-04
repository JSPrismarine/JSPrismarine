import BaseGenerator from '../BaseGenerator';
import Chunk from '../chunk/Chunk';

export default class Flat extends BaseGenerator {
    public generateChunk(cx: number, cz: number): Chunk {
        const chunk = new Chunk(cx, cz);

        const bedrock = this.getBlockManager().getBlock('minecraft:bedrock');
        const dirt = this.getBlockManager().getBlock('minecraft:dirt');
        const grass = this.getBlockManager().getBlock('minecraft:grass');

        for (let x = 0; x < 16; x++) {
            for (let z = 0; z < 16; z++) {
                let y = 0;
                chunk.setBlock(x, y++, z, bedrock);
                chunk.setBlock(x, y++, z, dirt);
                chunk.setBlock(x, y++, z, dirt);
                chunk.setBlock(x, y++, z, dirt);
                chunk.setBlock(x, y++, z, grass);
            }
        }

        return chunk;
    }
}
