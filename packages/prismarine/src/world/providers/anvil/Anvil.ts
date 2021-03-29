import BaseProvider from '../BaseProvider';
import Chunk from '../../chunk/Chunk';
import Generator from '../../Generator';
import type Server from '../../../Server';
import Vector3 from '../../../math/Vector3';
import path from 'path';
const AnvilProvider = require('prismarine-provider-anvil').Anvil('1.16');

export default class Anvil extends BaseProvider {
    private anvil: any;
    private cache = new Map();

    public constructor(folderPath: string, server: Server) {
        super(folderPath, server);
        this.anvil = new AnvilProvider(path.join(this.getPath(), 'region'));
    }

    public async readChunk(cx: number, cz: number, seed: number, generator: Generator, config?: any): Promise<Chunk> {
        // This should probably be done in the world class
        if (this.cache.has(`${cx}_${cz}`)) return this.cache.get(`${cx}_${cz}`);

        const data = await this.anvil.load(cx, cz);

        // TODO: optimize this, this is a horrible way to do it
        if (data) {
            const chunk = new Chunk(cx, cz);
            const blocks = new Map();

            let height = 0;
            for (let i = 0; i < data.sections.length; i++) if (data.sections[i] !== null) height += 16;

            if (height >= 0)
                for (let x = 0; x < 16; x++) {
                    for (let y = 0; y < height; y++) {
                        for (let z = 0; z < 16; z++) {
                            try {
                                const name = data.getBlock(new Vector3(x, y, z)).name || 'air';
                                if (name.includes('air')) continue;

                                let block;
                                if (!blocks.has(name)) {
                                    try {
                                        block = this.getServer().getBlockManager().getBlock(`minecraft:${name}`);
                                    } catch {
                                        block = null;
                                    }
                                    blocks.set(name, block);
                                } else {
                                    block = blocks.get(name);
                                }

                                // Finally set the block
                                if (block) chunk.setBlock(x, y, z, block);
                            } catch {}
                        }
                    }
                }

            this.cache.set(`${cx}_${cz}`, chunk);
            return chunk;
        }

        return generator.generateChunk(cx, cz, seed, config);
    }

    public async writeChunk(chunk: Chunk) {
        // TODO
    }
}
