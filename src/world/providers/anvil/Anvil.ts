import type Chunk from '../../chunk/Chunk';
import Provider from '../../Provider';
import type Server from '../../../Server';
// import path from 'path';
/* import fs from 'fs';
import util from 'util';
import Zlib from 'zlib';
import BinaryStream from '@jsprismarine/jsbinaryutils';
import { ByteOrder } from '../../../nbt/ByteOrder';
import NBTReader from '../../../nbt/NBTReader'; */

// const ANVIL_FORMAT = 'mca';
export default class Anvil extends Provider {
    // private regionPath: string;
    // private regions: Map<string, Buffer> = new Map();

    public constructor(folderPath: string) {
        super(folderPath);
        // this.regionPath = path.join(this.getPath(), 'region');
    }

    public async readChunk({
        x,
        z,
        generator,
        seed,
        server
    }: {
        x: number;
        z: number;
        generator: any;
        seed: number;
        server: Server;
    }): Promise<Chunk | null> {
        // const regionX = x >> 5,
        //    regionZ = z >> 5;

        try {
            /* const regionFile = await fs.promises.readFile(
                this.getRegionPath(regionX, regionZ)
            );
            const str = new BinaryStream(regionFile);
            const decodedFile = await util.promisify(Zlib.deflate)(regionFile);
            const NBT = new NBTReader(str, ByteOrder.BIG_ENDIAN); */
        } catch {
            // TODO: generate new chunks
        }
        return null;
    }

    /* private getRegionPath(regionX: number, regionZ: number): string {
        return path.join(
            this.regionPath,
            `r.${regionX}.${regionZ}.${ANVIL_FORMAT}`
        );
    } */
}
