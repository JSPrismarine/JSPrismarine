import { createHash } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { readZip } from '@jsprismarine/packs/zip';
import { afterEach, describe, expect, it } from 'vitest';

import type { AddonResourcePack } from '../addons/AddonManager';
import type { PackSummary } from '../addons/addonPack';
import { chunkOf, RESOURCE_PACK_CHUNK_SIZE, ServedResourcePacks, stackOrderOf } from './ServedResourcePacks';

const scratch: string[] = [];
afterEach(async () => {
    for (const directory of scratch.splice(0)) await rm(directory, { recursive: true, force: true });
});

/** A resource pack folder on disk, as the installer leaves it. */
const installed = async (
    uuid: string,
    files: Record<string, string | Uint8Array>,
    dependencies: readonly string[] = []
): Promise<AddonResourcePack> => {
    const directory = mkdtempSync(path.join(tmpdir(), 'jsprismarine-served-'));
    scratch.push(directory);
    for (const [name, data] of Object.entries(files)) {
        await mkdir(path.dirname(path.join(directory, name)), { recursive: true });
        await writeFile(path.join(directory, name), data);
    }
    const summary: PackSummary = {
        kind: 'resource',
        name: `Pack ${uuid.slice(0, 2)}`,
        uuid,
        version: '1.0.0',
        needsRestart: [],
        dependencies: dependencies.map((each) => ({ uuid: each, version: '1.0.0' })),
        addon: false
    };
    return { key: 'addon', folder: '.', directory, summary };
};

const uuidOf = (n: number) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;

describe('ServedResourcePacks', () => {
    it('zips each pack once per change in the installed list, and hashes the zip', async () => {
        const list = [await installed(uuidOf(1), { 'manifest.json': '{}', 'textures/a.png': 'png' })];
        let current: readonly AddonResourcePack[] = list;
        const served = new ServedResourcePacks(() => current);

        const [pack] = await served.packs();
        const again = await served.packs();

        expect(again[0]).toBe(pack);
        expect([...readZip(pack!.bytes).keys()]).toEqual(['manifest.json', 'textures/a.png']);
        expect(pack!.sha256).toEqual(createHash('sha256').update(pack!.bytes).digest());
        expect(pack!.resourceName).toBe(`${uuidOf(1)}_1.0.0`);
        expect(served.offered()).toEqual([pack]);

        current = [...list];
        expect((await served.packs())[0]).not.toBe(pack);
    });

    it('finds a pack by the name it was offered under or its bare UUID, after the list moved on', async () => {
        let current: readonly AddonResourcePack[] = [await installed(uuidOf(1), { 'manifest.json': '{}' })];
        const served = new ServedResourcePacks(() => current);
        const [first] = await served.packs();
        current = [];
        await served.packs();

        expect(served.find(`${uuidOf(1)}_1.0.0`)).toBe(first);
        expect(served.find(uuidOf(1).toUpperCase())).toBeUndefined();
        expect(served.offered()).toEqual([]);
        expect(served.find(`${uuidOf(2)}_1.0.0`)).toBeUndefined();
    });

    it('cuts a pack into chunks of the chunk size, and has none past its last', async () => {
        const big = new Uint8Array(RESOURCE_PACK_CHUNK_SIZE * 2);
        const served = new ServedResourcePacks(() => [current]);
        const current = await installed(uuidOf(1), { 'manifest.json': '{}', 'blob.bin': big });
        const [pack] = await served.packs();

        expect(pack!.chunkCount).toBe(Math.ceil(pack!.bytes.byteLength / RESOURCE_PACK_CHUNK_SIZE));
        const chunks = Array.from({ length: pack!.chunkCount }, (_, index) => chunkOf(pack!, index)!);
        expect(chunks.map(({ offset }) => offset)).toEqual(chunks.map((_, index) => index * RESOURCE_PACK_CHUNK_SIZE));
        expect(chunks.reduce((total, { data }) => total + data.byteLength, 0)).toBe(pack!.bytes.byteLength);
        expect(chunkOf(pack!, pack!.chunkCount)).toBeUndefined();
        expect(chunkOf(pack!, -1)).toBeUndefined();
    });
});

describe('stackOrderOf', () => {
    it('keeps the installed order but puts a pack above the packs it depends on', () => {
        const pack = (uuid: string, dependencies: string[] = []) => ({ uuid, dependencies });
        const base = pack('base');
        const other = pack('other');
        const skin = pack('skin', ['base']);

        expect(stackOrderOf([base, other, skin]).map(({ uuid }) => uuid)).toEqual(['skin', 'base', 'other']);
        expect(stackOrderOf([other, skin, base]).map(({ uuid }) => uuid)).toEqual(['other', 'skin', 'base']);
    });
});
