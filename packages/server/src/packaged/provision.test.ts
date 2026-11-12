import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { Server } from 'node:http';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { downloadVerified, provisionBehaviorPacks, provisionPackagedData } from './provision';

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
    let downloads = 0;

    beforeAll(async () => {
        server = createServer((request, response) => {
            if (request.url === '/bds.zip') downloads += 1;
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
        await expect(provisionPackagedData(() => {})).resolves.toBeUndefined();
    });

    describe('the behavior pack cache', () => {
        let scratch: string;
        let cacheDir: string;
        const silent = (): void => {};
        const packFor = (versionRoot: string) => path.join(versionRoot, 'behavior_packs');

        beforeEach(() => {
            scratch = mkdtempSync(path.join(os.tmpdir(), 'jsp-provision-'));
            cacheDir = path.join(scratch, 'user-cache');
            downloads = 0;
            vi.stubEnv('JSP_VANILLA_BEHAVIOR_PACK', '');
        });

        afterEach(() => {
            vi.unstubAllEnvs();
            rmSync(scratch, { recursive: true, force: true });
        });

        it('downloads once and reuses the pack from any working directory', async () => {
            const bds = pin(`${base}/bds.zip`, zip);
            await provisionBehaviorPacks(path.join(scratch, 'a', 'node_modules'), bds, silent, cacheDir);
            const shared = path.join(cacheDir, 'bds', bds.serverVersion);
            expect(process.env.JSP_VANILLA_BEHAVIOR_PACK).toBe(packFor(shared));
            expect(existsSync(path.join(packFor(shared), 'vanilla', 'manifest.json'))).toBe(true);

            vi.stubEnv('JSP_VANILLA_BEHAVIOR_PACK', '');
            await provisionBehaviorPacks(path.join(scratch, 'b', 'node_modules'), bds, silent, cacheDir);
            expect(downloads).toBe(1);
            expect(process.env.JSP_VANILLA_BEHAVIOR_PACK).toBe(packFor(shared));
        });

        it('downloads again when the pinned version changes', async () => {
            const modules = path.join(scratch, 'node_modules');
            await provisionBehaviorPacks(modules, pin(`${base}/bds.zip`, zip), silent, cacheDir);
            vi.stubEnv('JSP_VANILLA_BEHAVIOR_PACK', '');
            const repinned = { ...pin(`${base}/bds.zip`, zip), serverVersion: '1.26.60.1' };
            await provisionBehaviorPacks(modules, repinned, silent, cacheDir);
            expect(downloads).toBe(2);
            expect(process.env.JSP_VANILLA_BEHAVIOR_PACK).toBe(packFor(path.join(cacheDir, 'bds', '1.26.60.1')));
        });

        it.each([
            ['never finished', undefined],
            ['came from another digest', JSON.stringify({ sha256: 'another' })]
        ])('replaces an unpack that %s', async (_, marker) => {
            const bds = pin(`${base}/bds.zip`, zip);
            const shared = path.join(cacheDir, 'bds', bds.serverVersion);
            mkdirSync(path.join(packFor(shared), 'vanilla'), { recursive: true });
            if (marker !== undefined) writeFileSync(path.join(shared, 'complete.json'), marker);
            await provisionBehaviorPacks(path.join(scratch, 'node_modules'), bds, silent, cacheDir);
            expect(downloads).toBe(1);
            expect(existsSync(path.join(packFor(shared), 'vanilla', 'manifest.json'))).toBe(true);
        });

        it('uses a pack an older build unpacked into the working directory', async () => {
            const bds = pin(`${base}/bds.zip`, zip);
            const modules = path.join(scratch, 'node_modules');
            const local = path.join(modules, '.cache', 'jsprismarine', 'bds', bds.serverVersion, 'unpacked');
            mkdirSync(path.join(packFor(local), 'vanilla'), { recursive: true });
            writeFileSync(path.join(packFor(local), 'vanilla', 'manifest.json'), '{}');
            await provisionBehaviorPacks(modules, bds, silent, cacheDir);
            expect(downloads).toBe(0);
            expect(process.env.JSP_VANILLA_BEHAVIOR_PACK).toBe(packFor(local));
        });

        it('leaves a user-set override alone', async () => {
            vi.stubEnv('JSP_VANILLA_BEHAVIOR_PACK', '/somewhere/behavior_packs');
            await provisionBehaviorPacks(
                path.join(scratch, 'node_modules'),
                pin(`${base}/bds.zip`, zip),
                silent,
                cacheDir
            );
            expect(downloads).toBe(0);
            expect(process.env.JSP_VANILLA_BEHAVIOR_PACK).toBe('/somewhere/behavior_packs');
        });
    });
});
