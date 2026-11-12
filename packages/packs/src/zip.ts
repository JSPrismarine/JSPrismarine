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

/**
 * The most one entry may expand to: 256 MiB. A Bedrock or Java pack file is far smaller; the
 * largest member the server reads, the inner jar of a Java server jar, is under 30 MiB.
 */
export const MAX_ZIP_ENTRY_BYTES = 256 * 1024 * 1024;

/**
 * The most one load may expand to in all, nested archives included: 1 GiB. A Java server jar and
 * the jar inside it come to under 150 MiB.
 */
export const MAX_ZIP_TOTAL_BYTES = 1024 * 1024 * 1024;

/**
 * How many more bytes the archives of one load may expand to. Hand the same budget to the
 * {@link readZip} of an archive and of the archives nested in it, so nesting cannot multiply
 * the allowance.
 */
export interface ZipBudget {
    remaining: number;
}

/**
 * A fresh budget for one load.
 * @param maxBytes - The most the load may expand to; {@link MAX_ZIP_TOTAL_BYTES} by default.
 */
export const createZipBudget = (maxBytes: number = MAX_ZIP_TOTAL_BYTES): ZipBudget => ({ remaining: maxBytes });

/** Limits for one {@link readZip}. */
export interface ZipLimits {
    /** The most one entry may expand to; {@link MAX_ZIP_ENTRY_BYTES} by default. */
    maxEntryBytes?: number;
    /** What the read may spend, shared with nested reads; a fresh {@link createZipBudget} by default. */
    budget?: ZipBudget;
}

/** One file entry of the central directory, with where its data sits. */
interface ZipEntry {
    readonly name: string;
    readonly method: number;
    readonly compressedSize: number;
    readonly size: number;
    readonly localOffset: number;
}

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
 * Nothing is inflated past what the archive declares: each entry must expand to
 * exactly its declared size, which has to fit the entry limit and the budget
 * before any of it is allocated. Entries whose records overlap are refused, so
 * a small archive cannot name one compressed stream many times over.
 *
 * @param bytes - The archive.
 * @param limits - How much the read may expand to; see {@link ZipLimits}.
 * @throws {ZipError} When the archive is malformed, uses an unsupported
 * compression method, has overlapping entries, or would expand past a limit.
 */
export const readZip = (bytes: Uint8Array, limits: ZipLimits = {}): Map<string, Uint8Array> => {
    const maxEntryBytes = limits.maxEntryBytes ?? MAX_ZIP_ENTRY_BYTES;
    const budget = limits.budget ?? createZipBudget();
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const eocd = findEndOfCentralDirectory(view);

    const count = view.getUint16(eocd + 10, true);
    const centralOffset = view.getUint32(eocd + 16, true);
    const decoder = new TextDecoder();
    const entries: ZipEntry[] = [];

    let cursor = centralOffset;
    for (let i = 0; i < count; i++) {
        if (view.getUint32(cursor, true) !== CENTRAL_SIGNATURE)
            throw new ZipError('malformed zip: bad central directory entry signature');

        const method = view.getUint16(cursor + 10, true);
        const compressedSize = view.getUint32(cursor + 20, true);
        const size = view.getUint32(cursor + 24, true);
        const nameLength = view.getUint16(cursor + 28, true);
        const extraLength = view.getUint16(cursor + 30, true);
        const commentLength = view.getUint16(cursor + 32, true);
        const localOffset = view.getUint32(cursor + 42, true);
        const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));

        if (!name.endsWith('/')) entries.push({ name, method, compressedSize, size, localOffset });

        cursor += 46 + nameLength + extraLength + commentLength;
    }

    rejectOverlaps(bytes, view, entries);

    const files = new Map<string, Uint8Array>();
    for (const entry of entries) {
        if (entry.size > maxEntryBytes) {
            throw new ZipError(`${entry.name} expands to ${entry.size} bytes, past the ${maxEntryBytes} allowed`);
        }
        if (entry.size > budget.remaining) {
            throw new ZipError(`${entry.name} expands past the ${budget.remaining} bytes left of the archive budget`);
        }
        budget.remaining -= entry.size;
        files.set(entry.name, readEntryData(bytes, view, entry));
    }

    return files;
};

/** Where an entry's data starts, read from its local header. */
const dataStartOf = (view: DataView, { localOffset, name }: ZipEntry): number => {
    if (localOffset + 30 > view.byteLength || view.getUint32(localOffset, true) !== LOCAL_SIGNATURE)
        throw new ZipError(`malformed zip: bad local header for ${name}`);

    return localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
};

/**
 * Refuses entries whose local records and data run past the archive or into each other. A zip
 * writer lays each entry out once; two names over the same bytes are a crafted archive.
 */
const rejectOverlaps = (bytes: Uint8Array, view: DataView, entries: readonly ZipEntry[]): void => {
    const spans = entries
        .map((entry) => ({ entry, start: entry.localOffset, end: dataStartOf(view, entry) + entry.compressedSize }))
        .sort((left, right) => left.start - right.start);

    let previousEnd = 0;
    for (const { entry, start, end } of spans) {
        if (end > bytes.byteLength) throw new ZipError(`malformed zip: ${entry.name} runs past the end of the archive`);
        if (start < previousEnd) throw new ZipError(`malformed zip: ${entry.name} overlaps another entry`);
        previousEnd = end;
    }
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

/**
 * Locates an entry's data through its local header and decompresses it, to no more than the
 * size the central directory declares.
 */
const readEntryData = (bytes: Uint8Array, view: DataView, entry: ZipEntry): Uint8Array => {
    const { name, method, compressedSize, size } = entry;
    const dataStart = dataStartOf(view, entry);
    const data = bytes.subarray(dataStart, dataStart + compressedSize);

    if (method === 0) {
        if (compressedSize !== size) throw new ZipError(`malformed zip: stored ${name} has two sizes`);
        return data;
    }
    if (method !== 8) throw new ZipError(`unsupported zip compression method ${method} for ${name}`);

    let inflated: Buffer;
    try {
        // One byte past the declared size, so an entry that would grow beyond it stops there.
        inflated = inflateRawSync(data, { maxOutputLength: size + 1 });
    } catch (error: unknown) {
        throw new ZipError(`could not inflate ${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (inflated.byteLength !== size) {
        throw new ZipError(`malformed zip: ${name} inflates to more or less than its declared ${size} bytes`);
    }
    return new Uint8Array(inflated.buffer, inflated.byteOffset, inflated.byteLength);
};
