import Chunk from '../chunk/Chunk';
import Generator from '../Generator';
import Server from '../../Server';

export default class Flat implements Generator {

    public generateChunk(cx: number, cz: number): Chunk {
        const chunk = new Chunk(cx, cz);
        const server = Server.instance;

        const bedrock = server.getBlockManager().getBlock('minecraft:bedrock')!;
        const dirt = server.getBlockManager().getBlock('minecraft:dirt')!;
        const grass = server.getBlockManager().getBlock('minecraft:grass')!;
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
