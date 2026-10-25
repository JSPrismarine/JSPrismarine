import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { inflateRawSync } from 'node:zlib';

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_FILE_HEADER = 0x02014b50;
const LOCAL_FILE_HEADER = 0x04034b50;

interface ZipEntry {
    name: string;
    method: number;
    compressedSize: number;
    localHeaderOffset: number;
}

/**
 * Rejects entry names that would escape the destination directory. Archives
 * are untrusted downloads, so a name that is absolute, uses `\\`, contains a
 * `..` segment, or looks like a Windows drive path fails the whole unpack.
 */
const assertSafeEntryName = (name: string): void => {
    const unsafe =
        name.startsWith('/') || name.includes('\\') || /^[A-Za-z]:/.test(name) || name.split('/').includes('..');
    if (unsafe) throw new Error(`Refusing to unpack zip entry with unsafe name: ${name}`);
};

const readCentralDirectory = (buffer: Buffer): ZipEntry[] => {
    // The end-of-central-directory record is the only trustworthy index into a
    // zip; it sits at the end, before a comment of up to 64 KiB.
    let end = -1;
    const earliest = Math.max(0, buffer.length - 65557);
    for (let i = buffer.length - 22; i >= earliest; i--) {
        if (buffer.readUInt32LE(i) === END_OF_CENTRAL_DIRECTORY) {
            end = i;
            break;
        }
    }
    if (end < 0) throw new Error('Not a zip file: no end of central directory record');

    const entryCount = buffer.readUInt16LE(end + 10);
    const centralOffset = buffer.readUInt32LE(end + 16);
    if (entryCount === 0xffff || centralOffset === 0xffffffff) {
        throw new Error('Zip64 archives are not supported by this reader');
    }

    const entries: ZipEntry[] = [];
    let offset = centralOffset;
    for (let i = 0; i < entryCount; i++) {
        if (buffer.readUInt32LE(offset) !== CENTRAL_FILE_HEADER) {
            throw new Error('Corrupt zip: bad central file header');
        }
        const method = buffer.readUInt16LE(offset + 10);
        const compressedSize = buffer.readUInt32LE(offset + 20);
        const nameLength = buffer.readUInt16LE(offset + 28);
        const extraLength = buffer.readUInt16LE(offset + 30);
        const commentLength = buffer.readUInt16LE(offset + 32);
        const localHeaderOffset = buffer.readUInt32LE(offset + 42);
        const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);
        if (compressedSize === 0xffffffff || localHeaderOffset === 0xffffffff) {
            throw new Error(`Zip64 entry ${name} is not supported by this reader`);
        }
        entries.push({ name, method, compressedSize, localHeaderOffset });
        offset += 46 + nameLength + extraLength + commentLength;
    }
    return entries;
};

const readEntryData = (buffer: Buffer, entry: ZipEntry): Buffer => {
    const { localHeaderOffset: at, name } = entry;
    if (buffer.readUInt32LE(at) !== LOCAL_FILE_HEADER) {
        throw new Error(`Corrupt zip: bad local header for ${name}`);
    }
    const nameLength = buffer.readUInt16LE(at + 26);
    const extraLength = buffer.readUInt16LE(at + 28);
    const start = at + 30 + nameLength + extraLength;
    const compressed = buffer.subarray(start, start + entry.compressedSize);
    if (entry.method === 0) return compressed;
    if (entry.method === 8) return inflateRawSync(compressed);
    throw new Error(`${name} uses zip compression method ${entry.method}, which this does not read`);
};

/**
 * Reads one entry of a zip archive into memory, without writing anything to
 * disk. Used for the small metadata files inside a downloaded archive, such
 * as the `version.json` at the root of Mojang's bundler jar.
 *
 * @param name - Entry path inside the archive, with `/` separators.
 * @returns The entry's bytes, or undefined when the archive has no such entry.
 */
export const readZipEntry = async (archivePath: string, name: string): Promise<Buffer | undefined> => {
    const buffer = await readFile(archivePath);
    const entry = readCentralDirectory(buffer).find((candidate) => candidate.name === name);
    return entry === undefined ? undefined : readEntryData(buffer, entry);
};

/**
 * Reads the entries of an in-memory archive whose names a filter accepts.
 *
 * This exists for the one archive that holds another: Mojang's bundler jar carries the real
 * server jar as a single entry, so the inner one is read as bytes and then read again as an
 * archive, with no temporary file in between.
 *
 * @param accept - Decides which entry names are wanted, so a caller after 1511 of 17655 entries
 *   inflates only those.
 */
export const readZipEntriesFrom = (archive: Buffer, accept: (name: string) => boolean): Map<string, Buffer> => {
    const found = new Map<string, Buffer>();
    for (const entry of readCentralDirectory(archive)) {
        if (entry.name.endsWith('/') || !accept(entry.name)) continue;

        assertSafeEntryName(entry.name);
        found.set(entry.name, readEntryData(archive, entry));
    }
    return found;
};

/** The entries of an archive on disk whose names a filter accepts. */
export const readZipEntries = async (
    archivePath: string,
    accept: (name: string) => boolean
): Promise<Map<string, Buffer>> => readZipEntriesFrom(await readFile(archivePath), accept);

/**
 * Unpacks a zip archive into a directory, creating it if needed. Supports the
 * stored and deflate methods, which is all the pinned sources use, and fails
 * on zip64. Every entry is written as a regular file; entry names that could
 * escape the destination abort the unpack.
 */
export const extractZip = async (archivePath: string, destination: string): Promise<void> => {
    const buffer = await readFile(archivePath);
    const entries = readCentralDirectory(buffer);
    for (const entry of entries) assertSafeEntryName(entry.name);
    for (const entry of entries) {
        if (entry.name.endsWith('/')) {
            await mkdir(join(destination, entry.name), { recursive: true });
            continue;
        }
        const target = join(destination, entry.name);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, readEntryData(buffer, entry));
    }
};
