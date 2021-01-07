import BaseProvider from '../../BaseProvider';
import Chunk from '../../chunk/Chunk';
import Generator from '../../Generator';
import SharedSeedRandom from '../../util/SharedSeedRandom';

export default class Anvil extends BaseProvider {
    public async readChunk(
        cx: number,
        cz: number,
        _seed: SharedSeedRandom,
        _generator: Generator
    ): Promise<Chunk> {
        return new Chunk(cx, cz);
    }
}
