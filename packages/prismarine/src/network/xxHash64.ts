const MASK_64 = 0xffff_ffff_ffff_ffffn;
const PRIME_1 = 0x9e37_79b1_85eb_ca87n;
const PRIME_2 = 0xc2b2_ae3d_27d4_eb4fn;
const PRIME_3 = 0x1656_67b1_9e37_79f9n;
const PRIME_4 = 0x85eb_ca77_c2b2_ae63n;
const PRIME_5 = 0x27d4_eb2f_1656_67c5n;

const rotateLeft = (value: bigint, count: bigint): bigint => ((value << count) | (value >> (64n - count))) & MASK_64;

const round = (accumulator: bigint, input: bigint): bigint => {
    const mixed = (accumulator + input * PRIME_2) & MASK_64;
    return (rotateLeft(mixed, 31n) * PRIME_1) & MASK_64;
};

/** Returns the unsigned XXHash64 value Bedrock uses as a client blob identifier. */
export const xxHash64 = (data: Buffer, seed = 0n): bigint => {
    seed &= MASK_64;
    let offset = 0;
    let hash: bigint;

    if (data.byteLength >= 32) {
        let first = (seed + PRIME_1 + PRIME_2) & MASK_64;
        let second = (seed + PRIME_2) & MASK_64;
        let third = seed;
        let fourth = (seed - PRIME_1) & MASK_64;

        const limit = data.byteLength - 32;
        while (offset <= limit) {
            first = round(first, data.readBigUInt64LE(offset));
            second = round(second, data.readBigUInt64LE(offset + 8));
            third = round(third, data.readBigUInt64LE(offset + 16));
            fourth = round(fourth, data.readBigUInt64LE(offset + 24));
            offset += 32;
        }

        hash =
            (rotateLeft(first, 1n) + rotateLeft(second, 7n) + rotateLeft(third, 12n) + rotateLeft(fourth, 18n)) &
            MASK_64;
        for (const lane of [first, second, third, fourth]) {
            hash ^= round(0n, lane);
            hash = (hash * PRIME_1 + PRIME_4) & MASK_64;
        }
    } else {
        hash = (seed + PRIME_5) & MASK_64;
    }

    hash = (hash + BigInt(data.byteLength)) & MASK_64;

    while (offset + 8 <= data.byteLength) {
        hash ^= round(0n, data.readBigUInt64LE(offset));
        hash = (rotateLeft(hash, 27n) * PRIME_1 + PRIME_4) & MASK_64;
        offset += 8;
    }

    if (offset + 4 <= data.byteLength) {
        hash ^= (BigInt(data.readUInt32LE(offset)) * PRIME_1) & MASK_64;
        hash = (rotateLeft(hash, 23n) * PRIME_2 + PRIME_3) & MASK_64;
        offset += 4;
    }

    while (offset < data.byteLength) {
        hash ^= (BigInt(data.readUInt8(offset)) * PRIME_5) & MASK_64;
        hash = (rotateLeft(hash, 11n) * PRIME_1) & MASK_64;
        offset++;
    }

    hash ^= hash >> 33n;
    hash = (hash * PRIME_2) & MASK_64;
    hash ^= hash >> 29n;
    hash = (hash * PRIME_3) & MASK_64;
    hash ^= hash >> 32n;
    return hash & MASK_64;
};
