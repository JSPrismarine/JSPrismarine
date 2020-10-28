import type Prismarine from "../../Prismarine";
import Chunk from "../chunk/Chunk";

export default class Flat {
    getChunk({ chunkX, chunkY, chunkZ, seed, server }: {
        chunkX: number,
        chunkY: number,
        chunkZ: number,
        seed: number,
        server: Prismarine
    }) {
        const chunk = new Chunk(chunkX, chunkZ);

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
                chunk.setBlock(x, y, z, grass);
            }
        }

        return chunk;
    }
}
