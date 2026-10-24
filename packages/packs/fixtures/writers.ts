/**
 * Test-only writers for the two binary containers the loader reads. They
 * write the smallest valid form of each format so tests can build fixtures
 * without committing binary files.
 */

import { crc32, deflateRawSync } from 'node:zlib';

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
 * deflated form is smaller are deflated, the rest are stored.
 */
export const writeZip = (files: ReadonlyMap<string, Uint8Array>): Uint8Array => {
    const locals: Uint8Array[] = [];
    const centrals: Uint8Array[] = [];
    let offset = 0;

    for (const [name, data] of files) {
        const nameBytes = encoder.encode(name);
        const deflated = new Uint8Array(deflateRawSync(data));
        const method = deflated.length < data.length ? 8 : 0;
        const payload = method === 8 ? deflated : data;
        const checksum = crc32(data);

        const local = new Uint8Array(30 + nameBytes.length);
        const localView = new DataView(local.buffer);
        localView.setUint32(0, 0x04034b50, true);
        localView.setUint16(4, 20, true);
        localView.setUint16(8, method, true);
        localView.setUint32(14, checksum, true);
        localView.setUint32(18, payload.length, true);
        localView.setUint32(22, data.length, true);
        localView.setUint16(26, nameBytes.length, true);
        local.set(nameBytes, 30);

        const central = new Uint8Array(46 + nameBytes.length);
        const centralView = new DataView(central.buffer);
        centralView.setUint32(0, 0x02014b50, true);
        centralView.setUint16(4, 20, true);
        centralView.setUint16(6, 20, true);
        centralView.setUint16(10, method, true);
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
    const eocd = new Uint8Array(22);
    const eocdView = new DataView(eocd.buffer);
    eocdView.setUint32(0, 0x06054b50, true);
    eocdView.setUint16(8, files.size, true);
    eocdView.setUint16(10, files.size, true);
    eocdView.setUint32(12, centralSize, true);
    eocdView.setUint32(16, offset, true);

    return concat([...locals, ...centrals, eocd]);
};

/** Encodes text files into the byte map the archive writers take. */
export const textFiles = (files: Record<string, string>): Map<string, Uint8Array> =>
    new Map(Object.entries(files).map(([name, text]) => [name, encoder.encode(text)]));
