/**
 * Test-only writers for the two binary containers the loader reads, so tests
 * can build fixtures without committing binary files.
 */

import { writeZip as writePackZip } from '../src/zip';

const encoder = new TextEncoder();

const concat = (parts: Uint8Array[]): Uint8Array => {
    const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
    let offset = 0;
    for (const part of parts) {
        out.set(part, offset);
        offset += part.length;
    }
    return out;
};

/** Writes a version 1 brarchive holding the given files in entry order. */
export const writeBrarchive = (files: ReadonlyMap<string, Uint8Array>): Uint8Array => {
    const header = new Uint8Array(16);
    const headerView = new DataView(header.buffer);
    header.set([0x7d, 0x27, 0x25, 0xb1, 0xa0, 0x52, 0x70, 0x26]);
    headerView.setUint32(8, files.size, true);
    headerView.setUint32(12, 1, true);

    const entries: Uint8Array[] = [];
    const bodies: Uint8Array[] = [];
    for (const [name, data] of files) {
        const entry = new Uint8Array(256);
        const nameBytes = encoder.encode(name);
        entry[0] = nameBytes.length;
        entry.set(nameBytes, 1);
        new DataView(entry.buffer).setUint32(252, data.length, true);
        entries.push(entry);
        bodies.push(data);
    }

    return concat([header, ...entries, ...bodies]);
};

/**
 * Writes a zip archive holding the given files in entry order. Entries whose
 * deflated form is smaller are deflated, the rest are stored, so tests read
 * both methods.
 */
export const writeZip = (files: ReadonlyMap<string, Uint8Array>): Uint8Array => writePackZip(files, { deflate: true });

/** Encodes text files into the byte map the archive writers take. */
export const textFiles = (files: Record<string, string>): Map<string, Uint8Array> =>
    new Map(Object.entries(files).map(([name, text]) => [name, encoder.encode(text)]));
