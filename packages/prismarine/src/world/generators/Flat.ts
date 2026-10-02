import BaseGenerator from '../BaseGenerator';
import type { Block } from '../../block/Block';
import Chunk from '../chunk/Chunk';

export default class Flat extends BaseGenerator {
    public async generateChunk(cx: number, cz: number, seed?: number, config?: any): Promise<Chunk> {
        return new Promise((resolve) => {
            const chunk = new Chunk(cx, cz);

            // Default layers if none is provided
            const layers = config?.layers ?? [
                {
                    block: 'bedrock',
                    size: 1
                },
                {
                    block: 'dirt',
                    size: 2
                },
                {
                    // `grass` was the grass block's name in older Bedrock versions; the
                    // plant took the name over and the block became `grass_block`.
                    block: 'grass_block',
                    size: 1
                }
            ];

            const blocks: Block[] = [];
            layers.forEach((layer: any) => {
                let block: Block;
                try {
                    if (!layer.block.startsWith('minecraft:')) {
                        block = this.getBlockManager().getBlock(`minecraft:${layer.block}`);
                    } else block = this.getBlockManager().getBlock(layer.block);
                } catch {
                    block = this.getBlockManager().getBlock('minecraft:air');
                }
                for (let c = 1; c <= layer.size; c++) {
                    blocks.push(block);
                }
            });

            // Stacked up from the world floor, which is -64 in the Overworld - the same place
            // vanilla puts a flat world's bedrock.
            const floor = chunk.getMinY();

            for (let x = 0; x < 16; x++) {
                for (let z = 0; z < 16; z++) {
                    blocks.forEach((block, place) => {
                        chunk.setBlock(x, floor + place, z, block);
                    });
                }
            }

            resolve(chunk);
        });
    }
}
