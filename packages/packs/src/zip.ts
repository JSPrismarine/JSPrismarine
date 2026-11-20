import { crc32, deflateRawSync, inflateRawSync } from 'node:zlib';
import { PacksErrors } from '@jsprismarine/errors/packs';

/**
 * A minimal zip reader and writer for `.mcpack` and `.mcaddon` containers. The
 * reader reads the central directory and supports the two compression methods
 * Minecraft packs use, stored and deflate. Zip64, encryption and multi-disk
 * archives are out of scope; a pack that needs them fails with a
 * {@link ZipError}.
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
        if (view.getUint32(cursor, true) !== CENTRAL_SIGNATURE) throw new PacksErrors.ZipBadCentralDirectoryEntry();

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
            throw new PacksErrors.ZipEntryTooLarge({
                name: entry.name,
                entryCount: entry.size,
                maxEntryBytes
            });
        }
        if (entry.size > budget.remaining) {
            throw new PacksErrors.ZipArchiveTooLarge({
                name: entry.name,
                remaining: budget.remaining
            });
        }
        budget.remaining -= entry.size;
        files.set(entry.name, readEntryData(bytes, view, entry));
    }

    return files;
};

/** Where an entry's data starts, read from its local header. */
const dataStartOf = (view: DataView, { localOffset, name }: ZipEntry): number => {
    if (localOffset + 30 > view.byteLength || view.getUint32(localOffset, true) !== LOCAL_SIGNATURE)
        throw new PacksErrors.ZipBadLocalHeader({ name });

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
        if (end > bytes.byteLength) throw new PacksErrors.ZipEntryTruncated({ name: entry.name });
        if (start < previousEnd) throw new PacksErrors.ZipEntriesOverlap({ name: entry.name });
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
    throw new PacksErrors.NotZip();
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
        if (compressedSize !== size) throw new PacksErrors.ZipStoredEntrySizesDiffer({ name });
        return data;
    }
    if (method !== 8) throw new PacksErrors.UnsupportedZipCompressionMethod({ method, name });

    let inflated: Buffer;
    try {
        // One byte past the declared size, so an entry that would grow beyond it stops there.
        inflated = inflateRawSync(data, { maxOutputLength: size + 1 });
    } catch (error: unknown) {
        throw new PacksErrors.ZipEntryNotInflatable({
            name,
            value: error instanceof Error ? error.message : String(error)
        });
    }
    if (inflated.byteLength !== size) {
        throw new PacksErrors.ZipEntrySizeMismatch({ name, size });
    }
    return new Uint8Array(inflated.buffer, inflated.byteOffset, inflated.byteLength);
};

/** Options for {@link writeZip}. */
export interface ZipWriteOptions {
    /**
     * Deflate each entry whose deflated form is smaller. Off by default: stored entries make the
     * archive's bytes depend only on the files, while deflate output can change with the zlib
     * build.
     */
    deflate?: boolean;
}

/** MS-DOS date of 1980-01-01, the earliest a zip can record, so the time of a build never shows. */
const DOS_EPOCH_DATE = (1 << 5) | 1;
/** General purpose flag bit 11: the entry's name is UTF-8. */
const UTF8_NAME_FLAG = 0x0800;

/**
 * Writes a zip archive holding the given files in iteration order, each dated 1980-01-01. With
 * the default stored entries, the same files in the same order always give the same bytes.
 *
 * @param files - Archive path to contents. Paths use `/` and name files, not directories.
 * @param options - See {@link ZipWriteOptions}.
 * @throws {ZipError} `ZipTooLargeToWrite` when the files need Zip64: more than 65535 of them, or
 * offsets past 4 GiB. `ZipNameTooLong` for a path longer than 65535 bytes in UTF-8.
 */
export const writeZip = (files: ReadonlyMap<string, Uint8Array>, options: ZipWriteOptions = {}): Uint8Array => {
    const bytes = [...files.values()].reduce((total, data) => total + data.length, 0);
    if (files.size > 0xffff || bytes > 0xffffffff)
        throw new PacksErrors.ZipTooLargeToWrite({ count: files.size, bytes });
    const encoder = new TextEncoder();
    const locals: Uint8Array[] = [];
    const centrals: Uint8Array[] = [];
    let offset = 0;

    for (const [name, data] of files) {
        const nameBytes = encoder.encode(name);
        if (nameBytes.length > 0xffff) throw new PacksErrors.ZipNameTooLong({ name, length: nameBytes.length });
        const deflated = options.deflate ? new Uint8Array(deflateRawSync(data)) : undefined;
        const method = deflated && deflated.length < data.length ? 8 : 0;
        const payload = method === 8 && deflated ? deflated : data;
        const checksum = crc32(data);

        const local = new Uint8Array(30 + nameBytes.length);
        const localView = new DataView(local.buffer);
        localView.setUint32(0, LOCAL_SIGNATURE, true);
        localView.setUint16(4, 20, true);
        localView.setUint16(6, UTF8_NAME_FLAG, true);
        localView.setUint16(8, method, true);
        localView.setUint16(12, DOS_EPOCH_DATE, true);
        localView.setUint32(14, checksum, true);
        localView.setUint32(18, payload.length, true);
        localView.setUint32(22, data.length, true);
        localView.setUint16(26, nameBytes.length, true);
        local.set(nameBytes, 30);

        const central = new Uint8Array(46 + nameBytes.length);
        const centralView = new DataView(central.buffer);
        centralView.setUint32(0, CENTRAL_SIGNATURE, true);
        centralView.setUint16(4, 20, true);
        centralView.setUint16(6, 20, true);
        centralView.setUint16(8, UTF8_NAME_FLAG, true);
        centralView.setUint16(10, method, true);
        centralView.setUint16(14, DOS_EPOCH_DATE, true);
        centralView.setUint32(16, checksum, true);
        centralView.setUint32(20, payload.length, true);
        centralView.setUint32(24, data.length, true);
        centralView.setUint16(28, nameBytes.length, true);
        centralView.setUint32(42, offset, true);
        central.set(nameBytes, 46);

        locals.push(local, payload);
        centrals.push(central);
        offset += local.length + payload.length;
    }

    const centralSize = centrals.reduce((total, part) => total + part.length, 0);
    // The headers count too: the central directory's offset and size each have four bytes, and
    // an entry's offset is below the directory's, so checking the directory covers every entry.
    if (offset > 0xffffffff || centralSize > 0xffffffff)
        throw new PacksErrors.ZipTooLargeToWrite({ count: files.size, bytes: offset + centralSize });
    const eocd = new Uint8Array(EOCD_MIN_SIZE);
    const eocdView = new DataView(eocd.buffer);
    eocdView.setUint32(0, EOCD_SIGNATURE, true);
    eocdView.setUint16(8, files.size, true);
    eocdView.setUint16(10, files.size, true);
    eocdView.setUint32(12, centralSize, true);
    eocdView.setUint32(16, offset, true);

    // A fresh buffer rather than Buffer.concat, whose small results share Node's pool, so the
    // archive's `buffer` holds the archive alone.
    const archive = new Uint8Array(offset + centralSize + eocd.length);
    let cursor = 0;
    for (const part of [...locals, ...centrals, eocd]) {
        archive.set(part, cursor);
        cursor += part.length;
    }
    return archive;
};
