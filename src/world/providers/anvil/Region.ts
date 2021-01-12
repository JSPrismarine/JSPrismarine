import BinaryStream from '@jsprismarine/jsbinaryutils';
import { ByteOrder } from '../../../nbt/ByteOrder';
import NBTReader from '../../../nbt/NBTReader';
import NBTTagCompound from '../../../nbt/NBTTagCompound';
import Zlib from 'zlib';

enum AnvilChunkCompressionType {
    GZip = 1,
    Zlib = 2,
    Uncompressed = 3
}

export default class Region {
    private chunks: Map<string, any> = new Map();

    constructor(buffer: Buffer) {
        const stream = new BinaryStream(buffer);

        const locations: number[][] = [];
        for (let i = 0; i < 1024; i++) {
            const offset = stream.readTriad();
            const count = stream.readByte();

            locations.push([offset, count]);
        }

        // TODO: timestamps

        locations.forEach((location) => {
            // FIXME: This should be replaced with stream.setOffset in the future
            const stream = new BinaryStream(buffer, location[0] * 4096);
            for (let i = 0; i < location[1]; i++) {
                const sector = new BinaryStream(stream.read(4096));

                const size = sector.readInt();
                const compression = sector.readByte();
                let data;
                switch (compression) {
                    case AnvilChunkCompressionType.Zlib:
                        data = Zlib.unzipSync(sector.read(size - 1));
                        break;
                    case AnvilChunkCompressionType.Uncompressed:
                        data = sector.read(size - 1);
                        break;
                    default:
                        throw new Error(`Invalid compression type`);
                }

                const nbtStream = new BinaryStream(data);
                const nbt = NBTTagCompound.readFromStream(
                    nbtStream,
                    ByteOrder.BIG_ENDIAN
                );
            }
        });
    }
}
