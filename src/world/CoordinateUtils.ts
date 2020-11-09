export default class CoordinateUtils {
    static fromBlockToChunk(v: number) {
        return v >> 4;
    }

    static getChunkMin(v: number) {
        return v << 4;
    }

    static getChunkMax(v: number) {
        return ((v + 1) << 4) - 1;
    }

    /**
     * Returns and encoded integer by given integers.
     *
     * @param {number} x
     * @param {number} z
     */
    static encodePos(x: number, z: number) {
        return `${x}:${z}`;
    }

    /**
     * Returns an array containing decoded positions
     * from the encoded integer given.
     */
    static decodePos(encodedPos: string): [number, number] {
        return (encodedPos.split(':') as unknown) as [number, number];
    }
}
