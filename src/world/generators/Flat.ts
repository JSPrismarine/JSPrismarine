import Chunk from '../chunk/Chunk';
import type Server from '../../Server';
import type Vector3 from '../../math/Vector3';

export default class Flat {
    public getChunk({
        pos,
        seed,
        server
    }: {
        pos: Vector3;
        seed: number;
        server: Server;
    }) {
        const chunk = new Chunk(pos.getX(), pos.getZ());

        const bedrock = server.getBlockManager().getBlock('minecraft:bedrock');
        const dirt = server.getBlockManager().getBlock('minecraft:dirt');
        const grass = server.getBlockManager().getBlock('minecraft:grass');
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
