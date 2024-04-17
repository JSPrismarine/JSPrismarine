import BinaryStream from '@jsprismarine/jsbinaryutils';
import fs from 'node:fs';
import path from 'node:path';
import type Server from '../../../Server';
import type { Generator } from '../../Generator';
import Chunk from '../../chunk/Chunk';
import BaseProvider from '../BaseProvider';

export default class Filesystem extends BaseProvider {
    public constructor(folderPath: string, server: Server) {
        super(folderPath, server);

        if (!fs.existsSync(path.join(this.getPath(), 'chunks'))) fs.mkdirSync(path.join(this.getPath(), 'chunks'));
    }

    public async readChunk(cx: number, cz: number, seed: number, generator: Generator, config?: any): Promise<Chunk> {
        try {
            const buffer = Buffer.from(
                await fs.promises.readFile(path.join(this.getPath(), 'chunks', `${cx}_${cz}.dat`), {
                    flag: 'r',
                    encoding: 'utf-8'
                })
            );

            return Chunk.networkDeserialize(new BinaryStream(buffer), cx, cz);
        } catch {
            return generator.generateChunk(cx, cz, seed, config);
        }
    }

    /**
     * @TODO: format version, entities etc.
     */
    public async writeChunk(chunk: Chunk): Promise<void> {
        // FIXME: Handle failures.
        await fs.promises.writeFile(
            path.join(this.getPath(), 'chunks', `${chunk.getX()}_${chunk.getZ()}.dat`),
            chunk.networkSerialize(),
            { flag: 'w+', encoding: 'utf-8', flush: true }
        );
    }
}
