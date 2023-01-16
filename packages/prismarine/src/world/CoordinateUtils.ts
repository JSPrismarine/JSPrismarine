// TODO: move to ./utils
export default class CoordinateUtils {
    public static fromBlockToChunk(v: number): number {
        return v >> 4;
    }

    public static getChunkMin(v: number): number {
        return v << 4;
    }

    public static getChunkMax(v: number): number {
        return ((v + 1) << 4) - 1;
    }
}
