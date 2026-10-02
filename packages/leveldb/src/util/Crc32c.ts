/**
 * CRC-32C (Castagnoli), the checksum LevelDB puts on every log record and every table block.
 *
 * Reflected algorithm, polynomial 0x1edc6f41, which as a reversed constant is 0x82f63b78. This is
 * a different polynomial from the CRC-32 in zlib and gzip - using that one produces a database the
 * game opens and then reports as corrupt, one block at a time.
 */

const POLYNOMIAL = 0x82f63b78;

const TABLE = (() => {
    const table = new Int32Array(256);
    for (let i = 0; i < 256; i++) {
        let crc = i;
        for (let bit = 0; bit < 8; bit++) {
            crc = crc & 1 ? (crc >>> 1) ^ POLYNOMIAL : crc >>> 1;
        }

        table[i] = crc;
    }

    return table;
})();

/** The running checksum, so a block's data and its compression byte can be covered in one value. */
export const crc32cUpdate = (data: Buffer, previous = 0): number => {
    let crc = ~previous >>> 0;
    for (let i = 0; i < data.byteLength; i++) {
        crc = (crc >>> 8) ^ TABLE[(crc ^ data.readUInt8(i)) & 0xff]!;
    }

    return ~crc >>> 0;
};

export const crc32c = (data: Buffer): number => crc32cUpdate(data);

/**
 * LevelDB never stores a raw CRC. It rotates and offsets it first, so that a checksum computed
 * over a buffer that itself contains a checksum cannot collide trivially.
 */
const MASK_DELTA = 0xa282ead8;

export const mask = (crc: number): number => (((crc >>> 15) | (crc << 17)) + MASK_DELTA) >>> 0;

export const unmask = (masked: number): number => {
    const rotated = (masked - MASK_DELTA) >>> 0;
    return ((rotated >>> 17) | (rotated << 15)) >>> 0;
};
