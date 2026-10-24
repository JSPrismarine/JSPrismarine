import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';

/** The digest algorithms the source manifest pins. */
export type HashAlgorithm = 'sha1' | 'sha256';

/** An expected digest: which algorithm and the lowercase hex value. */
export interface ExpectedHash {
    algorithm: HashAlgorithm;
    value: string;
}

/**
 * Computes the hex digest of a file by streaming it, so a 95 MB archive
 * never has to fit in one buffer.
 */
export const hashFile = async (filePath: string, algorithm: HashAlgorithm): Promise<string> => {
    const hash = createHash(algorithm);
    await pipeline(createReadStream(filePath), hash);
    return hash.digest('hex');
};

/**
 * Verifies a file against an expected digest.
 *
 * @throws Error naming the file, the expected digest and the actual one when they differ,
 * so a corrupted or tampered download stops the build before anything unpacks it.
 */
export const verifyFileHash = async (filePath: string, expected: ExpectedHash): Promise<void> => {
    const actual = await hashFile(filePath, expected.algorithm);
    if (actual !== expected.value.toLowerCase()) {
        throw new Error(`${expected.algorithm} mismatch for ${filePath}: expected ${expected.value}, got ${actual}`);
    }
};
