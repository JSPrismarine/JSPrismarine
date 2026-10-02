// TODO: move to ./utils
export default class CoordinateUtils {
    /**
     * The chunk column a block coordinate falls in.
     *
     * Floored before the shift, not shifted directly. `>>` converts through `ToInt32`, which
     * truncates towards zero, so `-0.5 >> 4` is `0` - but the block at `-0.5` is in chunk
     * `-1`. Entity positions are floats, so the bare shift put anything standing on the
     * negative side of a chunk boundary in the wrong chunk.
     * @param {number} v - A block coordinate, whole or fractional.
     * @returns {number} The chunk coordinate containing it.
     */
    public static fromBlockToChunk(v: number): number {
        return Math.floor(v) >> 4;
    }

    public static getChunkMin(v: number): number {
        return v << 4;
    }

    public static getChunkMax(v: number): number {
        return ((v + 1) << 4) - 1;
    }
}
