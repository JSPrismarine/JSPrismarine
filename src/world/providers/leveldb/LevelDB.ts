import BaseProvider from '../../BaseProvider';
import BinaryStream from '@jsprismarine/jsbinaryutils';
import Chunk from '../../chunk/Chunk';
import Generator from '../../Generator';

export default class LevelDB extends BaseProvider {
    public async readChunk(
        cx: number,
        cz: number,
        seed: number,
        generator: Generator
    ): Promise<Chunk> {
        // TODO
        return generator.generateChunk(cx, cz, seed);
    }

    /**
     * Creates an string index from chunk
     * x and z, used to indentify chunks
     * in the db.
     */
    public static chunkIndex(chunkX: number, chunkZ: number): string {
        const stream = new BinaryStream();
        stream.writeLInt(chunkX);
        stream.writeLInt(chunkZ);
        return stream.getBuffer().toString('hex');
    }
}
