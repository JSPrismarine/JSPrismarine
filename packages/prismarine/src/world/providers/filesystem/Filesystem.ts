import BaseProvider from '../BaseProvider';
import BinaryStream from '@jsprismarine/jsbinaryutils';
import Chunk from '../../chunk/Chunk';
import type { Generator } from '../../Generator';
import type Server from '../../../Server';
import fs from 'graceful-fs';
import path from 'node:path';

export default class Filesystem extends BaseProvider {
    private level: any = {};

    public constructor(folderPath: string, server: Server) {
        super(folderPath, server);

        if (!fs.existsSync(path.join(this.getPath(), 'chunks'))) fs.mkdirSync(path.join(this.getPath(), 'chunks'));
    }

    public async readChunk(cx: number, cz: number, seed: number, generator: Generator, config?: any): Promise<Chunk> {
        try {
            const buffer = Buffer.from(
                await fs.promises.readFile(path.join(this.getPath(), 'chunks', `${cx}_${cz}.dat`))
            );

            return Chunk.networkDeserialize(new BinaryStream(buffer), cx, cz);
        } catch {
            return generator.generateChunk(cx, cz, seed, config);
        }
    }

    public async writeChunk(chunk: Chunk): Promise<void> {
        // TODO: format version, entities etc
        await fs.promises.writeFile(
            path.join(this.getPath(), 'chunks', `${chunk.getX()}_${chunk.getZ()}.dat`),
            chunk.networkSerialize(true)
        );
    }
}
