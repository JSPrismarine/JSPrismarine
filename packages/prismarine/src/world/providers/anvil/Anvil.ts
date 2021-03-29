import BaseProvider from '../BaseProvider';
import Chunk from '../../chunk/Chunk';
import Generator from '../../Generator';
import type Server from '../../../Server';
import Vector3 from '../../../math/Vector3';
import path from 'path';
const AnvilProvider = require('prismarine-provider-anvil').Anvil('1.16');
// const ReadLevel = require('prismarine-provider-anvil').level.readLevel;
const ChunkProvider = require('prismarine-chunk')('1.16');

export default class Anvil extends BaseProvider {
    private anvil: any;
    // private level: any;

    public constructor(folderPath: string, server: Server) {
        super(folderPath, server);

        this.anvil = new AnvilProvider(path.join(this.getPath(), 'region'));
        /* ReadLevel(path.join(this.getPath(), 'level.dat')).then((data: any) => {
            this.level = data;
            console.log(this.level);
        }); */
    }

    public async readChunk(cx: number, cz: number, seed: number, generator: Generator, config?: any): Promise<Chunk> {
        const data = await this.anvil.load(cx, cz);

        // If the chunk doesn't exist we generate it
        if (!data) return generator.generateChunk(cx, cz, seed, config);

        const chunk = new Chunk(cx, cz);
        const blocks = new Map();

        // A section might be null if it's only filled with air
        // which means that we're able to ignore it therefore
        // making the loop a whole lot faster
        const height = data.sections.filter((a: any) => a !== null).length * 16;
        if (height <= 0) return chunk;

        // TODO: optimize this, this is a horrible way to do it
        // I'm not quite sure how though.
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

        return chunk;
    }

    public async writeChunk(chunk: Chunk) {
        /* const ch = new ChunkProvider();

        for (let x = 0; x < 16; x++) {
            for (let z = 0; z < 16; z++) {
                for (let y = 0; y < 256; y++) {
                    const pos = new Vector3(x, y, z);
                    const block = chunk.getBlock(x, y, z);

                    ch.setBlockType(pos, block.id);
                    ch.setBlockData(pos, block.meta);
                }
            }
        }

        await this.anvil.save(chunk.getX(), chunk.getZ(), ch); */
    }
}
