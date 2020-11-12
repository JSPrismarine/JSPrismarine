import Provider from '../Provider';

export default class Anvil extends Provider {
    async readChunk(x: number, z: number) {
        let regionX = x >> 5;
        let regionZ = z >> 5;
    }
}
