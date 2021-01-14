import BinaryStream from '@jsprismarine/jsbinaryutils';
import BlockStorage from '../../chunk/BlockStorage';
import { ByteOrder } from '../../../nbt/ByteOrder';
import Chunk from '../../chunk/Chunk';
import NBTReader from '../../../nbt/NBTReader';
import NBTTagCompound from '../../../nbt/NBTTagCompound';
import SubChunk from '../../chunk/SubChunk';
import Zlib from 'zlib';

enum AnvilChunkCompressionType {
    GZip = 1,
    Zlib = 2,
    Uncompressed = 3
}

export default class Region {
    private chunks: Map<string, any> = new Map();

    public constructor(buffer: Buffer) {
        const stream = new BinaryStream(buffer);

        const locations: number[][] = [];
        for (let i = 0; i < 1024; i++) {
            const offset = stream.readTriad();
            const count = stream.readByte();

            locations.push([offset, count]);
        }

        // TODO: timestamps

        for (const location of locations) {
            stream.setOffset(location[0] * 4096);
            for (let i = 0; i < location[1]; i++) {
                const size = stream.readInt();
                const compression = stream.readByte();
                const sector = stream.read(4091);

                let data;
                switch (compression) {
                    case AnvilChunkCompressionType.Zlib:
                        data = Zlib.unzipSync(sector.slice(0, size - 1));
                        break;
                    case AnvilChunkCompressionType.Uncompressed:
                        data = sector.slice(0, size - 1);
                        break;
                    default:
                        throw new Error(`Invalid compression type`);
                }

                const nbtStream = new BinaryStream(data);
                const regionNbt = NBTTagCompound.readFromStream(
                    nbtStream,
                    ByteOrder.BIG_ENDIAN
                );

                if (!regionNbt.has('Level'))
                    throw new Error('region is missing Level tag');

                const levelNbt = regionNbt.getCompound('Level', false)!;
                const xPos = levelNbt.getNumber('xPos', 0);
                const zPos = levelNbt.getNumber('zPos', 0);

                const storages: Map<number, BlockStorage> = new Map();
                const sections: Set<NBTTagCompound> = levelNbt.getList(
                    'Sections',
                    false
                )!;
                for (const section of sections) {
                    const yIndex = section.getByte('Y', 0);
                }

                const storage = new BlockStorage();
                const subChunk = new SubChunk();
                const chunk = new Chunk(xPos, zPos);
                this.chunks.set(`${xPos}.${zPos}`, chunk);
            }
        }
    }

    public getChunk(x: number, z: number): Chunk {
        return this.chunks.get(`${x}.${z}`);
    }
}
