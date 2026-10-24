import { inflateRawSync } from 'node:zlib';

/**
 * A minimal zip reader for `.mcpack` and `.mcaddon` containers. It reads the
 * central directory and supports the two compression methods Minecraft packs
 * use, stored and deflate. Zip64, encryption and multi-disk archives are out
 * of scope; a pack that needs them fails with a {@link ZipError}.
 */

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const EOCD_MIN_SIZE = 22;
const MAX_COMMENT_SIZE = 0xffff;

/** Error thrown when bytes are not a readable zip archive. */
export class ZipError extends Error {
    public override name = 'ZipError';
}

/** Whether the bytes start with a zip local file header. */
export const isZip = (bytes: Uint8Array): boolean =>
    bytes.length >= 4 &&
    new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, true) === LOCAL_SIGNATURE;

/**
 * Reads every file of a zip archive, keyed by archive path in central
 * directory order. Directory entries (paths ending in `/`) are skipped.
 *
 * @throws {ZipError} When the archive is malformed or uses an unsupported
 * compression method.
 */
export const readZip = (bytes: Uint8Array): Map<string, Uint8Array> => {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const eocd = findEndOfCentralDirectory(view);

    const count = view.getUint16(eocd + 10, true);
    const centralOffset = view.getUint32(eocd + 16, true);
    const decoder = new TextDecoder();
    const files = new Map<string, Uint8Array>();

    let cursor = centralOffset;
    for (let i = 0; i < count; i++) {
        if (view.getUint32(cursor, true) !== CENTRAL_SIGNATURE)
            throw new ZipError('malformed zip: bad central directory entry signature');

        const method = view.getUint16(cursor + 10, true);
        const compressedSize = view.getUint32(cursor + 20, true);
        const nameLength = view.getUint16(cursor + 28, true);
        const extraLength = view.getUint16(cursor + 30, true);
        const commentLength = view.getUint16(cursor + 32, true);
        const localOffset = view.getUint32(cursor + 42, true);
        const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));

        if (!name.endsWith('/')) {
            files.set(name, readEntryData(bytes, view, localOffset, compressedSize, method, name));
        }

        cursor += 46 + nameLength + extraLength + commentLength;
    }

    return files;
};

/**
 * Finds the end-of-central-directory record by scanning backwards from the
 * end, since a zip may end with a comment of up to 65535 bytes.
 */
const findEndOfCentralDirectory = (view: DataView): number => {
    const start = Math.max(0, view.byteLength - EOCD_MIN_SIZE - MAX_COMMENT_SIZE);
    for (let i = view.byteLength - EOCD_MIN_SIZE; i >= start; i--) {
        if (view.getUint32(i, true) === EOCD_SIGNATURE) return i;
    }
    throw new ZipError('not a zip: no end-of-central-directory record');
};

/** Locates an entry's data through its local header and decompresses it. */
const readEntryData = (
    bytes: Uint8Array,
    view: DataView,
    localOffset: number,
    compressedSize: number,
    method: number,
    name: string
): Uint8Array => {
    if (view.getUint32(localOffset, true) !== LOCAL_SIGNATURE)
        throw new ZipError(`malformed zip: bad local header for ${name}`);

    const nameLength = view.getUint16(localOffset + 26, true);
    const extraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + nameLength + extraLength;
    const data = bytes.subarray(dataStart, dataStart + compressedSize);

    if (method === 0) return data;
    if (method === 8) return new Uint8Array(inflateRawSync(data));
    throw new ZipError(`unsupported zip compression method ${method} for ${name}`);
};
