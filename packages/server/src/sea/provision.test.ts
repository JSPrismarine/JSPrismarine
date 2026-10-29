import { createHash } from 'node:crypto';
import type { Server } from 'node:http';
import { createServer } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { downloadVerified, provisionSeaData } from './provision';

/** A minimal one-file zip (stored, no compression) so the download has real bytes to verify. */
const storedZip = (name: string, data: Buffer): Buffer => {
    const nameBytes = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(0, 42);
    const centralOffset = local.length + nameBytes.length + data.length;
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(1, 8);
    eocd.writeUInt16LE(1, 10);
    eocd.writeUInt32LE(central.length + nameBytes.length, 12);
    eocd.writeUInt32LE(centralOffset, 16);
    return Buffer.concat([local, nameBytes, data, central, nameBytes, eocd]);
};

const crc32 = (bytes: Buffer): number => {
    let crc = ~0;
    for (const byte of bytes) {
        crc ^= byte;
        for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    return ~crc >>> 0;
};

describe('provision', () => {
    let server: Server;
    let base: string;
    const zip = storedZip('behavior_packs/vanilla/manifest.json', Buffer.from('{}'));

    beforeAll(async () => {
        server = createServer((request, response) => {
            if (request.url === '/bds.zip') response.end(zip);
            else if (request.url === '/corrupt.zip') response.end(Buffer.from('not the pinned bytes'));
            else response.writeHead(404).end();
        });
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        const address = server.address();
        base = typeof address === 'object' && address !== null ? `http://127.0.0.1:${address.port}` : '';
    });

    afterAll(async () => {
        await new Promise((resolve) => server.close(resolve));
    });

    const pin = (url: string, body: Buffer) => ({
        minecraftVersion: '1.26.51',
        serverVersion: '1.26.51.1',
        url,
        sha256: createHash('sha256').update(body).digest('hex'),
        sizeInBytes: body.length
    });

    it('downloads, verifies and reads the pinned zip', async () => {
        const entries = await downloadVerified(pin(`${base}/bds.zip`, zip), () => {});
        expect([...entries.keys()]).toEqual(['behavior_packs/vanilla/manifest.json']);
    });

    it('names the HTTP status when the download fails', async () => {
        await expect(downloadVerified(pin(`${base}/missing.zip`, zip), () => {})).rejects.toThrow(/HTTP 404/);
    });

    it('refuses bytes whose digest is not the pinned one', async () => {
        await expect(downloadVerified(pin(`${base}/corrupt.zip`, zip), () => {})).rejects.toThrow(
            /does not match the pinned/
        );
    });

    it('does nothing outside a single executable', async () => {
        // `isSea()` is false under vitest, so this must not touch the disk or the network.
        await expect(provisionSeaData(() => {})).resolves.toBeUndefined();
    });
});
