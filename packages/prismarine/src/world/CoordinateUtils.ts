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

    /**
     * Returns and encoded integer by given integers.
     */
    public static encodePos(x: number, z: number): string {
        return `${x}:${z}`;
    }

    /**
     * Returns an array containing decoded positions
     * from the encoded integer given.
     */
    public static decodePos(encodedPos: string): [number, number] {
        return (encodedPos.split(':') as unknown) as [number, number];
    }
}
