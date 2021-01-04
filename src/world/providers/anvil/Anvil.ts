import BaseProvider from '../../BaseProvider';
import Chunk from '../../chunk/Chunk';
import Generator from '../../Generator';
import SharedSeedRandom from '../../util/SharedSeedRandom';

export default class Anvil extends BaseProvider {
    public readChunk(
        cx: number,
        cz: number,
        _seed: SharedSeedRandom,
        _generator: Generator
    ): Chunk {
        return new Chunk(cx, cz);
    }
}
