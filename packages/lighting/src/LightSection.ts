/** The edge length of a chunk section in blocks. */
export const SECTION_SIZE = 16;

/** The number of blocks in a chunk section. */
export const SECTION_VOLUME = SECTION_SIZE * SECTION_SIZE * SECTION_SIZE;

/** The highest level either light layer can hold. */
export const MAX_LIGHT_LEVEL = 15;

const BYTE_LENGTH = SECTION_VOLUME / 2;

const indexOf = (x: number, y: number, z: number): number => {
    if (x < 0 || x >= SECTION_SIZE || y < 0 || y >= SECTION_SIZE || z < 0 || z >= SECTION_SIZE) {
        throw new RangeError(`Light coordinates (${x}, ${z}, ${y}) fall outside the section`);
    }

    return (x << 8) | (z << 4) | y;
};

/**
 * One light layer of one chunk section, 16 by 16 by 16 levels of 0 to 15 packed two per byte.
 *
 * The 4096 levels take 2048 bytes, so a world with both layers resident costs 4 KiB per section
 * rather than the 8 KiB a plain `Uint8Array` pair would. Cells are addressed in the same order the
 * server's block storage uses, `x` major then `z` then `y`, so a section walk touches both arrays
 * in step.
 *
 * Levels are server-internal. See the package README: the Bedrock client renders light it computes
 * itself and the protocol carries none.
 */
export class LightSection {
    private readonly levels = new Uint8Array(BYTE_LENGTH);

    /** The size of the packed backing store in bytes, 2048 for the 4096 cells. */
    public get byteLength(): number {
        return this.levels.byteLength;
    }

    /**
     * The light level at a position inside the section.
     * @param {number} x - Section-local x, 0 to 15.
     * @param {number} y - Section-local y, 0 to 15.
     * @param {number} z - Section-local z, 0 to 15.
     * @returns {number} The level, 0 to 15.
     * @throws {RangeError} When a coordinate falls outside the section.
     */
    public get(x: number, y: number, z: number): number {
        const index = indexOf(x, y, z);
        const byte = this.levels[index >> 1]!;

        return (index & 1) === 0 ? byte & 0xf : byte >> 4;
    }

    /**
     * Writes the light level at a position inside the section.
     * @param {number} x - Section-local x, 0 to 15.
     * @param {number} y - Section-local y, 0 to 15.
     * @param {number} z - Section-local z, 0 to 15.
     * @param {number} level - The level to store, 0 to 15.
     * @throws {RangeError} When a coordinate falls outside the section or the level is not 0 to 15.
     */
    public set(x: number, y: number, z: number, level: number): void {
        if (level < 0 || level > MAX_LIGHT_LEVEL || !Number.isInteger(level)) {
            throw new RangeError(`Light level ${level} is not an integer between 0 and ${MAX_LIGHT_LEVEL}`);
        }

        const index = indexOf(x, y, z);
        const byteIndex = index >> 1;
        const byte = this.levels[byteIndex]!;

        this.levels[byteIndex] = (index & 1) === 0 ? (byte & 0xf0) | level : (byte & 0x0f) | (level << 4);
    }
}
