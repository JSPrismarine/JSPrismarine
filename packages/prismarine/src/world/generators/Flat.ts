import BaseGenerator from '../BaseGenerator';
import type Block from '../../block/Block';
import Chunk from '../chunk/Chunk';
import Config from '../../config/Config';

export default class Flat extends BaseGenerator {
    public async generateChunk(cx: number, cz: number): Promise<Chunk> {
        return new Promise((resolve) => {
            const chunk = new Chunk(cx, cz);

            const layers = new Config('flat').getWorlds().world.layers;
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

            for (let x = 0; x < 16; x++) {
                for (let z = 0; z < 16; z++) {
                    blocks.forEach((block, place) => {
                        chunk.setBlock(x, place, z, block);
                    });
                }
            }

            resolve(chunk);
        });
    }
}
