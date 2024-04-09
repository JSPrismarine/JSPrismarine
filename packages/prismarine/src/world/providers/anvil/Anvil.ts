import BaseProvider from '../BaseProvider';
import Chunk from '../../chunk/Chunk';
import type Generator from '../../Generator';
import type Server from '../../../Server';
import Vector3 from '../../../math/Vector3';
import fs from 'node:fs';
import path from 'node:path';

// FIXME: to implement
export default class Anvil extends BaseProvider {
    private anvil: any;
    private level: any;

    public constructor(folderPath: string, server: Server) {
        super(folderPath, server);

        // Create regions folder if they don't already exist
        if (!fs.existsSync(path.join(this.getPath(), 'region'))) fs.mkdirSync(path.join(this.getPath(), 'region'));
    }

    public async readChunk(cx: number, cz: number, seed: number, generator: Generator, config?: any): Promise<Chunk> {
        // Load the chunk from the region file
        const data = await this.anvil.load(cx, cz);

        // If the chunk doesn't exist we generate it
        if (!data) return generator.generateChunk(cx, cz, seed, config);

        const chunk = new Chunk(cx, cz);
        const blocks = new Map();

        // A section might be null if it's only filled with air
        // which means that we're able to ignore it therefore
        // making the loop a whole lot faster.
        const height = data.sections.filter((a: any) => a !== null).length * 16;
        if (height <= 0) return generator.generateChunk(cx, cz, seed, config); // Maybe we should just return an empty chunk instead?

        // Wrapper around the logic for converting a prismarineJS block
        // to our format. This is done to prevent creating a new
        // function instance for *every* block.
        const loadBlock = async (pos: Vector3, name: string) => {
            try {
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
                if (block) chunk.setBlock(pos.getX(), pos.getY(), pos.getZ(), block);
            } catch {}
        };

        const promises = [];
        // Loop through each possible block and create a promise for it,
        // which could result in maxiumum of 65536 entries to await for.
        // thats horribly slow.
        // luckly it's usualy "only" 24576 entires since about half the blocks are only air.
        for (let x = 0; x < 16; x++) {
            for (let y = 0; y < height; y++) {
                for (let z = 0; z < 16; z++) {
                    const pos = new Vector3(x, y, z);
                    const block = data.getBlock(pos);

                    const name = block.name || 'air';
                    if (name.includes('air')) continue;

                    promises.push(loadBlock(pos, name));
                }
            }
        }

        await Promise.all(promises);
        return chunk;
    }

    public async writeChunk(_chunk: Chunk) {
        /* const ch = new ChunkProvider();

        const saveBlock = async (pos: Vector3) => {
            const block = chunk.getBlock(pos.getX(), pos.getY(), pos.getZ());

            // I'm not sure this is correct since block ids
            // wont match between Java edition and Bedrock edition.
            ch.setBlockType(pos, block.id);
            ch.setBlockData(pos, block.meta);
        };

        const promises = [];
        for (let x = 0; x < 16; x++) {
            for (let y = 0; y < 256; y++) {
                for (let z = 0; z < 16; z++) {
                    promises.push(saveBlock(new Vector3(x, y, z)));
                }
            }
        }

        await this.anvil.save(chunk.getX(), chunk.getZ(), ch); */
    }
}
