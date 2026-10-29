/**
 * The archive format the single executable carries its data files in.
 *
 * `scripts/package-sea.mts` encodes the Java worldgen data and this project's overlay packs
 * into one gzipped blob and embeds it as a SEA asset; {@link provisionSeaData} decodes it onto
 * disk on first run. A zip would need a writer this repository does not have, and the readers
 * of the data want a directory tree anyway, so the format is the simplest thing that survives
 * a round trip: a JSON index of `[path, byteLength]` pairs, length-prefixed, followed by the
 * file bytes in index order, all gzipped.
 *
 * Paths are relative, `/`-separated, and resolved under one root by the extractor, which
 * refuses any path that could escape it.
 */
import { gunzipSync, gzipSync } from 'node:zlib';

/** One encoded file: where it goes, relative to the extraction root, and its bytes. */
export type DataBundleFiles = ReadonlyMap<string, Uint8Array>;

/** Encodes files into one gzipped blob. */
export const encodeDataBundle = (files: DataBundleFiles): Buffer => {
    const index: Array<[string, number]> = [];
    const parts: Uint8Array[] = [];
    for (const [path, bytes] of files) {
        index.push([path, bytes.byteLength]);
        parts.push(bytes);
    }

    const indexBytes = Buffer.from(JSON.stringify(index), 'utf8');
    const header = Buffer.alloc(4);
    header.writeUInt32LE(indexBytes.byteLength, 0);
    return gzipSync(Buffer.concat([header, indexBytes, ...parts]));
};

/** A path that stays under the extraction root: relative, no `..`, no drive, no backslash. */
export const isSafeBundlePath = (path: string): boolean => {
    if (path === '' || path.startsWith('/') || path.includes('\\') || path.includes(':')) return false;
    return path.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
};

/**
 * Decodes a blob {@link encodeDataBundle} wrote.
 *
 * @throws When the blob is malformed or indexes a path that could escape the extraction root.
 */
export const decodeDataBundle = (blob: Uint8Array): Map<string, Uint8Array> => {
    const bytes = gunzipSync(blob);
    if (bytes.byteLength < 4) throw new Error('data bundle is truncated');

    const indexLength = bytes.readUInt32LE(0);
    const indexEnd = 4 + indexLength;
    if (indexEnd > bytes.byteLength) throw new Error('data bundle index is truncated');

    const index: unknown = JSON.parse(bytes.toString('utf8', 4, indexEnd));
    if (!Array.isArray(index)) throw new Error('data bundle index is not a list');

    const files = new Map<string, Uint8Array>();
    let cursor = indexEnd;
    for (const entry of index) {
        if (!Array.isArray(entry) || typeof entry[0] !== 'string' || typeof entry[1] !== 'number')
            throw new Error('data bundle index entry is malformed');

        const [path, size] = entry;
        if (!isSafeBundlePath(path)) throw new Error(`data bundle path escapes the extraction root: ${path}`);
        if (!Number.isInteger(size) || size < 0 || cursor + size > bytes.byteLength)
            throw new Error(`data bundle entry is truncated: ${path}`);

        files.set(path, bytes.subarray(cursor, cursor + size));
        cursor += size;
    }

    return files;
};
